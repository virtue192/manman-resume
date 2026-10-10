import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, MotionConfig, useMotionValue, useSpring, useReducedMotion } from 'motion/react';
import { ArrowUpRight, ArrowRight, ArrowLeft, Upload, FileText, Check, X, Plus, Sparkles, ShieldCheck, Settings2, ChevronRight, Download, LoaderCircle, RotateCcw, Eye, PencilLine, KeyRound, CircleHelp, Monitor, CheckCheck, Trash2, Copy, Moon, ExternalLink, AlertCircle } from 'lucide-react';
import { SAMPLE, SAMPLE_JD, SAMPLE_RESULT } from './sample';
import { FluidAtmosphere, FluidTitle, LiquidLens } from './FluidExperience';
import MoonPointer from './MoonPointer';
import { STATIC_SITE, asset, request as api, importResume, exportWord, printResume } from './client';

type Config = { provider: 'compatible' | 'ollama'; baseUrl: string; model: string; apiKey: string };
type Suggestion = { original: string; replacement: string; reason: string; category: string; needsConfirmation: boolean };
type Result = { summary: string; strengths: string[]; suggestions: Suggestion[]; questions: string[] };
type Draft = { text: string; jd: string; fileName: string; result: Result | null; accepted: number[]; demo: boolean; finalEdit: string | null };
const EMPTY: Draft = { text: '', jd: '', fileName: '', result: null, accepted: [], demo: false, finalEdit: null };
const DEFAULT: Config = { provider: 'compatible', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', apiKey: '' };
const STEPS = [{ title: '读懂经历', sub: '导入你的简历' }, { title: '看清目标', sub: '选择打磨方向' }, { title: '逐句打磨', sub: '让亮点更清晰' }, { title: '整理成稿', sub: '带走你的新简历' }];
function loadDraft(): Draft {
  try { const d = JSON.parse(localStorage.getItem('manman-draft') || 'null'); if (d && typeof d.text === 'string' && typeof d.jd === 'string' && Array.isArray(d.accepted)) return { ...EMPTY, ...d }; } catch { /* browser storage unavailable */ }
  return EMPTY;
}
function applyChanges(text: string, suggestions: Suggestion[], accepted: number[]) {
  const changes = suggestions.map((s, i) => ({ ...s, i, pos: text.indexOf(s.original) })).filter(s => accepted.includes(s.i) && s.pos >= 0).sort((a, b) => b.pos - a.pos);
  let output = text;
  for (const s of changes) output = output.slice(0, s.pos) + s.replacement + output.slice(s.pos + s.original.length);
  return output;
}
function MoonFriend({ small = false, thinking = false }: { small?: boolean; thinking?: boolean }) {
  return <div className={`moon-friend ${small ? 'small' : ''} ${thinking ? 'thinking' : ''}`} aria-label="慢慢，月亮伙伴" role="img">
    <div className="moon-halo" /><div className="moon-orbit" /><span className="twinkle twinkle-one">✦</span><span className="twinkle twinkle-two">✧</span><span className="moon-dot" />
    <div className="moon-body"><div className="moon-cutout" /><div className="moon-face"><i className="moon-eye" /><i className="moon-eye" /><span className="cheek left" /><span className="cheek right" /><span className="moon-smile" /></div><span className="moon-grain" /></div>
    <span className="moon-shadow" />
  </div>;
}
function Button({ children, onClick, disabled, secondary, className = '', type = 'button' }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; secondary?: boolean; className?: string; type?: 'button' | 'submit' }) {
  const reduce = useReducedMotion();
  const mx = useMotionValue(0), my = useMotionValue(0);
  const x = useSpring(mx, { stiffness: 250, damping: 22 }), y = useSpring(my, { stiffness: 250, damping: 22 });
  return <motion.button type={type} style={reduce ? undefined : { x, y }} onPointerMove={event => { if (disabled || reduce || event.pointerType === 'touch') return; const box = event.currentTarget.getBoundingClientRect(); mx.set((event.clientX - box.left - box.width / 2) * .07); my.set((event.clientY - box.top - box.height / 2) * .12); }} onPointerLeave={() => { mx.set(0); my.set(0); }} whileHover={disabled || reduce ? undefined : { scale: 1.025 }} whileTap={disabled || reduce ? undefined : { scale: .97 }} className={`${secondary ? 'button secondary' : 'button'} ${className}`} onClick={onClick} disabled={disabled}>{children}</motion.button>;
}
function Paper({ text, theme, compact = false }: { text: string; theme: string; compact?: boolean }) {
  const lines = text.split(/\r?\n/).filter(s => s.trim());
  const headings = /^(个人简介|个人优势|职业概述|工作经历|实习经历|项目经历|教育经历|教育背景|专业技能|技能|证书|荣誉奖项|自我评价|求职意向|联系方式|SUMMARY|EXPERIENCE|EDUCATION|SKILLS|PROJECTS|CERTIFICATIONS|PROFILE)$/i;
  return <article className={`resume-paper theme-${theme} ${compact ? 'compact' : ''}`} aria-label="简历预览">{lines.map((line, i) => i === 0 ? <h1 key={i}>{line}</h1> : headings.test(line.replace(/^[#\s]+|[：:\s]+$/g, '')) ? <h2 key={i}>{line.replace(/^#+\s*/, '')}</h2> : <p key={i}>{line}</p>)}</article>;
}

export default function App() {
  const [draft, setDraft] = useState<Draft>(loadDraft);
  const [step, setStep] = useState(0);
  const [config, setConfig] = useState<Config>(DEFAULT);
  const [settings, setSettings] = useState(false);
  const [help, setHelp] = useState(false);
  const [paste, setPaste] = useState(false);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState<'import' | 'optimize' | 'export' | null>(null);
  const [testState, setTestState] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle');
  const [testError, setTestError] = useState('');
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');
  const [tone, setTone] = useState('balanced');
  const [theme, setTheme] = useState('classic');
  const [editing, setEditing] = useState(false);
  const [preview, setPreview] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [docAvailable, setDocAvailable] = useState(false);
  const [clearDialog, setClearDialog] = useState(false);
  const uploadRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const lastFocus = useRef<HTMLElement | null>(null);
  const modal = settings || help || clearDialog || preview;
  const finalText = draft.finalEdit ?? applyChanges(draft.text, draft.result?.suggestions || [], draft.accepted);

  useEffect(() => { try { localStorage.setItem('manman-draft', JSON.stringify(draft)); setStorageError(false); } catch { setStorageError(true); } }, [draft]);
  useEffect(() => { if (!STATIC_SITE) fetch('/api/health').then(r => r.json()).then(d => setDocAvailable(d.doc)).catch(() => {}); }, []);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 4000); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => {
    if (!modal && busy !== 'optimize') return;
    lastFocus.current = document.activeElement as HTMLElement;
    const old = document.body.style.overflow; document.body.style.overflow = 'hidden';
    const timer = setTimeout(() => dialogRef.current?.querySelector<HTMLElement>('button, input, textarea')?.focus(), 80);
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { if (busy === 'optimize') abortRef.current?.abort(); else { setSettings(false); setHelp(false); setClearDialog(false); setPreview(false); } }
      if (e.key === 'Tab') {
        const nodes = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input, textarea, select, a[href]') || []);
        const first = nodes[0], last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', key);
    return () => { clearTimeout(timer); document.body.style.overflow = old; document.removeEventListener('keydown', key); lastFocus.current?.focus(); };
  }, [modal, busy === 'optimize']);
  useEffect(() => () => abortRef.current?.abort(), []);

  function navigate(next: number) { setStep(next); setError(''); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  function updateText(text: string) { setDraft(d => ({ ...d, text, demo: false, result: null, accepted: [], finalEdit: null })); }
  async function importFile(file?: File) {
    if (!file || busy) return;
    setError('');
    if (file.size > 10 * 1024 * 1024) { setError('文件不能超过 10 MB。'); return; }
    setBusy('import');
    try {
      const parsed = await importResume(file);
      setDraft(parsed.draft || { ...EMPTY, text: parsed.text, fileName: file.name }); setPaste(true); setToast(parsed.draft ? '本地备份已恢复，包括修改建议和成稿。' : '简历已读入，请核对文字和段落顺序。');
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(null); if (uploadRef.current) uploadRef.current.value = ''; }
  }
  function demo() { setDraft({ ...EMPTY, text: SAMPLE, jd: SAMPLE_JD, fileName: '林知夏 · 示例简历', demo: true }); setPaste(true); setToast('已载入虚构示例。演示结果不调用模型、不消耗 Key。'); }
  async function optimize() {
    if (draft.demo) { setDraft(d => ({ ...d, result: SAMPLE_RESULT, accepted: [], finalEdit: null })); navigate(2); return; }
    if (!config.model || (config.provider !== 'ollama' && !config.apiKey)) { setSettings(true); setToast('先连接你的模型，就可以开始真实优化。'); return; }
    setBusy('optimize'); setError(''); const controller = new AbortController(); abortRef.current = controller;
    try { const result = await api<Result>('/api/optimize', { text: draft.text, jd: draft.jd, tone, config }, controller.signal); setDraft(d => ({ ...d, result, accepted: [], finalEdit: null })); navigate(2); }
    catch (e) { setError((e as Error).name === 'AbortError' ? '已取消，本地草稿已保留。' : (e as Error).message); }
    finally { setBusy(null); abortRef.current = null; }
  }
  function accept(i: number) {
    setDraft(d => ({ ...d, finalEdit: null, accepted: d.accepted.includes(i) ? d.accepted.filter(n => n !== i) : [...d.accepted, i] }));
  }
  async function download(format: 'pdf' | 'docx' | 'txt' | 'md' | 'json') {
    if (busy) return;
    if (STATIC_SITE && format === 'pdf') {
      try { printResume(finalText, theme); setToast('在打印窗口选择“另存为 PDF”，即可保存正式分页的简历。'); } catch (e) { setError((e as Error).message); }
      return;
    }
    setBusy('export'); setError('');
    try {
      let blob: Blob;
      if (format === 'txt' || format === 'md') blob = new Blob([finalText], { type: 'text/plain;charset=utf-8' });
      else if (format === 'json') blob = new Blob([JSON.stringify({ app: 'manman-resume', version: 1, ...draft }, null, 2)], { type: 'application/json' });
      else if (STATIC_SITE && format === 'docx') blob = await exportWord(finalText, theme);
      else { const res = await fetch('/api/export', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: finalText, format, theme }) }); if (!res.ok) throw new Error((await res.json()).error); blob = await res.blob(); }
      const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `慢慢简历-${draft.demo ? '示例' : '优化稿'}.${format}`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); setToast('文件已导出。愿你的下一步，走得更笃定。');
    } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  }
  async function testProvider() {
    setTestState('testing'); setTestError('');
    try { await api('/api/test-provider', config); setTestState('ok'); } catch (e) { setTestState('error'); setTestError((e as Error).message); }
  }
  function updateConfig(change: Partial<Config>) { setConfig(c => ({ ...c, ...change })); setTestState('idle'); setTestError(''); }
  const canNext = draft.text.trim().length >= 30;

  return <MotionConfig reducedMotion="user"><div className="app-shell"><FluidAtmosphere/><MoonPointer/>
    <header className="topbar"><a className="brand" href="#" onClick={e => { e.preventDefault(); navigate(0); }}><img src={asset('moon.svg')} alt=""/><span>慢慢<span className="brand-dot">.</span><small>简历工作室</small></span></a>
      <nav className="header-nav" aria-label="主导航"><span className="local-badge"><i/> {STATIC_SITE ? '浏览器工作室' : '本地工作室'}</span><button onClick={() => setHelp(true)}><CircleHelp size={16}/><span>使用指南</span></button><button className="settings-trigger" onClick={() => setSettings(true)}><span className={`connection-dot ${config.apiKey || config.provider === 'ollama' ? 'connected' : ''}`}/><span>{config.apiKey || config.provider === 'ollama' ? '模型设置' : '连接我的模型'}</span><Settings2 size={16}/></button></nav>
    </header>
    <div className="workspace">
      <aside className="sidebar">
        <div className="sidebar-label">YOUR NEXT CHAPTER <span>✦</span></div>
        <div className="journey" aria-label="优化步骤">{STEPS.map((s, i) => <button key={s.title} className={`journey-step ${i === step ? 'active' : ''} ${i < step ? 'done' : ''}`} disabled={busy !== null || (i > 0 && !canNext) || (i > 2 && !draft.result)} onClick={() => navigate(i)} aria-current={step === i ? 'step' : undefined}><span className="step-number">{i < step ? <Check size={15}/> : `0${i + 1}`}</span><span><strong>{s.title}</strong><small>{s.sub}</small></span>{i === step && <motion.i layoutId="active-step" className="active-mark"/>}</button>)}</div>
        <div className="sidebar-note"><div className="tiny-stars">✧ <span>✦</span></div><p>好的简历，<br/>从好好认识自己开始。</p><small>慢一点，也会抵达。</small><div className="note-line"/></div>
        <div className="sidebar-bottom"><span><ShieldCheck size={15}/> 草稿保存在这台设备</span><button onClick={() => setClearDialog(true)} disabled={Boolean(busy)}><Trash2 size={13}/> 清除本地草稿</button><small>MANMAN STUDIO · v0.4</small></div>
      </aside>
      <main className="main-area">
        <div className="page-meta"><span>WORKSPACE / <b>{String(step + 1).padStart(2, '0')}</b></span><span className="save-state">{storageError ? '草稿未能自动保存，请导出备份' : draft.text ? '草稿已在本机保存' : '只属于你的求职空间'}<span className="subtle-dot"/></span></div>
        <AnimatePresence mode="wait"><motion.div key={step} initial={{ opacity: 0, y: 16, filter: 'blur(4px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.32 }}>
          <div className="page-heading"><span className="eyebrow"><span/> {['每一段经历，都值得被看见', '找到方向，再轻轻向前', '好的表达，让真实更有力量', '准备好了，去开启下一章'][step]}</span><FluidTitle text={['把你的经历，\n交给慢慢。', '下一站，\n你想去哪里？', '你的亮点，\n正在变得清晰。', '带着更好的自己，\n出发吧。'][step]}/><p>{['从一份简历开始。一起梳理经历、发现亮点，\n让招聘者看见你真正的价值。', '告诉慢慢你的目标岗位，或先做一次通用打磨。\n所有改写，都从你真实的经历出发。', '每一处修改都有理由。你来决定哪些留下，\n慢慢陪你把经历说得更清楚。', '选一个喜欢的样式，检查最后的细节。\n这份简历，是你真实经历更清晰的表达。'][step]}</p></div>

          {step === 0 && <div className="content-grid"><section className="primary-panel import-panel"><div className="panel-heading"><div><span className="section-index">01</span><h2>先认识一下你</h2></div><span className="tag">从这里开始</span></div>
            <motion.div className={`dropzone ${drag ? 'dragging' : ''} ${busy === 'import' ? 'loading' : ''}`} onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={e => { e.preventDefault(); setDrag(false); void importFile(e.dataTransfer.files[0]); }} whileHover={{ borderColor: '#a49372', backgroundColor: '#fbfaf6' }}>
              <div className="upload-icon">{busy === 'import' ? <LoaderCircle className="spin" size={26}/> : <Upload size={26} strokeWidth={1.5}/>}<span>✦</span></div>
              <h3>{busy === 'import' ? '正在读懂你的经历…' : draft.fileName ? '换一份简历，重新开始' : '把简历轻轻放在这里'}</h3><p>拖拽文件，或点击选择你的简历</p><Button secondary onClick={() => uploadRef.current?.click()} disabled={Boolean(busy)}><Plus size={16}/> 选择简历文件</Button>
              <input ref={uploadRef} type="file" accept=".pdf,.docx,.doc,.txt,.md,.json" hidden onChange={e => void importFile(e.target.files?.[0])}/><div className="file-types">PDF <i/> DOCX <i/> DOC <i/> TXT <i/> MD <span>最大 10 MB</span></div>
            </motion.div>
            <div className="import-alternative"><span/><small>也可以</small><span/></div><button className={`paste-toggle ${paste ? 'open' : ''}`} onClick={() => setPaste(!paste)}><PencilLine size={17}/><span>{draft.text ? '查看 / 编辑已读入的内容' : '直接粘贴简历文字'}</span><ChevronRight size={16}/></button>
            <AnimatePresence>{paste && <motion.div className="paste-panel" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}><label htmlFor="resume-text">核对经历、日期和段落顺序 <span>{draft.text.length.toLocaleString()} / 60,000</span></label><textarea id="resume-text" maxLength={60000} rows={9} value={draft.text} onChange={e => updateText(e.target.value)} placeholder={'姓名\n求职方向 · 联系方式\n\n工作经历\n公司 / 职位 / 任职时间\n你的职责、行动与实际成果…'}/>{draft.fileName && <small className="file-loaded"><FileText size={13}/>{draft.fileName}</small>}</motion.div>}</AnimatePresence>
            <div className="privacy-line"><ShieldCheck size={15}/><span>文件在当前设备读取；AI 优化时，仅向你选择的模型发送必要内容。</span></div>
            {draft.demo && <div className="demo-label"><Sparkles size={14}/> 当前为虚构示例，演示优化无需 Key。</div>}
            <div className="panel-footer"><button className="text-button" onClick={demo} disabled={Boolean(busy)}>先体验一份示例 <ArrowUpRight size={15}/></button><Button onClick={() => navigate(1)} disabled={!canNext || Boolean(busy)}>下一步，看清目标 <ArrowRight size={17}/></Button></div>
          </section><aside className="companion-column"><div className="companion-card"><div className="card-topline"><span>MEET YOUR LITTLE COMPANION</span><span>✧</span></div><div className="moon-stage"><LiquidLens/><MoonFriend/></div><div className="companion-message"><span className="hello">你好呀，我是慢慢 <span>🌙</span></span><p>你不需要一份完美的简历，<br/>只需要一个开始。<br/>剩下的，我们一起慢慢来。</p></div><span className="companion-signature">with a little moonlight.</span></div><div className="promise-card"><span className="promise-icon"><Sparkles size={18}/></span><div><strong>润色表达，保留真实</strong><p>不编造经历，不虚构数字。<br/>每一处修改，都由你决定。</p></div></div></aside></div>}

          {step === 1 && <div className="content-grid"><section className="primary-panel target-panel"><div className="panel-heading"><div><span className="section-index">02</span><h2>为你的下一步做准备</h2></div><span className="tag">方向很重要</span></div><label className="field-label" htmlFor="jd">目标岗位描述 <span>选填</span></label><p className="field-hint">粘贴 JD，让慢慢找到经历与岗位之间的连接。</p><textarea id="jd" className="jd-input" maxLength={20000} rows={7} value={draft.jd} onChange={e => setDraft(d => ({ ...d, jd: e.target.value }))} placeholder={'例如：产品运营\n负责用户成长、活动策划和数据分析，能与产品团队协作改善用户体验…'}/><div className="tone-heading"><span>你希望怎样打磨？</span><small>优化表达，保留原有事实</small></div><div className="tone-options">{[{ id: 'balanced', icon: '✧', title: '自然专业', detail: '清楚、有重点，恰到好处' }, { id: 'concise', icon: '↗', title: '简洁有力', detail: '删掉冗余，让信息更集中' }, { id: 'impact', icon: '✦', title: '突出贡献', detail: '把已有行动和成果讲明白' }].map(t => <button aria-pressed={tone === t.id} key={t.id} className={`tone-option ${tone === t.id ? 'selected' : ''}`} onClick={() => setTone(t.id)}><span className="tone-icon">{t.icon}</span><strong>{t.title}</strong><small>{t.detail}</small>{tone === t.id && <Check size={14}/>}</button>)}</div><div className="connection-card"><KeyRound size={19}/><div><strong>{draft.demo ? '示例体验已准备好' : config.provider === 'ollama' || config.apiKey ? `${config.model || '你的模型'} · 自带模型` : '用你自己的 Key，连接 AI'}</strong><small>{draft.demo ? '固定的虚构示例，不发送模型请求' : 'Key 仅在当前页面内存中使用，关闭后自动清除'}</small></div><button onClick={() => setSettings(true)}>{draft.demo ? '设置' : '配置'}<ChevronRight size={14}/></button></div><div className="panel-footer"><button className="text-button" onClick={() => navigate(0)} disabled={Boolean(busy)}><ArrowLeft size={15}/> 返回简历</button><Button onClick={() => void optimize()} disabled={Boolean(busy)}><Sparkles size={17}/> 开始慢慢打磨 <ArrowRight size={17}/></Button></div></section><aside className="companion-column"><div className="target-note"><MoonFriend small/><h3>不是把你写成另一个人。</h3><p>是让那个已经很努力的你，<br/>被更准确地看见。</p><ul><li><Check size={15}/> 只使用简历中已有的事实</li><li><Check size={15}/> 不足的信息会向你提问</li><li><Check size={15}/> 逐条查看，随时撤回修改</li></ul></div><div className="file-summary"><FileText size={19}/><div><strong>{draft.fileName || '粘贴的简历'}</strong><small>{draft.text.length.toLocaleString()} 字符 · 已准备好</small></div><Check size={15}/></div></aside></div>}

          {step === 2 && <div className="review-layout">{draft.result ? <><section className="diagnosis-card"><div className="diagnosis-title"><span><Sparkles size={17}/> 慢慢的观察</span>{draft.demo && <span className="tag">示例演示</span>}</div><p>{draft.result.summary}</p><div className="strength-chips">{draft.result.strengths.map(s => <span key={s}><Check size={13}/>{s}</span>)}</div></section><div className="review-toolbar"><div><h2>逐条看看，慢慢决定</h2><span>{draft.result.suggestions.length} 处建议 · 已采纳 {draft.accepted.length} 处</span></div><button className="text-button" onClick={() => setDraft(d => ({ ...d, accepted: d.result?.suggestions.map((s, i) => s.needsConfirmation ? -1 : i).filter(i => i >= 0) || [], finalEdit: null }))}><CheckCheck size={16}/> 采纳无需补充事实的建议</button></div><div className="suggestion-list">{draft.result.suggestions.map((s, i) => <motion.article layout key={`${i}-${s.original}`} className={`suggestion-card ${draft.accepted.includes(i) ? 'accepted' : ''}`}><div className="suggestion-header"><span className="suggestion-number">{String(i + 1).padStart(2, '0')}</span><span className="tag">{s.category}</span>{s.needsConfirmation && <span className="fact-warning"><AlertCircle size={13}/> 涉及新事实，请核实</span>}<button className={`accept-button ${draft.accepted.includes(i) ? 'is-accepted' : ''}`} onClick={() => accept(i)} aria-pressed={draft.accepted.includes(i)}>{draft.accepted.includes(i) ? <><Check size={15}/> 已采纳 · 点击撤回</> : <><Plus size={15}/>{s.needsConfirmation ? '事实已核实，采纳' : '采纳这处修改'}</>}</button></div><div className="diff-grid"><div className="before"><span>原来的表达</span><p>{s.original}</p></div><div className="after"><span><Sparkles size={12}/> 打磨之后</span><p>{s.replacement}</p></div></div><div className="reason"><span>为什么这样改</span><p>{s.reason}</p></div></motion.article>)}</div>{draft.result.questions.length > 0 && <section className="questions-card"><span><CircleHelp size={17}/> 还有一些亮点，等你补充</span><p>这些信息目前不在简历里。核实后，可以在成稿编辑中补充。</p>{draft.result.questions.map(q => <div key={q}><span>✧</span>{q}</div>)}</section>}<div className="review-footer"><button className="text-button" onClick={() => navigate(1)}><ArrowLeft size={15}/> 调整方向</button><Button onClick={() => navigate(3)}>整理我的简历 <ArrowRight size={17}/></Button></div></> : <section className="primary-panel empty-review"><MoonFriend small/><h2>还没有优化建议</h2><p>先选择方向，再让慢慢读一读你的经历。</p><Button onClick={() => navigate(1)}>去选择方向 <ArrowRight size={16}/></Button></section>}</div>}

          {step === 3 && <div className="export-layout"><div className="preview-column"><div className="preview-toolbar"><span><Eye size={16}/> 成稿预览 <small>A4</small></span><div><button className={editing ? 'selected' : ''} onClick={() => setEditing(!editing)}><PencilLine size={15}/>{editing ? '查看成稿' : '编辑文字'}</button><button onClick={() => setPreview(true)} aria-label="放大预览"><ExternalLink size={15}/></button></div></div>{editing ? <textarea aria-label="编辑成稿" className="final-editor" maxLength={60000} value={finalText} onChange={e => setDraft(d => ({ ...d, finalEdit: e.target.value }))}/> : <div className="paper-stage"><Paper text={finalText} theme={theme}/></div>}</div><aside className="export-options"><section className="primary-panel"><h2>让经历有个好模样</h2><p className="field-hint">内容是主角，样式恰到好处。</p><div className="template-options">{[{ id: 'classic', name: '经典专业', color: '#243b53' }, { id: 'moon', name: '月光简约', color: '#655382' }, { id: 'minimal', name: '纯粹黑白', color: '#222' }].map(t => <button className={`template ${theme === t.id ? 'selected' : ''}`} aria-pressed={theme === t.id} key={t.id} onClick={() => setTheme(t.id)}><div className="mini-paper" style={{ '--template-color': t.color } as React.CSSProperties}><b/><i/><i/><strong/><i/><i/><i/><strong/><i/><i/></div><span>{t.name}</span>{theme === t.id && <Check size={13}/>}</button>)}</div><div className="export-checklist"><span><Check size={14}/> 已采纳 {draft.accepted.length} 处修改</span><span><Check size={14}/> PDF 与 Word 均支持中文</span><span><Check size={14}/> 成品不附带慢慢品牌水印</span></div>{draft.demo && <div className="demo-label">虚构示例，请勿用于真实投递</div>}<Button className="full-width" disabled={Boolean(busy) || !finalText.trim()} onClick={() => void download('pdf')}>{busy === 'export' ? <LoaderCircle className="spin" size={16}/> : <Download size={16}/>} {STATIC_SITE ? '打印 / 保存 PDF' : '下载 PDF'}</Button><Button secondary className="full-width" disabled={Boolean(busy) || !finalText.trim()} onClick={() => void download('docx')}><FileText size={16}/> 下载 Word · DOCX</Button><div className="other-exports"><button disabled={Boolean(busy)} onClick={() => void download('txt')}>TXT</button><span>·</span><button disabled={Boolean(busy)} onClick={() => void download('md')}>Markdown</button><span>·</span><button disabled={Boolean(busy)} onClick={() => void download('json')}>备份草稿</button></div><p className="export-tip">{STATIC_SITE && 'PDF 使用浏览器打印另存为；Word 可直接下载。'}屏幕预览用于核对内容。请打开导出文件，检查正式分页和最终排版。</p></section><div className="farewell"><MoonFriend small/><p>每一次认真整理，<br/>都是向前的一小步。</p><span>愿你的下一章，自带光芒。 ✧</span></div><button className="text-button" onClick={() => navigate(2)}><ArrowLeft size={15}/> 返回修改建议</button></aside></div>}
        </motion.div></AnimatePresence>
        {error && <div className="error-banner" role="alert"><AlertCircle size={17}/><span>{error}</span><button onClick={() => setError('')} aria-label="关闭错误"><X size={15}/></button></div>}
        <footer className="workspace-footer"><span>一点月光，一点勇气。</span><span>MADE FOR YOUR NEXT CHAPTER <span>✦</span></span></footer>
      </main>
    </div>

    <AnimatePresence>{toast && <motion.div role="status" className="toast" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}><Check size={16}/>{toast}</motion.div>}</AnimatePresence>
    <AnimatePresence>{busy === 'optimize' && <motion.div className="overlay processing-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><section ref={node => { dialogRef.current = node as HTMLDivElement | null; }} role="dialog" aria-modal="true" aria-labelledby="processing-title" className="processing-card"><MoonFriend thinking/><span className="eyebrow">A LITTLE PATIENCE, A LITTLE MAGIC</span><h2 id="processing-title">慢慢正在读你的故事。</h2><p>梳理经历、对照方向、寻找更清晰的表达。<br/>正在等待你的模型返回建议，通常需要几十秒。</p><div className="processing-track"><span/></div><span className="processing-status"><LoaderCircle size={14} className="spin"/> 已发送到 {config.model}，等待模型响应</span><button className="text-button" onClick={() => abortRef.current?.abort()}>取消此次优化</button></section></motion.div>}</AnimatePresence>
    <AnimatePresence>{modal && <motion.div className="overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={e => { if (e.target === e.currentTarget) { setSettings(false); setHelp(false); setClearDialog(false); setPreview(false); } }}><motion.div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="dialog-title" className={`modal ${preview ? 'preview-modal' : ''}`} initial={{ opacity: 0, y: 24, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12, scale: 0.98 }}><button className="modal-close" onClick={() => { setSettings(false); setHelp(false); setClearDialog(false); setPreview(false); }} aria-label="关闭弹窗"><X size={20}/></button>
      {settings && <><span className="modal-eyebrow"><KeyRound size={17}/> YOUR MODEL, YOUR CHOICE</span><h2 id="dialog-title">连接你的 AI 伙伴</h2><p className="modal-intro">用你自己的 Key。模型费用由对应服务商收取。</p><label htmlFor="provider">模型服务</label><select id="provider" value={config.provider === 'ollama' ? 'ollama' : config.baseUrl.includes('tokendance.space') ? 'tokendance' : config.baseUrl.includes('deepseek.com') ? 'deepseek' : config.baseUrl.includes('openrouter.ai') ? 'openrouter' : config.baseUrl === 'https://api.openai.com/v1' ? 'openai' : 'custom'} onChange={e => { const presets: Record<string, Partial<Config>> = { tokendance: { provider: 'compatible', baseUrl: 'https://tokendance.space/gateway/v1', model: 'glm-5.2' }, deepseek: { provider: 'compatible', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' }, openai: { provider: 'compatible', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4.1-mini' }, openrouter: { provider: 'compatible', baseUrl: 'https://openrouter.ai/api/v1', model: 'deepseek/deepseek-chat' }, ollama: { provider: 'ollama', baseUrl: 'http://127.0.0.1:11434', model: 'qwen3:8b', apiKey: '' }, custom: { provider: 'compatible', baseUrl: '', model: '' } }; updateConfig({ ...presets[e.target.value], apiKey: '' }); }}><option value="tokendance">TokenDance · 词元跳动</option><option value="deepseek">DeepSeek</option><option value="openai">OpenAI</option><option value="openrouter">OpenRouter</option><option value="custom">自定义 · OpenAI 兼容接口</option><option value="ollama">Ollama · 本地模型</option></select><label htmlFor="base-url">API 地址 <small>{config.provider === 'ollama' ? '本机 Ollama 地址' : '通常以 /v1 结尾'}</small></label><input id="base-url" value={config.baseUrl} onChange={e => updateConfig({ baseUrl: e.target.value })} placeholder="https://api.example.com/v1"/><label htmlFor="model">模型名称</label><input id="model" value={config.model} onChange={e => updateConfig({ model: e.target.value })} placeholder="填写服务商实际提供的模型 ID"/>{config.provider !== 'ollama' && <><label htmlFor="api-key">API Key <small>仅本次会话使用</small></label><input id="api-key" type="password" autoComplete="off" spellCheck={false} value={config.apiKey} onChange={e => updateConfig({ apiKey: e.target.value })} placeholder="sk-…"/></>}<div className="key-privacy"><ShieldCheck size={17}/><p>Key 不写入草稿、磁盘或导出文件。刷新或关闭页面后需重新填写。{config.provider === 'ollama' ? '本地模型无需 Key。' : '优化时，简历与岗位描述会发送给你选择的服务商。'}</p></div>{STATIC_SITE && <p className="hosting-note">网页版由浏览器直接请求模型，接口需要允许跨域（CORS）。Key 只发给你填写的 API 地址，不交给 GitHub 或项目作者。若服务商不允许跨域，可下载 Windows 本地版。</p>}{testState === 'error' && <div role="alert" className="test-error">{testError}</div>}{testState === 'ok' && <div role="status" className="test-success"><Check size={15}/> 连接成功，可以开始打磨了</div>}<div className="modal-actions"><Button secondary disabled={testState === 'testing'} onClick={() => void testProvider()}>{testState === 'testing' ? <LoaderCircle className="spin" size={15}/> : <Monitor size={15}/>} 测试连接</Button><Button onClick={() => { setSettings(false); setToast('模型设置已应用于本次会话。'); }}>完成设置 <Check size={16}/></Button></div><button className="text-button key-clear" onClick={() => { updateConfig({ apiKey: '' }); setToast('Key 已从当前页面内存中清除。'); }}><Trash2 size={13}/> 清除当前 Key</button></>}
      {help && <><span className="modal-eyebrow"><Moon size={17}/> A GENTLE START</span><h2 id="dialog-title">慢慢来，四步就好</h2><div className="help-steps">{STEPS.map((s, i) => <div key={s.title}><span>0{i + 1}</span><p><strong>{s.title}</strong>{['导入 PDF、DOCX、TXT 或 MD，或粘贴文字。核对解析结果，确保经历完整。', '填写目标岗位，选择表达风格。在右上角连接你的模型，也可先体验示例。', '查看修改前后与理由。逐条采纳、撤回；涉及新事实的内容务必先核实。', '编辑成稿、选择样式，导出 PDF 或可编辑的 Word 文件。'][i]}</p></div>)}</div><div className="help-detail"><strong>文件与隐私</strong><p>最大 10 MB。旧版 DOC {docAvailable ? '可通过已检测到的 LibreOffice 转换读取' : '需安装 LibreOffice，或先另存为 DOCX'}。扫描 PDF 暂不提供 OCR，可先转成文字再导入。</p><p>草稿自动保存在当前浏览器的这台设备上。共享电脑使用后，可点击左下角清除；Key 只保存在页面内存中。</p><p>已支持 DeepSeek、OpenAI、OpenRouter、OpenAI 兼容接口及本地 Ollama。原生 Gemini／Anthropic 接口需通过兼容网关接入。</p></div><Button className="full-width" onClick={() => setHelp(false)}>明白了，慢慢开始 <ArrowRight size={16}/></Button></>}
      {clearDialog && <><span className="modal-eyebrow"><Trash2 size={17}/> LOCAL DRAFT</span><h2 id="dialog-title">清除这份本地草稿？</h2><p className="modal-intro">简历、岗位描述和修改建议会从此浏览器移除。已下载的文件不会受影响。</p><div className="modal-actions"><Button secondary onClick={() => setClearDialog(false)}>保留草稿</Button><Button onClick={() => { setDraft(EMPTY); setStep(0); setPaste(false); setClearDialog(false); setToast('本地草稿已清除。'); }}>确认清除</Button></div></>}
      {preview && <><h2 id="dialog-title">简历内容预览</h2><Paper text={finalText} theme={theme}/></>}
    </motion.div></motion.div>}</AnimatePresence>
  </div></MotionConfig>;
}

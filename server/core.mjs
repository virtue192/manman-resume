import { z } from 'zod';

export const providerSchema = z.object({
  provider: z.enum(['compatible', 'ollama']).default('compatible'),
  baseUrl: z.string().max(500), model: z.string().min(1).max(150), apiKey: z.string().max(2000).default(''),
});
export const optimizeSchema = z.object({ text: z.string().min(30).max(60000), jd: z.string().max(20000).default(''), tone: z.enum(['balanced', 'concise', 'impact']).default('balanced'), config: providerSchema });
export const resultSchema = z.object({
  summary: z.string().max(1500), strengths: z.array(z.string().max(400)).max(6),
  suggestions: z.array(z.object({ original: z.string().min(3).max(3000), replacement: z.string().min(1).max(3000), reason: z.string().max(600), category: z.enum(['表达', '结构', '岗位匹配']), needsConfirmation: z.boolean().default(false) })).max(15),
  questions: z.array(z.string().max(400)).max(8).default([]),
});

export function validateEndpoint(config) {
  let url;
  try { url = new URL(config.baseUrl); } catch { throw new Error('请输入完整的 API 地址，例如 https://api.deepseek.com/v1。'); }
  const local = ['localhost', '127.0.0.1', '[::1]', 'host.docker.internal'].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash || (!local && url.protocol !== 'https:') || !['https:', 'http:'].includes(url.protocol)) throw new Error('云端 API 请使用 HTTPS；本机模型可使用 http://127.0.0.1:11434。');
  if (config.provider !== 'ollama' && !config.apiKey.trim()) throw new Error('请先填写你的 API Key。');
  if (config.apiKey.includes('\n') || config.apiKey.includes('\r')) throw new Error('API Key 格式不正确。');
  return url.toString().replace(/\/$/, '');
}

export function parseModelJSON(content) {
  const clean = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { return JSON.parse(clean); } catch { throw new Error('模型没有返回可用的结构化结果，请重试或换一个支持 JSON 的模型。'); }
}

export function groundedResult(raw, source) {
  const result = resultSchema.parse(raw);
  const seen = new Set();
  const ranges = [];
  let excluded = 0;
  result.suggestions = result.suggestions.filter(s => {
    const first = source.indexOf(s.original);
    const end = first + s.original.length;
    if (first < 0 || source.indexOf(s.original, first + 1) >= 0 || s.original === s.replacement || seen.has(s.original) || ranges.some(r => first < r.end && end > r.start)) { excluded++; return false; }
    seen.add(s.original);
    ranges.push({ start: first, end });
    // New figures require an explicit factual review, even if the model omitted its flag.
    const numbers = s.replacement.match(/\d+(?:\.\d+)?/g) || [];
    s.needsConfirmation ||= numbers.some(n => !(s.original.match(/\d+(?:\.\d+)?/g) || []).includes(n));
    return true;
  });
  if (excluded) result.questions.push(`已过滤 ${excluded} 条无法唯一对应原文或互相重叠的修改，原始经历仍保留。`);
  return result;
}

export function applySuggestions(source, suggestions, accepted) {
  const replacements = suggestions.map((s, i) => ({ ...s, i, pos: source.indexOf(s.original) })).filter(s => accepted.includes(s.i) && s.pos >= 0).sort((a, b) => b.pos - a.pos);
  let result = source;
  for (const s of replacements) result = result.slice(0, s.pos) + s.replacement + result.slice(s.pos + s.original.length);
  return result;
}

export function escapeHTML(value) { return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
export function isHeading(line) { return /^(个人简介|个人优势|职业概述|工作经历|实习经历|项目经历|教育经历|教育背景|专业技能|技能|证书|荣誉奖项|自我评价|求职意向|联系方式|SUMMARY|EXPERIENCE|EDUCATION|SKILLS|PROJECTS|CERTIFICATIONS|PROFILE)$/i.test(line.replace(/^[#\s]+|[：:\s]+$/g, '')); }

export function resumeHTML(text, theme = 'classic') {
  const lines = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const title = lines.shift() || '我的简历';
  const body = lines.map(line => isHeading(line) ? `<h2>${escapeHTML(line.replace(/^#+\s*/, ''))}</h2>` : `<p>${escapeHTML(line.replace(/^[#]+\s*/, ''))}</p>`).join('');
  const accent = theme === 'moon' ? '#655382' : theme === 'minimal' ? '#222222' : '#243b53';
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>@page{size:A4;margin:16mm 18mm}*{box-sizing:border-box}body{font-family:"Microsoft YaHei","Noto Sans CJK SC","PingFang SC",sans-serif;color:#242833;font-size:10.5pt;line-height:1.65;margin:0}h1{font-size:25pt;color:${accent};margin:0 0 14px;letter-spacing:1px}h2{font-size:12pt;color:${accent};border-bottom:1px solid #d9dce2;padding-bottom:5px;margin:20px 0 8px;break-after:avoid}p{margin:5px 0;white-space:pre-wrap;overflow-wrap:anywhere;orphans:2;widows:2}header{border-bottom:2px solid ${accent};padding-bottom:10px}h1,p{page-break-inside:avoid}</style></head><body><header><h1>${escapeHTML(title)}</h1></header>${body}</body></html>`;
}

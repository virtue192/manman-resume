import { z } from 'zod';
import { providerSchema, resultSchema, groundedResult, parseModelJSON, resumeHTML, isHeading, type ModelConfig } from '../server/core.mjs';
import { callModel, SYSTEM_PROMPT } from '../server/model.mjs';

export const STATIC_SITE = import.meta.env.MODE === 'pages';
export const asset = (path: string) => `${import.meta.env.BASE_URL}${path}`;

async function browserModel(config: ModelConfig, messages: { role: string; content: string }[], signal?: AbortSignal, json = false) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) abort(); else signal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(abort, 180000);
  try { return await callModel(config, messages, controller.signal, json); }
  catch (error) {
    if (controller.signal.aborted) throw new Error('请求已取消或超时，草稿仍在当前浏览器中。');
    if ((error as Error).message.startsWith('无法连接')) throw new Error('浏览器无法连接模型服务。请检查地址和网络；该服务也可能未允许跨域访问（CORS）。可以改用支持浏览器跨域的接口，或下载 Windows 本地版。');
    throw error;
  } finally { clearTimeout(timeout); signal?.removeEventListener('abort', abort); }
}

export async function request<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
  if (!STATIC_SITE) {
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || '请求未成功，请重试。'); return data;
  }
  if (url === '/api/test-provider') {
    const config = providerSchema.parse(body);
    await browserModel(config, [{ role: 'user', content: 'Reply with OK.' }]);
    return { ok: true } as T;
  }
  if (url === '/api/optimize') {
    const data = z.object({ text: z.string().min(30).max(60000), jd: z.string().max(20000), tone: z.enum(['balanced', 'concise', 'impact']), config: providerSchema }).parse(body);
    const styles = { balanced: '准确、自然、专业', concise: '精简冗余，强调信息密度', impact: '突出已有行动、贡献和结果，不能虚构量化数据' };
    const content = await browserModel(data.config, [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: JSON.stringify({ resume: data.text, jobDescription: data.jd, editingStyle: styles[data.tone] }) }], signal, true);
    return groundedResult(parseModelJSON(content), data.text) as T;
  }
  throw new Error('此功能在当前网页版本中不可用。');
}

export async function importResume(file: File) {
  if (!STATIC_SITE) {
    const data = new FormData(); data.append('file', file);
    const response = await fetch('/api/import', { method: 'POST', body: data }); const parsed = await response.json();
    if (!response.ok) throw new Error(parsed.error); return parsed;
  }
  if (file.size > 10 * 1024 * 1024) throw new Error('文件不能超过 10 MB。');
  const extension = file.name.split('.').pop()?.toLowerCase();
  let text = '';
  if (extension === 'json') {
    const backup = z.object({ app: z.literal('manman-resume'), version: z.literal(1), text: z.string().min(30).max(60000), jd: z.string().max(20000), fileName: z.string().max(500), result: resultSchema.nullable(), accepted: z.array(z.number().int().min(0).max(14)).max(15), demo: z.boolean(), finalEdit: z.string().max(60000).nullable() }).parse(JSON.parse(await file.text()));
    if (backup.result && (groundedResult(backup.result, backup.text).suggestions.length !== backup.result.suggestions.length || backup.accepted.some(i => i >= backup.result!.suggestions.length))) throw new Error('备份中的修改无法对应原文，请重新导出备份。');
    const { app: _app, version: _version, ...draft } = backup; return { draft };
  }
  if (['txt', 'md'].includes(extension || '')) text = await file.text();
  else if (extension === 'docx') {
    const mammoth = await import('mammoth/mammoth.browser');
    text = (await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })).value;
  } else if (extension === 'pdf') {
    const pdfjs = await import('pdfjs-dist');
    const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
    try {
      const pdf = await task.promise;
      const pages: string[] = [];
      for (let n = 1; n <= pdf.numPages; n++) {
        const page = await pdf.getPage(n); const content = await page.getTextContent();
        let paragraph = '';
        for (const item of content.items) if ('str' in item) paragraph += item.str + (item.hasEOL ? '\n' : ' ');
        pages.push(paragraph); page.cleanup();
      }
      text = pages.join('\n\n');
    } finally { await task.destroy(); }
  } else if (extension === 'doc') throw new Error('网页版请导入 DOCX。旧版 DOC 可用 Word 另存为 DOCX，或在 Windows 本地版安装 LibreOffice 后读取。');
  else throw new Error('支持 PDF、DOCX、TXT、MD 和本应用的 JSON 备份。');
  text = text.replace(/\u0000/g, '').trim();
  if (text.length < 30) throw new Error('可读取的文字太少。扫描 PDF 请先 OCR，或粘贴简历文字。');
  if (text.length > 60000) throw new Error('简历文字过长，请控制在 60,000 字符以内。');
  return { text, fileName: file.name };
}

export async function exportWord(text: string, theme: string) {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, BorderStyle } = await import('docx');
  const lines = text.split(/\r?\n/).map(s => s.trim()); const first = lines.findIndex(Boolean);
  const color = theme === 'moon' ? '655382' : theme === 'minimal' ? '222222' : '243B53';
  const children = lines.map((line, i) => new Paragraph({
    ...(i === first ? { heading: HeadingLevel.TITLE, spacing: { after: 200 } } : isHeading(line) ? { heading: HeadingLevel.HEADING_1, spacing: { before: 260, after: 100 }, border: { bottom: { style: BorderStyle.SINGLE, size: 3, color: 'D9DCE2' } }, keepNext: true } : { spacing: { after: 85, line: 300 } }),
    children: [new TextRun({ text: line.replace(/^#+\s*/, ''), font: { ascii: 'Calibri', eastAsia: 'Microsoft YaHei', hAnsi: 'Calibri' }, size: i === first ? 48 : isHeading(line) ? 25 : 21, bold: i === first || isHeading(line), color: i === first || isHeading(line) ? color : '242833' })],
  }));
  return Packer.toBlob(new Document({ creator: 'Manman Resume', title: '简历', sections: [{ properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 907, bottom: 907, left: 1020, right: 1020 } } }, children }] }));
}

export function printResume(text: string, theme: string) {
  const pop = window.open('', '_blank');
  if (!pop) throw new Error('请允许此网站打开打印窗口，再重试。');
  pop.opener = null;
  const html = resumeHTML(text, theme).replace('<head>', '<head><title>我的简历</title>').replace('</body>', '<script>document.fonts.ready.then(()=>{setTimeout(()=>window.print(),300)});</script></body>');
  pop.document.open(); pop.document.write(html); pop.document.close();
}

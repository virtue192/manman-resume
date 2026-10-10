import express from 'express';
import multer from 'multer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z, ZodError } from 'zod';
import { providerSchema, optimizeSchema, resultSchema, groundedResult, parseModelJSON } from './core.mjs';
import { callModel, SYSTEM_PROMPT } from './model.mjs';
import { parseFile, exportDOCX, exportPDF, libreOfficePath, browserPath } from './files.mjs';

const app = express();
app.disable('x-powered-by');
const allowedHosts = new Set(['127.0.0.1', 'localhost', '[::1]']);
app.use((req, res, next) => {
  if (!allowedHosts.has(req.hostname)) return res.status(403).json({ error: '该工作室仅允许从本机访问。' });
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  if (req.path.startsWith('/api')) {
    res.setHeader('Cache-Control', 'no-store');
    if (req.headers.origin) {
      try { if (!allowedHosts.has(new URL(req.headers.origin).hostname) || ![String(process.env.PORT || 4317), '5173'].includes(new URL(req.headers.origin).port)) throw new Error(); }
      catch { return res.status(403).json({ error: '不允许来自其他网站的请求。' }); }
    }
  }
  next();
});
app.use(express.json({ limit: '1mb' }));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 } });
app.get('/api/health', (_req, res) => res.json({ ok: true, doc: Boolean(libreOfficePath()), pdf: Boolean(browserPath()), version: '0.4.0' }));
app.post('/api/import', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: '请选择简历文件。' });
  try {
    if (path.extname(req.file.originalname).toLowerCase() === '.json') {
      const backup = z.object({ app: z.literal('manman-resume'), version: z.literal(1), text: z.string().min(30).max(60000), jd: z.string().max(20000), fileName: z.string().max(500), result: resultSchema.nullable(), accepted: z.array(z.number().int().min(0).max(14)).max(15), demo: z.boolean(), finalEdit: z.string().max(60000).nullable() }).parse(JSON.parse(req.file.buffer.toString('utf8')));
      if (backup.result && (groundedResult(backup.result, backup.text).suggestions.length !== backup.result.suggestions.length || backup.accepted.some(i => i >= backup.result.suggestions.length))) throw new Error('简历备份中的修改无法对应原文，请重新导出备份。');
      const { app: _app, version: _version, ...draft } = backup;
      return res.json({ draft });
    }
    res.json({ text: await parseFile(req.file), fileName: req.file.originalname });
  }
  catch (error) { res.status(422).json({ error: error.message.includes('简历') || error.message.includes('PDF') || error.message.includes('OCR') || error.message.includes('LibreOffice') || error.message.includes('支持') ? error.message : '无法读取文件。请确认文件未加密、未损坏，或改用粘贴文字。' }); }
});
function requestSignal(req, res) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 180000);
  const close = () => { if (!res.writableEnded) controller.abort(); clearTimeout(timeout); };
  res.on('close', close);
  return { signal: controller.signal, cleanup: () => { clearTimeout(timeout); res.off('close', close); } };
}
app.post('/api/test-provider', async (req, res) => {
  const config = providerSchema.parse(req.body);
  const task = requestSignal(req, res);
  try { await callModel(config, [{ role: 'user', content: 'Reply with OK.' }], task.signal); res.json({ ok: true }); }
  catch (error) { res.status(422).json({ error: error.message }); }
  finally { task.cleanup(); }
});
app.post('/api/optimize', async (req, res) => {
  const data = optimizeSchema.parse(req.body);
  const task = requestSignal(req, res);
  try {
    const tones = { balanced: '准确、自然、专业', concise: '精简冗余，强调信息密度', impact: '突出已有行动、贡献和结果，不能虚构量化数据' };
    const content = await callModel(data.config, [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: JSON.stringify({ resume: data.text, jobDescription: data.jd, editingStyle: tones[data.tone] }) }], task.signal, true);
    res.json(groundedResult(parseModelJSON(content), data.text));
  } catch (error) { res.status(422).json({ error: error instanceof ZodError ? '模型返回的结果结构不完整，请重试或切换模型。' : error.message }); }
  finally { task.cleanup(); }
});
app.post('/api/export', async (req, res) => {
  const data = z.object({ text: z.string().min(1).max(60000), format: z.enum(['pdf', 'docx']), theme: z.enum(['classic', 'moon', 'minimal']).default('classic') }).parse(req.body);
  try {
    const result = data.format === 'pdf' ? await exportPDF(data.text, data.theme) : await exportDOCX(data.text, data.theme);
    res.type(data.format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="resume.${data.format}"`);
    res.send(result);
  } catch (error) { res.status(422).json({ error: error.message }); }
});
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
app.use(express.static(path.join(root, 'dist')));
app.get('/{*splat}', (_req, res) => res.sendFile(path.join(root, 'dist', 'index.html')));
app.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError) return res.status(400).json({ error: error.code === 'LIMIT_FILE_SIZE' ? '文件不能超过 10 MB。' : '请一次上传一份简历。' });
  res.status(400).json({ error: error instanceof ZodError ? '输入内容不完整或过长，请检查后重试。' : '请求无法处理，请检查输入内容。' });
});
const port = Number(process.env.PORT || 4317);
app.listen(port, process.env.HOST || '127.0.0.1', () => console.log(`\n  慢慢🌙 简历工作室\n  http://127.0.0.1:${port}\n  仅本机访问 · Key 不写入磁盘\n`)).on('error', error => { console.error(error.code === 'EADDRINUSE' ? `端口 ${port} 已被占用。请关闭旧窗口或设置 PORT。` : '本地服务启动失败。'); process.exit(1); });

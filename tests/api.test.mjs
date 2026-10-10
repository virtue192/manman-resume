import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';
const origin = 'http://127.0.0.1:4318';
const resume = '林知夏\n产品运营\n工作经历\n参与策划6场线上活动，累计1200人参加。\n教育背景\n华东理工大学 | 本科 | 2018—2022';
let child, mock, mockURL;
before(async () => {
  mock = createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    const payload = JSON.parse(body);
    assert.equal(req.headers.authorization, 'Bearer test-secret-key');
    res.setHeader('Content-Type', 'application/json');
    const content = payload.messages.length === 1 ? 'OK' : JSON.stringify({ summary: '保留真实活动数据，精简表达。', strengths: ['有活动经验'], suggestions: [{ original: '参与策划6场线上活动，累计1200人参加。', replacement: '参与策划6场线上活动，累计吸引1200人参与。', reason: '简洁表达', category: '表达' }, { original: '虚构的经历', replacement: '新经历', reason: '测试过滤', category: '表达' }], questions: [] });
    res.end(JSON.stringify({ choices: [{ message: { content } }] }));
  });
  await new Promise(resolve => mock.listen(0, '127.0.0.1', resolve));
  mockURL = `http://127.0.0.1:${mock.address().port}/v1`;
  child = spawn(process.execPath, ['server/index.mjs'], { env: { ...process.env, PORT: '4318' }, stdio: 'ignore', windowsHide: true });
  for (let i = 0; i < 50; i++) { try { if ((await fetch(`${origin}/api/health`)).ok) return; } catch {} await new Promise(r => setTimeout(r, 200)); }
  throw new Error('Test server did not start');
});
after(async () => { child?.kill(); await new Promise(resolve => mock?.close(resolve)); });
function post(route, data, extra = {}) { return fetch(`${origin}${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...extra }, body: JSON.stringify(data) }); }
test('server blocks foreign origins and validates model inputs', async () => {
  const blocked = await post('/api/optimize', {}, { Origin: 'https://malicious.example' }); assert.equal(blocked.status, 403);
  const invalid = await post('/api/optimize', {}); assert.equal(invalid.status, 400);
});
test('BYOK forwards configured key and returns only grounded suggestions', async () => {
  const config = { provider: 'compatible', baseUrl: mockURL, model: 'test-model', apiKey: 'test-secret-key' };
  assert.equal((await post('/api/test-provider', config)).status, 200);
  const response = await post('/api/optimize', { text: resume, jd: '', tone: 'balanced', config });
  assert.equal(response.status, 200);
  const output = await response.json(); assert.equal(output.suggestions.length, 1); assert.ok(!JSON.stringify(output).includes(config.apiKey));
});
test('Chinese DOCX export can be imported with original facts intact', async () => {
  const response = await post('/api/export', { text: resume, format: 'docx', theme: 'moon' }); assert.equal(response.status, 200);
  const buffer = Buffer.from(await response.arrayBuffer()); assert.ok(buffer.length > 1000);
  const parsed = (await mammoth.extractRawText({ buffer })).value; assert.ok(parsed.includes('林知夏')); assert.ok(parsed.includes('1200'));
  const upload = new FormData(); upload.append('file', new Blob([buffer]), 'resume.docx');
  const imported = await fetch(`${origin}/api/import`, { method: 'POST', body: upload }); assert.equal(imported.status, 200); assert.ok((await imported.json()).text.includes('华东理工大学'));
});
test('Chinese PDF export contains searchable text and round-trips through import', async () => {
  const response = await post('/api/export', { text: resume, format: 'pdf', theme: 'classic' }); assert.equal(response.status, 200);
  const buffer = Buffer.from(await response.arrayBuffer()); assert.equal(buffer.subarray(0, 5).toString(), '%PDF-');
  const parser = new PDFParse({ data: buffer });
  try { const parsed = (await parser.getText()).text; assert.ok(parsed.includes('林知夏')); assert.ok(parsed.includes('1200')); } finally { await parser.destroy(); }
  const upload = new FormData(); upload.append('file', new Blob([buffer]), 'resume.pdf');
  const imported = await fetch(`${origin}/api/import`, { method: 'POST', body: upload }); assert.equal(imported.status, 200); assert.ok((await imported.json()).text.includes('林知夏'));
});
test('invalid PDFs and unsupported files have actionable errors', async () => {
  const upload = new FormData(); upload.append('file', new Blob(['not pdf']), 'bad.pdf');
  const response = await fetch(`${origin}/api/import`, { method: 'POST', body: upload }); assert.equal(response.status, 422); assert.ok((await response.json()).error.includes('PDF'));
  const unknown = new FormData(); unknown.append('file', new Blob(['text']), 'resume.exe');
  assert.equal((await fetch(`${origin}/api/import`, { method: 'POST', body: unknown })).status, 422);
});
test('draft backups restore edits without credentials and reject tampered suggestions', async () => {
  const backup = { app: 'manman-resume', version: 1, text: resume, jd: '', fileName: 'resume.txt', result: null, accepted: [], demo: false, finalEdit: resume + '\n补充事实' };
  const upload = new FormData(); upload.append('file', new Blob([JSON.stringify(backup)]), 'backup.json');
  const response = await fetch(`${origin}/api/import`, { method: 'POST', body: upload }); assert.equal(response.status, 200); assert.equal((await response.json()).draft.finalEdit, backup.finalEdit);
  const tampered = { ...backup, result: { summary: '说明', strengths: [], questions: [], suggestions: [{ original: '不存在的事实', replacement: '虚构成就', reason: '测试', category: '表达' }] }, accepted: [0] };
  const invalid = new FormData(); invalid.append('file', new Blob([JSON.stringify(tampered)]), 'backup.json');
  assert.equal((await fetch(`${origin}/api/import`, { method: 'POST', body: invalid })).status, 422);
});

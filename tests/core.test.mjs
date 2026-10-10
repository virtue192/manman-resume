import test from 'node:test';
import assert from 'node:assert/strict';
import { groundedResult, applySuggestions, parseModelJSON, validateEndpoint, resumeHTML } from '../server/core.mjs';
const input = '参与策划6场活动，累计1200人参加。\n负责整理数据。';
const suggestion = { original: '参与策划6场活动，累计1200人参加。', replacement: '参与策划6场线上活动，累计1200人参加。', reason: '表达更清晰', category: '表达' };
const result = suggestions => ({ summary: '说明', strengths: [], suggestions, questions: [] });
test('grounding drops missing, duplicate, overlapping and ambiguous quotations', () => {
  const output = groundedResult(result([suggestion, suggestion, { ...suggestion, original: '不存在的经历' }, { ...suggestion, original: '策划6场活动' }]), input);
  assert.equal(output.suggestions.length, 1);
  assert.ok(output.questions[0].includes('过滤 3 条'));
  assert.equal(groundedResult(result([{ ...suggestion, original: '负责整理数据。' }]), '负责整理数据。\n负责整理数据。').suggestions.length, 0);
  const overlapping = [{ ...suggestion, original: 'ABCDE' }, { ...suggestion, original: 'CDEFG' }];
  assert.equal(groundedResult(result(overlapping), 'ABCDEFG').suggestions.length, 1);
});
test('new metrics always need confirmation', () => {
  assert.equal(groundedResult(result([{ ...suggestion, replacement: '组织12场活动，3000人参加。' }]), input).suggestions[0].needsConfirmation, true);
  assert.equal(groundedResult(result([suggestion]), input).suggestions[0].needsConfirmation, false);
});
test('accepted edits apply against source offsets, without cascading replacement', () => {
  const source = '原文一\n原文二';
  const suggestions = [{ original: '原文一', replacement: '原文二' }, { original: '原文二', replacement: '结果' }];
  assert.equal(applySuggestions(source, suggestions, [0, 1]), '原文二\n结果');
  assert.equal(applySuggestions(source, suggestions, []), source);
});
test('supports fenced model JSON but rejects non-JSON', () => {
  assert.deepEqual(parseModelJSON('```json\n{"ok":true}\n```'), { ok: true });
  assert.throws(() => parseModelJSON('I am not JSON'));
});
test('endpoint rejects plaintext cloud URLs, embedded credentials and missing keys', () => {
  assert.throws(() => validateEndpoint({ provider: 'compatible', baseUrl: 'http://example.com/v1', apiKey: 'key' }));
  assert.throws(() => validateEndpoint({ provider: 'compatible', baseUrl: 'https://user:password@example.com/v1', apiKey: 'key' }));
  assert.throws(() => validateEndpoint({ provider: 'compatible', baseUrl: 'https://example.com/v1', apiKey: '' }));
  assert.equal(validateEndpoint({ provider: 'ollama', baseUrl: 'http://127.0.0.1:11434', apiKey: '' }), 'http://127.0.0.1:11434');
});
test('export escapes HTML and retains Chinese text', () => {
  const html = resumeHTML('林知夏\n工作经历\n<script>alert(1)</script>');
  assert.ok(html.includes('林知夏'));
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('<h2>工作经历</h2>'));
});

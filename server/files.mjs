import { existsSync } from 'node:fs';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';
import { chromium } from 'playwright';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, BorderStyle } from 'docx';
import { isHeading, resumeHTML } from './core.mjs';

const execFileAsync = promisify(execFile);
export function libreOfficePath() {
  return [process.env.LIBREOFFICE_PATH, 'C:/Program Files/LibreOffice/program/soffice.exe', 'C:/Program Files (x86)/LibreOffice/program/soffice.exe', '/usr/bin/libreoffice', '/usr/bin/soffice', '/Applications/LibreOffice.app/Contents/MacOS/soffice'].find(p => p && existsSync(p));
}
export function browserPath() {
  return [process.env.BROWSER_PATH, 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/chromium', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(p => p && existsSync(p));
}
export async function parseFile(file) {
  const extension = path.extname(file.originalname).toLowerCase();
  let text;
  if (['.txt', '.md'].includes(extension)) text = file.buffer.toString('utf8');
  else if (extension === '.docx') text = (await mammoth.extractRawText({ buffer: file.buffer })).value;
  else if (extension === '.pdf') {
    if (!file.buffer.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new Error('这不是有效的 PDF 文件。');
    const parser = new PDFParse({ data: file.buffer });
    try { text = (await parser.getText({ pageJoiner: '' })).text; } finally { await parser.destroy(); }
  } else if (extension === '.doc') {
    const soffice = libreOfficePath();
    if (!soffice) throw new Error('旧版 .doc 需要本机安装 LibreOffice。也可以先用 Word 另存为 .docx，再导入。');
    const directory = await mkdtemp(path.join(tmpdir(), 'manman-doc-'));
    try {
      await writeFile(path.join(directory, 'resume.doc'), file.buffer);
      await execFileAsync(soffice, [`-env:UserInstallation=${new URL(`file:///${directory.replace(/\\/g, '/')}/profile`).href}`, '--headless', '--convert-to', 'docx', '--outdir', directory, path.join(directory, 'resume.doc')], { timeout: 45000, windowsHide: true });
      text = (await mammoth.extractRawText({ buffer: await readFile(path.join(directory, 'resume.docx')) })).value;
    } finally { await rm(directory, { recursive: true, force: true }); }
  } else throw new Error('支持 PDF、DOCX、DOC、TXT 和 Markdown 文件。');
  text = text.replace(/\u0000/g, '').trim();
  if (text.length < 30) throw new Error('可读取的文字太少。如果这是扫描件，请先进行 OCR，或直接粘贴简历文字。');
  if (text.length > 60000) throw new Error('简历文字过长，请控制在 60,000 字符以内。');
  return text;
}

export async function exportDOCX(text, theme = 'classic') {
  const lines = text.split(/\r?\n/).map(s => s.trim());
  const firstIndex = lines.findIndex(Boolean);
  const color = theme === 'moon' ? '655382' : theme === 'minimal' ? '222222' : '243B53';
  const children = lines.map((line, i) => {
    const heading = isHeading(line);
    return new Paragraph({
      ...(i === firstIndex ? { heading: HeadingLevel.TITLE, spacing: { after: 200 } } : heading ? { heading: HeadingLevel.HEADING_1, spacing: { before: 260, after: 100 }, border: { bottom: { style: BorderStyle.SINGLE, size: 3, color: 'D9DCE2' } }, keepNext: true } : { spacing: { after: 85, line: 300 } }),
      children: [new TextRun({ text: line.replace(/^#+\s*/, ''), font: { ascii: 'Calibri', eastAsia: 'Microsoft YaHei', hAnsi: 'Calibri' }, size: i === firstIndex ? 48 : heading ? 25 : 21, bold: i === firstIndex || heading, color: i === firstIndex || heading ? color : '242833' })],
    });
  });
  return Packer.toBuffer(new Document({ creator: 'Manman Resume', title: '简历', sections: [{ properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 907, bottom: 907, left: 1020, right: 1020 } } }, children }] }));
}

export async function exportPDF(text, theme) {
  let browser;
  try { browser = await chromium.launch({ headless: true, ...(browserPath() ? { executablePath: browserPath() } : {}) }); }
  catch { throw new Error('PDF 导出需要 Edge／Chrome，或运行 npx playwright install chromium 安装打印引擎。'); }
  try {
    const page = await browser.newPage();
    await page.setContent(resumeHTML(text, theme));
    await page.evaluate(() => document.fonts.ready);
    return await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true, timeout: 30000 });
  } finally { await browser.close(); }
}

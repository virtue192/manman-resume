import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 13)) { console.error('请安装 Node.js 22.13 或以上版本。'); process.exit(1); }
const windows = process.platform === 'win32';
function npm(command) {
  return new Promise((resolve, reject) => {
    const child = windows ? spawn('cmd.exe', ['/d', '/s', '/c', `npm ${command}`], { cwd: root, stdio: 'inherit', windowsHide: true }) : spawn('npm', command.split(' '), { cwd: root, stdio: 'inherit' });
    child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(new Error(`npm ${command} 失败。请检查网络和环境后重新启动。`)));
  });
}
try {
  console.log('\n  慢慢🌙 · 正在准备你的本地工作室…\n');
  if (!existsSync(path.join(root, 'node_modules'))) await npm('ci');
  await npm('run build');
  const port = process.env.PORT || '4317';
  const url = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, ['server/index.mjs'], { cwd: root, stdio: 'inherit', windowsHide: true });
  server.on('exit', code => process.exit(code || 0));
  process.on('SIGINT', () => server.kill());
  process.on('SIGTERM', () => server.kill());
  for (let attempt = 0; attempt < 30; attempt++) {
    if (server.exitCode !== null) break;
    try {
      const response = await fetch(`${url}/api/health`);
      if (response.ok) {
        if (windows) spawn('rundll32.exe', ['url.dll,FileProtocolHandler', url], { windowsHide: true, stdio: 'ignore' }).on('error', () => console.log(`请在浏览器打开 ${url}`));
        else console.log(`请在浏览器打开 ${url}`);
        console.log('保持此窗口开启。关闭窗口即可停止服务。');
        break;
      }
    } catch { /* server is starting */ }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
} catch (error) { console.error(error.message); process.exit(1); }

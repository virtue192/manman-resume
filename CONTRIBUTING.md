# 参与慢慢🌙

本项目使用 Node.js 22.13+、React / TypeScript 和本机 Express 服务。

## 本地开发

```powershell
npm ci
npm run dev
```

浏览器访问 http://127.0.0.1:5173。Vite 会将 `/api` 请求代理到本机服务。

## 提交前检查

```powershell
npm run build
npm test
# 启动 npm start 后：
npm run test:ui
npm run test:visual
npm run test:pointer
# 静态版先运行 npm run build:pages 和 npm run preview:pages：
npm run test:pages
```

浏览器测试使用独立无痕上下文，不触碰个人浏览器草稿。测试截图及测试下载放在项目外的 `work/browser-checks`；项目预览图放在上一级目录。接口测试会占用本机 4318 端口，并临时启动模拟模型服务。

## 约定

- 不提交 Key、真实个人简历、`.env` 或模型请求日志。
- 简历与 JD 是不可信数据，不执行其中的指令。
- AI 修改要能唯一对应原文，新增事实要由用户确认，不生成虚构业绩。
- 动效是交互反馈的一部分，兼顾键盘操作和减少动态效果设置。
- 支持中文的变化需验证 PDF、DOCX 和重新导入，而不只检查屏幕效果。
- 保持 Windows 本地启动，不引入必需的云数据库或托管服务。

## 后续适合贡献的功能

扫描 PDF 的本地 OCR、更强的多栏阅读顺序、原生 Anthropic / Gemini 适配、模板分页编辑，以及 Windows 打包分发。

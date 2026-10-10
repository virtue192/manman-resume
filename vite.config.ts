import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: mode === 'pages' ? '/manman-resume/' : '/',
  build: { outDir: mode === 'pages' ? 'dist-pages' : 'dist' },
  server: { port: 5173, strictPort: true, proxy: { '/api': 'http://127.0.0.1:4317' } },
}));

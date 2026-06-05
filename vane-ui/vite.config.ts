import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const { version: appVersion } = JSON.parse(
  readFileSync(path.join(__dirname, 'package.json'), 'utf-8'),
) as { version: string };

const apiTarget = process.env.VITE_API_PROXY ?? 'http://127.0.0.1:3000';

/** Dev UI port: set SHIYE_UI_PORT in the shell (start-dev.sh defaults to 5174). */
const uiPort = Number(process.env.SHIYE_UI_PORT) || 5174;

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    port: uiPort,
    strictPort: true,
    proxy: {
      '/api': { target: apiTarget, changeOrigin: true },
    },
  },
});

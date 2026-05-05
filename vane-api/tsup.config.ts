import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs'],
  platform: 'node',
  target: 'node20',
  outDir: 'dist',
  sourcemap: true,
  clean: true,
  external: ['better-sqlite3', '@napi-rs/canvas'],
  esbuildOptions(options) {
    options.alias = {
      stream: 'node:stream',
    };
  },
});

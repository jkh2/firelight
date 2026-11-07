import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { readFileSync, readdirSync } from 'node:fs';

// `npm run build`         -> normal site for Vercel (models served from /models)
// `npm run build:single`  -> one self-contained HTML file (models inlined) for quick phone previews
export default defineConfig(({ mode }) => {
  const single = mode === 'single';
  const models = {
    name: 'firelight-models',
    resolveId: (id) => (id === 'virtual:models' ? '\0virtual:models' : null),
    load(id) {
      if (id !== '\0virtual:models') return null;
      const files = readdirSync('public/models').filter((f) => f.endsWith('.glb'));
      const entries = files.map((f) => [f, single
        ? `b64:${readFileSync(`public/models/${f}`).toString('base64')}`
        : `models/${f}`]);
      return `export default ${JSON.stringify(Object.fromEntries(entries))};`;
    },
  };
  return {
    base: './',
    publicDir: single ? false : 'public',
    plugins: single ? [models, viteSingleFile()] : [models],
    build: { outDir: single ? 'dist-single' : 'dist', chunkSizeWarningLimit: 1500 },
    server: { host: true },
  };
});

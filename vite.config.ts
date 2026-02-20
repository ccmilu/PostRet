import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import { resolve } from 'path'
import { createReadStream, existsSync } from 'fs'

/**
 * Serve assets/models/ at /models/ during development.
 * Allows renderer process to fetch MediaPipe model files via /models/xxx.task
 */
function serveModelsPlugin(): Plugin {
  return {
    name: 'serve-models',
    configureServer(server) {
      server.middlewares.use('/models', (req, res, next) => {
        const filePath = resolve(__dirname, 'assets', 'models', req.url!.replace(/^\//, ''));
        if (existsSync(filePath)) {
          res.setHeader('Content-Type', 'application/octet-stream');
          createReadStream(filePath).pipe(res);
        } else {
          next();
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    serveModelsPlugin(),
    electron([
      {
        entry: 'electron/main.ts',
        onstart(args) {
          args.startup()
        },
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: ['electron'],
            },
          },
        },
      },
      {
        entry: 'electron/preload.ts',
        onstart(args) {
          args.reload()
        },
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: ['electron'],
            },
          },
        },
      },
    ]),
    renderer(),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  build: {
    outDir: 'dist',
  },
})

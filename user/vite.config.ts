import {defineConfig} from 'vite';
import viteReact from '@vitejs/plugin-react';
import {TanStackRouterVite} from '@tanstack/router-plugin/vite';
import {resolve} from 'path';

export default defineConfig({
  plugins: [TanStackRouterVite(), viteReact()],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  // Allow opening the dev server through a VS Code dev tunnel (*.devtunnels.ms)
  server: {allowedHosts: ['.devtunnels.ms']},
  build: {
    chunkSizeWarningLimit: 1500,
  },
});

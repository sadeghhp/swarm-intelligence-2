import { defineConfig } from 'vite';

export default defineConfig({
  base: '/swarm-intelligence-2/',
  server: {
    port: 3000,
    open: true
  },
  build: {
    target: 'esnext'
  },
  assetsInclude: ['**/*.wgsl']
});



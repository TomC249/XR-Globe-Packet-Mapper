import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 3000,
    open: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  // Babylon.js needs this to avoid issues with certain submodules
  optimizeDeps: {
    include: [
      '@babylonjs/core',
      '@babylonjs/materials',
      '@babylonjs/loaders',
      '@babylonjs/gui',
    ],
  },
});

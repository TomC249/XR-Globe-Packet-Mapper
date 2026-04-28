import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';


export default defineConfig({
plugins: [basicSsl()],
  server: {
    port: 3000,
    host: true,   // hosts on local ip, required for WebXR on mobile
    https: true,
    open: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  
  optimizeDeps: {
    include: [
      '@babylonjs/core',
      '@babylonjs/materials',
      '@babylonjs/loaders',
      '@babylonjs/gui',
    ],
  },
});

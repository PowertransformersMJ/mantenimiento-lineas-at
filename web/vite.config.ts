import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// El sitio se publica en Cloudflare Pages y es PÚBLICO. Lo que sale de aquí no
// contiene un solo byte de cliente: es el caparazón. Los datos reales llegan
// después, por lectura autenticada.
//
// ⚠️ ADR-005: SIN meta-framework. No hay servidor de renderizado en el
// despliegue, así que cualquier código con forma de Next.js rompe aquí.
export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2022',
    outDir: 'dist',
    sourcemap: true,
    chunkSizeWarningLimit: 700,
  },
  server: { port: 5173, strictPort: false },
});

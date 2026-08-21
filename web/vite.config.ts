import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// El sitio se publica en Cloudflare Pages y es PÚBLICO. Lo que sale de aquí no
// contiene un solo byte de cliente: es el caparazón. Los datos reales llegan
// después, por lectura autenticada.
//
// ⚠️ ADR-005: SIN meta-framework. No hay servidor de renderizado en el
// despliegue, así que cualquier código con forma de Next.js rompe aquí.
// El banco de pruebas del mapa (`sonda-satelital.html`) NO se construye salvo
// que se pida a mano con `SONDA_MAPA=1`. Sin esa variable, Vite solo construye
// `index.html` y la página del banco no existe en el sitio publicado — que es
// lo correcto: es una herramienta de diagnóstico, no una pantalla del producto.
//
// Con la variable puesta se construye ADEMÁS, y sirve para lo único que no se
// puede comprobar con el servidor de desarrollo: que el mapa siga vivo en el
// paquete COMPILADO. Ya pasó una vez que lo hacía en desarrollo y moría minificado
// (`32 · L-15`, el worker de MapLibre), y eso no se ve de otra manera.
const entradas = process.env.SONDA_MAPA
  ? { principal: 'index.html', sonda: 'sonda-satelital.html' }
  : undefined;

export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2022',
    outDir: 'dist',
    sourcemap: true,
    chunkSizeWarningLimit: 700,
    ...(entradas ? { rollupOptions: { input: entradas } } : {}),
  },
  server: { port: 5173, strictPort: false },
});

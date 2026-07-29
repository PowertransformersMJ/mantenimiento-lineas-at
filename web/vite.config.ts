import { defineConfig } from 'vite';

// El sitio se publica en Cloudflare Pages y es PÚBLICO. Por eso el paquete que
// sale de aquí no contiene un solo byte de cliente: es el caparazón. Los datos
// reales de AFINIA llegan después, por sincronización autenticada.
export default defineConfig({
  build: {
    target: 'es2022',
    outDir: 'dist',
    sourcemap: true,
    // Un aviso temprano vale más que una sorpresa en producción: si el paquete
    // engorda de golpe, casi siempre es que algo entró que no debía.
    chunkSizeWarningLimit: 400,
  },
  server: { port: 5173, strictPort: false },
});

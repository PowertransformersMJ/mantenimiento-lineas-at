// ============================================================================
// main.tsx — punto de entrada
// ----------------------------------------------------------------------------
// En esta página NO hay datos inventados (orden del Ingeniero). Y como el sitio
// es público, los datos reales no viajan en el paquete: llegan por lectura
// autenticada. Por eso el estado inicial es vacío, y eso es correcto.
// ============================================================================
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './estilo.css';
import { App } from './App';
import { RedDeSeguridad } from './componentes/RedDeSeguridad';

const raiz = document.getElementById('app');
// La red va DENTRO de StrictMode y FUERA de App: si envolviera solo una parte,
// un tropiezo en la cabecera o en el ruteo seguiría dejando la página en blanco.
if (raiz) createRoot(raiz).render(
  <StrictMode>
    <RedDeSeguridad>
      <App />
    </RedDeSeguridad>
  </StrictMode>,
);

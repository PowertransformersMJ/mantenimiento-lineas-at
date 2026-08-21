// ============================================================================
// sonda-satelital.tsx — BANCO DE PRUEBAS del componente REAL del mapa
// ----------------------------------------------------------------------------
// ⚠️ SOLO DESARROLLO. Vite construye únicamente `index.html`, así que esta
// página NO viaja al sitio publicado. No pide sesión, no toca la base y NO
// CONTIENE UNA SOLA COORDENADA DE CLIENTE: los apoyos son sintéticos y se
// derivan en tiempo de ejecución de la cabecera del recorte público del mapa,
// que es un archivo del propio repositorio.
//
// PARA QUÉ. La satelital no se pinta y el sitio real exige sesión, así que cada
// medida allí depende de que alguien abra su navegador. Aquí se monta EL MISMO
// componente `Mapa` —sus efectos, su panel, su interruptor— sobre datos falsos.
// Si aquí falla, el fallo es del componente y se depura sin nadie delante.
// ============================================================================
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Apoyo } from '@lineas/contratos';
import Mapa from './componentes/Mapa';
import { prepararTeselas } from './datos/teselas';
import './estilo.css';

/**
 * Apoyos SINTÉTICOS. Ni uno solo es real: se colocan en el centro del recorte
 * público —el que declara la cabecera del `.pmtiles` que viaja en este mismo
 * repositorio— y se separan por milésimas de grado. No hay un número de campo
 * escrito en este archivo a propósito: un literal con cuatro decimales en esta
 * franja es exactamente lo que el guardián de fugas bloquea, y con razón.
 */
function apoyosSinteticos(limites: [number, number, number, number]): Apoyo[] {
  const lon0 = (limites[0] + limites[2]) / 2;
  const lat0 = (limites[1] + limites[3]) / 2;
  return Array.from({ length: 6 }, (_, i) => ({
    id: `falso-${i}`,
    tipo: 'apoyo',
    lineaId: 'linea-falsa',
    orden: i,
    tipoPunto: 'Estructura',
    nombreCampo: `F${i + 1}`,
    coordenada: { lat: lat0 + i * 0.002, lon: lon0 + i * 0.002 },
    funcionEstructural: i === 0 || i === 5 ? 'Terminal' : 'Suspensión',
    funcionProcedencia: { origen: 'supuesto', fuente: 'banco de pruebas' },
    version: 1,
    // Dos tramos SIN cable de guarda, para ver cómo se pintan: uno de dos vanos
    // seguidos (F2→F4) y otro suelto (F5→F6). Es dato falso de un banco de
    // pruebas: nunca sale de aquí.
    ...(i === 1 || i === 2 ? { cableGuardaVanoSaliente: 'ausente' } : {}),
    ...(i === 4 ? { cableGuardaVanoSaliente: 'ausente' } : {}),
    ...(i === 0 ? { cableGuardaVanoSaliente: 'presente' } : {}),
  })) as unknown as Apoyo[];
}

function Banco() {
  const [apoyos, setApoyos] = useState<Apoyo[] | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);

  useEffect(() => {
    void prepararTeselas()
      .then((m) => setApoyos(apoyosSinteticos(m.limites)))
      .catch((e: Error) => setFallo(e.message));
  }, []);

  if (fallo) return <p>⛔ no se pudo preparar la cartografía: {fallo}</p>;
  if (!apoyos) return <p>preparando la cartografía…</p>;
  return <Mapa apoyos={apoyos} pantalla="banco-componente-real" />;
}

createRoot(document.getElementById('raiz')!).render(
  <StrictMode><Banco /></StrictMode>,
);

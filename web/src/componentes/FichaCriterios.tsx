// ============================================================================
// componentes/FichaCriterios.tsx — el semáforo de UN apoyo, dentro de su ficha
// ----------------------------------------------------------------------------
// La ficha de un punto enseñaba hasta hoy un INVENTARIO: qué hay. Este bloque
// responde la otra pregunta, la que hace que alguien abra una ficha — si lo que
// hay CUADRA. Va debajo del inventario a propósito: primero el hecho, después
// el juicio sobre el hecho.
//
// AQUÍ NO SE CALCULA NADA Y NO SE DECIDE NADA. Ni un umbral, ni una banda de
// ángulos, ni un `if` sobre un número de ingeniería: todo eso lo resuelve
// vistas/criteriosApoyo.ts, que a su vez solo llama al núcleo. Este archivo
// recibe cinco renglones ya juzgados y los viste. Si mañana hay que discutir un
// veredicto, la discusión NO empieza aquí — y esa es justamente la idea.
//
// Tampoco filtra ni reordena: pinta los cinco renglones tal y como llegan, en el
// orden en que llegan. Una fila que desaparece cuando falta el dato se lee como
// «eso ya no aplica», y entonces el hueco deja de contarse. El hueco tiene que
// verse (misma regla que la tabla de Umbrales).
//
// ⚠️ SIN CSS PROPIO. Reusa .calidad-lista / .calidad-item y los sellos que ya
// existen en estilo.css. Un bloque con estilos nuevos se sale del tema oscuro y
// —peor— de la hoja de impresión: el informe firmable sale de esta misma pantalla.
// ============================================================================
import { useMemo } from 'react';
import type { Apoyo } from '@lineas/contratos';
import { textoNucleo } from '../vistas/formato';
import { criteriosDeApoyo, type Criterio, type ContextoApoyo, type Veredicto }
  from '../vistas/criteriosApoyo';
import { Sello } from './Sello';

/**
 * Cómo se ve cada veredicto. Dos mapas y no uno porque son dos cosas distintas:
 * el FONDO del renglón dice cuánto grita, y el SELLO dice qué se concluyó.
 *
 * `cumple` va sobre fondo neutro, no verde: nada en esta pantalla es una
 * certificación, y un renglón verde brillante invita a leerlo como tal. El
 * sello verde ya dice lo que hay que decir, y va acompañado de su detalle —
 * que casi siempre aclara sobre qué NO opina el criterio.
 *
 * `revisar` es el único que tintan: es lo único accionable de la lista.
 * Tampoco existe un `atencion` (rojo) aquí — el sistema señala, dictamina quien
 * firma (CLAUDE.md §4), y para eso «revisar» ya alcanza.
 */
const FONDO: Record<Veredicto, string> = {
  cumple: 'info',
  revisar: 'aviso',
  no_evaluable: 'info',
};

const SELLO: Record<Veredicto, string> = {
  cumple: 'verde',
  revisar: 'ambar',
  no_evaluable: 'gris',
};

const ROTULO: Record<Veredicto, string> = {
  cumple: 'cumple',
  revisar: 'revisar',
  no_evaluable: 'no evaluable',
};

/**
 * @param apoyo     el punto que la ficha tiene abierto. Se acepta `null` para
 *                  que una ficha a medio cargar no tumbe la pestaña entera.
 * @param contexto  lo que la ficha sabe y el apoyo no lleva encima: la
 *                  deflexión y los vanos salen de las coordenadas de sus
 *                  VECINOS, y la tensión máxima es un dato de la línea.
 */
export function FichaCriterios({ apoyo, contexto }:
  { apoyo: Apoyo | null | undefined; contexto: ContextoApoyo | null | undefined }) {

  // Se memoriza por el punto y su contexto: el usuario salta de chip en chip y
  // cada salto rehace la lista entera. Barato, pero gratis es mejor.
  const criterios = useMemo<Criterio[]>(
    () => criteriosDeApoyo(apoyo, contexto),
    [apoyo, contexto],
  );

  if (!criterios.length) return null;

  const cuenta = (v: Veredicto) => criterios.filter((c) => c.veredicto === v).length;
  const aRevisar = cuenta('revisar');
  const sinJuzgar = cuenta('no_evaluable');

  return (
    <section className="panel">
      <h2>Criterios de este apoyo</h2>
      <p className="fine">
        <b>{cuenta('cumple')}</b> cumplen · <b>{aRevisar}</b> a revisar ·{' '}
        <b>{sinJuzgar}</b> no evaluables con los datos de hoy.{' '}
        {/* El recuento de «no evaluable» se enseña ARRIBA y en negrita a propósito:
            hoy son mayoría, y esconderlo daría la impresión de una ficha evaluada.
            Cuando la captura de campo (F4) llene el inventario, este número baja
            solo — y que baje es la señal de que la captura sirvió. */}
        «No evaluable» no es un fallo de la aplicación: es un hecho sobre los datos, y cada
        renglón dice cuál. Ninguno de estos veredictos certifica nada — certifica quien firma.
      </p>
      <Sello origen="criterios evaluados sobre el apoyo, uno por uno" />

      <ul className="calidad-lista">
        {criterios.map((c) => (
          <li key={c.id} className={`calidad-item ${FONDO[c.veredicto]}`}>
            <span className={`sello ${SELLO[c.veredicto]}`}>{ROTULO[c.veredicto]}</span>{' '}
            <b>{c.etiqueta}:</b> {c.valor}. {textoNucleo(c.detalle)}
            {/* El criterio viaja PEGADO a su veredicto, no en una nota al pie ni
                en un tooltip. Un semáforo sin fuente es una opinión con colores,
                y esto se imprime: en papel no hay dónde pasar el ratón. */}
            <span className="umbral-fuente">{textoNucleo(c.criterio)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ============================================================================
// tests/cargabilidad-guardado-contra-molde.test.js — lo que se ESCRIBE, ¿cabe
// en el molde?
// ----------------------------------------------------------------------------
// POR QUÉ EXISTE, y es la lección entera (`99 §ADR-109`, `35 · L-82`). El módulo
// de parámetros eléctricos leía el archivo, lo enseñaba en pantalla y lo
// dibujaba — y **no había guardado nunca nada**. Dos fallos encadenados, y los
// dos invisibles desde la pantalla:
//
//   1. la regla de la base se rompía al preguntar por un día que aún no existía
//      (arreglado en `firestore.rules`, probado en `tests/reglas/`);
//   2. y detrás estaba éste: el documento que produce el motor **no pasaba su
//      propio molde**. `id` heredaba el UUID de `Base` cuando la identidad de un
//      día es DETERMINISTA a propósito, y `circuito`, `subestacionOrigen` y
//      `subestacionDestino` llegan como `null` —«el archivo no lo dijo»— contra
//      un `.optional()` que solo admitía ausencia.
//
// ⚠️ Ninguna prueba validaba `DiaDeCargabilidad` ni `ResumenDiarioCargabilidad`.
// Se probaba el motor por un lado y el molde por otro, y el punto donde se
// tocan —que es donde se escribe en la base— no lo miraba nadie. Esta prueba
// recorre el camino ENTERO: registros → `empaquetarPorDia` → `resumirDia` → el
// objeto exacto que arma `guardarCarga` → `.parse()`.
//
// ⚠️ Datos SINTÉTICOS: el repositorio es público (`L-23`).
// ============================================================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { empaquetarPorDia, resumirDia } from '../nucleo/cargabilidad.js';
import {
  DiaDeCargabilidad, ResumenDiarioCargabilidad, CargaDeCargabilidad,
  idDelDia, idDelResumen,
} from '../contratos/src/cargabilidad.ts';

const ORG = 'org-de-prueba';
const UID = 'uid-de-prueba';
const AHORA = '2026-01-02T00:00:00.000Z';

/** Una hora de tensión por fases, que es lo que trae el archivo del Ingeniero. */
const hora = (h, rs, st, tr) => ({
  linea: 'LN-627', fecha: '2026-01-01', hora: h,
  tension_kV: rs, tension_RS_kV: rs, tension_ST_kV: st, tension_TR_kV: tr,
});

const REGISTROS = [hora(0, 68.4, 68.9, 68.4), hora(1, 68.3, 68.8, 68.3), hora(2, 68.2, 68.7, 68.2)];

/**
 * Lo mismo que hace `web/src/datos/cargabilidadRepo.guardarCarga`. Se copia
 * aquí a propósito: si el repositorio cambia lo que estampa, esta prueba deja de
 * reflejarlo y hay que actualizarla — que es justo el aviso que se quiere.
 */
const comoLoEscribeElRepositorio = (d) => ({
  id: idDelDia(ORG, String(d.linea), d.circuito, String(d.fecha)),
  orgId: ORG, creadoEn: AHORA, creadoPor: UID, revision: 0,
  ...d, cargaId: '6f1f5e2e-2a3c-4f8e-9a1d-0b7c2d3e4f50', versionMotor: '0.15.0',
});

describe('LO QUE SE ESCRIBE CABE EN SU MOLDE', () => {
  test('⚠️ un día real del motor pasa `DiaDeCargabilidad` — con su id derivado y sus nulos', () => {
    const { dias } = empaquetarPorDia(REGISTROS);
    assert.equal(dias.length, 1);

    // El motor escribe `null` en los tres: el archivo de SCADA no los trae.
    assert.equal(dias[0].circuito, null);
    assert.equal(dias[0].subestacionOrigen, null);
    assert.equal(dias[0].subestacionDestino, null);

    const doc = comoLoEscribeElRepositorio(dias[0]);
    const salida = DiaDeCargabilidad.parse(doc);     // ← aquí moría
    assert.equal(salida.id, `${ORG}__ln-627__-__2026-01-01`);
    assert.equal(salida.circuito, null, 'el «no lo dijo» se GUARDA, no se descarta');
    assert.equal(Object.keys(salida.horas).length, 3);
  });

  test('y su resumen pasa `ResumenDiarioCargabilidad`', () => {
    const { dias } = empaquetarPorDia(REGISTROS);
    const r = resumirDia(dias[0]);
    const doc = {
      id: idDelResumen(ORG, String(r.linea), String(r.fecha)),
      orgId: ORG, creadoEn: AHORA, creadoPor: UID, revision: 0, ...r, versionMotor: '0.15.0',
    };
    const salida = ResumenDiarioCargabilidad.parse(doc);
    assert.equal(salida.id, `${ORG}__ln-627__2026-01-01`);
    // Un día de solo tensión no trae porcentaje ni amperios, y eso NO es un cero:
    assert.equal(salida.horasConMedida, 0);
    assert.equal(salida.maxima_pct, undefined);
  });

  test('el rastro de la carga SÍ lleva UUID: no es una medición, es un acto', () => {
    const doc = CargaDeCargabilidad.parse({
      id: '6f1f5e2e-2a3c-4f8e-9a1d-0b7c2d3e4f50',
      orgId: ORG, creadoEn: AHORA, creadoPor: UID, revision: 0,
      nombreArchivo: 'sintetico.csv', filasDelArchivo: 3, registrosGuardados: 3, filasConError: 0,
      mapeo: {}, lineas: ['LN-627'], desde: '2026-01-01', hasta: '2026-01-01',
      cargadoEn: AHORA, cargadoPor: UID, estado: 'guardada',
    });
    assert.equal(doc.estado, 'guardada');
  });

  test('⚠️ el id determinista NO se relaja hasta admitir cualquier cosa', () => {
    const { dias } = empaquetarPorDia(REGISTROS);
    const doc = comoLoEscribeElRepositorio(dias[0]);
    for (const malo of ['', 'sin-separador', '__empieza-vacio', 'con espacio__2026-01-01']) {
      assert.throws(() => DiaDeCargabilidad.parse({ ...doc, id: malo }),
        `el id «${malo}» no debería pasar el molde`);
    }
  });

  test('⚠️ dos cargas del MISMO día caen en el MISMO id: corregir reemplaza, no duplica', () => {
    const { dias } = empaquetarPorDia(REGISTROS);
    const otraVez = empaquetarPorDia([hora(0, 68.9, 69.4, 68.9)]);   // el mismo día, corregido
    assert.equal(
      DiaDeCargabilidad.parse(comoLoEscribeElRepositorio(dias[0])).id,
      DiaDeCargabilidad.parse(comoLoEscribeElRepositorio(otraVez.dias[0])).id,
    );
  });

  test('un circuito declarado sí entra en el id, y separa los dos históricos', () => {
    const { dias } = empaquetarPorDia(REGISTROS.map((r) => ({ ...r, circuito: 'C1' })));
    const doc = DiaDeCargabilidad.parse(comoLoEscribeElRepositorio(dias[0]));
    assert.equal(doc.id, `${ORG}__ln-627__c1__2026-01-01`);
    assert.equal(doc.circuito, 'C1');
  });
});

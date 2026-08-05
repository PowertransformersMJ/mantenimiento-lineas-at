// ============================================================================
// tests/rca-contrato-parte.test.js — el guardián del camino de EDICIÓN
// ----------------------------------------------------------------------------
// POR QUÉ EXISTE. `crearAnalisis` validaba contra el contrato antes de escribir;
// `guardarParte` NO validaba nada — mandaba el parche directo a la base. O sea
// que el documento nacía protegido y todas las ediciones posteriores entraban
// sin mirar. Y eso es justo al revés de lo que hace falta: un análisis de causa
// raíz se crea vacío en un segundo y se edita durante SEMANAS. Casi todo lo que
// acaba en el papel firmado entró por el camino que no miraba.
//
// Estas pruebas son del CONTRATO, no de la pantalla: la defensa tiene que estar
// en el esquema, porque una comprobación escrita dentro de un componente se
// pierde el día que alguien añade un editor nuevo — y ese día llega siempre.
// ============================================================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ParteDeAnalisis } from '../contratos/src/rca.ts';

const ok = (p) => ParteDeAnalisis.safeParse(p);

describe('una PARTE del análisis se valida antes de tocar la base', () => {
  test('un parche legítimo pasa: se guardan las once espinas de una vez', () => {
    const r = ok({
      espinas: [{ espina: 'conductor', estado: 'abierta', motivo: 'compatible con lo observado', evidenciaIds: [] }],
    });
    assert.equal(r.success, true, r.error?.issues?.[0]?.message);
  });

  test('parcial de verdad: guardar SOLO las hipótesis no exige mandar el resto', () => {
    // Es lo que hacen los editores: cada uno manda su lista completa y nada más.
    assert.equal(ok({ hipotesis: [] }).success, true);
    assert.equal(ok({ arbol: [] }).success, true);
    assert.equal(ok({ cadenas: [] }).success, true);
    assert.equal(ok({ ausencias: [] }).success, true);
    assert.equal(ok({ acciones: [] }).success, true);
    assert.equal(ok({ limitaciones: ['no se pudo descartar el rayo'] }).success, true);
  });

  test('UNA CLAVE MAL ESCRITA SE RECHAZA, no se escribe en silencio', () => {
    // Antes esto entraba en el documento y se quedaba ahí para siempre: basura
    // silenciosa dentro de un papel que se firma. Y el editor creía haber
    // guardado; el dato real no cambiaba.
    const r = ok({ hipotesís: [] });          // con tilde: un dedazo verosímil
    assert.equal(r.success, false, 'una clave desconocida entró sin que nadie la mirara');

    const r2 = ok({ espinaz: [] });
    assert.equal(r2.success, false);
  });

  test('los campos de IDENTIDAD y PROPIEDAD no se pueden editar por esta vía', () => {
    // Las reglas de Firestore también lo impiden, pero un error del servidor es
    // opaco: dice «permisos». Éste dice cuál es el campo.
    for (const clave of ['id', 'orgId', 'creadoPor', 'creadoEn', 'codigo', 'tipo', 'abiertoEn']) {
      assert.equal(ok({ [clave]: 'x' }).success, false, `se dejó editar «${clave}»`);
    }
  });

  test('el CONTENIDO se valida, no solo el nombre de la clave', () => {
    // Un estado de espina que no existe. Sin validación, esto llegaba a la base
    // y volvía como documento que el contrato rechaza al LEER: el análisis
    // desaparecía de la pantalla y nadie sabría por qué.
    assert.equal(ok({ espinas: [{ espina: 'conductor', estado: 'no_aplica', motivo: 'x' }] }).success, false,
      'se coló el estado «no aplica», que este método NO tiene');

    // Un motivo vacío: un estado sin motivo no se puede auditar.
    assert.equal(ok({ espinas: [{ espina: 'conductor', estado: 'abierta', motivo: '' }] }).success, false);

    // Una espina inventada al vuelo rompe la agregación entre análisis, que es
    // justo lo que hace valiosa la recurrencia.
    assert.equal(ok({ espinas: [{ espina: 'mano_de_obra', estado: 'abierta', motivo: 'x' }] }).success, false,
      '«mano de obra» se eliminó a propósito: invita a terminar el análisis en un nombre propio');
  });

  test('un parche vacío es válido: no todo guardado cambia algo', () => {
    assert.equal(ok({}).success, true);
  });
});

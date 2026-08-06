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

describe('LOS PARCHES REALES de la pantalla siguen pasando', () => {
  // Endurecer el camino de guardado tiene un riesgo evidente y es el contrario
  // del que se está tapando: dejar fuera una clave que la aplicación SÍ manda, y
  // romperle el guardar a alguien que estaba trabajando. Se comprobó a mano una
  // vez; a mano no sirve la próxima. Aquí van las formas EXACTAS que envía cada
  // editor hoy, copiadas de `Rca.tsx` y `RcaEditores.tsx`.
  //
  // Si alguien añade un editor con una clave nueva, esta prueba NO lo detecta —
  // lo detectará el usuario al guardar. Por eso la clave nueva se añade al
  // `pick` de `ParteDeAnalisis` Y a esta lista, en el mismo cambio.

  test('la tabla de espinas (Rca.tsx)', () => {
    const r = ok({ espinas: [
      { espina: 'conductor', estado: 'no_evaluable', motivo: 'falta la ficha', evidenciaIds: [], datoQueFalta: 'carga de rotura' },
      { espina: 'ambiente_clima', estado: 'abierta', motivo: 'hubo viento esa noche', evidenciaIds: [] },
    ] });
    assert.equal(r.success, true, r.error?.issues?.[0]?.message);
  });

  test('declarar la causa raíz (Rca.tsx · Declarar)', () => {
    const r = ok({
      causaRaiz: {
        nodoId: '11111111-1111-4111-8111-111111111111',
        enunciado: 'la especificación no exigía inhibidor en el conector',
        declaradaPor: 'uid-de-quien-firma',
        declaradaEn: '2026-08-05T10:00:00.000Z',
        condicionesNoCumplidas: [],
      },
      estado: 'en_revision',
    });
    assert.equal(r.success, true, r.error?.issues?.[0]?.message);
  });

  test('los cuatro editores de RcaEditores.tsx', () => {
    assert.equal(ok({ cadenas: [] }).success, true);
    assert.equal(ok({ arbol: [] }).success, true);
    assert.equal(ok({ hipotesis: [] }).success, true);
    assert.equal(ok({ ausencias: [] }).success, true);
  });
});

describe('TODO-56 · «cerrado» se dice UNA vez, aunque se escriba en dos campos', () => {
  // `AnalisisCausa` lleva `estado` (con «cerrado» y «sin conclusión» entre sus
  // valores) Y un booleano `cerrado`. El booleano existe porque las REGLAS DE LA
  // BASE lo miran —permiten editar solo mientras sea false— y un enum no se
  // consulta barato desde una regla. Pero dos representaciones del mismo hecho
  // divergen en cuanto alguien escribe una y olvida la otra, y las dos
  // consecuencias son malas y silenciosas:
  //   · estado «cerrado» + cerrado:false → la pantalla dice cerrado y la base
  //     DEJA SEGUIR EDITANDO el razonamiento ya firmado.
  //   · estado «abierto» + cerrado:true → se ve abierto y no se puede tocar,
  //     sin que nada explique por qué.
  // Hoy no chocan porque nada pone `cerrado` en true. Se atan ANTES de que
  // exista el botón de cerrar: después habría documentos con las dos verdades
  // ya escritas, y eso ya no lo arregla una regla.

  test('cerrar el estado SIN marcar el booleano se rechaza', () => {
    const r = ok({ estado: 'cerrado' });
    assert.equal(r.success, false, 'la base habría seguido dejando editar un análisis firmado');
    assert.match(r.error.issues[0].message, /las reglas de la base miran ese booleano/);
  });

  test('marcar el booleano SIN el estado que lo justifica se rechaza', () => {
    assert.equal(ok({ cerrado: true }).success, false);
  });

  test('pasar a un estado NO terminal no exige mandar `cerrado`', () => {
    // La primera versión de esta regla lo exigía en CUALQUIER cambio de estado y
    // rompía el botón de declarar la causa raíz, que manda `en_revision` a secas.
    // Lo cazó la prueba de los parches reales: endurecer una escritura tiene el
    // riesgo CONTRARIO al que se está tapando.
    assert.equal(ok({ estado: 'en_revision' }).success, true);
    assert.equal(ok({ estado: 'abierto' }).success, true);
  });

  test('los dos juntos y coherentes pasan', () => {
    assert.equal(ok({ estado: 'cerrado', cerrado: true }).success, true);
    assert.equal(ok({ estado: 'sin_conclusion', cerrado: true }).success, true,
      '«sin conclusión» también es un final: se cierra sin causa raíz, y es honesto');
    assert.equal(ok({ estado: 'en_revision', cerrado: false }).success, true);
  });

  test('los dos juntos y CONTRADICIÉNDOSE se rechazan, en las dos direcciones', () => {
    assert.equal(ok({ estado: 'cerrado', cerrado: false }).success, false);
    assert.equal(ok({ estado: 'abierto', cerrado: true }).success, false);
    assert.equal(ok({ estado: 'sin_conclusion', cerrado: false }).success, false);
  });

  test('un parche que no toca ninguno de los dos sigue pasando', () => {
    // No se puede endurecer el cierre a costa de romperle el guardar a los seis
    // editores, que no mandan ni `estado` ni `cerrado`.
    assert.equal(ok({ hipotesis: [] }).success, true);
    assert.equal(ok({ espinas: [] }).success, true);
  });
});

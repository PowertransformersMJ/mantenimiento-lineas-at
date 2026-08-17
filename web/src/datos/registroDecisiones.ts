// ============================================================================
// datos/registroDecisiones.ts — el libro de DECISIONES FIRMADAS, LEÍDO
// ----------------------------------------------------------------------------
// QUÉ ES. El libro donde queda escrito lo que el Ingeniero ya decidió sobre
// puntos que todavía NO están cargados vive en
// `herramientas/decisiones-firmadas.json` y **se queda ahí**. Este archivo es la
// única línea de código que lo trae a la aplicación, calcada de
// `registroSemillas.ts`, que resolvió antes este mismo problema.
//
// POR QUÉ VIVE EN EL REPOSITORIO PÚBLICO, y por qué eso no es una fuga: el
// propio archivo lo explica en sus primeras claves. Es un extracto REDACTADO con
// lista blanca de campos del fixture de la bóveda; no lleva ni una coordenada,
// ni una hora de captura, ni el nombre de ninguna subestación, ni un número.
//
// ⚠️ LA APLICACIÓN SOLO **LEE**. Y no es una comodidad: es el requisito entero.
// Un libro que la pantalla pudiera escribir es un libro donde la pantalla puede
// FABRICAR un recuerdo, y entonces «decidido por usted el 16 de agosto» deja de
// ser verificable y pasa a ser una afirmación del sistema sobre sí mismo. Un
// archivo del repositorio solo cambia con un commit, con autor y con diff.
//
// ⚠️ ESTO NO DA IDENTIDAD. Que un nombre esté aquí no lo hace cargable: el
// desplegable se alimenta SOLO de `registroSemillas.ts`. Por eso el punto que él
// dejó pendiente se puede nombrar sin riesgo — no tiene semilla emitida, y
// nombrarlo es estructuralmente incapaz de dársela.
// ============================================================================
import registro from '../../../herramientas/decisiones-firmadas.json';

/**
 * El libro completo, tal cual está en el repositorio.
 *
 * Se expone como dato opaco por la misma razón que el de identidad: quien lo
 * interpreta es `@lineas/importar/decisiones`. Un intermediario que «arregla» el
 * libro por el camino es exactamente el sitio donde aparecería la segunda
 * versión de la verdad.
 */
export const REGISTRO_DECISIONES: Record<string, unknown> = registro;

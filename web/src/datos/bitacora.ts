// ============================================================================
// datos/bitacora.ts — los fallos de bitácora se CUENTAN, no se tragan
// ----------------------------------------------------------------------------
// POR QUÉ EXISTE. Escribir «esta persona entró» no puede impedir entrar: si la
// base rechaza esa escritura, la sesión sigue. Hasta ahí, todo el mundo está de
// acuerdo — y por eso el 90 % de los sistemas lo resuelve con un `catch {}`
// vacío y se queda sin bitácora durante meses sin que nada falle.
//
// Un registro que puede desaparecer en silencio no es un registro: es una
// creencia. Así que el fallo se traga hacia el USUARIO —no le estropea la
// jornada— y se declara hacia el SISTEMA: se cuenta, se guarda el último motivo
// y la pantalla de personas lo enseña. Quien administra puede ver que la
// bitácora lleva 14 fallos y por qué, en vez de suponer que está completa.
//
// No se manda a ningún sitio: este proyecto no tiene servidor de telemetría ni
// lo va a pagar. Vive en memoria y se ve donde importa.
// ============================================================================

export interface FalloDeBitacora {
  /** Qué se intentaba escribir, en palabras: «último acceso», «recibo». */
  que: string;
  motivo: string;
  cuando: string;
}

const fallos: FalloDeBitacora[] = [];

/** Tope: interesa saber QUE falla y por qué, no acumular mil líneas iguales. */
const TOPE = 20;

/**
 * Anota un fallo de escritura de bitácora. **Nunca lanza**: quien llama a esto
 * ya está en su propio camino de degradación.
 */
export function anotarFalloDeBitacora(que: string, e: unknown): void {
  const motivo = e instanceof Error ? e.message : String(e ?? 'fallo desconocido');
  fallos.push({ que, motivo, cuando: new Date().toISOString() });
  if (fallos.length > TOPE) fallos.splice(0, fallos.length - TOPE);
  // También a la consola: es donde mira quien está diagnosticando en vivo.
  console.warn(`[bitácora] no se pudo escribir ${que}:`, motivo);
}

/** Cuántos fallos van y cuál fue el último. Vacío = la bitácora va limpia. */
export function fallosDeBitacora(): { cuantos: number; ultimos: FalloDeBitacora[] } {
  return { cuantos: fallos.length, ultimos: [...fallos] };
}

/** Solo para las pruebas y para el botón de «ya lo he visto». */
export function olvidarFallosDeBitacora(): void {
  fallos.length = 0;
}

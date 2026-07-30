// ============================================================================
// componentes/Estado.tsx — los estados que NO son el camino feliz
// ----------------------------------------------------------------------------
// Existen desde el día 1 a propósito (ADR-004). Es exactamente donde el trabajo
// en paralelo se estrella: el frontend construye el camino feliz, el backend
// devuelve degradaciones, y juntarlos cuesta una semana de parches. Si la
// tarjeta de "apagado por presupuesto" está diseñada desde el principio, no hay
// choque.
// ============================================================================

interface Props {
  titulo: string;
  children?: React.ReactNode;
  nota?: string;
  accion?: React.ReactNode;
}

export function Estado({ titulo, children, nota, accion }: Props) {
  return (
    <section className="panel vacio">
      <div className="vacio-t">{titulo}</div>
      {children && <p className="vacio-c">{children}</p>}
      {accion}
      {nota && <p className="fine">{nota}</p>}
    </section>
  );
}

export function SinSesion({ onEntrar }: { onEntrar: () => void }) {
  return (
    <Estado
      titulo="Inicie sesión para ver sus líneas"
      accion={<button className="boton" onClick={onEntrar}>Entrar con Google</button>}
    >
      Esta página no contiene ningún dato: las líneas reales se leen de la base después de
      autenticarse. Es deliberado — el sitio es público, y las coordenadas de la infraestructura
      de un cliente no pueden viajar dentro de lo que se publica en internet.
    </Estado>
  );
}

export function Cargando() {
  return <Estado titulo="Cargando…">Leyendo la línea desde la base.</Estado>;
}

export function Vacio() {
  return (
    <Estado titulo="No hay líneas asignadas" nota="Si esto no es lo que espera, avise al administrador.">
      Su usuario está autenticado pero todavía no tiene ninguna línea asignada.
    </Estado>
  );
}

export function Error_({ mensaje }: { mensaje: string }) {
  return (
    <Estado titulo="No se pudo cargar" nota="El dato no se perdió: solo no se pudo leer ahora.">
      {mensaje}
    </Estado>
  );
}

/** Quinto estado, el que casi nadie dibuja hasta que es tarde (ADR-004 §5). */
export function ApagadoPorPresupuesto({ vuelve }: { vuelve?: string }) {
  return (
    <Estado
      titulo="Análisis con IA apagado por presupuesto"
      nota={vuelve ? `Se reactiva ${vuelve}.` : 'Se reactiva al iniciar el siguiente periodo.'}
    >
      Se alcanzó el tope de gasto del día. <b>El sistema sigue funcionando igual</b>: el cálculo, las
      fichas y los informes no dependen de la IA. Solo quedan en pausa las sugerencias automáticas.
    </Estado>
  );
}

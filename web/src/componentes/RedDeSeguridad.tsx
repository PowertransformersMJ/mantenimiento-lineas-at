// ============================================================================
// componentes/RedDeSeguridad.tsx — la última red, la que evita la página en blanco
// ----------------------------------------------------------------------------
// POR QUÉ EXISTE. Hasta hoy la única red de la aplicación era `RespaldoMapa`, y
// solo cubría el mapa. Si cualquier otra pieza tropezaba al pintarse —un dato
// inesperado en una tabla, una cifra ausente donde el código daba por hecho que
// habría una— React desmonta el árbol entero y queda **una página en blanco**:
// ni cabecera, ni mensaje, ni botón. La única salida es recargar, y si el dato
// raro sigue en la base, se queda en blanco otra vez.
//
// Con varios ingenieros entrando, cada uno con sus líneas y sus expedientes,
// eso deja de ser teórico. Y hay algo peor que el fallo: quien lo sufre HOY no
// puede ni reportarlo, porque no hay nada que leer ni que copiar. El defecto se
// vuelve invisible para quien podría arreglarlo.
//
// QUÉ HACE, Y QUÉ NO:
//
//   · NO se traga el error. Lo vuelve a lanzar a la consola, porque quien esté
//     depurando lo necesita entero y con su traza.
//   · NO promete que lo arreglará. Ofrece dos salidas honestas: reintentar
//     —porque a veces es un tropiezo puntual— y volver al parque, que rearma la
//     aplicación desde cero sin cerrar la sesión.
//   · SÍ enseña el detalle técnico, plegado y seleccionable. No es para que el
//     ingeniero lo entienda: es para que lo pueda copiar y pegar en un mensaje.
//     Un fallo que no se puede reportar no se arregla nunca.
//
// Es deliberadamente tonta: sin estado compartido, sin red, sin dependencias.
// Una red de seguridad que puede fallar no es una red.
// ============================================================================
import { Component, type ReactNode, type ErrorInfo } from 'react';

type Props = { children: ReactNode };
type Estado = { fallo: Error | null; pila: string | null };

export class RedDeSeguridad extends Component<Props, Estado> {
  state: Estado = { fallo: null, pila: null };

  static getDerivedStateFromError(error: Error): Partial<Estado> {
    return { fallo: error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Se registra ADEMÁS de enseñarse. Tragarse el error dejaría a quien depura
    // sin la traza, que es justo lo que hace falta para arreglarlo.
    console.error('[red-de-seguridad] la aplicación tropezó al pintarse:', error, info);
    this.setState({ pila: info.componentStack ?? null });
  }

  #reintentar = (): void => {
    this.setState({ fallo: null, pila: null });
  };

  #volverAlParque = (): void => {
    // Rearma la aplicación desde la raíz. No cierra sesión: cerrarla obligaría a
    // volver a entrar por un fallo de pintado, que no tiene nada que ver.
    location.hash = '';
    location.reload();
  };

  render(): ReactNode {
    const { fallo, pila } = this.state;
    if (!fallo) return this.props.children;

    const detalle = [
      `Mensaje: ${fallo.message}`,
      fallo.stack ? `\nTraza:\n${fallo.stack}` : '',
      pila ? `\nComponentes:\n${pila}` : '',
    ].join('');

    return (
      <div className="red-seguridad" role="alert">
        <div className="red-seguridad-caja">
          <h1>La aplicación tropezó al dibujar esta pantalla</h1>
          <p>
            <b>No se ha perdido nada de lo que está guardado.</b> Esto es un fallo al
            <i> pintar</i>, no al guardar: el dato que ya estaba en la base sigue intacto.
          </p>
          <p className="red-seguridad-que-hacer">
            Prueba a reintentar. Si vuelve a ocurrir en el mismo sitio, no es casualidad:
            copia el detalle de abajo y mándalo — con eso se arregla; sin eso, no.
          </p>

          <div className="red-seguridad-botones">
            <button type="button" className="boton" onClick={this.#reintentar}>
              Reintentar
            </button>
            <button type="button" className="boton chico" onClick={this.#volverAlParque}>
              Volver al parque
            </button>
          </div>

          <details className="red-seguridad-detalle">
            <summary>Detalle técnico (para copiar y mandar)</summary>
            <pre>{detalle}</pre>
          </details>
        </div>
      </div>
    );
  }
}

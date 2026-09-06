// ============================================================================
// componentes/Usuarios.tsx — administrar personas, permisos y alcance
// ----------------------------------------------------------------------------
// ES DE ORGANIZACIÓN, NO DE LÍNEA, y por eso no es una pestaña de `Linea.tsx`:
// hay que poder dar de alta a alguien cuando todavía no hay ninguna línea
// cargada, que es justo el primer día. Se abre encima de lo que haya, como los
// atlas, y tiene su propia dirección (`#/personas`).
//
// ⚠️ NI UNA LISTA ESCRITA A MANO. Los roles, las funciones delegables, cuáles
// trae cada rol y qué acciones son auditables salen TODOS de
// `contratos/src/usuarios.ts`. Un `<option>` tecleado aquí sería la tercera
// copia del catálogo y divergiría; es exactamente el fallo que el propio
// catálogo documenta de otro sistema —el rol definido en las reglas y olvidado
// en las tablas del cliente— y por el que un usuario nuevo no se podía editar
// desde su propia pantalla.
//
// ⚠️ ESTA PANTALLA NO CREA NADA. No puede: acuñar un reclamo exige la llave
// maestra, y ésa no toca el navegador. Todo va contra el trabajador de personas,
// que verifica la firma del token y decide. Si el trabajador no está
// configurado, aquí no se intenta nada y se dice — una configuración incompleta
// APAGA, no abre.
//
// ⚠️ EL ENLACE DE UN SOLO USO SE VE UNA VEZ Y NO SE GUARDA. Vive en el estado
// local de este componente y muere con él: no entra en el almacén, ni en
// `localStorage`, ni en la dirección. Es una credencial.
// ============================================================================
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ACCIONES_AUDITABLES, FUNCIONES_DELEGABLES, FUNCIONES_POR_ROL, ROLES_ASIGNABLES,
  ROL_DESCRIPCION, TODAS_LAS_LINEAS, defectosDeContrasena, funcionesEfectivas,
  MIN_CONTRASENA, permisosDe,
  type Funcion, type Linea, type ModoDeAlta, type Rol,
} from '@lineas/contratos';
import { almacen, useSesion } from '../datos/enlace';
import { puede, type SesionDePantalla } from '../datos/permisos';
import { fallosDeBitacora } from '../datos/bitacora';
import type { EntradaLeidaDeAuditoria } from '../datos/repositorio';
import {
  cambiarEstado, crearPersona, editarPersona, hayTrabajador, listarPersonas, reconciliar,
  reponerCredencial, ensayarLimpieza, ejecutarLimpieza,
  type EnsayoDeLimpieza, type ListadoDePersonas, type PersonaListada,
} from '../datos/usuariosRemoto';
import { Estado } from './Estado';

/** Cómo se decide, por persona, qué pasa con una función delegable. */
type Ajuste = 'rol' | 'extra' | 'quitada';

const fecha = (v: unknown): string => {
  if (!v) return '—';
  const t = typeof v === 'string' ? Date.parse(v) : Number(v);
  if (!Number.isFinite(t)) return '—';
  return new Date(t).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });
};

// ── La tabla ────────────────────────────────────────────────────────────────

/**
 * Las funciones de una persona, con lo que se le añadió y lo que se le quitó
 * MARCADO. Una lista plana de funciones efectivas esconde justo lo que hay que
 * revisar en una auditoría: qué se tocó a mano.
 */
function Funciones({ p }: { p: PersonaListada }) {
  const efectivas = funcionesEfectivas(p.rol, p.funcionesExtra ?? [], p.funcionesQuitadas ?? []);
  const deSerie = new Set(FUNCIONES_POR_ROL[p.rol]);
  const quitadas = (p.funcionesQuitadas ?? []).filter((f) => deSerie.has(f));

  return (
    <span className="chips">
      {efectivas.map((f) => (
        <span key={f} className={'chip' + ((p.funcionesExtra ?? []).includes(f) ? ' usr-extra' : '')}
          title={(p.funcionesExtra ?? []).includes(f) ? 'añadida a mano, no viene de su rol' : 'viene de su rol'}>
          {f}
        </span>
      ))}
      {quitadas.map((f) => (
        <span key={f} className="chip usr-quitada" title="su rol la traía y se le quitó a mano">
          {f}
        </span>
      ))}
      {!efectivas.length && <span className="chip usr-quitada">sin ninguna función</span>}
    </span>
  );
}

// ── El repartidor de funciones, construido DESDE el catálogo ────────────────

/**
 * LOS ROLES QUE SE PUEDEN OFRECER, y la pantalla obedece al trabajador.
 *
 * `ROLES_ASIGNABLES` es la cota SUPERIOR del catálogo; el trabajador la estrecha
 * todavía más —nombrar administradores es del propietario— y lo dice al listar.
 * Ofrecer un rol que el servidor va a rechazar es el botón mentiroso que este
 * sistema tiene prohibido, así que manda lo que contesta el trabajador y solo se
 * cae al catálogo cuando todavía no ha contestado.
 */
function rolesOfrecidos(puedeAsignar: Rol[]): readonly Rol[] {
  return puedeAsignar.length ? puedeAsignar : ROLES_ASIGNABLES;
}

function AjustesDeFunciones({ rol, ajustes, alCambiar }: {
  rol: Rol;
  ajustes: Record<string, Ajuste>;
  alCambiar: (f: Funcion, a: Ajuste) => void;
}) {
  const deSerie = new Set(FUNCIONES_POR_ROL[rol]);
  return (
    <div className="usr-funciones">
      {/* ⚠️ La lista sale de FUNCIONES_DELEGABLES, del catálogo. Si mañana se
          añade una función delegable, aparece aquí sola. */}
      {FUNCIONES_DELEGABLES.map((f) => (
        <label key={f} className="usr-funcion">
          <span className="mono">{f}</span>
          <select value={ajustes[f] ?? 'rol'} onChange={(e) => alCambiar(f, e.target.value as Ajuste)}>
            <option value="rol">{deSerie.has(f) ? 'la trae su rol' : 'no la trae su rol'}</option>
            <option value="extra">añadir</option>
            <option value="quitada">quitar</option>
          </select>
        </label>
      ))}
      <p className="fine">
        Solo aparecen las funciones <b>delegables</b>. Las que no lo son —crear personas, cargar el
        trazado, aplicar un dato a varios apoyos— van con el rol y no se regalan una a una: el
        trabajador las rechazaría y lo dejaría anotado en la bitácora.
      </p>
    </div>
  );
}

// ── El repartidor de alcance ────────────────────────────────────────────────

function AjusteDeAlcance({ lineas, todas, elegidas, alCambiarTodas, alElegir }: {
  lineas: Linea[];
  todas: boolean;
  elegidas: string[];
  alCambiarTodas: (v: boolean) => void;
  alElegir: (id: string, v: boolean) => void;
}) {
  return (
    <div className="usr-alcance">
      <label className="usr-radio">
        <input type="radio" checked={todas} onChange={() => alCambiarTodas(true)} />
        <span>Todas las líneas de la organización</span>
      </label>
      <label className="usr-radio">
        <input type="radio" checked={!todas} onChange={() => alCambiarTodas(false)} />
        <span>Solo estas líneas</span>
      </label>
      {!todas && (
        <div className="usr-lineas">
          {lineas.length === 0 && (
            <p className="aviso">
              No hay ninguna línea que usted alcance, así que no hay ninguna que repartir. Con esto
              la cuenta no vería nada: elija «todas» o cargue antes el trazado.
            </p>
          )}
          {lineas.map((l) => (
            <label key={l.id} className="usr-linea">
              <input type="checkbox" checked={elegidas.includes(l.id)}
                onChange={(e) => alElegir(l.id, e.target.checked)} />
              <span>{l.codigo}</span>
            </label>
          ))}
        </div>
      )}
      <p className="fine">
        El alcance viaja en el token y tiene tope de tamaño: si no caben todas las líneas elegidas,
        el trabajador lo rechaza diciendo cuántas sobran. Nunca recorta en silencio.
      </p>
    </div>
  );
}

// ── El enlace de un solo uso ────────────────────────────────────────────────

function EnlaceEmitido({ enlace, alCerrar }: { enlace: string; alCerrar: () => void }) {
  const [copiado, setCopiado] = useState(false);
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(enlace);
      setCopiado(true);
    } catch {
      // Sin permiso de portapapeles no se pierde nada: el enlace está a la vista
      // y se puede seleccionar a mano. Lo que no se hace es fingir que se copió.
      setCopiado(false);
    }
  };
  return (
    <div className="usr-enlace" role="alert">
      <p><b>Enlace de un solo uso.</b> Entrégueselo a la persona por el canal que usted controle.</p>
      <p className="alerta">
        <b>Quien vea este enlace entra en esa cuenta.</b> Caduca en <b>una hora</b> por defecto (el
        plazo se sube en la consola: Authentication → Templates → Password reset → «Expire after»)
        y se gasta con el primer uso. Si caduca, se reemite otro desde la fila de la persona.
      </p>
      <p className="alerta">
        No se vuelve a ver. En cuanto cierre este aviso, ni usted ni nadie puede recuperarlo: se
        emite otro y este deja de valer.
      </p>
      <textarea className="usr-enlace-txt" readOnly value={enlace} rows={3}
        onFocus={(e) => e.currentTarget.select()} />
      <div className="usr-acciones">
        <button type="button" className="boton chico" onClick={() => void copiar()}>
          {copiado ? 'Copiado' : 'Copiar'}
        </button>
        <button type="button" className="boton chico" onClick={alCerrar}>Ya lo entregué</button>
      </div>
    </div>
  );
}

// ── Reponer una contraseña, tecleándola ─────────────────────────────────────

/**
 * La segunda vía de reposición, y la que hay que usar con los ojos abiertos.
 *
 * Existe porque el Ingeniero la decidió (`§ADR-019 §2`) y porque hay casos en
 * que el enlace no sirve —una cuadrilla sin correo ni canal de mensajería a la
 * que se le dicta la contraseña por radio—. Pero **la conocen dos**, así que:
 *   · nace PROVISIONAL y el sistema le exigirá cambiarla al primer acceso;
 *   · se valida con la misma regla del catálogo, no con el mínimo de Firebase;
 *   · y el aviso de lo que significa va DELANTE, no en letra pequeña al final.
 */
function ReponerContrasena({ persona, alTerminar, alFallar }: {
  persona: PersonaListada;
  alTerminar: () => void;
  alFallar: (m: string) => void;
}) {
  const [contrasena, setContrasena] = useState('');
  const [repetida, setRepetida] = useState('');
  const [trabajando, setTrabajando] = useState(false);
  const [hecho, setHecho] = useState(false);

  const defectos = contrasena ? defectosDeContrasena(contrasena, persona.correo) : [];
  const coinciden = contrasena.length > 0 && contrasena === repetida;
  const listo = defectos.length === 0 && coinciden && !trabajando;

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!listo) return;
    setTrabajando(true);
    try {
      await reponerCredencial(persona.uid, { modo: 'contrasena', contrasena });
      setContrasena(''); setRepetida('');   // fuera de memoria en cuanto sale
      setHecho(true);
      alTerminar();
    } catch (err) {
      alFallar(err instanceof Error ? err.message : 'No se pudo reponer la contraseña.');
    } finally {
      setTrabajando(false);
    }
  };

  return (
    <form className="usr-form" onSubmit={(e) => void enviar(e)}>
      <p><b>Reponer la contraseña de {persona.nombre || persona.correo}</b></p>
      <p className="aviso">
        Si la teclea usted, <b>la conocen dos personas</b>: mientras no la cambie, lo que esa persona
        firme en este sistema no es solo suyo. Nace provisional y se le exigirá cambiarla al entrar.
        Si puede entregarle un enlace, es mejor vía.
      </p>
      <div className="calc-fila">
        <label className="calc-campo"><span>Contraseña</span>
          <input type="password" autoComplete="new-password" value={contrasena}
            onChange={(e) => setContrasena(e.target.value)} /></label>
        <label className="calc-campo"><span>Repítala</span>
          <input type="password" autoComplete="new-password" value={repetida}
            onChange={(e) => setRepetida(e.target.value)} /></label>
      </div>
      <p className="fine">
        <b>Requisitos:</b> al menos {MIN_CONTRASENA} caracteres · letras y números · no puede
        contener el correo de la persona.
      </p>
      {defectos.length > 0 && <p className="aviso">La contraseña {defectos.join(' · ')}.</p>}
      {repetida.length > 0 && !coinciden && <p className="aviso">Las dos no coinciden.</p>}
      {hecho && <p className="ok" role="status">Contraseña repuesta. Comuníquesela por un canal que usted controle.</p>}
      <div className="rca-guardar">
        <button type="submit" className="boton" disabled={!listo}>
          {trabajando ? 'Reponiendo…' : 'Reponer contraseña'}
        </button>
        <button type="button" className="boton chico" onClick={alTerminar}>Cancelar</button>
      </div>
    </form>
  );
}

// ── El alta ─────────────────────────────────────────────────────────────────

function Alta({ lineas, puedeAsignar, alTerminar, alFallar }: {
  lineas: Linea[];
  puedeAsignar: Rol[];
  alTerminar: (enlace?: string) => void;
  alFallar: (m: string) => void;
}) {
  const roles = rolesOfrecidos(puedeAsignar);
  const [nombre, setNombre] = useState('');
  const [correo, setCorreo] = useState('');
  // Arranca en el MENOS poderoso de los que se pueden ofrecer: si alguien pulsa
  // «dar de alta» sin mirar, no se crea un administrador por descuido.
  const [rol, setRol] = useState<Rol>(roles[roles.length - 1]);
  const [ajustes, setAjustes] = useState<Record<string, Ajuste>>({});
  const [todas, setTodas] = useState(true);
  const [elegidas, setElegidas] = useState<string[]>([]);
  /**
   * ⚠️ POR DEFECTO, ENLACE. Es la práctica que citan OWASP ASVS 6.4.1 y el mejor
   * de los tres sistemas escaneados: la cuenta nace con una credencial aleatoria
   * que NADIE ve, y la persona elige la suya. La otra vía existe y se conserva
   * —la decidió el Ingeniero—, pero el defecto no puede ser que un administrador
   * conozca la contraseña de otro.
   */
  const [modo, setModo] = useState<ModoDeAlta>('enlace');
  const [contrasena, setContrasena] = useState('');
  const [repetida, setRepetida] = useState('');
  const [enviando, setEnviando] = useState(false);

  const defectos = modo === 'contrasena' && contrasena ? defectosDeContrasena(contrasena, correo) : [];
  const coinciden = modo !== 'contrasena' || (contrasena.length > 0 && contrasena === repetida);
  const listo = nombre.trim().length > 0 && correo.trim().length > 3
    && (todas || elegidas.length > 0)
    && defectos.length === 0 && coinciden && !enviando;

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!listo) return;
    setEnviando(true);
    try {
      const r = await crearPersona({
        nombre: nombre.trim(),
        correo: correo.trim().toLowerCase(),
        rol,
        funcionesExtra: FUNCIONES_DELEGABLES.filter((f) => ajustes[f] === 'extra'),
        funcionesQuitadas: FUNCIONES_DELEGABLES.filter((f) => ajustes[f] === 'quitada'),
        lineas: todas ? [TODAS_LAS_LINEAS] : elegidas,
        modo,
        ...(modo === 'contrasena' ? { contrasena } : {}),
      });
      // La contraseña se borra de la memoria del formulario en cuanto se manda.
      setContrasena(''); setRepetida('');
      alTerminar(r.enlace);
    } catch (err) {
      alFallar(err instanceof Error ? err.message : 'No se pudo dar de alta.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <form className="usr-form" onSubmit={(e) => void enviar(e)}>
      <div className="calc-fila">
        <label className="calc-campo"><span>Nombre</span>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} required /></label>
        <label className="calc-campo"><span>Correo</span>
          <input type="email" autoComplete="off" value={correo}
            onChange={(e) => setCorreo(e.target.value)} required /></label>
        <label className="calc-campo"><span>Rol</span>
          {/* ⚠️ Del catálogo, y solo los ASIGNABLES: `propietario` queda fuera a
              propósito — la aplicación no puede acuñarlo, y el trabajador y las
              reglas se niegan igual. */}
          <select value={rol} onChange={(e) => setRol(e.target.value as Rol)}>
            {roles.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>
      </div>
      <p className="fine">{ROL_DESCRIPCION[rol]}</p>

      <AjustesDeFunciones rol={rol} ajustes={ajustes}
        alCambiar={(f, a) => setAjustes((x) => ({ ...x, [f]: a }))} />

      <AjusteDeAlcance lineas={lineas} todas={todas} elegidas={elegidas}
        alCambiarTodas={setTodas}
        alElegir={(id, v) => setElegidas((xs) => (v ? [...new Set([...xs, id])] : xs.filter((y) => y !== id)))} />

      <div className="usr-modo">
        <label className="usr-radio">
          <input type="radio" checked={modo === 'enlace'} onChange={() => setModo('enlace')} />
          <span>
            <b>Enlace de un solo uso</b> (recomendado) — la cuenta nace con una credencial aleatoria
            que nadie ve, y la persona elige la suya. Usted entrega el enlace por el canal que
            controle: no depende del correo.
          </span>
        </label>
        <label className="usr-radio">
          <input type="radio" checked={modo === 'contrasena'} onChange={() => setModo('contrasena')} />
          <span>
            <b>Contraseña que usted teclea</b> — se la comunica usted. Nace provisional y se le
            exigirá cambiarla en el primer acceso. Mientras no la cambie, <b>lo que esa persona
            firme no es solo suyo</b>: la conocen dos.
          </span>
        </label>
      </div>

      {modo === 'contrasena' && (
        <>
          <div className="calc-fila">
            <label className="calc-campo"><span>Contraseña</span>
              <input type="password" autoComplete="new-password" value={contrasena}
                onChange={(e) => setContrasena(e.target.value)} /></label>
            <label className="calc-campo"><span>Repítala</span>
              <input type="password" autoComplete="new-password" value={repetida}
                onChange={(e) => setRepetida(e.target.value)} /></label>
          </div>
          <p className="fine">
            <b>Requisitos:</b> al menos {MIN_CONTRASENA} caracteres · letras y números · no puede
            contener el correo de la persona.
          </p>
          {defectos.length > 0 && <p className="aviso">La contraseña {defectos.join(' · ')}.</p>}
          {repetida.length > 0 && !coinciden && <p className="aviso">Las dos no coinciden.</p>}
        </>
      )}

      <div className="rca-guardar">
        <button type="submit" className="boton" disabled={!listo}>
          {enviando ? 'Dando de alta…' : 'Dar de alta'}
        </button>
      </div>
    </form>
  );
}

// ── El editor de una persona ────────────────────────────────────────────────

function Editar({ persona, lineas, puedeAsignar, alTerminar, alFallar }: {
  persona: PersonaListada;
  lineas: Linea[];
  puedeAsignar: Rol[];
  alTerminar: () => void;
  alFallar: (m: string) => void;
}) {
  // El rol que la persona YA tiene se ofrece siempre, aunque quien edita no
  // pudiera asignarlo: si no, el desplegable arrancaría vacío o cambiándole el
  // rol solo por abrir el formulario.
  const roles = [...new Set([...rolesOfrecidos(puedeAsignar), persona.rol])];
  const [nombre, setNombre] = useState(persona.nombre);
  const [rol, setRol] = useState<Rol>(persona.rol);
  const [ajustes, setAjustes] = useState<Record<string, Ajuste>>(() => {
    const x: Record<string, Ajuste> = {};
    for (const f of persona.funcionesExtra ?? []) x[f] = 'extra';
    for (const f of persona.funcionesQuitadas ?? []) x[f] = 'quitada';
    return x;
  });
  const [todas, setTodas] = useState((persona.lineas ?? []).includes(TODAS_LAS_LINEAS));
  const [elegidas, setElegidas] = useState<string[]>(
    (persona.lineas ?? []).filter((x) => x !== TODAS_LAS_LINEAS));
  const [enviando, setEnviando] = useState(false);

  const guardar = async () => {
    setEnviando(true);
    try {
      await editarPersona(persona.uid, {
        nombre: nombre.trim(),
        rol,
        funcionesExtra: FUNCIONES_DELEGABLES.filter((f) => ajustes[f] === 'extra'),
        funcionesQuitadas: FUNCIONES_DELEGABLES.filter((f) => ajustes[f] === 'quitada'),
        lineas: todas ? [TODAS_LAS_LINEAS] : elegidas,
      });
      alTerminar();
    } catch (e) {
      alFallar(e instanceof Error ? e.message : 'No se pudo guardar.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="usr-form">
      <div className="calc-fila">
        <label className="calc-campo"><span>Nombre</span>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} /></label>
        <label className="calc-campo"><span>Correo</span>
          {/* El correo NO se edita: es la identidad de la cuenta en el servidor
              de autenticación, y cambiarlo aquí dejaría el perfil y la cuenta
              hablando de dos personas distintas. */}
          <input value={persona.correo} readOnly /></label>
        <label className="calc-campo"><span>Rol</span>
          <select value={rol} onChange={(e) => setRol(e.target.value as Rol)}>
            {roles.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>
      </div>
      <p className="fine">{ROL_DESCRIPCION[rol]}</p>

      <AjustesDeFunciones rol={rol} ajustes={ajustes}
        alCambiar={(f, a) => setAjustes((x) => ({ ...x, [f]: a }))} />

      <AjusteDeAlcance lineas={lineas} todas={todas} elegidas={elegidas}
        alCambiarTodas={setTodas}
        alElegir={(id, v) => setElegidas((xs) => (v ? [...new Set([...xs, id])] : xs.filter((y) => y !== id)))} />

      <div className="rca-guardar">
        <button type="button" className="boton" disabled={enviando} onClick={() => void guardar()}>
          {enviando ? 'Guardando…' : 'Guardar cambios'}
        </button>
        <button type="button" className="boton chico" onClick={alTerminar}>Cancelar</button>
      </div>
    </div>
  );
}

// ── La bitácora ─────────────────────────────────────────────────────────────

function Bitacora({ personas }: { personas: PersonaListada[] }) {
  const [accion, setAccion] = useState('');
  const [sujetoUid, setSujeto] = useState('');
  const [filas, setFilas] = useState<EntradaLeidaDeAuditoria[] | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        const xs = await almacen.bitacoraDeAccesos({
          accion: accion || undefined,
          sujetoUid: sujetoUid || undefined,
        });
        if (vivo) { setFilas(xs); setFallo(null); }
      } catch (e) {
        // «No se pudo leer» y «no hay nada» son cosas distintas: una bitácora
        // vacía por un fallo de lectura se leería como «aquí no pasó nada».
        if (vivo) { setFilas(null); setFallo(e instanceof Error ? e.message : 'no se pudo leer la bitácora'); }
      }
    })();
    return () => { vivo = false; };
  }, [accion, sujetoUid]);

  return (
    <section className="tarjeta">
      <h3>Bitácora de accesos y cambios de permiso</h3>
      <p className="fine">
        La escribe <b>solo el servidor</b>, con el actor tomado del token verificado. Desde esta
        pantalla no se puede escribir ni borrar una línea: un registro que el auditado puede firmar
        con el nombre de otro no es un registro de auditoría.
      </p>
      <div className="calc-fila">
        <label className="calc-campo"><span>Acción</span>
          <select value={accion} onChange={(e) => setAccion(e.target.value)}>
            <option value="">todas</option>
            {/* Del catálogo: la lista de acciones auditables es CERRADA. */}
            {ACCIONES_AUDITABLES.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
        <label className="calc-campo"><span>Persona</span>
          <select value={sujetoUid} onChange={(e) => setSujeto(e.target.value)}>
            <option value="">todas</option>
            {personas.map((p) => <option key={p.uid} value={p.uid}>{p.nombre || p.correo}</option>)}
          </select>
        </label>
      </div>

      {fallo && <p className="alerta">No se pudo leer la bitácora: {fallo}</p>}
      {!fallo && filas === null && <p className="fine">Leyendo…</p>}
      {!fallo && filas?.length === 0 && (
        <p className="fine">
          No hay ninguna anotación que cumpla el filtro. Es un resultado, no un hueco: la lectura
          funcionó.
        </p>
      )}
      {!!filas?.length && (
        <div className="tabla-scroll">
          <table className="tabla">
            <thead>
              <tr><th>Cuándo</th><th>Acción</th><th>Quién</th><th>Sobre quién</th><th>Motivo</th></tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.id}>
                  <td>{fecha(f.en)}</td>
                  <td><span className="pill">{f.accion}</span></td>
                  <td>{f.actorCorreo ?? f.actorUid}</td>
                  <td>{f.sujetoCorreo ?? f.sujetoUid ?? '—'}</td>
                  <td>{f.motivo ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ── La pantalla ─────────────────────────────────────────────────────────────

export function Usuarios() {
  const sesion = useSesion();
  const quien: SesionDePantalla | undefined = sesion.fase === 'autenticado'
    ? { correo: sesion.correo, rol: sesion.rol, orgId: sesion.orgId, uid: sesion.uid, claims: sesion.claims }
    : undefined;
  const gestiona = puede(quien, 'usuarios.gestionar');
  const audita = puede(quien, 'usuarios.auditoria');

  const [listado, setListado] = useState<ListadoDePersonas | null>(null);
  const personas = listado?.usuarios ?? null;
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [fallo, setFallo] = useState<string | null>(null);
  const [enlace, setEnlace] = useState<string | null>(null);
  const [altaAbierta, setAltaAbierta] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  /** A quién se le está reponiendo la contraseña tecleada, si a alguien. */
  const [reponiendo, setReponiendo] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState<string | null>(null);

  const refrescar = useCallback(async () => {
    try {
      setListado(await listarPersonas());
      setFallo(null);
    } catch (e) {
      setListado(null);
      setFallo(e instanceof Error ? e.message : 'No se pudo leer la lista de personas.');
    }
  }, []);

  useEffect(() => {
    if (!gestiona) return;
    void refrescar();
    void almacen.lineasDeLaOrganizacion().then(setLineas).catch(() => setLineas([]));
  }, [gestiona, refrescar]);

  /**
   * DESPUÉS DE TOCAR LA PROPIA CUENTA, el token que este navegador tiene está
   * viejo: los reclamos los reescribe el trabajador y no llegan hasta el
   * siguiente token. Se pide forzado y se PARCHEA la sesión en memoria — sin
   * rehacer el arranque, que destruiría esta misma pantalla (`32 · L-66`).
   */
  const trasCambiar = useCallback(async (uidTocado?: string) => {
    await refrescar();
    if (uidTocado && quien && uidTocado === quien.uid) await almacen.recargarSesion();
  }, [refrescar, quien]);

  const conAviso = async (uid: string, que: string, fn: () => Promise<void>) => {
    setTrabajando(`${uid}:${que}`);
    setFallo(null);
    try {
      await fn();
      await trasCambiar(uid);
    } catch (e) {
      setFallo(e instanceof Error ? e.message : 'No se pudo completar la operación.');
    } finally {
      setTrabajando(null);
    }
  };

  const bitacora = useMemo(() => fallosDeBitacora(), [listado]);

  if (!gestiona) {
    return (
      <section className="panel usr">
        <Estado
          titulo="Aquí no hay nada que ver con su permiso"
          nota="Si debería poder administrar personas, avise: es un permiso que se concede uno a uno."
        >
          Administrar personas exige la función <span className="mono">usuarios.gestionar</span>, y
          su sesión no la trae. No se ha leído ningún dato.
        </Estado>
        <button type="button" className="boton chico" onClick={() => almacen.cerrarPersonas()}>Volver</button>
      </section>
    );
  }

  return (
    <section className="panel usr">
      <div className="usr-cab">
        <h2>Personas y permisos</h2>
        <button type="button" className="boton chico" onClick={() => almacen.cerrarPersonas()}>Volver</button>
      </div>

      {!hayTrabajador() && (
        <p className="alerta">
          El servicio de personas no está configurado en este despliegue. Esta pantalla no puede
          crear ni cambiar nada — y no lo intenta.
        </p>
      )}

      {sesion.fase === 'autenticado' && sesion.motivoDeReclamos && (
        <p className="alerta">{sesion.motivoDeReclamos}</p>
      )}

      {bitacora.cuantos > 0 && (
        <p className="aviso">
          <b>La bitácora tiene huecos:</b> {bitacora.cuantos} escritura(s) no se pudieron guardar en
          esta sesión. La última, «{bitacora.ultimos.at(-1)?.que}»: {bitacora.ultimos.at(-1)?.motivo}.
          Lo que se ve abajo puede estar incompleto.
        </p>
      )}

      {/* ⚠️ «Sin reconciliar» solo significa algo si el espejo se pudo leer. Con
          el espejo ilegible, todas las filas saldrían limpias y quien administra
          se iría tranquilo creyendo que no hay nada que reconciliar. Se dice que
          NO SE SABE, que es el tercer estado de siempre (`32 · L-44`). */}
      {listado && !listado.espejoLegible && (
        <p className="aviso">
          <b>No se pudo leer el espejo del perfil en la base.</b> La columna «sin reconciliar» no
          dice nada en esta carga: no es que esté todo bien, es que no se sabe.
        </p>
      )}

      {fallo && <p className="alerta" role="alert">{fallo}</p>}
      {enlace && <EnlaceEmitido enlace={enlace} alCerrar={() => setEnlace(null)} />}

      <div className="usr-acciones">
        <button type="button" className="boton" onClick={() => setAltaAbierta((x) => !x)}>
          {altaAbierta ? 'Cerrar el alta' : 'Dar de alta a alguien'}
        </button>
        <button type="button" className="boton chico" onClick={() => void refrescar()}>Releer</button>
      </div>

      {altaAbierta && (
        <Alta lineas={lineas} puedeAsignar={listado?.puedeAsignar ?? []} alFallar={setFallo}
          alTerminar={(e) => { setEnlace(e ?? null); setAltaAbierta(false); void refrescar(); }} />
      )}

      {/* LA LIMPIEZA INICIAL, solo para el propietario: identidad del que mira,
          derivada del catálogo (`permisosDe().esPropietario`), no una comparación
          de cadenas. Es la única operación irreversible de esta pantalla. */}
      {permisosDe(quien?.claims).esPropietario && <LimpiezaInicial alTerminar={() => void refrescar()} />}

      {personas === null && !fallo && <p className="fine">Leyendo la lista de personas…</p>}
      {personas?.length === 0 && (
        <p className="fine">
          No hay ninguna persona dada de alta además de las que crea la llave maestra. Es un
          resultado, no un hueco: la lectura funcionó.
        </p>
      )}

      {!!personas?.length && (
        <div className="tabla-scroll">
          <table className="tabla">
            <thead>
              <tr>
                <th>Nombre</th><th>Correo</th><th>Rol</th><th>Funciones efectivas</th>
                <th>Alcance</th><th>Estado</th><th>Entra con</th><th>Último acceso</th>
                <th>Contraseña</th><th></th>
              </tr>
            </thead>
            <tbody>
              {personas.map((p) => {
                /**
                 * PROTEGIDO = el rol que la aplicación NO puede asignar. Se
                 * deriva del catálogo (`ROLES_ASIGNABLES`) y no se compara con
                 * la palabra «propietario»: si mañana hay un segundo rol que la
                 * aplicación no puede acuñar, esta tabla se entera sola.
                 */
                const protegido = !(ROLES_ASIGNABLES as readonly string[]).includes(p.rol);
                const todasLasLineas = (p.lineas ?? []).includes(TODAS_LAS_LINEAS);
                return (
                  <tr key={p.uid}>
                    <td>{p.nombre || '—'}</td>
                    <td className="mono">{p.correo}</td>
                    <td><span className="pill" title={ROL_DESCRIPCION[p.rol]}>{p.rol}</span></td>
                    <td><Funciones p={p} /></td>
                    <td>{todasLasLineas ? 'todas' : `${(p.lineas ?? []).length} línea(s)`}</td>
                    <td>
                      {p.activo
                        ? <span className="pill ok">activa</span>
                        : <span className="pill av">deshabilitada</span>}
                      {p.desincronizado && (
                        <span className="pill h-pill" title="el perfil y el token no dicen lo mismo">
                          sin reconciliar
                        </span>
                      )}
                    </td>
                    {/* CON QUÉ ENTRA. Es lo que dice quién sigue dependiendo de
                        Google, o sea a quién dejaría fuera retirar ese botón. */}
                    <td className="mono">{(p.proveedores ?? []).join(', ') || '—'}</td>
                    <td>{fecha(p.ultimoAcceso)}</td>
                    <td>
                      {p.contrasenaProvisionalPendiente
                        ? <span className="pill av">provisional pendiente</span>
                        : <span className="fine">—</span>}
                    </td>
                    <td>
                      {/* ⚠️ EL PROPIETARIO NO SE TOCA DESDE AQUÍ. Es la cuenta de
                          rescate del dueño del sistema y el techo de la
                          delegación: solo nace y cambia con la llave maestra. Se
                          enseña —enumerarlo es parte del control— y no se le
                          ofrece ninguna acción, porque el trabajador y las
                          reglas las rechazarían igual. */}
                      {protegido ? (
                        <span className="pill h-pill" title="solo la llave maestra puede tocar esta cuenta">
                          Protegido
                        </span>
                      ) : (
                        <div className="usr-fila-acciones">
                          <button type="button" className="boton chico"
                            onClick={() => setEditando(editando === p.uid ? null : p.uid)}>
                            {editando === p.uid ? 'Cerrar' : 'Editar'}
                          </button>
                          <button type="button" className="boton chico"
                            disabled={trabajando === `${p.uid}:estado`}
                            onClick={() => void conAviso(p.uid, 'estado', () => cambiarEstado(p.uid, !p.activo))}>
                            {p.activo ? 'Deshabilitar' : 'Restituir'}
                          </button>
                          <button type="button" className="boton chico"
                            disabled={trabajando === `${p.uid}:enlace`}
                            onClick={() => void conAviso(p.uid, 'enlace', async () => {
                              const r = await reponerCredencial(p.uid, { modo: 'enlace' });
                              setEnlace(r.enlace ?? null);
                            })}>
                            Emitir enlace
                          </button>
                          <button type="button" className="boton chico"
                            onClick={() => setReponiendo(reponiendo === p.uid ? null : p.uid)}>
                            {reponiendo === p.uid ? 'Cerrar' : 'Reponer contraseña'}
                          </button>
                          <button type="button" className="boton chico"
                            disabled={trabajando === `${p.uid}:reconciliar`}
                            onClick={() => void conAviso(p.uid, 'reconciliar', () => reconciliar(p.uid))}>
                            Reconciliar
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editando && personas?.some((p) => p.uid === editando) && (
        <Editar
          persona={personas.find((p) => p.uid === editando)!}
          lineas={lineas}
          puedeAsignar={listado?.puedeAsignar ?? []}
          alFallar={setFallo}
          alTerminar={() => { const u = editando; setEditando(null); void trasCambiar(u ?? undefined); }}
        />
      )}

      {/* CUENTAS QUE EXISTEN Y NO SON DE NADIE. Se enseñan, no se esconden: así
          es como aparecería hoy la cuenta ajena que se dio de alta sola por
          «Entrar con Google» el 31-07-2026 (`99 §ADR-024`). Una pantalla de
          administración que solo lista a las personas bien aprovisionadas es la
          que hace que nadie se entere. */}
      {!!listado?.sinAprovisionar?.length && (
        <section className="tarjeta">
          <h3>Cuentas sin aprovisionar ({listado.sinAprovisionar.length})</h3>
          <p className="aviso">
            Existen en el servidor de acceso y <b>no tienen organización ni rol</b>: no son personas
            de este sistema. No pueden leer datos de activo, pero existir ya es un hecho que hay que
            mirar. Si alguna no debería estar, deshabilítela.
          </p>
          <div className="tabla-scroll">
            <table className="tabla">
              <thead>
                <tr><th>Correo</th><th>Nombre</th><th>Entra con</th><th>Creada</th><th>Último acceso</th><th>Estado</th></tr>
              </thead>
              <tbody>
                {listado.sinAprovisionar.map((c) => (
                  <tr key={c.uid}>
                    <td className="mono">{c.correo || '—'}</td>
                    <td>{c.nombre || '—'}</td>
                    <td className="mono">{(c.proveedores ?? []).join(', ') || '—'}</td>
                    <td>{fecha(c.creadaEn)}</td>
                    <td>{fecha(c.ultimoAcceso)}</td>
                    <td>
                      {c.activo
                        ? <span className="pill av">activa</span>
                        : <span className="pill h-pill">deshabilitada</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {reponiendo && personas?.some((p) => p.uid === reponiendo) && (
        <ReponerContrasena
          persona={personas.find((p) => p.uid === reponiendo)!}
          alFallar={setFallo}
          alTerminar={() => { const u = reponiendo; setReponiendo(null); void trasCambiar(u ?? undefined); }}
        />
      )}

      <p className="fine">
        De las dos vías de reposición, <b>el enlace es la buena</b>: la persona elige una contraseña
        que no sabe nadie más. La tecleada existe para cuando no hay canal por el que mandar un
        enlace, y su precio está dicho arriba — la conocen dos, y eso deja de ser la firma de una
        sola persona.
      </p>

      {/* La bitácora la puede leer quien tiene `usuarios.auditoria`. Un gestor
          sin esa función no la ve, y no se le enseña una tabla vacía que le
          haría creer que no ha pasado nada. */}
      {audita
        ? <Bitacora personas={personas ?? []} />
        : (
          <p className="fine">
            La bitácora de accesos exige la función <span className="mono">usuarios.auditoria</span>,
            que su sesión no trae. No se ha intentado leerla.
          </p>
        )}
    </section>
  );
}

// ── La limpieza inicial (`99 §ADR-100`) ─────────────────────────────────────

/**
 * Borrar TODAS las cuentas viejas, de una vez y para siempre. Dos pasos con
 * red: primero un ENSAYO que enseña exactamente qué se borraría; después el
 * borrado, que exige teclear BORRAR y el secreto de un solo uso que el
 * propietario puso en el trabajador. El cuerpo que se manda es EXACTAMENTE el
 * que devolvió el ensayo: si el padrón cambió entre medias, el trabajador lo
 * rechaza y hay que ensayar otra vez.
 *
 * ⚠️ El secreto NO se guarda en ningún sitio: vive en el estado del formulario
 * y muere con él. Y el texto avisa de lo que significa: definitivo, con lápida.
 */
function LimpiezaInicial({ alTerminar }: { alTerminar: () => void }) {
  const [abierta, setAbierta] = useState(false);
  const [ensayo, setEnsayo] = useState<EnsayoDeLimpieza | null>(null);
  const [confirmacion, setConfirmacion] = useState('');
  const [secreto, setSecreto] = useState('');
  const [trabajando, setTrabajando] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);
  const [informe, setInforme] = useState<string | null>(null);

  const ensayar = async () => {
    setFallo(null); setInforme(null); setTrabajando(true);
    try { setEnsayo(await ensayarLimpieza()); }
    catch (e) { setFallo(e instanceof Error ? e.message : 'No se pudo ensayar.'); }
    finally { setTrabajando(false); }
  };

  const borrar = async () => {
    if (!ensayo || confirmacion !== 'BORRAR' || !secreto) return;
    setFallo(null); setTrabajando(true);
    try {
      let borradas = 0;
      // Lotes: el trabajador responde 202 mientras queden; se vuelve a ensayar y
      // se manda lo pendiente, hasta que diga que terminó.
      let actual = ensayo;
      for (let vuelta = 0; vuelta < 50; vuelta += 1) {
        const r = await ejecutarLimpieza(secreto, { total: actual.total, uids: actual.uids, orgId: actual.orgId });
        borradas += r.borradas.length;
        if (r.terminado) break;
        actual = await ensayarLimpieza();
      }
      setInforme(`Listo. ${borradas} cuenta(s) borrada(s); sus lápidas quedan en la base. `
        + 'La revocación es inmediata en las dos puertas si REVOCADOS_ANTES_DE está puesto; si no, hasta una hora.');
      setEnsayo(null); setSecreto(''); setConfirmacion('');
      alTerminar();
    } catch (e) {
      setFallo(e instanceof Error ? e.message : 'No se pudo borrar.');
    } finally {
      setTrabajando(false);
    }
  };

  if (!abierta) {
    return (
      <div className="usr-acciones">
        <button type="button" className="boton chico" onClick={() => setAbierta(true)}>Limpieza inicial…</button>
      </div>
    );
  }

  return (
    <div className="usr-enlace">
      <p><b>Limpieza inicial.</b> Borra <b>todas</b> las cuentas del proyecto salvo la suya. Es la
        operación definitiva del corte de acceso y solo puede hacerse una vez.</p>
      <p className="alerta">
        <b>Definitivo.</b> Las cuentas quedan como lápida en la base, con su correo y su nombre, para
        que lo que declararon siga teniendo autor. Antes de ejecutar, ponga{' '}
        <span className="mono">REVOCADOS_ANTES_DE</span> en los dos trabajadores: así la revocación es
        inmediata, no «en una hora».
      </p>
      <div className="usr-acciones">
        <button type="button" className="boton chico" disabled={trabajando} onClick={() => void ensayar()}>
          {trabajando && !ensayo ? 'Ensayando…' : 'Ensayar (no borra nada)'}
        </button>
        <button type="button" className="boton chico"
          onClick={() => { setAbierta(false); setEnsayo(null); setSecreto(''); }}>Cerrar</button>
      </div>
      {fallo && <p className="alerta" role="alert">{fallo}</p>}
      {informe && <p className="ok" role="status">{informe}</p>}
      {ensayo && (
        <>
          <p className="fine"><b>{ensayo.total}</b> cuenta(s) se borrarían:</p>
          <div className="tabla-scroll">
            <table className="tabla">
              <thead><tr><th>Correo</th><th>Entra con</th><th>Rol</th><th>Estado</th><th>Creada</th></tr></thead>
              <tbody>
                {ensayo.cuentas.map((c) => (
                  <tr key={c.uid}>
                    <td>{c.correo}</td>
                    <td>{c.proveedores.join(', ') || '—'}</td>
                    <td>{c.rol}</td>
                    <td>{c.deshabilitada ? 'apagada' : 'activa'}</td>
                    <td>{c.creadaEn ? c.creadaEn.slice(0, 10) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="calc-fila">
            <label className="calc-campo"><span>Teclee BORRAR</span>
              <input type="text" autoComplete="off" value={confirmacion}
                onChange={(e) => setConfirmacion(e.target.value)} /></label>
            <label className="calc-campo"><span>Secreto de limpieza (LIMPIEZA_TOKEN)</span>
              <input type="password" autoComplete="off" value={secreto}
                onChange={(e) => setSecreto(e.target.value)} /></label>
          </div>
          <div className="usr-acciones">
            <button type="button" className="boton" disabled={trabajando || confirmacion !== 'BORRAR' || !secreto}
              onClick={() => void borrar()}>
              {trabajando ? 'Borrando…' : `Borrar estas ${ensayo.total} cuenta(s)`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

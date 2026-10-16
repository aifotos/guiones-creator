// Dónde se guardan los clientes y los guiones: la base de datos de Cloudflare.
// Se carga todo al entrar y se mantiene una copia en memoria; cada cambio se
// manda a la API.
const Almacen = (() => {
  const CLAVE_SESION = 'guiones-creator:sesion';
  let sesion = leerSesion();
  let clientes = [];
  let guiones = [];
  let alCaducar = () => {};

  function leerSesion() {
    try { return localStorage.getItem(CLAVE_SESION); } catch { return null; }
  }

  async function pedir(metodo, ruta, datos) {
    let respuesta;
    try {
      respuesta = await fetch(CONFIG.api + ruta, {
        method: metodo,
        headers: { 'Content-Type': 'application/json', ...(sesion ? { Authorization: `Bearer ${sesion}` } : {}) },
        body: datos ? JSON.stringify(datos) : undefined,
      });
    } catch {
      const e = new Error('Sin conexión a internet');
      e.estado = 0;
      throw e;
    }
    const cuerpo = await respuesta.json().catch(() => ({}));
    if (respuesta.status === 401 && ruta !== '/api/login') { cerrarSesion(); alCaducar(); }
    if (!respuesta.ok) {
      const e = new Error(cuerpo.error || 'Algo salió mal');
      e.estado = respuesta.status;
      e.datos = cuerpo;
      throw e;
    }
    return cuerpo;
  }

  // ---------- Sesión ----------

  async function entrar(password) {
    const { token } = await pedir('POST', '/api/login', { password });
    sesion = token;
    try { localStorage.setItem(CLAVE_SESION, token); } catch {}
  }

  function cerrarSesion() {
    sesion = null;
    clientes = [];
    guiones = [];
    try { localStorage.removeItem(CLAVE_SESION); } catch {}
  }

  // ---------- Lectura ----------

  async function cargar() {
    const datos = await pedir('GET', '/api/todo');
    clientes = datos.clientes;
    guiones = datos.guiones;
  }

  const porFecha = (a, b) => b.actualizado - a.actualizado;
  const listarClientes = () => [...clientes].sort(porFecha);
  const obtenerCliente = (id) => clientes.find((c) => c.id === id) || null;
  const guionesDe = (clienteId) => guiones.filter((g) => g.cliente_id === clienteId).sort(porFecha);
  const listar = () => [...guiones].sort(porFecha);
  const obtener = (id) => guiones.find((g) => g.id === id) || null;

  function linkDe(cliente) {
    return `${CONFIG.sitio}cliente.html#${cliente.token}`;
  }

  // ---------- Clientes ----------

  function reemplazarCliente(nuevo) {
    const i = clientes.findIndex((c) => c.id === nuevo.id);
    if (i >= 0) clientes[i] = nuevo; else clientes.push(nuevo);
    return nuevo;
  }

  async function crearCliente(nombre) {
    return reemplazarCliente(await pedir('POST', '/api/clientes', { nombre }));
  }

  async function editarCliente(id, cambios) {
    return reemplazarCliente(await pedir('PATCH', `/api/clientes/${id}`, cambios));
  }

  async function regenerarLink(id) {
    return reemplazarCliente(await pedir('POST', `/api/clientes/${id}/regenerar`));
  }

  async function borrarCliente(id) {
    await pedir('DELETE', `/api/clientes/${id}`);
    clientes = clientes.filter((c) => c.id !== id);
    guiones = guiones.filter((g) => g.cliente_id !== id);
  }

  // ---------- Guiones ----------

  async function crear(clienteId, titulo, bloques, formato) {
    const guion = await pedir('POST', '/api/guiones', { cliente_id: clienteId, titulo, bloques, formato, personajes: [] });
    guiones.push(guion);
    const cliente = obtenerCliente(clienteId);
    if (cliente) cliente.actualizado = guion.actualizado;
    return guion;
  }

  // Manda el guion tal como está ahora. Si alguien lo cambió en otro sitio,
  // la API responde 409 con la versión nueva (error.datos.guion).
  // forzarCopia: guarda en el historial cómo estaba antes (al restaurar una versión).
  async function guardar(guion, { forzarCopia = false } = {}) {
    const enviado = { titulo: guion.titulo, formato: guion.formato, bloques: guion.bloques, personajes: guion.personajes || [], version: guion.version, forzarCopia };
    const respuesta = await pedir('PUT', `/api/guiones/${guion.id}`, enviado);
    guion.version = respuesta.version;
    guion.actualizado = respuesta.actualizado;
    const cliente = obtenerCliente(guion.cliente_id);
    if (cliente) cliente.actualizado = respuesta.actualizado;
  }

  // Sustituye la copia local por la que llegó del servidor (tras un conflicto).
  function reemplazar(guion) {
    const i = guiones.findIndex((g) => g.id === guion.id);
    if (i >= 0) guiones[i] = guion; else guiones.push(guion);
    return guion;
  }

  async function comentar(guion, texto) {
    const comentario = await pedir('POST', `/api/guiones/${guion.id}/comentarios`, { texto });
    (guion.comentarios ||= []).push(comentario);
    return comentario;
  }

  // Qué cambió el cliente: { antes, despues, vigente } o null si no hay registro.
  async function cambios(id) {
    return (await pedir('GET', `/api/guiones/${id}/cambios`)).cambios;
  }

  // Historial y bloqueo
  const versiones = async (id) => (await pedir('GET', `/api/guiones/${id}/versiones`)).versiones;
  async function desbloquear(guion) {
    await pedir('POST', `/api/guiones/${guion.id}/desbloquear`);
    guion.aprobado = null;
  }

  // Avisos por Telegram
  const avisos = () => pedir('GET', '/api/avisos');
  const conectarTelegram = () => pedir('POST', '/api/avisos/telegram/conectar');
  const pruebaTelegram = () => pedir('POST', '/api/avisos/telegram/prueba');
  const desconectarTelegram = () => pedir('DELETE', '/api/avisos/telegram');

  async function borrar(id) {
    await pedir('DELETE', `/api/guiones/${id}`);
    guiones = guiones.filter((g) => g.id !== id);
  }

  return {
    haySesion: () => !!sesion,
    entrar, cerrarSesion, cargar,
    alCaducarSesion: (fn) => { alCaducar = fn; },
    listarClientes, obtenerCliente, guionesDe, listar, obtener, linkDe,
    crearCliente, editarCliente, regenerarLink, borrarCliente,
    crear, guardar, reemplazar, borrar, comentar, cambios,
    avisos, conectarTelegram, pruebaTelegram, desconectarTelegram,
    versiones, desbloquear,
  };
})();

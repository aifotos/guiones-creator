// API de Guiones Creator.
//
// Rutas del administrador (requieren iniciar sesión con la contraseña):
//   POST   /api/login                  { password } → { token }
//   GET    /api/todo                   clientes y guiones
//   POST   /api/clientes               { nombre }
//   PATCH  /api/clientes/:id           { nombre?, activo? }
//   POST   /api/clientes/:id/regenerar nuevo link
//   DELETE /api/clientes/:id           borra el cliente y sus guiones
//   POST   /api/guiones                { cliente_id, titulo, formato, contenido }
//   PUT    /api/guiones/:id            { titulo, formato, contenido, version }
//   DELETE /api/guiones/:id
//   POST   /api/guiones/:id/comentarios { texto }  responder al cliente
//   GET    /api/guiones/:id/cambios     qué cambió el cliente (antes y después)
//   GET    /api/avisos                  estado de los avisos por Telegram
//   POST   /api/avisos/telegram/conectar  conecta el chat que acaba de escribir al bot
//   POST   /api/avisos/telegram/prueba    manda un aviso de prueba
//   DELETE /api/avisos/telegram           deja de mandar avisos
//
// Rutas del cliente (solo con su link secreto):
//   GET    /api/c/:token                              su nombre, guiones y comentarios
//   PUT    /api/c/:token/guiones/:id                  { bloques, version } cambia los textos
//   POST   /api/c/:token/guiones/:id/aprobar          aprueba el guion
//   POST   /api/c/:token/guiones/:id/comentarios      { texto, cita? { bloque, texto } }

const SESION_DIAS = 30;
const MAX_FALLOS = 8;
const VENTANA_FALLOS_MS = 15 * 60 * 1000;
const MAX_CUERPO = 2 * 1024 * 1024; // 2 MB por petición: sobra para cualquier guion

const CORS = {
  // La seguridad no depende del origen: el administrador manda su token en la
  // cabecera Authorization y el cliente su link secreto. No se usan cookies.
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

class ErrorHttp extends Error {
  constructor(estado, mensaje) { super(mensaje); this.estado = estado; }
}

function json(datos, estado = 200) {
  return new Response(JSON.stringify(datos), {
    status: estado,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...CORS },
  });
}

async function leerCuerpo(peticion) {
  const texto = await peticion.text();
  if (texto.length > MAX_CUERPO) throw new ErrorHttp(413, 'El guion es demasiado grande');
  try { return texto ? JSON.parse(texto) : {}; } catch { throw new ErrorHttp(400, 'Datos no válidos'); }
}

// ---------- Utilidades criptográficas ----------

const codificador = new TextEncoder();

function base64url(bytes) {
  let bin = '';
  for (const b of new Uint8Array(bytes)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function aleatorio(n) {
  return base64url(crypto.getRandomValues(new Uint8Array(n)));
}

const nuevoId = () => crypto.randomUUID();
const nuevoTokenCliente = () => aleatorio(24); // 192 bits: imposible de adivinar

async function hmac(secreto, mensaje) {
  const clave = await crypto.subtle.importKey('raw', codificador.encode(secreto), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return base64url(await crypto.subtle.sign('HMAC', clave, codificador.encode(mensaje)));
}

// Compara sin revelar por el tiempo de respuesta cuántos caracteres coinciden.
async function igualesSeguro(a, b) {
  const [ha, hb] = await Promise.all([a, b].map((x) => crypto.subtle.digest('SHA-256', codificador.encode(String(x)))));
  const va = new Uint8Array(ha), vb = new Uint8Array(hb);
  let dif = 0;
  for (let i = 0; i < va.length; i++) dif |= va[i] ^ vb[i];
  return dif === 0;
}

// ---------- Sesión del administrador ----------

async function crearSesion(env) {
  const caduca = Date.now() + SESION_DIAS * 24 * 60 * 60 * 1000;
  const datos = `admin.${caduca}`;
  return `${datos}.${await hmac(env.SESSION_SECRET, datos)}`;
}

async function exigirAdmin(peticion, env) {
  const token = (peticion.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const partes = token.split('.');
  if (partes.length !== 3 || partes[0] !== 'admin') throw new ErrorHttp(401, 'Inicia sesión');
  const [quien, caduca, firma] = partes;
  if (!(await igualesSeguro(firma, await hmac(env.SESSION_SECRET, `${quien}.${caduca}`)))) throw new ErrorHttp(401, 'Inicia sesión');
  if (Number(caduca) < Date.now()) throw new ErrorHttp(401, 'La sesión caducó, vuelve a entrar');
}

async function login(peticion, env) {
  if (!env.ADMIN_PASSWORD || !env.SESSION_SECRET) throw new ErrorHttp(500, 'Falta configurar la contraseña en Cloudflare');
  const ip = peticion.headers.get('CF-Connecting-IP') || 'desconocida';
  const ahora = Date.now();
  const registro = await env.DB.prepare('SELECT fallos, desde FROM intentos_login WHERE ip = ?').bind(ip).first();
  const vigente = registro && ahora - registro.desde < VENTANA_FALLOS_MS;
  if (vigente && registro.fallos >= MAX_FALLOS) throw new ErrorHttp(429, 'Demasiados intentos. Espera 15 minutos.');

  const { password } = await leerCuerpo(peticion);
  if (!(await igualesSeguro(password || '', env.ADMIN_PASSWORD))) {
    await env.DB.prepare(
      `INSERT INTO intentos_login (ip, fallos, desde) VALUES (?1, 1, ?2)
       ON CONFLICT(ip) DO UPDATE SET fallos = CASE WHEN ?2 - desde < ?3 THEN fallos + 1 ELSE 1 END,
                                     desde  = CASE WHEN ?2 - desde < ?3 THEN desde ELSE ?2 END`,
    ).bind(ip, ahora, VENTANA_FALLOS_MS).run();
    throw new ErrorHttp(401, 'Contraseña incorrecta');
  }
  await env.DB.prepare('DELETE FROM intentos_login WHERE ip = ?').bind(ip).run();
  return json({ token: await crearSesion(env) });
}

// ---------- Datos ----------

const FORMATOS = ['sencillo', 'video', 'cine'];
const TIPOS = ['escena', 'accion', 'camara', 'voz', 'pantalla', 'nota', 'transicion', 'parrafo'];

function limpiarBloques(bloques) {
  if (!Array.isArray(bloques) || bloques.length > 3000) throw new ErrorHttp(400, 'Bloques no válidos');
  return bloques.map((b) => {
    if (!b || typeof b !== 'object' || !TIPOS.includes(b.tipo)) throw new ErrorHttp(400, 'Bloques no válidos');
    const limpio = { id: String(b.id ?? '').slice(0, 64), tipo: b.tipo, texto: String(b.texto ?? '').slice(0, 50000) };
    if (b.personaje != null) limpio.personaje = String(b.personaje).slice(0, 80);
    if (b.acotacion != null) limpio.acotacion = String(b.acotacion).slice(0, 200);
    return limpio;
  });
}

function guionDeFila(f, comentarios = []) {
  let contenido = {};
  try { contenido = JSON.parse(f.contenido); } catch {}
  return {
    id: f.id,
    cliente_id: f.cliente_id,
    titulo: f.titulo,
    formato: f.formato,
    bloques: Array.isArray(contenido.bloques) ? contenido.bloques : [],
    personajes: Array.isArray(contenido.personajes) ? contenido.personajes : [],
    version: f.version,
    editado_por: f.editado_por || 'admin',
    aprobado: f.aprobado || null,
    comentarios,
    creado: f.creado,
    actualizado: f.actualizado,
  };
}

// Agrupa los comentarios por guion: { idGuion: [comentario, …] }
function agruparComentarios(filas) {
  const grupos = {};
  for (const c of filas) {
    let cita = null;
    try { cita = c.cita ? JSON.parse(c.cita) : null; } catch {}
    (grupos[c.guion_id] ||= []).push({ id: c.id, autor: c.autor, texto: c.texto, cita, creado: c.creado });
  }
  return grupos;
}

function validarGuion(d) {
  if (d.formato != null && !FORMATOS.includes(d.formato)) throw new ErrorHttp(400, 'Formato desconocido');
  const personajes = Array.isArray(d.personajes) ? d.personajes.slice(0, 200).map((p) => String(p).slice(0, 80)) : [];
  return {
    titulo: String(d.titulo ?? '').slice(0, 300),
    formato: d.formato || 'video',
    contenido: JSON.stringify({ bloques: limpiarBloques(d.bloques || []), personajes }),
  };
}

function nombreCliente(nombre) {
  const limpio = String(nombre ?? '').trim().slice(0, 120);
  if (!limpio) throw new ErrorHttp(400, 'Escribe el nombre del cliente');
  return limpio;
}

async function todo(env) {
  const [clientes, guiones, comentarios] = await env.DB.batch([
    env.DB.prepare('SELECT * FROM clientes ORDER BY actualizado DESC'),
    env.DB.prepare('SELECT * FROM guiones ORDER BY actualizado DESC'),
    env.DB.prepare('SELECT * FROM comentarios ORDER BY creado'),
  ]);
  const porGuion = agruparComentarios(comentarios.results);
  return json({ clientes: clientes.results, guiones: guiones.results.map((g) => guionDeFila(g, porGuion[g.id])) });
}

async function crearCliente(peticion, env) {
  const { nombre } = await leerCuerpo(peticion);
  const ahora = Date.now();
  const cliente = { id: nuevoId(), nombre: nombreCliente(nombre), token: nuevoTokenCliente(), activo: 1, creado: ahora, actualizado: ahora };
  await env.DB.prepare('INSERT INTO clientes (id, nombre, token, activo, creado, actualizado) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(cliente.id, cliente.nombre, cliente.token, cliente.activo, cliente.creado, cliente.actualizado).run();
  return json(cliente, 201);
}

async function obtenerCliente(env, id) {
  const cliente = await env.DB.prepare('SELECT * FROM clientes WHERE id = ?').bind(id).first();
  if (!cliente) throw new ErrorHttp(404, 'Ese cliente no existe');
  return cliente;
}

async function editarCliente(peticion, env, id) {
  const cliente = await obtenerCliente(env, id);
  const d = await leerCuerpo(peticion);
  const nombre = d.nombre != null ? nombreCliente(d.nombre) : cliente.nombre;
  const activo = d.activo != null ? (d.activo ? 1 : 0) : cliente.activo;
  // Solo cifras (con el código de país), como lo pide WhatsApp: 18095551234
  const telefono = d.telefono != null ? String(d.telefono).replace(/\D/g, '').slice(0, 20) : cliente.telefono;
  const ahora = Date.now();
  await env.DB.prepare('UPDATE clientes SET nombre = ?, activo = ?, telefono = ?, actualizado = ? WHERE id = ?').bind(nombre, activo, telefono, ahora, id).run();
  return json({ ...cliente, nombre, activo, telefono, actualizado: ahora });
}

async function regenerarLink(env, id) {
  const cliente = await obtenerCliente(env, id);
  const token = nuevoTokenCliente();
  const ahora = Date.now();
  await env.DB.prepare('UPDATE clientes SET token = ?, activo = 1, actualizado = ? WHERE id = ?').bind(token, ahora, id).run();
  return json({ ...cliente, token, activo: 1, actualizado: ahora });
}

async function borrarCliente(env, id) {
  await obtenerCliente(env, id);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM guiones WHERE cliente_id = ?').bind(id),
    env.DB.prepare('DELETE FROM clientes WHERE id = ?').bind(id),
  ]);
  return json({ ok: true });
}

async function crearGuion(peticion, env) {
  const d = await leerCuerpo(peticion);
  await obtenerCliente(env, d.cliente_id);
  const v = validarGuion(d);
  const ahora = Date.now();
  const id = typeof d.id === 'string' && /^[\w-]{8,64}$/.test(d.id) ? d.id : nuevoId();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO guiones (id, cliente_id, titulo, formato, contenido, version, creado, actualizado) VALUES (?, ?, ?, ?, ?, 1, ?, ?)')
      .bind(id, d.cliente_id, v.titulo, v.formato, v.contenido, ahora, ahora),
    env.DB.prepare('UPDATE clientes SET actualizado = ? WHERE id = ?').bind(ahora, d.cliente_id),
  ]);
  return json(guionDeFila({ id, cliente_id: d.cliente_id, ...v, version: 1, creado: ahora, actualizado: ahora }), 201);
}

async function guardarGuion(peticion, env, id) {
  const d = await leerCuerpo(peticion);
  const v = validarGuion(d);
  const ahora = Date.now();
  const previa = await env.DB.prepare('SELECT * FROM guiones WHERE id = ?').bind(id).first();
  if (previa && previa.editado_por === 'cliente' && previa.version === Number(d.version)) await copiaDe(env, previa).run();
  // Solo guarda si nadie lo cambió desde la versión que tenía quien guarda.
  const r = await env.DB.prepare(
    "UPDATE guiones SET titulo = ?, formato = ?, contenido = ?, version = version + 1, editado_por = 'admin', actualizado = ? WHERE id = ? AND version = ?",
  ).bind(v.titulo, v.formato, v.contenido, ahora, id, Number(d.version)).run();
  if (!r.meta.changes) {
    const fila = await env.DB.prepare('SELECT * FROM guiones WHERE id = ?').bind(id).first();
    if (!fila) throw new ErrorHttp(404, 'Ese guion no existe');
    return json({ error: 'Este guion cambió en otro sitio', guion: guionDeFila(fila, await comentariosDe(env, id)) }, 409);
  }
  const fila = await env.DB.prepare('SELECT * FROM guiones WHERE id = ?').bind(id).first();
  await env.DB.prepare('UPDATE clientes SET actualizado = ? WHERE id = ?').bind(ahora, fila.cliente_id).run();
  return json(guionDeFila(fila, await comentariosDe(env, id)));
}

// Guarda una copia del guion tal como está, firmada por quien lo dejó así
// (o como 'admin' si es el punto de partida con el que se comparará al cliente).
function copiaDe(env, fila, autor = fila.editado_por || 'admin') {
  return env.DB.prepare('INSERT INTO versiones (id, guion_id, version, autor, titulo, formato, contenido, creado) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(nuevoId(), fila.id, fila.version, autor, fila.titulo, fila.formato, fila.contenido, fila.actualizado);
}

// Lo último que cambió el cliente: "antes" es como lo dejaste tú y "despues" como lo dejó él.
async function cambiosDelCliente(env, id) {
  const fila = await env.DB.prepare('SELECT * FROM guiones WHERE id = ?').bind(id).first();
  if (!fila) throw new ErrorHttp(404, 'Ese guion no existe');
  const despues = fila.editado_por === 'cliente'
    ? fila
    : await env.DB.prepare("SELECT * FROM versiones WHERE guion_id = ? AND autor = 'cliente' ORDER BY version DESC LIMIT 1").bind(id).first();
  if (!despues) return json({ cambios: null });
  const antes = await env.DB.prepare("SELECT * FROM versiones WHERE guion_id = ? AND autor = 'admin' AND version < ? ORDER BY version DESC LIMIT 1")
    .bind(id, despues.version).first();
  if (!antes) return json({ cambios: null });
  const resumen = (f) => ({ version: f.version, fecha: f.actualizado ?? f.creado, bloques: JSON.parse(f.contenido || '{}').bloques || [] });
  return json({ cambios: { antes: resumen(antes), despues: resumen(despues), vigente: despues === fila } });
}

async function borrarGuion(env, id) {
  await env.DB.prepare('DELETE FROM guiones WHERE id = ?').bind(id).run();
  return json({ ok: true });
}

async function comentarAdmin(peticion, env, id) {
  const guion = await env.DB.prepare('SELECT id FROM guiones WHERE id = ?').bind(id).first();
  if (!guion) throw new ErrorHttp(404, 'Ese guion no existe');
  return json(await guardarComentario(env, id, 'admin', await leerCuerpo(peticion)), 201);
}

async function guardarComentario(env, guionId, autor, { texto, cita } = {}) {
  const limpio = String(texto ?? '').trim().slice(0, 4000);
  if (!limpio) throw new ErrorHttp(400, 'El comentario está vacío');
  const frase = cita && typeof cita === 'object' ? String(cita.texto ?? '').trim().slice(0, 600) : '';
  const citaLimpia = frase ? { bloque: String(cita.bloque ?? '').slice(0, 64), texto: frase } : null;
  const comentario = { id: nuevoId(), autor, texto: limpio, cita: citaLimpia, creado: Date.now() };
  await env.DB.prepare('INSERT INTO comentarios (id, guion_id, autor, texto, cita, creado) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(comentario.id, guionId, autor, comentario.texto, citaLimpia ? JSON.stringify(citaLimpia) : null, comentario.creado).run();
  return comentario;
}

// ---------- Avisos por Telegram ----------
// El bot lo creas tú en Telegram (@BotFather); su token es un secreto de Cloudflare
// (TELEGRAM_TOKEN) y el chat al que escribir se guarda en la tabla ajustes.

const escaparHtml = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const recortar = (t, n) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

async function ajuste(env, clave) {
  return (await env.DB.prepare('SELECT valor FROM ajustes WHERE clave = ?').bind(clave).first())?.valor ?? null;
}

async function telegram(env, metodo, datos) {
  const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_TOKEN}/${metodo}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(datos || {}),
  });
  const cuerpo = await r.json().catch(() => ({}));
  if (!cuerpo.ok) throw new ErrorHttp(502, `Telegram respondió: ${cuerpo.description || r.status}`);
  return cuerpo.result;
}

// Manda un aviso si Telegram está conectado. Nunca hace fallar lo que el cliente estaba haciendo.
async function avisar(env, html) {
  try {
    const chat = await ajuste(env, 'telegram_chat');
    if (!env.TELEGRAM_TOKEN || !chat) return;
    await telegram(env, 'sendMessage', { chat_id: chat, text: html, parse_mode: 'HTML', disable_web_page_preview: true });
  } catch (e) {
    console.error('Aviso de Telegram no enviado', e);
  }
}

const enlaceGuion = (env, id, extra = '') => `${env.SITIO}#g:${id}${extra}`;

async function estadoAvisos(env) {
  return json({
    telegram: {
      token: !!env.TELEGRAM_TOKEN,
      conectado: !!(await ajuste(env, 'telegram_chat')),
      nombre: await ajuste(env, 'telegram_nombre'),
    },
  });
}

// Busca el último mensaje que alguien mandó al bot y guarda ese chat como destino de los avisos.
async function conectarTelegram(env) {
  if (!env.TELEGRAM_TOKEN) throw new ErrorHttp(400, 'Falta el token del bot en Cloudflare');
  const mensajes = await telegram(env, 'getUpdates', { allowed_updates: ['message'] });
  const ultimo = [...mensajes].reverse().find((u) => u.message?.chat?.id);
  if (!ultimo) throw new ErrorHttp(404, 'Todavía no le has escrito al bot. Ábrelo en Telegram, pulsa Iniciar (o escribe "hola") y vuelve a intentarlo.');
  const chat = ultimo.message.chat;
  const nombre = [chat.first_name, chat.last_name].filter(Boolean).join(' ') || chat.title || chat.username || 'Telegram';
  await env.DB.batch([
    env.DB.prepare("INSERT INTO ajustes (clave, valor) VALUES ('telegram_chat', ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor").bind(String(chat.id)),
    env.DB.prepare("INSERT INTO ajustes (clave, valor) VALUES ('telegram_nombre', ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor").bind(nombre),
  ]);
  await telegram(env, 'sendMessage', { chat_id: chat.id, text: '✅ Listo. A partir de ahora te aviso aquí cuando un cliente te escriba, cambie o apruebe un guion.' });
  return json({ nombre });
}

async function pruebaTelegram(env) {
  const chat = await ajuste(env, 'telegram_chat');
  if (!env.TELEGRAM_TOKEN || !chat) throw new ErrorHttp(400, 'Telegram no está conectado');
  await telegram(env, 'sendMessage', { chat_id: chat, text: '🔔 Aviso de prueba de Guiones Creator. ¡Funciona!' });
  return json({ ok: true });
}

async function desconectarTelegram(env) {
  await env.DB.prepare("DELETE FROM ajustes WHERE clave IN ('telegram_chat', 'telegram_nombre')").run();
  return json({ ok: true });
}

// ---------- Cliente (con su link) ----------

async function clienteDelLink(env, token) {
  const cliente = await env.DB.prepare('SELECT id, nombre FROM clientes WHERE token = ? AND activo = 1').bind(token).first();
  if (!cliente) throw new ErrorHttp(404, 'Este link no existe o fue desactivado');
  return cliente;
}

async function guionDelCliente(env, cliente, id) {
  const fila = await env.DB.prepare('SELECT * FROM guiones WHERE id = ? AND cliente_id = ?').bind(id, cliente.id).first();
  if (!fila) throw new ErrorHttp(404, 'Ese guion no existe');
  return fila;
}

async function comentariosDe(env, guionId) {
  const { results } = await env.DB.prepare('SELECT * FROM comentarios WHERE guion_id = ? ORDER BY creado').bind(guionId).all();
  return agruparComentarios(results)[guionId] || [];
}

// Lo que ve el cliente se limpia: sin el id del cliente.
const paraCliente = ({ cliente_id, ...g }) => g;

// Lo que ve el cliente: su nombre, sus guiones y sus comentarios. Nada de los demás clientes.
async function vistaCliente(env, token) {
  const cliente = await clienteDelLink(env, token);
  const [guiones, comentarios] = await env.DB.batch([
    env.DB.prepare('SELECT * FROM guiones WHERE cliente_id = ? ORDER BY actualizado DESC').bind(cliente.id),
    env.DB.prepare('SELECT c.* FROM comentarios c JOIN guiones g ON g.id = c.guion_id WHERE g.cliente_id = ? ORDER BY c.creado').bind(cliente.id),
  ]);
  const porGuion = agruparComentarios(comentarios.results);
  return json({
    cliente: { nombre: cliente.nombre },
    guiones: guiones.results.map((g) => paraCliente(guionDeFila(g, porGuion[g.id]))),
  });
}

// El cliente solo cambia textos: no puede añadir, quitar ni reordenar bloques.
// Cambiar el guion quita la aprobación (hay que volver a aprobarlo).
async function clienteEdita(peticion, env, ctx, token, id) {
  const cliente = await clienteDelLink(env, token);
  const fila = await guionDelCliente(env, cliente, id);
  const d = await leerCuerpo(peticion);
  if (Number(d.version) !== fila.version) {
    return json({ error: 'Este guion cambió en otro sitio', guion: paraCliente(guionDeFila(fila, await comentariosDe(env, id))) }, 409);
  }
  // Antes de que el cliente cambie algo hace falta la versión con la que comparar:
  // la tuya, o, si el guion es de antes de existir las copias, cómo estaba hasta ahora.
  const hayPuntoDePartida = await env.DB.prepare("SELECT 1 FROM versiones WHERE guion_id = ? AND autor = 'admin' LIMIT 1").bind(id).first();
  if (fila.editado_por !== 'cliente' || !hayPuntoDePartida) await copiaDe(env, fila, 'admin').run();
  const nuevos = new Map(limpiarBloques(d.bloques || []).map((b) => [b.id, b.texto]));
  const contenido = JSON.parse(fila.contenido || '{}');
  contenido.bloques = (contenido.bloques || []).map((b) => (nuevos.has(b.id) ? { ...b, texto: nuevos.get(b.id) } : b));
  const ahora = Date.now();
  const r = await env.DB.prepare(
    "UPDATE guiones SET contenido = ?, version = version + 1, editado_por = 'cliente', aprobado = NULL, actualizado = ? WHERE id = ? AND version = ?",
  ).bind(JSON.stringify(contenido), ahora, id, fila.version).run();
  if (!r.meta.changes) { // otro guardado se coló justo ahora
    const otra = await guionDelCliente(env, cliente, id);
    return json({ error: 'Este guion cambió en otro sitio', guion: paraCliente(guionDeFila(otra, await comentariosDe(env, id))) }, 409);
  }
  await env.DB.prepare('UPDATE clientes SET actualizado = ? WHERE id = ?').bind(ahora, cliente.id).run();
  const actualizada = await guionDelCliente(env, cliente, id);
  ctx.waitUntil(avisar(env,
    `✏️ <b>${escaparHtml(cliente.nombre)}</b> hizo cambios en «${escaparHtml(fila.titulo || 'Guion sin título')}».\n\n<a href="${enlaceGuion(env, id, ':cambios')}">Ver qué cambió</a>`));
  return json(paraCliente(guionDeFila(actualizada, await comentariosDe(env, id))));
}

async function clienteAprueba(env, ctx, token, id) {
  const cliente = await clienteDelLink(env, token);
  const fila = await guionDelCliente(env, cliente, id);
  const ahora = Date.now();
  await env.DB.batch([
    env.DB.prepare('UPDATE guiones SET aprobado = ? WHERE id = ?').bind(ahora, id),
    env.DB.prepare('UPDATE clientes SET actualizado = ? WHERE id = ?').bind(ahora, cliente.id),
  ]);
  ctx.waitUntil(avisar(env,
    `✅ <b>${escaparHtml(cliente.nombre)}</b> aprobó «${escaparHtml(fila.titulo || 'Guion sin título')}».\n\n<a href="${enlaceGuion(env, id)}">Abrir el guion</a>`));
  return json({ aprobado: ahora });
}

async function clienteComenta(peticion, env, ctx, token, id) {
  const cliente = await clienteDelLink(env, token);
  const fila = await guionDelCliente(env, cliente, id);
  const comentario = await guardarComentario(env, id, 'cliente', await leerCuerpo(peticion));
  const cita = comentario.cita ? `\n<i>Sobre: «${escaparHtml(recortar(comentario.cita.texto, 120))}»</i>` : '';
  ctx.waitUntil(avisar(env,
    `💬 <b>${escaparHtml(cliente.nombre)}</b> te escribió en «${escaparHtml(fila.titulo || 'Guion sin título')}»:${cita}\n\n${escaparHtml(recortar(comentario.texto, 600))}\n\n<a href="${enlaceGuion(env, id, ':chat')}">Responder</a>`));
  return json(comentario, 201);
}

// ---------- Enrutador ----------

async function atender(peticion, env, ctx) {
  const url = new URL(peticion.url);
  const ruta = url.pathname.replace(/\/+$/, '');
  const metodo = peticion.method;
  let m;

  if (ruta === '/api/login' && metodo === 'POST') return login(peticion, env);
  if ((m = ruta.match(/^\/api\/c\/([\w-]{20,64})$/)) && metodo === 'GET') return vistaCliente(env, m[1]);
  if ((m = ruta.match(/^\/api\/c\/([\w-]{20,64})\/guiones\/([\w-]+)$/)) && metodo === 'PUT') return clienteEdita(peticion, env, ctx, m[1], m[2]);
  if ((m = ruta.match(/^\/api\/c\/([\w-]{20,64})\/guiones\/([\w-]+)\/aprobar$/)) && metodo === 'POST') return clienteAprueba(env, ctx, m[1], m[2]);
  if ((m = ruta.match(/^\/api\/c\/([\w-]{20,64})\/guiones\/([\w-]+)\/comentarios$/)) && metodo === 'POST') return clienteComenta(peticion, env, ctx, m[1], m[2]);

  if (ruta.startsWith('/api/')) {
    await exigirAdmin(peticion, env);
    if (ruta === '/api/todo' && metodo === 'GET') return todo(env);
    if (ruta === '/api/avisos' && metodo === 'GET') return estadoAvisos(env);
    if (ruta === '/api/avisos/telegram/conectar' && metodo === 'POST') return conectarTelegram(env);
    if (ruta === '/api/avisos/telegram/prueba' && metodo === 'POST') return pruebaTelegram(env);
    if (ruta === '/api/avisos/telegram' && metodo === 'DELETE') return desconectarTelegram(env);
    if (ruta === '/api/clientes' && metodo === 'POST') return crearCliente(peticion, env);
    if ((m = ruta.match(/^\/api\/clientes\/([\w-]+)\/regenerar$/)) && metodo === 'POST') return regenerarLink(env, m[1]);
    if ((m = ruta.match(/^\/api\/clientes\/([\w-]+)$/))) {
      if (metodo === 'PATCH') return editarCliente(peticion, env, m[1]);
      if (metodo === 'DELETE') return borrarCliente(env, m[1]);
    }
    if (ruta === '/api/guiones' && metodo === 'POST') return crearGuion(peticion, env);
    if ((m = ruta.match(/^\/api\/guiones\/([\w-]+)\/comentarios$/)) && metodo === 'POST') return comentarAdmin(peticion, env, m[1]);
    if ((m = ruta.match(/^\/api\/guiones\/([\w-]+)\/cambios$/)) && metodo === 'GET') return cambiosDelCliente(env, m[1]);
    if ((m = ruta.match(/^\/api\/guiones\/([\w-]+)$/))) {
      if (metodo === 'PUT') return guardarGuion(peticion, env, m[1]);
      if (metodo === 'DELETE') return borrarGuion(env, m[1]);
    }
  }
  throw new ErrorHttp(404, 'No encontrado');
}

export default {
  async fetch(peticion, env, ctx) {
    if (peticion.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    try {
      return await atender(peticion, env, ctx);
    } catch (e) {
      if (e instanceof ErrorHttp) return json({ error: e.message }, e.estado);
      console.error(e);
      return json({ error: 'Algo falló en el servidor' }, 500);
    }
  },
};

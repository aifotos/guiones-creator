// Pantalla del administrador: acceso con contraseña, clientes con su link,
// editor por bloques (o texto libre en el formato sencillo), sugerencias y
// vista del cliente.
(() => {
  const $ = (id) => document.getElementById(id);

  let actual = null;      // guión abierto
  let modo = 'editar';    // 'editar' | 'leer'
  let temporizador = null;
  let clienteAbierto = null; // cliente cuyo panel está abierto

  const BLOQUES_INICIALES = {
    sencillo: () => [Guion.nuevoBloque('parrafo')],
    video: () => [Guion.nuevoBloque('escena'), Guion.nuevoBloque('camara')],
    cine: () => [Guion.nuevoBloque('escena'), Guion.nuevoBloque('accion')],
  };

  const ATAJOS = {
    sencillo: 'Escribe libremente, como un texto normal. Deja una línea en blanco entre párrafos.',
    video: '<kbd>⌘</kbd> + <kbd>Enter</kbd> crea un bloque debajo · <kbd>Tab</kbd> en un bloque vacío cambia su tipo · en una escena escribe <b>int</b> o <b>ext</b> y te sugiere el resto.',
    cine: '<kbd>⌘</kbd> + <kbd>Enter</kbd> crea el siguiente bloque (Encabezado → Acción → Diálogo) · <kbd>Tab</kbd> en un bloque vacío cambia su tipo · en un encabezado escribe <b>int</b> o <b>ext</b> y te sugiere el resto.',
  };

  // ---------- Menú de sugerencias ----------

  const Menu = (() => {
    const caja = document.createElement('ul');
    caja.className = 'sugerencias';
    caja.hidden = true;
    caja.setAttribute('role', 'listbox');
    document.body.append(caja);
    let opciones = [], indice = 0, alElegir = null, ancla = null;

    function mostrar(elemento, lista, elegir) {
      if (!lista.length) return ocultar();
      ancla = elemento; opciones = lista; indice = 0; alElegir = elegir;
      caja.replaceChildren(...lista.map((op, i) => {
        const li = document.createElement('li');
        li.className = 'sugerencia' + (i === 0 ? ' activa' : '');
        const texto = document.createElement('span');
        texto.textContent = op.etiqueta;
        const detalle = document.createElement('small');
        detalle.textContent = op.detalle || '';
        li.append(texto, detalle);
        // mousedown (no click) para que el campo no pierda el foco antes de elegir.
        li.addEventListener('mousedown', (e) => { e.preventDefault(); aceptar(i); });
        return li;
      }));
      const r = elemento.getBoundingClientRect();
      caja.style.left = `${r.left + scrollX}px`;
      caja.style.top = `${r.bottom + scrollY + 4}px`;
      caja.hidden = false;
    }

    function ocultar() { caja.hidden = true; opciones = []; ancla = null; }

    function aceptar(i) {
      const op = opciones[i], elegir = alElegir;
      ocultar();
      if (op && elegir) elegir(op);
    }

    function marcar() { [...caja.children].forEach((li, i) => li.classList.toggle('activa', i === indice)); }

    // Devuelve true si la tecla era para el menú.
    function tecla(e) {
      if (caja.hidden) return false;
      if (e.key === 'ArrowDown') { indice = (indice + 1) % opciones.length; marcar(); }
      else if (e.key === 'ArrowUp') { indice = (indice - 1 + opciones.length) % opciones.length; marcar(); }
      else if (e.key === 'Enter' || e.key === 'Tab') aceptar(indice);
      else if (e.key === 'Escape') ocultar();
      else return false;
      e.preventDefault();
      return true;
    }

    const abiertoPara = (elemento) => !caja.hidden && ancla === elemento;
    return { mostrar, ocultar, tecla, abiertoPara };
  })();

  // ---------- Aviso breve ----------

  const aviso = document.createElement('div');
  aviso.className = 'aviso';
  aviso.setAttribute('role', 'status');
  document.body.append(aviso);
  let avisoTiempo = null;
  // accion (opcional): { texto, alPulsar } añade un botón al aviso, que dura más.
  function avisar(texto, accion) {
    const check = elemento('span', 'aviso-check');
    check.append(UI.icono('check', 14));
    aviso.replaceChildren(check, elemento('span', 'aviso-texto', texto));
    if (accion) {
      const boton = document.createElement('button');
      boton.className = 'aviso-accion';
      boton.textContent = accion.texto;
      boton.addEventListener('click', () => { aviso.classList.remove('visible'); accion.alPulsar(); });
      aviso.append(boton);
    }
    aviso.classList.toggle('con-accion', !!accion);
    aviso.classList.add('visible');
    clearTimeout(avisoTiempo);
    avisoTiempo = setTimeout(() => aviso.classList.remove('visible'), accion ? 8000 : 2800);
  }

  // ---------- Guardado ----------
  // Se guarda en la nube un momento después de dejar de escribir. Sin conexión
  // reintenta solo; si el guion cambió en otro sitio, pregunta qué hacer.

  let guardando = false;
  let pendiente = null;

  function estadoGuardado(texto, error = false) {
    $('guardado').textContent = texto;
    $('guardado').classList.toggle('error', error);
  }

  async function guardarYa(guion = actual) {
    clearTimeout(temporizador);
    temporizador = null;
    if (!guion) return;
    if (guardando) { pendiente = guion; return; }
    guardando = true;
    estadoGuardado('Guardando…');
    try {
      await Almacen.guardar(guion);
      if (guion === actual) { estadoGuardado('Guardado'); $('doc-version').textContent = `v${guion.version}`; }
      pintarLista();
    } catch (e) {
      if (e.estado === 409) resolverConflicto(guion, e.datos.guion);
      else if (e.estado === 423) {
        estadoGuardado('No guardado: el cliente lo aprobó', true);
        alert('El cliente acaba de aprobar este guión, así que quedó bloqueado y tu último cambio no se guardó. Desbloquéalo si necesitas cambiar algo.');
        guion.aprobado = guion.aprobado || Date.now();
        refrescarAhora();
      }
      else if (e.estado !== 401) {
        estadoGuardado('Sin conexión · reintentando…', true);
        temporizador = setTimeout(() => guardarYa(guion), 4000);
      }
    } finally {
      guardando = false;
      if (pendiente) { const siguiente = pendiente; pendiente = null; guardarYa(siguiente); }
    }
  }

  function guardarLuego() {
    estadoGuardado('Guardando…');
    clearTimeout(temporizador);
    const guion = actual;
    temporizador = setTimeout(() => guardarYa(guion), 700);
  }

  function resolverConflicto(local, servidor) {
    const usarNueva = confirm(
      `"${servidor.titulo || 'Guión sin título'}" se cambió en otro sitio (quizá lo editó el cliente).\n\n` +
      'Aceptar: ver la versión más nueva (se descartan tus últimos cambios).\n' +
      'Cancelar: guardar tu versión encima de la otra.');
    if (usarNueva) {
      Almacen.reemplazar(servidor);
      if (actual && actual.id === servidor.id) abrir(servidor.id);
      avisar('Se cargó la versión más nueva');
    } else {
      local.version = servidor.version;
      guardarYa(local);
    }
  }

  function hayCambiosSinGuardar() {
    return !!temporizador || guardando;
  }

  // ---------- Novedades del cliente ----------
  // Se recuerda en este navegador cuándo abriste cada guion por última vez;
  // lo que el cliente hizo después (editar, aprobar, comentar) es una novedad.

  const CLAVE_VISTOS = 'guiones-creator:vistos';
  let vistos = {};
  try { vistos = JSON.parse(localStorage.getItem(CLAVE_VISTOS) || '{}'); } catch {}

  function marcarVisto(g) {
    vistos[g.id] = Date.now();
    try { localStorage.setItem(CLAVE_VISTOS, JSON.stringify(vistos)); } catch {}
  }

  // Devuelve qué hizo el cliente desde la última vez que abriste el guion.
  function novedades(g) {
    const visto = vistos[g.id] || 0;
    const lista = [];
    if (g.editado_por === 'cliente' && g.actualizado > visto) lista.push('editó');
    if (g.aprobado && g.aprobado > visto) lista.push('aprobó');
    if ((g.comentarios || []).some((c) => c.autor === 'cliente' && c.creado > visto)) lista.push('comentó');
    return lista;
  }

  function insignias(g) {
    const caja = elemento('span', 'insignias');
    if (g.aprobado) caja.append(elemento('span', 'insignia aprobado', 'Aprobado ✓'));
    if (novedades(g).length) caja.append(elemento('span', 'insignia nuevo', 'Nuevo'));
    return caja;
  }

  const fechaHora = (ms) => new Date(ms).toLocaleString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  // Píldora de estado del guion. Si está aprobado (bloqueado), tocarla lo desbloquea.
  function pintarAvisos() {
    const e = estadoDe(actual);
    const pildora = $('doc-estado');
    pildora.style.setProperty('--estado-fondo', e.fondo);
    pildora.style.setProperty('--estado-texto', e.texto);
    pildora.style.setProperty('--estado-punto', e.punto);
    $('doc-estado-texto').textContent = e.etiqueta;
    pildora.title = actual.aprobado
      ? `El cliente lo aprobó el ${fechaHora(actual.aprobado)} y quedó bloqueado. Toca para desbloquear y editar.`
      : e.etiqueta;
    pildora.classList.toggle('accionable', !!actual.aprobado);
    cargarCambios();
  }

  // ¿Hay cambios del cliente que marcar? Muestra el interruptor y repinta si hace falta.
  async function cargarCambios() {
    const guion = actual;
    let cambios = null;
    try { cambios = await cambiosDe(guion); } catch { /* sin conexión */ }
    if (guion !== actual) return;
    const antes = cambiosActuales;
    cambiosActuales = cambios;
    $('ver-cambios').hidden = !cambios;
    pintarInterruptorCambios();
    if (cambios !== antes && verCambios && modo === 'editar' && actual.formato !== 'sencillo') pintarBloques();
  }

  function pintarInterruptorCambios() {
    $('ver-cambios').setAttribute('aria-pressed', String(verCambios));
    $('ver-cambios').classList.toggle('activo', verCambios);
  }


  // Chat del guion: columna fija a la derecha desde 1200 px; por debajo, un cajón que
  // se abre con "Chat con…" (o el botón redondo del celular) y se cierra con la ✕.
  let chatAbierto = false;
  const chatFijo = () => window.innerWidth >= 1200 && modo !== 'leer'; // en la vista del cliente es cajón
  const chatFlotante = {
    abrir() {
      chatAbierto = true;
      $('marco').classList.add('chat-abierto');
      if (actual) pintarComentariosDoc({ alFinal: true });
    },
    cerrar() {
      chatAbierto = false;
      $('marco').classList.remove('chat-abierto');
    },
    visible: () => vista === 'documento' && (chatFijo() || chatAbierto),
  };
  $('chat-cerrar').addEventListener('click', () => chatFlotante.cerrar());

  // Mensajes del cliente que no has leído (globo rojo del botón del chat minimizado).
  // Se cuentan como leídos cuando el chat está abierto a la vista.
  const CLAVE_LEIDOS = 'guiones-creator:chat-leidos';
  let leidos = {};
  try { leidos = JSON.parse(localStorage.getItem(CLAVE_LEIDOS) || '{}'); } catch {}

  function pintarSinLeer() {
    const mensajes = actual.comentarios || [];
    if (chatFlotante.visible()) {
      leidos[actual.id] = Math.max(0, ...mensajes.map((c) => c.creado));
      try { localStorage.setItem(CLAVE_LEIDOS, JSON.stringify(leidos)); } catch {}
    }
    const sinLeer = mensajes.filter((c) => c.autor === 'cliente' && c.creado > (leidos[actual.id] || 0)).length;
    for (const id of ['doc-chat-sin-leer', 'movil-sin-leer']) {
      $(id).textContent = sinLeer;
      $(id).hidden = !sinLeer;
    }
  }

  function pintarComentariosDoc(opciones = {}) {
    const cliente = Almacen.obtenerCliente(actual.cliente_id);
    const nombre = cliente?.nombre || 'Cliente';
    $('chat-nombre').textContent = nombre;
    $('chat-avatar').replaceWith(Object.assign(UI.avatar(nombre, indiceCliente(actual.cliente_id), 'avatar chat-avatar'), { id: 'chat-avatar' }));
    $('respuesta-texto').placeholder = `Escríbele a ${nombre}…`;
    Chat.pintar($('doc-comentarios'), actual.comentarios || [], {
      yo: 'admin',
      vacio: 'Aún no hay mensajes',
      alTocarCita: (c) => {
        if (!chatFijo()) chatFlotante.cerrar(); // el cajón tapa el guion
        verFrase(c);
      },
      alFinal: opciones.alFinal,
    });
    pintarSinLeer();
  }

  function citasDe(g) {
    return (g.comentarios || []).filter((c) => c.cita).map((c) => ({ id: c.id, bloque: c.cita.bloque, texto: c.cita.texto }));
  }

  // Muestra la frase comentada: en la vista del cliente sale resaltada; si ya
  // no está igual (porque se cambió), se señala el bloque donde estaba.
  function verFrase(c) {
    cambiarModo('leer');
    const marca = $('modo-leer').querySelector(`mark[data-comentario="${c.id}"]`)
      || $('modo-leer').querySelector(`[data-bloque="${c.cita.bloque}"]`);
    if (!marca) return avisar('Esa frase ya no está en el guión: se cambió después del comentario');
    marca.scrollIntoView({ behavior: 'smooth', block: 'center' });
    marca.classList.remove('destello');
    void marca.offsetWidth;
    marca.classList.add('destello');
  }

  // ---------- Lista lateral: clientes y sus guiones ----------

  function elemento(etiqueta, clase, texto) {
    const nodo = document.createElement(etiqueta);
    if (clase) nodo.className = clase;
    if (texto != null) nodo.textContent = texto;
    return nodo;
  }

  function infoGuion(g) {
    const formato = Guion.FORMATOS[g.formato || 'video'].nombre;
    return `${formato} · ${Guion.formatoDuracion(Guion.estadisticas(g.bloques).segundos)} · ${fecha(g.actualizado)}`;
  }

  // Posición de cada cliente por fecha de alta: decide el color y la forma de su avatar.
  function indiceCliente(id) {
    const orden = [...Almacen.listarClientes()].sort((a, b) => a.creado - b.creado);
    return Math.max(0, orden.findIndex((c) => c.id === id));
  }

  // Estado de un guion: aprobado · el cliente editó · esperando al cliente (se lo enviaste) · borrador.
  const CLAVE_ENVIADOS = 'guiones-creator:enviados';
  let enviados = {};
  try { enviados = JSON.parse(localStorage.getItem(CLAVE_ENVIADOS) || '{}'); } catch {}
  function marcarEnviado(g) {
    enviados[g.id] = Date.now();
    try { localStorage.setItem(CLAVE_ENVIADOS, JSON.stringify(enviados)); } catch {}
  }
  function estadoDe(g) {
    if (g.aprobado) return UI.ESTADOS.aprobado;
    if (g.editado_por === 'cliente') return UI.ESTADOS.editado;
    if (enviados[g.id]) return UI.ESTADOS.esperando;
    return UI.ESTADOS.borrador;
  }

  // Cliente cuyos guiones se despliegan en el lateral (el del guion abierto o el del panel).
  const clienteActivo = () => clienteAbierto || actual?.cliente_id || null;

  function pintarLista() {
    const lista = $('lista');
    lista.replaceChildren();
    const clientes = Almacen.listarClientes();
    const activo = vista === 'inicio' ? null : clienteActivo();
    for (const c of clientes) {
      const guiones = Almacen.guionesDe(c.id);
      const item = elemento('li', 'cliente-item');
      const fila = elemento('button', `cliente-fila${c.id === activo ? ' activo' : ''}`);
      const sinLeer = guiones.reduce((n, g) => n + novedades(g).length, 0);
      fila.append(UI.avatar(c.nombre, indiceCliente(c.id)), elemento('span', 'cliente-nombre', c.nombre));
      if (sinLeer) fila.append(elemento('span', 'cliente-sin-leer', String(sinLeer)));
      // Como en el prototipo: tocar un cliente abre su primer guion (o su ficha si no tiene).
      fila.addEventListener('click', () => (guiones.length ? abrir(guiones[0].id) : abrirCliente(c.id)));
      item.append(fila);

      if (c.id === activo) {
        const sub = elemento('ul', 'lista-guiones');
        for (const g of guiones) {
          const li = elemento('li');
          const boton = elemento('button', `guion-fila${actual && g.id === actual.id ? ' activo' : ''}`);
          const punto = elemento('span', 'punto-estado');
          punto.style.background = estadoDe(g).punto;
          boton.append(punto, elemento('span', 'guion-titulo', g.titulo || 'Guión sin título'));
          boton.addEventListener('click', () => abrir(g.id));
          li.append(boton);
          sub.append(li);
        }
        item.append(sub);
      }
      lista.append(item);
    }
    if (!clientes.length) lista.append(elemento('li', 'lista-vacia', 'Aún no hay clientes.'));
    $('contador-inicio').textContent = totalNovedades();
    Chat.contarEnPestana('Guiones Creator · aifotos', totalNovedades());
    if (vista === 'inicio') pintarInicio();
  }

  // Cuántas cosas nuevas hizo el cliente en todos los guiones (para la pestaña y el sonido).
  function totalNovedades() {
    return Almacen.listar().reduce((n, g) => n + novedades(g).length + mensajesNuevos(g), 0);
  }
  function mensajesNuevos(g) {
    const visto = vistos[g.id] || 0;
    return Math.max(0, (g.comentarios || []).filter((c) => c.autor === 'cliente' && c.creado > visto).length - 1);
  }

  function fecha(ms) {
    return new Date(ms).toLocaleDateString('es', { day: 'numeric', month: 'short' });
  }

  // ---------- Abrir un guion o un cliente ----------

  function recordar(valor) {
    try { localStorage.setItem('guiones-creator:ultimo', valor); } catch {}
  }

  // Vista actual: 'inicio' | 'cliente' | 'documento' | 'vacio'
  let vista = 'inicio';
  function mostrar(nueva) {
    vista = nueva;
    $('inicio').hidden = vista !== 'inicio';
    $('vacio').hidden = vista !== 'vacio';
    $('documento').hidden = vista !== 'documento';
    $('panel-cliente').hidden = vista !== 'cliente';
    $('marco').dataset.vista = vista;
    $('ir-inicio').classList.toggle('activo', vista === 'inicio');
    pintarBarraMovil();
  }

  // Barra superior del celular: volver · logo (en Inicio) · título · chat (en el editor).
  function pintarBarraMovil() {
    const cliente = Almacen.obtenerCliente(clienteActivo());
    $('movil-titulo').textContent = vista === 'inicio' || !cliente ? 'Guiones' : cliente.nombre;
  }

  function irAInicio() {
    if (temporizador) guardarYa();
    Menu.ocultar();
    actual = null;
    clienteAbierto = null;
    mostrar('inicio');
    pintarLista(); // también pinta Inicio
    $('inicio').scrollTop = 0;
  }

  // ---------- Inicio: saludo, lo nuevo y tus clientes ----------

  // "hace 12 min", "hace 3 h", "ayer", "lunes" o "2 oct".
  function haceCuanto(ms) {
    const minutos = Math.round((Date.now() - ms) / 60000);
    if (minutos < 1) return 'ahora';
    if (minutos < 60) return `hace ${minutos} min`;
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    if (ms >= hoy.getTime()) return `hace ${Math.round(minutos / 60)} h`;
    const dias = Math.ceil((hoy.getTime() - ms) / 86400000);
    if (dias <= 1) return 'ayer';
    if (dias < 7) return new Date(ms).toLocaleDateString('es', { weekday: 'long' });
    return fecha(ms);
  }

  // Tarjetas de "Lo nuevo": colores y giro de cada tipo, como en el prototipo.
  const TARJETA_NOVEDAD = {
    editó: { tipo: 'Editó', verbo: 'cambió', fondo: '#c67139', texto: '#f9f4ed', chip: 'rgba(255,255,255,.22)', giro: '-1.2deg' },
    comentó: { tipo: 'Mensaje', verbo: 'te escribió sobre', fondo: '#201e1d', texto: '#f5ead8', chip: 'rgba(255,255,255,.14)', giro: '.8deg' },
    aprobó: { tipo: 'Aprobado', verbo: 'aprobó', fondo: '#7a8a5e', texto: '#f9f4ed', chip: 'rgba(255,255,255,.22)', giro: '-.5deg' },
  };

  function momentoNovedad(g, que) {
    if (que === 'aprobó') return g.aprobado;
    if (que === 'comentó') return Math.max(0, ...(g.comentarios || []).filter((c) => c.autor === 'cliente').map((c) => c.creado));
    return g.actualizado;
  }

  // Fila de un guion: punto y píldora de estado, título, formato y cuándo se tocó.
  function filaGuion(g) {
    const e = estadoDe(g);
    const fila = elemento('button', 'cliente-tarjeta-guion');
    const punto = elemento('span', 'punto-estado');
    punto.style.background = e.punto;
    const textos = elemento('span', 'cliente-tarjeta-textos');
    textos.append(
      elemento('span', 'cliente-tarjeta-titulo', g.titulo || 'Guión sin título'),
      elemento('span', 'cliente-tarjeta-info', `${Guion.FORMATOS[g.formato || 'video'].nombre} · ${haceCuanto(g.actualizado)}`),
    );
    const pildora = elemento('span', 'cliente-tarjeta-estado', e.etiqueta);
    pildora.style.background = e.fondo;
    pildora.style.color = e.texto;
    fila.append(punto, textos, pildora);
    fila.addEventListener('click', () => abrir(g.id));
    return fila;
  }

  function pintarInicio() {
    const ahora = new Date();
    const dia = ahora.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' }).replace(',', '');
    $('inicio-fecha').textContent = dia.charAt(0).toUpperCase() + dia.slice(1);
    const hora = ahora.getHours();
    $('inicio-hola').textContent = hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches';

    // Lo nuevo: lo que hicieron los clientes desde la última vez que abriste cada guion.
    const eventos = [];
    for (const g of Almacen.listar()) {
      const c = Almacen.obtenerCliente(g.cliente_id);
      if (!c) continue;
      for (const que of novedades(g)) eventos.push({ g, c, que, cuando: momentoNovedad(g, que) });
    }
    eventos.sort((a, b) => b.cuando - a.cuando);
    const n = eventos.length;
    $('inicio-resumen').textContent = n
      ? `Hay ${n} ${n === 1 ? 'cosa nueva' : 'cosas nuevas'} de tus clientes. Empieza por la de arriba.`
      : 'No hay nada nuevo de tus clientes. Todo al día.';
    const feed = $('feed');
    feed.replaceChildren();
    for (const { g, c, que, cuando } of eventos) {
      const t = TARJETA_NOVEDAD[que];
      const tarjeta = elemento('button', 'feed-tarjeta');
      tarjeta.style.background = t.fondo;
      tarjeta.style.color = t.texto;
      tarjeta.style.setProperty('--giro', t.giro);
      const arriba = elemento('span', 'feed-arriba');
      const chip = elemento('span', 'feed-tipo', t.tipo);
      chip.style.background = t.chip;
      arriba.append(chip, elemento('span', 'feed-cuando', haceCuanto(cuando)));
      const frase = elemento('span', 'feed-frase');
      frase.append(elemento('b', '', c.nombre), ` ${t.verbo} `, elemento('span', 'feed-titulo', `«${g.titulo || 'Guión sin título'}»`));
      const abajo = elemento('span', 'feed-abajo');
      abajo.append(elemento('span', '', c.nombre), elemento('span', '', 'Abrir →'));
      tarjeta.append(arriba, frase, abajo);
      tarjeta.addEventListener('click', () => {
        abrir(g.id);
        if (que === 'comentó') chatFlotante.abrir();
      });
      feed.append(tarjeta);
    }
    if (!n) feed.append(elemento('p', 'feed-vacio', 'Cuando un cliente edite, comente o apruebe un guión, aparecerá aquí.'));

    // Tus clientes
    const caja = $('tarjetas-clientes');
    caja.replaceChildren();
    for (const c of Almacen.listarClientes()) {
      const guiones = Almacen.guionesDe(c.id);
      const tarjeta = elemento('div', 'cliente-tarjeta');
      const cabeza = elemento('button', 'cliente-tarjeta-cabeza');
      const datos = elemento('span', 'cliente-tarjeta-datos');
      const ultima = Math.max(c.creado || 0, ...guiones.map((g) => g.actualizado));
      datos.append(
        elemento('span', 'cliente-tarjeta-nombre', c.nombre),
        elemento('span', 'cliente-tarjeta-sub', `${guiones.length} ${guiones.length === 1 ? 'guión' : 'guiones'} · ${haceCuanto(ultima)}`),
      );
      cabeza.append(UI.avatar(c.nombre, indiceCliente(c.id), 'avatar avatar-grande'), datos);
      const sinLeer = guiones.reduce((m, g) => m + novedades(g).length, 0);
      if (sinLeer) cabeza.append(elemento('span', 'cliente-tarjeta-sin-leer', `${sinLeer} sin leer`));
      cabeza.addEventListener('click', () => abrirCliente(c.id));

      const lista = elemento('div', 'cliente-tarjeta-guiones');
      for (const g of guiones) lista.append(filaGuion(g));

      const link = elemento('div', 'cliente-tarjeta-link');
      const url = Almacen.linkDe(c);
      const copiar = elemento('button', 'link-copiar-mini', 'Copiar');
      copiar.addEventListener('click', () => copiarLink(c));
      const whatsapp = elemento('button', 'link-whatsapp-mini', 'WhatsApp');
      whatsapp.addEventListener('click', () => enviarWhatsApp(c));
      link.append(UI.icono('link', 14), elemento('span', 'cliente-tarjeta-url', `…/${url.split('/').pop()}`), copiar, whatsapp);

      const pie = elemento('div', 'cliente-tarjeta-pie');
      const caduco = linkCaducado(c);
      pie.append(elemento('span', '', !c.activo ? 'Link desactivado'
        : caduco ? `El link caducó el ${fecha(c.caduca)}`
          : c.caduca ? `El link caduca el ${fecha(c.caduca)}` : 'Link sin fecha de caducidad'));
      const mas = elemento('button', 'cliente-tarjeta-mas', '+ Guión');
      mas.addEventListener('click', () => {
        clienteAbierto = c.id; // para que el diálogo ya lo traiga elegido
        abrirNuevo();
        clienteAbierto = null;
      });
      pie.append(mas);

      tarjeta.append(cabeza, lista, link, pie);
      caja.append(tarjeta);
    }
    if (!caja.children.length) caja.append(elemento('p', 'feed-vacio', 'Aún no tienes clientes. Crea el primero con «+ Cliente nuevo».'));
  }

  // Guiones antiguos sin formato; el formato sencillo es un único texto.
  function normalizar(g) {
    if (!g.formato) g.formato = 'video';
    if (g.formato === 'sencillo' && (g.bloques.length !== 1 || g.bloques[0].tipo !== 'parrafo')) {
      g.bloques = Guion.convertir(g.bloques, 'sencillo');
    }
    if (!g.bloques.length) g.bloques = BLOQUES_INICIALES[g.formato]();
    return g;
  }

  function abrir(id) {
    if (temporizador) guardarYa();
    Menu.ocultar();
    actual = id ? Almacen.obtener(id) : null;
    clienteAbierto = null;
    chatFlotante.cerrar();
    mostrar(actual ? 'documento' : 'vacio');
    estadoGuardado('');
    if (actual) {
      normalizar(actual);
      recordar(`g:${actual.id}`);
      $('titulo').value = actual.titulo;
      pintarCabeceraCliente();
      pintarAvisos();
      pintarComentariosDoc({ alFinal: true });
      marcarVisto(actual);
      pintarEditor();
      cambiarModo(modo);
    }
    pintarLista();
  }

  // Migas, "Chat con…", "Enviar a…", versión y nombre en el interruptor de cambios.
  function pintarCabeceraCliente() {
    const c = Almacen.obtenerCliente(actual.cliente_id);
    const nombre = c ? c.nombre : '';
    $('doc-cliente-nombre').textContent = nombre;
    $('doc-migas-formato').textContent = Guion.FORMATOS[actual.formato].nombre;
    for (const id of ['doc-chat-nombre', 'doc-enviar-nombre', 'cambios-nombre']) $(id).textContent = nombre;
    $('doc-version').textContent = `v${actual.version}`;
    $('doc-enviar').disabled = !c || !c.activo;
    $('chat-whatsapp').hidden = !c || !c.activo;
  }

  // ---------- Panel del cliente y su link ----------

  function abrirCliente(id) {
    if (temporizador) guardarYa();
    Menu.ocultar();
    actual = null;
    clienteAbierto = id;
    chatFlotante.cerrar();
    recordar(`c:${id}`);
    mostrar('cliente');
    pintarPanelCliente();
    pintarLista();
  }

  function pintarPanelCliente() {
    const c = Almacen.obtenerCliente(clienteAbierto);
    if (!c) return abrir(null);
    $('cliente-nombre').value = c.nombre;
    $('panel-avatar').replaceWith(Object.assign(UI.avatar(c.nombre, indiceCliente(c.id), 'avatar avatar-panel'), { id: 'panel-avatar' }));
    $('link-url').value = Almacen.linkDe(c);
    const caducado = linkCaducado(c);
    const funciona = c.activo && !caducado;
    $('link-caja').classList.toggle('apagado', !funciona);
    $('estado-link').textContent = !c.activo ? 'Desactivado' : caducado ? 'Caducado' : 'Activo';
    $('estado-link').className = `ajustes-estado estado-link ${funciona ? 'activo' : 'inactivo'}`;
    $('link-ayuda').textContent = !c.activo
      ? 'Este link está desactivado: quien lo abra no verá nada. Actívalo otra vez o genera uno nuevo.'
      : caducado
        ? `Este link caducó el ${fecha(c.caduca)}: quien lo abra no verá nada. Cambia o quita la fecha para que vuelva a funcionar.`
        : `Con este link, ${c.nombre} ve todos sus guiones. No necesita cuenta ni contraseña.${c.caduca ? ` Funciona hasta el ${fecha(c.caduca)}.` : ''}`;
    $('cliente-caduca').value = c.caduca ? fechaParaCampo(c.caduca) : '';
    $('link-copiar').disabled = !c.activo;
    $('link-whatsapp').disabled = !c.activo;
    $('cliente-telefono').value = c.telefono || '';
    $('link-activar').textContent = c.activo ? 'Desactivar link' : 'Activar link';

    const ul = $('cliente-guiones');
    ul.replaceChildren(...Almacen.guionesDe(c.id).map(filaGuion));
    if (!ul.children.length) ul.append(elemento('p', 'feed-vacio', 'Este cliente aún no tiene guiones.'));
  }

  // Ejecuta una acción contra la nube y avisa si falla.
  async function intentar(accion, queFallo) {
    try {
      return await accion();
    } catch (e) {
      if (e.estado !== 401) alert(`${queFallo}.\n${e.message}`);
      return null;
    }
  }

  async function copiarLink(cliente) {
    const link = Almacen.linkDe(cliente);
    try {
      await navigator.clipboard.writeText(link);
      avisar('Link copiado. Pégalo en un mensaje para tu cliente.');
    } catch {
      prompt('Copia este link:', link);
    }
  }

  // Abre WhatsApp con el mensaje ya escrito; tú solo pulsas enviar. Si el cliente
  // tiene su número guardado se abre su chat; si no, eliges el contacto.
  function enviarWhatsApp(cliente, guion) {
    const texto = guion
      ? `Hola, te escribí en tu guión «${guion.titulo || 'Guión'}». Puedes verlo y responderme aquí: ${Almacen.linkDe(cliente)}/${guion.id}`
      : `Hola, aquí puedes ver y revisar tus guiones: ${Almacen.linkDe(cliente)}`;
    window.open(`https://wa.me/${cliente.telefono || ''}?text=${encodeURIComponent(texto)}`, '_blank', 'noopener');
  }

  const avisarClienteDelGuion = () => enviarWhatsApp(Almacen.obtenerCliente(actual.cliente_id), actual);

  async function nuevoCliente() {
    const nombre = (prompt('Nombre del cliente:') || '').trim();
    if (!nombre) return;
    const c = await intentar(() => Almacen.crearCliente(nombre), 'No se pudo crear el cliente');
    if (c) { abrirCliente(c.id); avisar('Cliente creado con su link'); }
  }

  // ---------- Editor ----------

  function pintarEditor(enfocarId) {
    const formato = actual.formato;
    $('documento').dataset.formato = formato;
    $('formato').value = formato;
    $('doc-migas-formato').textContent = Guion.FORMATOS[formato].nombre;
    $('atajos').innerHTML = ATAJOS[formato];

    const sencillo = formato === 'sencillo';
    $('sencillo').hidden = !sencillo;
    $('bloques').hidden = sencillo;
    $('agregar-caja').hidden = sencillo;
    if (sencillo) {
      $('sencillo').value = actual.bloques[0].texto;
      ajustarAltura($('sencillo'));
    } else {
      pintarBotonesAgregar();
      pintarBloques(enfocarId);
    }
    pintarPersonajes();
    pintarDatos();
    pintarBloqueo();
  }

  // ---------- Guion aprobado: bloqueado ----------

  // Con el guion aprobado el editor queda solo para mirar (inert: no se puede
  // tocar ni escribir) hasta que lo desbloquees.
  function pintarBloqueo() {
    const bloqueado = !!actual.aprobado;
    $('modo-editar').inert = bloqueado;
    $('modo-editar').classList.toggle('bloqueado', bloqueado);
    $('formato').disabled = bloqueado;
  }

  async function desbloquearGuion() {
    if (!confirm('Si lo desbloqueas y cambias algo, el cliente tendrá que volver a aprobarlo. ¿Desbloquear?')) return;
    const guion = actual;
    if ((await intentar(() => Almacen.desbloquear(guion), 'No se pudo desbloquear')) === null) return;
    if (guion !== actual) return;
    pintarAvisos();
    pintarBloqueo();
    pintarLista();
    avisar('Guión desbloqueado: ya puedes editarlo');
  }

  function ajustarAltura(area) {
    area.style.height = 'auto';
    area.style.height = area.scrollHeight + 'px';
  }

  function infoBloque(b) {
    const palabras = Guion.contarPalabras(b.texto);
    if (!palabras) return '';
    const seg = Guion.segundosDe(b);
    return `${palabras} palabra${palabras === 1 ? '' : 's'}` + (seg ? ` · ${Guion.formatoDuracion(seg)}` : '');
  }

  // Etiquetas cortas del rediseño ("En pantalla", "Nota").
  const ETIQUETA_CORTA = { pantalla: 'En pantalla', nota: 'Nota' };
  const etiquetaTipo = (tipo) => (actual.formato === 'cine' ? Guion.nombreTipo(tipo, 'cine') : ETIQUETA_CORTA[tipo] || Guion.nombreTipo(tipo, actual.formato));

  function crearSelectorTipo(b) {
    const select = document.createElement('select');
    select.className = 'bloque-tipo';
    select.setAttribute('aria-label', 'Tipo de bloque');
    for (const tipo of Guion.FORMATOS[actual.formato].tipos) {
      const op = new Option(etiquetaTipo(tipo), tipo);
      op.selected = tipo === b.tipo;
      select.append(op);
    }
    select.addEventListener('change', () => {
      b.tipo = select.value;
      pintarBloques(b.id);
      guardarLuego();
    });
    return select;
  }

  function botonPequeno(texto, titulo, accion) {
    const boton = document.createElement('button');
    boton.className = 'boton-icono';
    boton.textContent = texto;
    boton.title = titulo;
    boton.setAttribute('aria-label', titulo);
    boton.addEventListener('click', accion);
    return boton;
  }

  function campo(clase, valor, placeholder) {
    const input = document.createElement('input');
    input.className = clase;
    input.value = valor || '';
    input.placeholder = placeholder;
    input.autocomplete = 'off';
    input.spellcheck = false;
    return input;
  }

  function textosDeOtrasEscenas(b) {
    return actual.bloques.filter((x) => x.tipo === 'escena' && x !== b).map((x) => x.texto);
  }

  function sugerirEscena(area, b) {
    const lista = Sugerencias.escena(area.value, textosDeOtrasEscenas(b), actual.formato === 'cine');
    Menu.mostrar(area, lista, (op) => {
      area.value = op.valor;
      b.texto = op.valor;
      area.setSelectionRange(area.value.length, area.value.length);
      guardarLuego();
      sugerirEscena(area, b); // encadena: INT. → lugar → momento del día
    });
  }

  function sugerirPersonaje(input, b) {
    const nombres = Guion.personajes(actual).map((p) => p.nombre).filter((n) => n !== Guion.claveNombre(input.value));
    Menu.mostrar(input, Sugerencias.personaje(input.value, nombres), (op) => {
      input.value = op.valor;
      b.personaje = op.valor;
      guardarLuego();
      pintarPersonajes();
      input.closest('.bloque').querySelector('textarea').focus();
    });
  }

  function crearCamposDialogo(b, caja) {
    const cine = actual.formato === 'cine';
    const fila = document.createElement('div');
    fila.className = 'bloque-quien';
    const personaje = campo('bloque-personaje', b.personaje, cine ? 'PERSONAJE' : '¿Quién habla?');
    personaje.setAttribute('aria-label', 'Personaje');
    personaje.addEventListener('input', () => { b.personaje = personaje.value; sugerirPersonaje(personaje, b); guardarLuego(); });
    personaje.addEventListener('focus', () => sugerirPersonaje(personaje, b));
    personaje.addEventListener('blur', () => {
      Menu.ocultar();
      if (cine) { b.personaje = personaje.value.toUpperCase().trim(); personaje.value = b.personaje; }
      pintarPersonajes();
      guardarLuego();
    });
    personaje.addEventListener('keydown', (e) => {
      if (Menu.abiertoPara(personaje) && Menu.tecla(e)) return;
      if (e.key === 'Enter') { e.preventDefault(); caja.querySelector('textarea').focus(); }
    });
    fila.append(personaje);

    if (cine) {
      const acotacion = campo('bloque-acotacion', b.acotacion, '(acotación)');
      acotacion.setAttribute('aria-label', 'Acotación');
      acotacion.addEventListener('input', () => { b.acotacion = acotacion.value; guardarLuego(); });
      acotacion.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); caja.querySelector('textarea').focus(); }
      });
      fila.append(acotacion);
    }
    return fila;
  }

  // Tramo de tiempo de cada escena ("0–3 s"), sumando lo que se dice en las anteriores.
  function tiemposDeEscenas() {
    const tiempos = new Map();
    let inicio = 0;
    for (const g of Guion.porEscenas(actual.bloques)) {
      const fin = inicio + g.segundos;
      if (g.escena && g.segundos >= 0.5) tiempos.set(g.escena.id, `${Math.round(inicio)}–${Math.round(fin)} s`);
      inicio = fin;
    }
    return tiempos;
  }

  // Bloques que cambió el cliente (con "Marcar lo que cambió" activo): id → texto de antes.
  function bloquesCambiados() {
    const marcados = new Map();
    if (!verCambios || !cambiosActuales) return marcados;
    const antes = new Map(cambiosActuales.antes.bloques.map((b) => [b.id, b.texto]));
    for (const b of cambiosActuales.despues.bloques) {
      if (antes.has(b.id) && antes.get(b.id) !== b.texto) marcados.set(b.id, antes.get(b.id));
    }
    return marcados;
  }

  function accionesDeBloque(i) {
    const acciones = document.createElement('span');
    acciones.className = 'bloque-acciones';
    acciones.append(
      botonPequeno('↑', 'Subir bloque', () => mover(i, -1)),
      botonPequeno('↓', 'Bajar bloque', () => mover(i, 1)),
      botonPequeno('✕', 'Eliminar bloque', () => eliminarBloque(i)),
    );
    return acciones;
  }

  function pintarBloques(enfocarId) {
    const contenedor = $('bloques');
    contenedor.replaceChildren();
    let numeroEscena = 0;
    const tiempos = tiemposDeEscenas();
    const cambiados = bloquesCambiados();
    const nombreCliente = Almacen.obtenerCliente(actual.cliente_id)?.nombre || 'El cliente';

    actual.bloques.forEach((b, i) => {
      const caja = document.createElement('div');
      caja.dataset.id = b.id;
      const area = document.createElement('textarea');
      area.className = 'bloque-texto';
      area.rows = 1;
      area.value = b.texto;

      if (b.tipo === 'escena') {
        // Escena: círculo con el número · nombre · tramo de tiempo
        caja.className = 'bloque bloque-escena';
        const numero = elemento('span', 'escena-numero', String(++numeroEscena).padStart(2, '0'));
        area.classList.add('escena-texto');
        area.placeholder = actual.formato === 'cine' ? 'INT. LUGAR - DÍA (escribe int o ext)' : 'Nombre de la escena';
        caja.append(numero, area);
        if (tiempos.has(b.id)) caja.append(elemento('span', 'escena-tiempo', tiempos.get(b.id)));
        caja.append(accionesDeBloque(i));
      } else {
        // Resto: etiqueta de color a la izquierda · quién habla y texto a la derecha
        caja.className = `bloque bloque-cuerpo tipo-${b.tipo}${cambiados.has(b.id) ? ' cambiado' : ''}`;
        const etiqueta = elemento('div', 'bloque-etiqueta');
        etiqueta.append(crearSelectorTipo(b));
        const columna = elemento('div', 'bloque-columna');
        if (b.tipo === 'camara' || b.tipo === 'voz') columna.append(crearCamposDialogo(b, caja));
        area.placeholder = b.tipo === 'camara' && actual.formato === 'cine' ? 'Lo que dice el personaje' : Guion.TIPOS[b.tipo].ayuda;
        columna.append(area);
        if (cambiados.has(b.id)) {
          const nota = elemento('span', 'bloque-cambio');
          nota.append(elemento('b', '', `${nombreCliente} cambió esto.`), elemento('span', 'bloque-antes', `Antes: ${cambiados.get(b.id)}`));
          columna.append(nota);
        }
        caja.append(etiqueta, columna, accionesDeBloque(i));
      }

      area.addEventListener('input', () => {
        if (b.tipo === 'escena') {
          const prefijo = Sugerencias.autocompletarPrefijo(area.value);
          if (prefijo) area.value = prefijo;
        }
        b.texto = area.value;
        ajustarAltura(area);
        if (b.tipo === 'escena') sugerirEscena(area, b);
        pintarDatos();
        guardarLuego();
      });
      if (b.tipo === 'escena') {
        area.addEventListener('focus', () => sugerirEscena(area, b));
        area.addEventListener('blur', () => {
          Menu.ocultar();
          if (actual.formato === 'cine' && area.value.trim()) {
            b.texto = Guion.normalizarEncabezado(area.value).toUpperCase();
            area.value = b.texto;
            guardarLuego();
          }
        });
      }
      area.addEventListener('keydown', (e) => teclaEnBloque(e, i, area));
      area.addEventListener('paste', (e) => pegarEnBloque(e, i));
      contenedor.append(caja);
    });

    // La altura solo se puede medir cuando ya están en pantalla.
    contenedor.querySelectorAll('textarea').forEach(ajustarAltura);
    if (enfocarId) {
      const caja = contenedor.querySelector(`[data-id="${enfocarId}"]`);
      const b = actual.bloques.find((x) => x.id === enfocarId);
      const destino = b && b.tipo === 'camara' && !b.personaje && actual.formato === 'cine'
        ? caja?.querySelector('.bloque-personaje')
        : caja?.querySelector('textarea');
      if (destino) { destino.focus(); destino.setSelectionRange(destino.value.length, destino.value.length); }
    }
    pintarDatos();
    pintarRitmo();
  }

  // Ritmo: un tramo por escena, de ancho proporcional a sus segundos en voz alta.
  const COLORES_RITMO = [['#c67139', '#f9f4ed'], ['#7a8a5e', '#f9f4ed'], ['#F9AE34', '#201e1d'], ['#201e1d', '#f5ead8']];
  function pintarRitmo() {
    const grupos = Guion.porEscenas(actual.bloques).filter((g) => g.escena || g.bloques.length);
    const hayEscenas = actual.formato !== 'sencillo' && grupos.some((g) => g.escena);
    $('ritmo').hidden = !hayEscenas;
    if (!hayEscenas) return;
    const total = grupos.reduce((n, g) => n + g.segundos, 0);
    $('ritmo-titulo').textContent = `Ritmo · ${Guion.formatoDuracion(total)} en total`;
    $('ritmo-estado').textContent = `${grupos.filter((g) => g.escena).length} escenas`;
    const barra = $('ritmo-barra');
    barra.replaceChildren();
    grupos.forEach((g, i) => {
      const tramo = elemento('div', 'ritmo-tramo', `${g.escena ? g.escena.texto || 'Escena' : 'Inicio'} · ${Guion.formatoDuracion(g.segundos)}`);
      const [fondo, texto] = COLORES_RITMO[i % COLORES_RITMO.length];
      tramo.style.flex = `${Math.max(0.6, total ? (g.segundos / total) * 100 : 1).toFixed(1)} 1 0`;
      tramo.style.background = fondo;
      tramo.style.color = texto;
      tramo.title = tramo.textContent;
      barra.append(tramo);
    });
  }

  function teclaEnBloque(e, i, area) {
    if (Menu.abiertoPara(area) && Menu.tecla(e)) return;
    const b = actual.bloques[i];
    const tipos = Guion.FORMATOS[actual.formato].tipos;

    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      continuar(i, Guion.siguienteTipo(actual.formato, b.tipo));
    } else if (e.key === 'Enter' && !e.shiftKey && (b.tipo === 'escena' || b.tipo === 'transicion')) {
      // Encabezados y transiciones son de una sola línea: Enter pasa al siguiente bloque.
      e.preventDefault();
      continuar(i, Guion.siguienteTipo(actual.formato, b.tipo));
    } else if (e.key === 'Tab' && area.value === '') {
      e.preventDefault();
      const pos = tipos.indexOf(b.tipo);
      b.tipo = tipos[(pos + (e.shiftKey ? tipos.length - 1 : 1)) % tipos.length];
      pintarBloques(b.id);
      guardarLuego();
    } else if (e.key === 'Backspace' && area.value === '' && !b.personaje && actual.bloques.length > 1) {
      e.preventDefault();
      const anterior = actual.bloques[i - 1] || actual.bloques[i + 1];
      actual.bloques.splice(i, 1);
      pintarBloques(anterior.id);
      guardarLuego();
    }
  }

  // Pegar varias líneas dentro de un bloque: se analizan y se reparten en bloques.
  function pegarEnBloque(e, i) {
    const texto = e.clipboardData.getData('text/plain');
    if (texto.split('\n').filter((l) => l.trim()).length < 2) return;
    e.preventDefault();
    const nuevos = Guion.desdeTexto(texto, actual.formato);
    const vacio = !actual.bloques[i].texto.trim();
    actual.bloques.splice(vacio ? i : i + 1, vacio ? 1 : 0, ...nuevos);
    pintarBloques(nuevos[nuevos.length - 1].id);
    pintarPersonajes();
    guardarLuego();
    avisar(`Guión ordenado en ${nuevos.length} bloques`);
  }

  // Pasa al bloque siguiente: si ya hay uno vacío debajo lo reutiliza, si no crea uno.
  function continuar(i, tipo) {
    const siguiente = actual.bloques[i + 1];
    if (siguiente && !siguiente.texto.trim() && !siguiente.personaje) {
      siguiente.tipo = tipo;
      pintarBloques(siguiente.id);
      guardarLuego();
    } else {
      insertar(i + 1, tipo);
    }
  }

  function insertar(posicion, tipo, extra) {
    const b = Guion.nuevoBloque(tipo, '', extra);
    actual.bloques.splice(posicion, 0, b);
    pintarBloques(b.id);
    guardarLuego();
  }

  function mover(i, delta) {
    const j = i + delta;
    if (j < 0 || j >= actual.bloques.length) return;
    [actual.bloques[i], actual.bloques[j]] = [actual.bloques[j], actual.bloques[i]];
    pintarBloques();
    guardarLuego();
  }

  function eliminarBloque(i) {
    const b = actual.bloques[i];
    if (b.texto.trim() && !confirm('¿Eliminar este bloque y su texto?')) return;
    actual.bloques.splice(i, 1);
    if (!actual.bloques.length) actual.bloques.push(Guion.nuevoBloque(Guion.FORMATOS[actual.formato].tipos[0]));
    pintarBloques();
    pintarPersonajes();
    guardarLuego();
  }

  function pintarDatos() {
    const est = Guion.estadisticas(actual.bloques);
    $('dato-duracion').textContent = Guion.formatoDuracion(est.segundos);
    $('dato-palabras').textContent = `${est.palabras} palabras`;
  }

  // Color del punto de cada tipo en la barra "Añadir" (como en el prototipo).
  const PUNTO_TIPO = { escena: '#f5ead8', camara: '#f6a06b', voz: '#aebf92', pantalla: '#F9AE34', nota: '#c0b6a5', accion: '#c0b6a5', transicion: '#c0b6a5' };

  function pintarBotonesAgregar() {
    const caja = $('agregar');
    caja.replaceChildren();
    for (const tipo of Guion.FORMATOS[actual.formato].tipos) {
      const boton = elemento('button', 'agregar-boton');
      const punto = elemento('span', 'agregar-punto');
      punto.style.background = PUNTO_TIPO[tipo] || '#f5ead8';
      boton.append(punto, etiquetaTipo(tipo));
      boton.addEventListener('click', () => {
        // Lo que se dice lo dice la misma persona que habló la última vez, si la hay.
        const ultimo = [...actual.bloques].reverse().find((b) => b.personaje);
        const extra = (tipo === 'camara' || tipo === 'voz') && ultimo ? { personaje: ultimo.personaje, acotacion: '' } : undefined;
        insertar(actual.bloques.length, tipo, extra);
      });
      caja.append(boton);
    }
  }


  // ---------- Personajes (formato cinematográfico) ----------

  function pintarPersonajes() {
    const caja = $('personajes');
    caja.hidden = actual.formato !== 'cine';
    if (caja.hidden) return;
    caja.replaceChildren();

    const titulo = document.createElement('span');
    titulo.className = 'personajes-titulo';
    titulo.textContent = 'Personajes';
    caja.append(titulo);

    for (const { nombre, dialogos } of Guion.personajes(actual)) {
      const chip = document.createElement('span');
      chip.className = 'personaje';
      const boton = document.createElement('button');
      boton.className = 'personaje-nombre';
      boton.title = `Añadir un diálogo de ${nombre}`;
      boton.textContent = nombre;
      const cuenta = document.createElement('small');
      cuenta.textContent = dialogos;
      boton.append(cuenta);
      boton.addEventListener('click', () => insertar(actual.bloques.length, 'camara', { personaje: nombre, acotacion: '' }));
      chip.append(boton, botonPequeno('✎', `Renombrar a ${nombre}`, () => renombrarPersonaje(nombre)));
      if (!dialogos) chip.append(botonPequeno('✕', `Quitar a ${nombre}`, () => quitarPersonaje(nombre)));
      caja.append(chip);
    }

    const nuevo = document.createElement('button');
    nuevo.className = 'boton personaje-nuevo';
    nuevo.textContent = '+ Personaje';
    nuevo.addEventListener('click', agregarPersonaje);
    caja.append(nuevo);
  }

  function agregarPersonaje() {
    const nombre = (prompt('Nombre del personaje:') || '').trim().toUpperCase();
    if (!nombre) return;
    actual.personajes = actual.personajes || [];
    if (!Guion.personajes(actual).some((p) => p.nombre === Guion.claveNombre(nombre))) actual.personajes.push(nombre);
    pintarPersonajes();
    guardarLuego();
  }

  function renombrarPersonaje(nombre) {
    const nuevo = (prompt(`Nuevo nombre para ${nombre}:`, nombre) || '').trim().toUpperCase();
    if (!nuevo || nuevo === nombre) return;
    for (const b of actual.bloques) {
      if (b.personaje && Guion.claveNombre(b.personaje) === nombre) {
        // Conserva la extensión: "ANA (V.O.)" → "ANABEL (V.O.)"
        b.personaje = nuevo + b.personaje.slice(b.personaje.toUpperCase().indexOf(nombre) + nombre.length);
      }
    }
    actual.personajes = (actual.personajes || []).map((p) => (Guion.claveNombre(p) === nombre ? nuevo : p));
    pintarBloques();
    pintarPersonajes();
    guardarLuego();
  }

  function quitarPersonaje(nombre) {
    actual.personajes = (actual.personajes || []).filter((p) => Guion.claveNombre(p) !== nombre);
    pintarPersonajes();
    guardarLuego();
  }

  // ---------- Formato sencillo ----------

  $('sencillo').addEventListener('input', () => {
    actual.bloques[0].texto = $('sencillo').value;
    ajustarAltura($('sencillo'));
    pintarDatos();
    guardarLuego();
  });
  $('sencillo').addEventListener('paste', (e) => {
    const texto = e.clipboardData.getData('text/plain');
    if (texto.split('\n').filter((l) => l.trim()).length < 2) return;
    // Si el texto pegado trae escenas, notas, etc., se queda solo con lo que se dice.
    e.preventDefault();
    const area = $('sencillo');
    area.setRangeText(Guion.desdeTexto(texto, 'sencillo')[0].texto, area.selectionStart, area.selectionEnd, 'end');
    area.dispatchEvent(new Event('input'));
  });

  // ---------- Cambiar de formato ----------

  function llenarSelectorFormato(select, conAutomatico) {
    if (conAutomatico) select.append(new Option('Detectar automáticamente', 'auto'));
    for (const [clave, f] of Object.entries(Guion.FORMATOS)) select.append(new Option(f.nombre, clave));
  }

  $('formato').addEventListener('change', () => {
    const destino = $('formato').value;
    const perdidos = Guion.seQuitarian(actual.bloques, destino);
    if (perdidos && !confirm(`El formato Sencillo solo guarda lo que se dice. Se quitarán ${perdidos} bloque${perdidos === 1 ? '' : 's'} (escenas, notas, textos en pantalla…). ¿Continuar?`)) {
      $('formato').value = actual.formato;
      return;
    }
    actual.bloques = Guion.convertir(actual.bloques, destino);
    actual.formato = destino;
    pintarEditor();
    if (modo === 'leer') pintarLectura();
    guardarYa();
    avisar(`Ahora es un guión ${Guion.FORMATOS[destino].nombre.toLowerCase()}`);
  });

  // ---------- Editar / Vista del cliente ----------

  function cambiarModo(nuevoModo) {
    modo = nuevoModo;
    Menu.ocultar();
    document.querySelectorAll('.pestana').forEach((p) => p.classList.toggle('activa', p.dataset.modo === modo));
    $('modo-editar').hidden = modo !== 'editar';
    $('vista-cliente').hidden = modo !== 'leer';
    $('documento').classList.toggle('leyendo', modo === 'leer');
    $('marco').classList.toggle('leyendo', modo === 'leer');
    chatFlotante.cerrar();
    $('documento').scrollTop = 0;
    if (modo === 'leer') pintarLectura();
    else document.querySelectorAll('#modo-editar textarea').forEach(ajustarAltura);
  }

  // ---------- Elegir cliente en los diálogos ----------

  function llenarClientes(dialogo) {
    const select = $(`${dialogo}-cliente`);
    select.replaceChildren();
    for (const c of Almacen.listarClientes()) select.append(new Option(c.nombre, c.id));
    select.append(new Option('+ Cliente nuevo…', '__nuevo'));
    const preferido = clienteAbierto || actual?.cliente_id;
    select.value = preferido && Almacen.obtenerCliente(preferido) ? preferido : (select.options[0].value);
    $(`${dialogo}-cliente-nuevo`).value = '';
    alternarClienteNuevo(dialogo);
  }

  function alternarClienteNuevo(dialogo) {
    const nuevo = $(`${dialogo}-cliente`).value === '__nuevo';
    $(`${dialogo}-cliente-nuevo-caja`).hidden = !nuevo;
    $(`${dialogo}-cliente-nuevo`).required = nuevo; // el formulario no se cierra sin nombre
  }

  async function clienteDestino(dialogo) {
    const valor = $(`${dialogo}-cliente`).value;
    if (valor !== '__nuevo') return valor;
    const c = await Almacen.crearCliente($(`${dialogo}-cliente-nuevo`).value.trim());
    return c.id;
  }

  async function crear(dialogo, titulo, formato, bloques) {
    return intentar(async () => {
      const clienteId = await clienteDestino(dialogo);
      try { localStorage.setItem('guiones-creator:formato', formato); } catch {}
      const g = await Almacen.crear(clienteId, titulo, bloques || BLOQUES_INICIALES[formato](), formato);
      modo = 'editar';
      abrir(g.id);
      return g;
    }, 'No se pudo crear el guión');
  }

  function formatoPreferido() {
    try { return localStorage.getItem('guiones-creator:formato') || 'video'; } catch { return 'video'; }
  }

  // ---------- Cambios del cliente: tachado lo borrado, en verde lo añadido ----------

  let verCambios = true;      // "Marcar lo que cambió el cliente" empieza activado, como en el prototipo
  let cambiosActuales = null; // cambios del cliente del guion abierto (o null)
  const cambiosGuardados = new Map(); // id del guion → { version, cambios }

  async function cambiosDe(g) {
    const guardado = cambiosGuardados.get(g.id);
    if (guardado && guardado.version === g.version) return guardado.cambios;
    const cambios = await Almacen.cambios(g.id);
    cambiosGuardados.set(g.id, { version: g.version, cambios });
    return cambios;
  }

  // Pinta la vista del cliente: lo mismo que ve el cliente al abrir su link.
  function pintarLectura() {
    const guion = actual;
    const c = Almacen.obtenerCliente(guion.cliente_id);
    const nombre = c?.nombre || 'tu cliente';
    $('asi-nombre').textContent = nombre;
    const e = estadoDe(guion);
    const pildora = $('vc-estado');
    pildora.textContent = e.etiqueta;
    pildora.style.setProperty('--estado-fondo', e.fondo);
    pildora.style.setProperty('--estado-texto', e.texto);
    pildora.style.setProperty('--estado-punto', e.punto);
    $('vc-saludo-titulo').textContent = `Hola, ${nombre}.`;
    $('vc-saludo-texto').replaceChildren('Te mandamos la ', elemento('b', '', `v${guion.version}`), ' de tu guión. Léelo con calma; si una frase no te cuadra, tócala y coméntala.');
    Vista.render(guion, $('modo-leer'), { citas: citasDe(guion) });
    if (guion.aprobado) $('modo-leer').prepend(elemento('span', 'lectura-sello', '¡Aprobado!'));
    $('vc-aprobar').classList.toggle('hecho', !!guion.aprobado);
    $('vc-aprobar').querySelector('span').textContent = guion.aprobado ? 'Aprobado' : 'Aprobar';
  }

  $('volver-editar').addEventListener('click', () => cambiarModo('editar'));
  $('vc-editar').addEventListener('click', () => cambiarModo('editar'));
  $('vc-teleprompter').addEventListener('click', () => $('abrir-teleprompter').click());
  $('vc-pdf').addEventListener('click', () => $('exportar-pdf').click());
  $('vc-chat').addEventListener('click', () => chatFlotante.abrir());
  $('vc-aprobar').addEventListener('click', () => {
    if (!actual.aprobado) avisar('Solo tu cliente puede aprobarlo desde su link');
  });

  $('ver-cambios').addEventListener('click', () => {
    verCambios = !verCambios;
    pintarInterruptorCambios();
    if (actual.formato !== 'sencillo') pintarBloques();
    if (!verCambios) $('cambios-info').textContent = '';
  });

  // ---------- Historial de versiones ----------

  let historial = [];       // versiones anteriores (la más reciente primero)
  let elegida = null;       // versión que se está mirando

  async function abrirHistorial() {
    if (hayCambiosSinGuardar()) await guardarYa();
    const guion = actual;
    $('historial-lista').replaceChildren(elemento('li', 'lista-vacia', 'Cargando versiones…'));
    $('historial-lectura').replaceChildren();
    $('historial-sub').textContent = `${guion.titulo || 'Guión sin título'} · se guarda cada «Listo» del cliente y una copia cada 10 min`;
    $('historial-comparar').checked = true;
    $('dialogo-historial').showModal();
    try {
      historial = await Almacen.versiones(guion.id);
    } catch (e) {
      $('historial-lista').replaceChildren(elemento('li', 'lista-vacia', `No se pudo cargar: ${e.message}`));
      return;
    }
    if (guion !== actual) return;
    pintarHistorial();
    elegirVersion(null);
  }

  // Tipo de cada versión, con los colores del prototipo.
  const TIPO_VERSION = {
    cliente: ['Listo del cliente', '#ffe1d0', '#8c491a'],
    admin: ['Copia automática', '#eee7db', '#645c50'],
    actual: ['Actual', '#201e1d', '#f5ead8'],
  };

  function pintarHistorial() {
    const lista = $('historial-lista');
    lista.replaceChildren();
    const ahora = { id: null, version: actual.version, autor: actual.editado_por || 'admin', fecha: actual.actualizado, bloques: actual.bloques, actual: true };
    for (const v of [ahora, ...historial]) {
      const li = elemento('li');
      const boton = elemento('button', `historial-item${(elegida?.id ?? null) === v.id ? ' activo' : ''}`);
      boton.dataset.id = v.id ?? '';
      const quien = v.autor === 'cliente' ? (Almacen.obtenerCliente(actual.cliente_id)?.nombre || 'Cliente') : 'Tú';
      const [tipo, fondo, texto] = TIPO_VERSION[v.actual ? 'actual' : v.autor] || TIPO_VERSION.admin;
      const cabeza = elemento('span', 'historial-cabeza');
      const pildora = elemento('span', 'historial-tipo', tipo);
      pildora.style.background = fondo;
      pildora.style.color = texto;
      cabeza.append(elemento('span', 'historial-v', `v${v.version}`), pildora);
      boton.append(
        cabeza,
        elemento('span', 'historial-quien', `${quien} · ${fechaHora(v.fecha)}`),
        elemento('span', 'historial-nota', `${Guion.estadisticas(v.bloques).palabras} palabras`),
      );
      boton.addEventListener('click', () => elegirVersion(v.actual ? null : v));
      li.append(boton);
      lista.append(li);
    }
    if (!historial.length) lista.append(elemento('li', 'lista-vacia', 'Todavía no hay versiones anteriores. Se irán guardando a medida que tú o el cliente hagáis cambios.'));
  }

  function elegirVersion(v) {
    elegida = v;
    $('historial-lista').querySelectorAll('.historial-item').forEach((b) => b.classList.toggle('activo', b.dataset.id === (v?.id ?? '')));
    $('historial-restaurar').textContent = `Restaurar v${(v || actual).version}`;
    $('historial-restaurar').disabled = !v;
    pintarVistaHistorial();
  }

  // Vista previa de una versión: cada bloque con su etiqueta. Al comparar, sobre el
  // guion de hoy se tacha lo que ya no está y se marca en verde lo añadido después.
  const FUENTE_HISTORIAL = { escena: 'escena', pantalla: 'pantalla', nota: 'nota', voz: 'voz' };
  function pintarVistaHistorial() {
    const comparar = !!elegida && $('historial-comparar').checked;
    const caja = $('historial-lectura');
    caja.replaceChildren();
    const bloques = elegida && !comparar ? elegida.bloques : actual.bloques;
    const formato = elegida && !comparar ? elegida.formato : actual.formato;
    const antes = comparar ? new Map(elegida.bloques.map((b) => [b.id, b.texto])) : null;
    for (const b of bloques) {
      const previo = antes ? (antes.get(b.id) ?? '') : null;
      if (!b.texto.trim() && !(previo || '').trim()) continue;
      const fila = elemento('div', 'historial-bloque');
      const texto = elemento('span', `historial-texto tipo-${FUENTE_HISTORIAL[b.tipo] || 'camara'}`);
      if (antes && previo !== b.texto) {
        for (const parte of Diferencias.comparar(previo, b.texto)) {
          if (parte.tipo === 'igual') texto.append(parte.texto);
          else texto.append(elemento(parte.tipo === 'borrado' ? 'del' : 'ins', '', parte.texto));
        }
      } else texto.append(b.texto);
      fila.append(elemento('span', 'historial-etiqueta', formato === 'sencillo' ? 'Texto' : Guion.nombreTipo(b.tipo, formato)), texto);
      caja.append(fila);
    }
    if (!caja.children.length) caja.append(elemento('p', 'lista-vacia', 'Esta versión está vacía.'));
  }

  async function restaurarVersion() {
    if (!elegida) return;
    const aviso = actual.aprobado ? '\n\nEl guión está aprobado: al restaurar se quitará la aprobación y el cliente tendrá que volver a aprobarlo.' : '';
    if (!confirm(`¿Volver a la versión del ${fechaHora(elegida.fecha)}? La versión actual quedará guardada en el historial por si la necesitas.${aviso}`)) return;
    const guion = actual;
    const version = elegida;
    const hecho = await intentar(async () => {
      if (guion.aprobado) await Almacen.desbloquear(guion);
      guion.titulo = version.titulo;
      guion.formato = version.formato;
      guion.bloques = structuredClone(version.bloques);
      await Almacen.guardar(guion, { forzarCopia: true });
      return true;
    }, 'No se pudo restaurar la versión');
    if (!hecho) return;
    $('dialogo-historial').close();
    if (guion === actual) abrir(guion.id);
    avisar('Versión restaurada');
  }

  $('abrir-historial').addEventListener('click', abrirHistorial);
  $('historial-cerrar').addEventListener('click', () => $('dialogo-historial').close());
  $('historial-comparar').addEventListener('change', pintarVistaHistorial);
  $('historial-restaurar').addEventListener('click', restaurarVersion);

  // ---------- Plantillas ----------

  let misPlantillas = [];

  async function cargarMisPlantillas() {
    try { misPlantillas = await Almacen.plantillas(); } catch { misPlantillas = []; }
    llenarPlantillas();
  }

  function llenarPlantillas() {
    const formato = document.querySelector('input[name="nuevo-formato"]:checked')?.value || 'video';
    const select = $('nuevo-plantilla');
    const antes = select.value;
    select.replaceChildren(new Option('En blanco', ''));
    const incluidas = elemento('optgroup');
    incluidas.label = 'Plantillas de aifotos';
    for (const p of Plantillas.incluidas(formato)) incluidas.append(new Option(p.nombre, `i:${p.id}`));
    if (incluidas.children.length) select.append(incluidas);
    const propias = elemento('optgroup');
    propias.label = 'Mis plantillas';
    for (const p of misPlantillas.filter((x) => x.formato === formato)) propias.append(new Option(p.nombre, `m:${p.id}`));
    if (propias.children.length) select.append(propias);
    select.value = [...select.options].some((o) => o.value === antes) ? antes : '';
    $('borrar-plantilla').hidden = !select.value.startsWith('m:');
    pintarChipsPlantilla();
  }

  // Las plantillas se eligen con botones (el selector oculto guarda la elección).
  function pintarChipsPlantilla() {
    const select = $('nuevo-plantilla');
    const caja = $('nuevo-plantillas');
    caja.replaceChildren();
    const opciones = [...select.options];
    for (const o of [...opciones.filter((x) => x.value), ...opciones.filter((x) => !x.value)]) {
      const chip = elemento('button', `plantilla-chip${o.value === select.value ? ' activo' : ''}`, o.textContent);
      chip.type = 'button';
      chip.addEventListener('click', () => {
        select.value = o.value;
        select.dispatchEvent(new Event('change'));
        pintarChipsPlantilla();
      });
      caja.append(chip);
    }
  }

  function plantillaElegida() {
    const [origen, id] = $('nuevo-plantilla').value.split(':');
    if (origen === 'i') return Plantillas.incluidas(document.querySelector('input[name="nuevo-formato"]:checked')?.value).find((p) => p.id === id);
    if (origen === 'm') return misPlantillas.find((p) => p.id === id);
    return null;
  }

  $('nuevo-plantilla').addEventListener('change', () => { $('borrar-plantilla').hidden = !$('nuevo-plantilla').value.startsWith('m:'); });
  $('borrar-plantilla').addEventListener('click', async () => {
    const p = plantillaElegida();
    if (!p || !confirm(`¿Eliminar la plantilla «${p.nombre}»? Los guiones que ya creaste con ella no cambian.`)) return;
    if ((await intentar(() => Almacen.borrarPlantilla(p.id), 'No se pudo eliminar la plantilla')) === null) return;
    misPlantillas = misPlantillas.filter((x) => x.id !== p.id);
    llenarPlantillas();
  });

  $('guardar-plantilla').addEventListener('click', async () => {
    const nombre = (prompt('Nombre de la plantilla (la verás al crear un guión nuevo):', actual.titulo || '') || '').trim();
    if (!nombre) return;
    if (hayCambiosSinGuardar()) await guardarYa();
    const hecha = await intentar(() => Almacen.crearPlantilla(nombre, actual), 'No se pudo guardar la plantilla');
    if (hecha) avisar(`Plantilla «${nombre}» guardada. La verás en «+ Nuevo guión».`);
  });

  // ---------- PDF y teleprompter ----------

  $('exportar-pdf').addEventListener('click', async () => {
    if (hayCambiosSinGuardar()) await guardarYa();
    Exportar.pdf(actual, { cliente: Almacen.obtenerCliente(actual.cliente_id)?.nombre });
  });
  $('abrir-teleprompter').addEventListener('click', () => Teleprompter.abrir(actual));

  // ---------- Copia de seguridad ----------

  $('descargar-respaldo').addEventListener('click', async () => {
    $('descargar-respaldo').disabled = true;
    const hecho = await intentar(async () => { await Almacen.respaldo(); return true; }, 'No se pudo descargar la copia');
    $('descargar-respaldo').disabled = false;
    if (hecho) avisar('Copia de seguridad descargada (carpeta Descargas)');
  });

  // ---------- Nuevo guión ----------

  function abrirNuevo() {
    const caja = $('nuevo-formatos');
    const preferido = formatoPreferido();
    caja.replaceChildren();
    for (const [clave, f] of Object.entries(Guion.FORMATOS)) {
      const label = elemento('label', 'formato-opcion');
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'nuevo-formato';
      radio.value = clave;
      radio.checked = clave === preferido;
      label.append(radio, elemento('b', '', f.nombre), elemento('span', '', f.descripcion));
      radio.addEventListener('change', llenarPlantillas);
      caja.append(label);
    }
    llenarPlantillas();
    cargarMisPlantillas();
    $('nuevo-titulo').value = '';
    llenarClientes('nuevo');
    $('dialogo-nuevo').returnValue = '';
    $('dialogo-nuevo').showModal();
    $('nuevo-titulo').focus();
  }

  $('dialogo-nuevo').addEventListener('close', async () => {
    if ($('dialogo-nuevo').returnValue !== 'crear') return;
    const formato = document.querySelector('input[name="nuevo-formato"]:checked')?.value || 'video';
    const plantilla = plantillaElegida();
    const g = await crear('nuevo', $('nuevo-titulo').value.trim(), formato, plantilla ? Plantillas.bloquesDe(plantilla) : undefined);
    if (g) $(formato === 'sencillo' ? 'sencillo' : 'titulo').focus();
  });

  // ---------- Pegar un guión ----------

  function formatoPegado() {
    const elegido = $('pegar-formato').value;
    return elegido === 'auto' ? Guion.detectarFormato($('pegar-texto').value) : elegido;
  }

  function abrirPegar() {
    $('pegar-titulo').value = '';
    $('pegar-texto').value = '';
    $('pegar-formato').value = 'auto';
    llenarClientes('pegar');
    resumenPegado();
    $('dialogo-pegar').returnValue = '';  // si se cierra con Esc no debe repetir el último "Crear"
    $('dialogo-pegar').showModal();
    $('pegar-texto').focus();
  }

  // Colores de cada tipo (los de los bloques del editor); escena y otros, en negro.
  const COLOR_TIPO = {
    camara: ['#ffe1d0', '#8c491a'], voz: ['#e1eecc', '#3d472b'],
    pantalla: ['#FCE3B0', '#6b4a0c'], nota: ['#eee7db', '#645c50'],
  };

  function resumenPegado() {
    const texto = $('pegar-texto').value;
    const caja = $('pegar-resumen');
    $('pegar-crear').disabled = !texto.trim();
    caja.replaceChildren();
    caja.hidden = !texto.trim();
    if (!texto.trim()) return;
    const formato = formatoPegado();
    const bloques = Guion.desdeTexto(texto, formato);
    caja.append(elemento('span', 'encontre-titulo', 'Encontré:'));
    const chip = (txt, [fondo, color] = ['#201e1d', '#f5ead8']) => {
      const c = elemento('span', 'encontre-chip', txt);
      c.style.background = fondo;
      c.style.color = color;
      caja.append(c);
    };
    if (formato === 'sencillo') return chip(Guion.FORMATOS[formato].nombre.toLowerCase());
    const cuenta = {};
    for (const b of bloques) cuenta[b.tipo] = (cuenta[b.tipo] || 0) + 1;
    for (const t of Object.keys(cuenta)) {
      chip(`${cuenta[t]} ${Guion.nombreTipo(t, formato, cuenta[t] !== 1).toLowerCase()}`, COLOR_TIPO[t]);
    }
  }

  // "Desde cero | Pegar uno que ya tengo": pasa de un diálogo al otro sin perder título ni cliente.
  function cambiarDialogo(de, a) {
    const titulo = $(`${de}-titulo`).value;
    const cliente = $(`${de}-cliente`).value;
    const nombreNuevo = $(`${de}-cliente-nuevo`).value;
    $(`dialogo-${de}`).close();
    (a === 'pegar' ? abrirPegar : abrirNuevo)();
    $(`${a}-titulo`).value = titulo;
    $(`${a}-cliente`).value = cliente;
    $(`${a}-cliente-nuevo`).value = nombreNuevo;
    alternarClienteNuevo(a);
  }
  $('nuevo-a-pegar').addEventListener('click', () => cambiarDialogo('nuevo', 'pegar'));
  $('pegar-a-nuevo').addEventListener('click', () => cambiarDialogo('pegar', 'nuevo'));

  $('dialogo-pegar').addEventListener('close', () => {
    if ($('dialogo-pegar').returnValue !== 'crear') return;
    const formato = formatoPegado();
    crear('pegar', $('pegar-titulo').value.trim(), formato, Guion.desdeTexto($('pegar-texto').value, formato));
  });

  // ---------- Eliminar ----------

  // Confirmación con el diálogo del prototipo; responde true si se pulsa "Sí, eliminar".
  function confirmarBorrado(titulo, texto) {
    $('borrar-titulo').textContent = titulo;
    $('borrar-texto').textContent = texto;
    $('dialogo-borrar').returnValue = '';
    $('dialogo-borrar').showModal();
    return new Promise((resolver) => $('dialogo-borrar').addEventListener('close', () => resolver($('dialogo-borrar').returnValue === 'eliminar'), { once: true }));
  }

  $('borrar').addEventListener('click', async () => {
    const contacto = Almacen.obtenerCliente(actual.cliente_id)?.nombre || 'Tu cliente';
    if (!(await confirmarBorrado(`¿Eliminar «${actual.titulo || 'Guión sin título'}»?`,
      `Se borran el guión, su chat con ${contacto} y todo su historial. ${contacto} dejará de verlo en su link. Esto no se puede deshacer.`))) return;
    clearTimeout(temporizador);
    temporizador = null;
    const { id, cliente_id: clienteId } = actual;
    if ((await intentar(() => Almacen.borrar(id), 'No se pudo eliminar el guión')) === null) return;
    abrirCliente(clienteId);
    avisar('Guión eliminado');
  });

  $('borrar-cliente').addEventListener('click', async () => {
    const c = Almacen.obtenerCliente(clienteAbierto);
    const n = Almacen.guionesDe(c.id).length;
    const aviso = n ? ` y sus ${n} guion${n === 1 ? '' : 'es'}` : '';
    if (!(await confirmarBorrado(`¿Eliminar a «${c.nombre}»?`,
      `Se borran ${c.nombre}${aviso}, con sus chats e historial. Su link dejará de funcionar. Esto no se puede deshacer.`))) return;
    if ((await intentar(() => Almacen.borrarCliente(c.id), 'No se pudo eliminar el cliente')) === null) return;
    const siguiente = Almacen.listarClientes()[0];
    if (siguiente) abrirCliente(siguiente.id); else abrir(null);
    avisar('Cliente eliminado');
  });

  // ---------- Acciones del link ----------

  const clientePanel = () => Almacen.obtenerCliente(clienteAbierto);

  $('link-copiar').addEventListener('click', () => copiarLink(clientePanel()));
  $('link-url').addEventListener('focus', () => $('link-url').select());
  $('link-whatsapp').addEventListener('click', () => enviarWhatsApp(clientePanel()));
  $('doc-chat').addEventListener('click', () => chatFlotante.abrir());
  // "Enviar a…": abre WhatsApp con el link de este guion y lo marca como "Esperando al cliente".
  $('doc-enviar').addEventListener('click', () => {
    marcarEnviado(actual);
    avisarClienteDelGuion();
    pintarAvisos();
    pintarLista();
    avisar(`Le avisamos a ${Almacen.obtenerCliente(actual.cliente_id)?.nombre || 'tu cliente'} por WhatsApp`);
  });
  $('doc-estado').addEventListener('click', () => { if (actual?.aprobado) desbloquearGuion(); });
  $('titulo').addEventListener('keydown', (e) => { if (e.key === 'Enter') e.preventDefault(); });
  $('chat-whatsapp').addEventListener('click', avisarClienteDelGuion);

  $('cliente-telefono').addEventListener('change', async () => {
    const c = clientePanel();
    const telefono = $('cliente-telefono').value.replace(/\D/g, '');
    if (telefono === (c.telefono || '')) return;
    const hecho = await intentar(() => Almacen.editarCliente(c.id, { telefono }), 'No se pudo guardar el WhatsApp');
    if (hecho) { $('cliente-telefono').value = hecho.telefono; avisar(hecho.telefono ? 'WhatsApp del cliente guardado' : 'WhatsApp del cliente quitado'); }
  });
  $('doc-cliente-nombre').addEventListener('click', irAInicio);

  $('link-activar').addEventListener('click', async () => {
    const c = clientePanel();
    if (c.activo && !confirm(`Mientras esté desactivado, ${c.nombre} no podrá ver sus guiones. ¿Desactivar el link?`)) return;
    const hecho = await intentar(() => Almacen.editarCliente(c.id, { activo: !c.activo }), 'No se pudo cambiar el link');
    if (hecho) { pintarPanelCliente(); pintarLista(); avisar(hecho.activo ? 'Link activado' : 'Link desactivado'); }
  });

  $('link-regenerar').addEventListener('click', async () => {
    const c = clientePanel();
    if (!confirm(`Se creará un link nuevo para ${c.nombre} y el actual dejará de funcionar. ¿Continuar?`)) return;
    const hecho = await intentar(() => Almacen.regenerarLink(c.id), 'No se pudo generar el link');
    if (hecho) { pintarPanelCliente(); pintarLista(); avisar('Link nuevo listo. Recuerda enviárselo.'); }
  });

  $('cliente-nombre').addEventListener('change', async () => {
    const c = clientePanel();
    const nombre = $('cliente-nombre').value.trim();
    if (!nombre || nombre === c.nombre) { $('cliente-nombre').value = c.nombre; return; }
    const hecho = await intentar(() => Almacen.editarCliente(c.id, { nombre }), 'No se pudo cambiar el nombre');
    if (hecho) { pintarPanelCliente(); pintarLista(); }
  });
  $('cliente-nombre').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('cliente-nombre').blur(); });

  // ---------- Responder al cliente ----------

  const ajustarRespuesta = Chat.prepararCampo($('respuesta-texto'), $('form-respuesta'));

  $('form-respuesta').addEventListener('submit', async (e) => {
    e.preventDefault();
    const texto = $('respuesta-texto').value.trim();
    if (!texto) return $('respuesta-texto').focus();
    $('respuesta-enviar').disabled = true;
    const guion = actual;
    const hecho = await intentar(() => Almacen.comentar(guion, texto), 'No se pudo enviar la respuesta');
    $('respuesta-enviar').disabled = false;
    if (!hecho) return;
    $('respuesta-texto').value = '';
    ajustarRespuesta();
    marcarVisto(guion);
    if (guion === actual) pintarComentariosDoc({ alFinal: true });
    avisar('Mensaje enviado.', { texto: 'Avisar por WhatsApp', alPulsar: () => enviarWhatsApp(Almacen.obtenerCliente(guion.cliente_id), guion) });
  });

  // ---------- Ver lo que hizo el cliente sin recargar ----------
  // Cada poco (y al volver a esta pestaña) se piden los datos de nuevo. Si estás
  // escribiendo, se espera a la siguiente vez para no interrumpirte.

  let refrescando = false;

  // Crece cada vez que un cliente escribe, edita o aprueba: si sube al refrescar, suena el aviso.
  function firmaCliente() {
    return Almacen.listar().reduce((n, g) =>
      n + (g.comentarios || []).filter((c) => c.autor === 'cliente').length
        + (g.editado_por === 'cliente' ? g.version : 0)
        + (g.aprobado ? 1 : 0), 0);
  }
  async function refrescar() {
    if (refrescando || document.hidden || !Almacen.haySesion() || $('marco').hidden || hayCambiosSinGuardar()) return;
    if (document.querySelector('dialog[open]')) return;
    refrescando = true;
    try {
      const antes = actual;
      const firmaAntes = firmaCliente();
      await Almacen.cargar();
      if (firmaCliente() > firmaAntes) Chat.sonar();
      if (antes) {
        const nuevo = Almacen.obtener(antes.id);
        if (!nuevo) { abrir(null); return; }
        if (nuevo.version === antes.version) {
          // Nada cambió: se conserva el mismo objeto (y lo que hay en pantalla).
          antes.comentarios = nuevo.comentarios;
          antes.aprobado = nuevo.aprobado;
          Almacen.reemplazar(antes);
          pintarAvisos();
          pintarBloqueo();
          pintarComentariosDoc();
          marcarVisto(antes);
        } else if (!hayCambiosSinGuardar()) {
          abrir(nuevo.id);
          avisar('El cliente hizo cambios: ya ves la versión nueva');
        }
      } else if (clienteAbierto) {
        pintarPanelCliente();
      }
      pintarLista();
    } catch {
      // Sin conexión: se intentará en el siguiente ciclo.
    } finally {
      refrescando = false;
    }
  }
  setInterval(refrescar, 20000);
  // Recarga en cuanto termine el guardado en curso (refrescar no actúa mientras se guarda).
  function refrescarAhora() {
    setTimeout(() => { clearTimeout(temporizador); temporizador = null; refrescar(); }, 50);
  }
  window.addEventListener('focus', refrescar);
  document.addEventListener('visibilitychange', refrescar);

  // ---------- Caducidad del link ----------

  function linkCaducado(c) { return !!c.caduca && c.caduca <= Date.now(); }
  const fechaParaCampo = (ms) => {
    const d = new Date(ms);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  // El link funciona hasta el final del día elegido (23:59 hora local).
  async function ponerCaducidad(fechaTexto) {
    const c = clientePanel();
    let caduca = null;
    if (fechaTexto) {
      const [a, m, d] = fechaTexto.split('-').map(Number);
      caduca = new Date(a, m - 1, d, 23, 59, 59).getTime();
    }
    const hecho = await intentar(() => Almacen.editarCliente(c.id, { caduca }), 'No se pudo cambiar la fecha');
    if (!hecho) return;
    pintarPanelCliente();
    pintarLista();
    avisar(caduca ? `El link funcionará hasta el ${fecha(caduca)}` : 'El link ya no caduca');
  }

  $('cliente-caduca').addEventListener('change', () => ponerCaducidad($('cliente-caduca').value));
  $('quitar-caducidad').addEventListener('click', () => ponerCaducidad(''));
  document.querySelectorAll('.caducidad-atajos [data-dias]').forEach((b) => b.addEventListener('click', () => {
    ponerCaducidad(fechaParaCampo(Date.now() + Number(b.dataset.dias) * 24 * 60 * 60 * 1000));
  }));

  // ---------- Móvil ----------


  // ---------- Entrar ----------

  function mostrarAcceso(mensaje = '') {
    $('marco').hidden = true;
    $('salir').hidden = true;
    $('abrir-avisos').hidden = true;
    $('cargando').hidden = true;
    $('acceso').hidden = false;
    $('acceso-error').textContent = mensaje;
    $('acceso-clave').value = '';
    $('acceso-clave').focus();
  }

  async function iniciar() {
    if (!Almacen.haySesion()) return mostrarAcceso();
    $('acceso').hidden = true;
    $('cargando').textContent = 'Cargando tus guiones…';
    $('cargando').hidden = false;
    try {
      await Almacen.cargar();
    } catch (e) {
      if (e.estado === 401) return;  // alCaducarSesion ya mostró la pantalla de acceso
      $('cargando').textContent = `No se pudo conectar (${e.message}). Revisa tu internet y recarga la página.`;
      return;
    }
    $('cargando').hidden = true;
    $('marco').hidden = false;
    $('salir').hidden = false;

    $('abrir-avisos').hidden = false;
    consultarTelegram();

    // Enlaces de los avisos de Telegram: #g:<id>, #g:<id>:cambios o #g:<id>:chat
    const [, enlace, que] = location.hash.match(/^#g:([\w-]+)(?::(\w+))?$/) || [];
    if (enlace) history.replaceState(null, '', location.pathname + location.search);
    if (enlace && Almacen.obtener(enlace)) {
      if (que === 'cambios') { verCambios = true; modo = 'editar'; }
      abrir(enlace);
      if (que === 'chat') chatFlotante.abrir();
      return;
    }

    irAInicio(); // al entrar, siempre Inicio
  }

  $('form-acceso').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('acceso-entrar').disabled = true;
    $('acceso-error').textContent = '';
    try {
      await Almacen.entrar($('acceso-clave').value);
      await iniciar();
    } catch (err) {
      $('acceso-error').textContent = err.message;
    } finally {
      $('acceso-entrar').disabled = false;
    }
  });

  // ---------- Avisos por Telegram ----------

  // Indicador del pie del lateral: punto salvia "Telegram" si llegan avisos, gris "Sin avisos" si no.
  function pintarIndicadorTelegram(conectado) {
    $('estado-telegram').classList.toggle('conectado', !!conectado);
    $('estado-telegram-texto').textContent = conectado ? 'Telegram' : 'Sin avisos';
  }

  async function consultarTelegram() {
    try { pintarIndicadorTelegram((await Almacen.avisos()).telegram.conectado); } catch { /* sin conexión: se deja como está */ }
  }

  function estadoAvisos(texto, conectado = false) {
    $('avisos-estado-texto').textContent = texto;
    $('ajustes-telegram').classList.toggle('conectado', conectado);
  }

  async function pintarAvisosTelegram() {
    $('avisos-error').textContent = '';
    let estado;
    try {
      ({ telegram: estado } = await Almacen.avisos());
    } catch (e) {
      estadoAvisos('Sin conectar');
      $('avisos-error').textContent = `No se pudo consultar: ${e.message}`;
      return;
    }
    pintarIndicadorTelegram(estado.conectado);
    estadoAvisos(estado.conectado ? `Conectado${estado.bot ? ` · @${estado.bot}` : ''}` : 'Sin conectar', estado.conectado);
    $('avisos-nota').hidden = !!estado.token;
    $('avisos-nota').textContent = 'Falta el primer paso: crear tu bot en Telegram y guardar su código en Cloudflare (Claude te guía).';
    $('avisos-pasos').hidden = !estado.token || estado.conectado;
    $('avisos-abrir-bot').hidden = !estado.bot || estado.conectado;
    if (estado.bot) {
      $('avisos-abrir-bot').href = `https://t.me/${estado.bot}?start=conectar`;
      $('avisos-bot-nombre').textContent = ` (@${estado.bot})`;
    }
    $('avisos-conectar').hidden = !estado.token || estado.conectado;
    $('avisos-prueba').hidden = !estado.conectado;
    $('avisos-desconectar').hidden = !estado.conectado;
  }

  async function accionTelegram(boton, accion, exito) {
    boton.disabled = true;
    $('avisos-error').textContent = '';
    try {
      const r = await accion();
      if (exito) avisar(exito(r));
      await pintarAvisosTelegram();
    } catch (e) {
      $('avisos-error').textContent = e.message;
    } finally {
      boton.disabled = false;
    }
  }

  $('abrir-avisos').addEventListener('click', () => {
    estadoAvisos('Comprobando…');
    $('dialogo-avisos').showModal();
    pintarAvisosTelegram();
  });
  $('avisos-conectar').addEventListener('click', () => accionTelegram($('avisos-conectar'), Almacen.conectarTelegram, (r) => `Conectado con ${r.nombre}. Revisa tu Telegram.`));
  $('avisos-prueba').addEventListener('click', () => accionTelegram($('avisos-prueba'), Almacen.pruebaTelegram, () => 'Aviso de prueba enviado a tu Telegram'));
  $('avisos-desconectar').addEventListener('click', () => accionTelegram($('avisos-desconectar'), Almacen.desconectarTelegram, () => 'Ya no recibirás avisos en Telegram'));

  $('salir').addEventListener('click', async () => {
    if (hayCambiosSinGuardar()) await guardarYa();
    Almacen.cerrarSesion();
    actual = null;
    clienteAbierto = null;
    mostrarAcceso();
  });

  Almacen.alCaducarSesion(() => mostrarAcceso('Tu sesión terminó. Vuelve a entrar.'));

  // ---------- Arranque ----------

  llenarSelectorFormato($('formato'), false);
  llenarSelectorFormato($('pegar-formato'), true);
  $('nuevo').addEventListener('click', abrirNuevo);
  $('pegar').addEventListener('click', abrirPegar);
  $('boton-nuevo-cliente').addEventListener('click', nuevoCliente);
  ['nuevo', 'pegar'].forEach((d) => $(`${d}-cliente`).addEventListener('change', () => alternarClienteNuevo(d)));
  document.querySelectorAll('[data-accion]').forEach((b) =>
    b.addEventListener('click', () => (b.dataset.accion === 'nuevo' ? abrirNuevo() : abrirPegar())));
  document.querySelectorAll('.pestana').forEach((p) => p.addEventListener('click', () => cambiarModo(p.dataset.modo)));
  $('ir-inicio').addEventListener('click', irAInicio);
  $('movil-inicio').addEventListener('click', irAInicio);
  $('movil-nuevo').addEventListener('click', abrirNuevo);
  $('inicio-nuevo').addEventListener('click', abrirNuevo);
  $('inicio-pegar').addEventListener('click', abrirPegar);
  $('inicio-cliente-nuevo').addEventListener('click', nuevoCliente);
  $('movil-ajustes').addEventListener('click', () => $('abrir-avisos').click());
  $('movil-volver').addEventListener('click', () => (vista === 'documento' && modo === 'leer' ? cambiarModo('editar') : irAInicio()));
  $('movil-chat').addEventListener('click', () => chatFlotante.abrir());
  $('titulo').addEventListener('input', () => { actual.titulo = $('titulo').value; guardarLuego(); });
  $('pegar-texto').addEventListener('input', resumenPegado);
  $('pegar-formato').addEventListener('change', resumenPegado);
  window.addEventListener('resize', () => Menu.ocultar());
  window.addEventListener('beforeunload', (e) => {
    if (!hayCambiosSinGuardar()) return;
    guardarYa();
    e.preventDefault();
    e.returnValue = '';
  });

  iniciar();
})();

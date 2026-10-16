// Página que abre el cliente con su link (cliente.html#<código secreto>).
// El código va después de "#", así que nunca llega a los servidores de GitHub.
// Aquí el cliente lee sus guiones, cambia los textos, los aprueba y chatea con aifotos.
(() => {
  const $ = (id) => document.getElementById(id);
  const codigo = location.hash.slice(1).split('/')[0];
  const base = `${CONFIG.api}/api/c/${encodeURIComponent(codigo)}`;
  const CADA_CUANTO_REVISAR = 20000; // ms: para ver mensajes nuevos de aifotos sin recargar

  let guiones = [];
  let nombreCliente = '';
  let actual = null;      // guion abierto
  let editando = false;
  let original = null;    // textos al empezar a editar: { idBloque: texto }
  let enviando = false;
  let tieneTelefono = true;

  function el(etiqueta, clase, texto) {
    const nodo = document.createElement(etiqueta);
    if (clase) nodo.className = clase;
    if (texto != null) nodo.textContent = texto;
    return nodo;
  }

  const fecha = (ms) => new Date(ms).toLocaleDateString('es', { day: 'numeric', month: 'long' });

  // Ventanas propias en vez de confirm()/alert(): los navegadores de WhatsApp
  // o Instagram a veces no muestran las del sistema y el botón parece no hacer nada.
  function preguntar(texto, { si = 'Sí', no = 'Cancelar' } = {}) {
    const dialogo = $('dialogo-pregunta');
    $('pregunta-texto').textContent = texto;
    $('pregunta-si').textContent = si;
    $('pregunta-no').textContent = no;
    $('pregunta-no').hidden = !no;
    dialogo.returnValue = '';
    dialogo.showModal();
    return new Promise((resolver) => {
      dialogo.addEventListener('close', () => resolver(dialogo.returnValue === 'si'), { once: true });
    });
  }

  const avisar = (texto) => preguntar(texto, { si: 'Entendido', no: '' });

  async function pedir(metodo, ruta, datos) {
    let r;
    try {
      r = await fetch(base + ruta, {
        method: metodo,
        headers: datos ? { 'Content-Type': 'application/json' } : {},
        body: datos ? JSON.stringify(datos) : undefined,
      });
    } catch {
      const e = new Error('Sin conexión a internet');
      e.estado = 0;
      throw e;
    }
    const cuerpo = await r.json().catch(() => ({}));
    if (!r.ok) {
      const e = new Error(cuerpo.error || 'Algo salió mal');
      e.estado = r.status;
      e.datos = cuerpo;
      throw e;
    }
    return cuerpo;
  }

  // ---------- Lista de guiones ----------

  function mostrarLista() {
    $('guion').hidden = true;
    $('acciones').hidden = true;
    cerrarChat();
    const lista = $('lista');
    lista.replaceChildren(el('h1', 'cliente-titulo', 'Tus guiones'));
    for (const g of guiones) {
      const tarjeta = el('a', 'tarjeta');
      tarjeta.href = `#${codigo}/${g.id}`;
      const titulo = el('span', 'tarjeta-titulo', g.titulo || 'Guión sin título');
      titulo.append(el('span', `insignia ${g.aprobado ? 'aprobado' : 'pendiente'}`, g.aprobado ? 'Aprobado' : 'Por revisar'));
      tarjeta.append(
        titulo,
        el('span', 'lista-info', `${Guion.formatoDuracion(Guion.estadisticas(g.bloques).segundos)} · actualizado el ${fecha(g.actualizado)}`),
      );
      lista.append(tarjeta);
    }
    lista.hidden = false;
    document.title = 'Tus guiones · aifotos';
    window.scrollTo(0, 0);
  }

  // ---------- Un guion ----------

  function citasDe(g) {
    return (g.comentarios || []).filter((c) => c.cita).map((c) => ({ id: c.id, bloque: c.cita.bloque, texto: c.cita.texto }));
  }

  function pintarGuion() {
    ocultarBurbuja();
    let aviso = null;
    if (editando) {
      aviso = el('p', 'lectura-aviso', 'Toca cualquier texto para cambiarlo. Tus cambios le llegan a aifotos cuando pulses ');
      aviso.append(el('b', '', 'Listo'), '.');
    }
    Vista.render(actual, $('lectura'), { editable: editando, alCambiar: alEditar, citas: citasDe(actual), aviso });
    if (actual.aprobado && !editando) $('lectura').prepend(el('span', 'lectura-sello', '¡Aprobado!'));
    marcarLineaElegida();
    pintarEstado();
    pintarChat();
  }

  // Estado desde el punto de vista del cliente, con los colores del prototipo.
  function estadoCliente() {
    if (actual.aprobado) return { etiqueta: 'Aprobado', ...UI.ESTADOS.aprobado };
    if (actual.editado_por === 'cliente') return { ...UI.ESTADOS.editado, etiqueta: 'Enviaste cambios' };
    return { ...UI.ESTADOS.esperando, etiqueta: 'Por revisar' };
  }

  function pintarEstado() {
    const e = estadoCliente();
    const pildora = $('estado-guion');
    pildora.textContent = e.etiqueta;
    pildora.className = 'estado-guion';
    pildora.style.setProperty('--estado-fondo', e.fondo);
    pildora.style.setProperty('--estado-texto', e.texto);
    pildora.style.setProperty('--estado-punto', e.punto);

    $('saludo-titulo').textContent = `Hola, ${nombreCliente}.`;
    const texto = $('saludo-texto');
    texto.replaceChildren();
    if (actual.aprobado) texto.append('Aprobaste la ', el('b', '', `v${actual.version}`), ' de tu guión. Si necesitas algún cambio, escríbele a aifotos por el chat.');
    else texto.append('Te mandamos la ', el('b', '', `v${actual.version}`), ' de tu guión. Léelo con calma; si una frase no te cuadra, tócala y coméntala.');

    // Aprobado = bloqueado: ya no se edita (si hace falta un cambio, se pide por el chat).
    $('editar').hidden = !!actual.aprobado && !editando;
    $('editar').querySelector('span').textContent = editando ? 'Listo' : 'Editar';
    $('editar').classList.toggle('activa', editando);
    $('descartar').hidden = !editando;
    $('aprobar').hidden = editando;
    $('aprobar').querySelector('span').textContent = actual.aprobado ? 'Aprobado' : 'Aprobar';
    $('aprobar').classList.toggle('hecho', !!actual.aprobado);
  }

  // ---------- Tocar una línea para comentarla ----------

  let lineaElegida = null; // id del bloque tocado

  function marcarLineaElegida() {
    $('lectura').querySelectorAll('.linea.elegida').forEach((x) => x.classList.remove('elegida'));
    $('lectura').querySelectorAll('.lectura-comentar').forEach((x) => x.remove());
    if (!lineaElegida || editando) return;
    const linea = $('lectura').querySelectorAll('.linea')[lineaElegida.indice];
    if (!linea) return;
    linea.classList.add('elegida');
    const boton = el('button', 'lectura-comentar');
    boton.append(UI.icono('chat', 14), 'Comentar esta frase');
    boton.addEventListener('click', () => {
      citarEnChat({ texto: lineaElegida.texto, bloque: lineaElegida.id });
      lineaElegida = null;
      marcarLineaElegida();
    });
    linea.after(boton);
  }

  $('lectura').addEventListener('click', (e) => {
    if (editando || e.target.closest('mark[data-comentario]') || window.getSelection().toString().trim()) return;
    const linea = e.target.closest('.linea[data-linea]');
    if (!linea) return;
    const indice = [...$('lectura').querySelectorAll('.linea')].indexOf(linea);
    const mismo = lineaElegida && lineaElegida.id === linea.dataset.linea && lineaElegida.indice === indice;
    lineaElegida = mismo ? null : { id: linea.dataset.linea, indice, texto: linea.querySelector('.linea-texto')?.textContent.trim() || '' };
    marcarLineaElegida();
  });

  async function mostrarGuion(g) {
    actual = g;
    editando = false;
    original = null;
    lineaElegida = null;
    $('lista').hidden = true;
    $('acciones').hidden = false;
    $('volver').hidden = guiones.length < 2;
    estadoEdicion('');
    pintarGuion();
    pintarChat({ alFinal: true });
    $('guion').hidden = false;
    document.title = `${g.titulo || 'Guión'} · aifotos`;
    window.scrollTo(0, 0);
    await ofrecerBorrador();
  }

  // ---------- Editar: los cambios se envían al pulsar "Listo" ----------
  // Mientras edita, lo escrito se guarda solo en este navegador (borrador). Así
  // aifotos recibe la versión final y no cada tecla, y si el cliente cierra la
  // página sin pulsar "Listo", puede recuperar lo que escribió.

  const claveBorrador = () => `guiones-creator:borrador:${codigo}:${actual.id}`;

  function textosDe(g) {
    return Object.fromEntries(g.bloques.map((b) => [b.id, b.texto]));
  }

  function hayCambiosSinEnviar() {
    return editando && original && actual.bloques.some((b) => b.texto !== original[b.id]);
  }

  function estadoEdicion(texto, error = false) {
    $('guardado').textContent = texto;
    $('guardado').classList.toggle('error', error);
  }

  let esperaBorrador = null;
  function alEditar() {
    estadoEdicion(hayCambiosSinEnviar() ? 'Cambios sin enviar' : '');
    clearTimeout(esperaBorrador);
    esperaBorrador = setTimeout(guardarBorrador, 400);
  }

  function guardarBorrador() {
    try {
      if (hayCambiosSinEnviar()) localStorage.setItem(claveBorrador(), JSON.stringify({ version: actual.version, textos: textosDe(actual) }));
      else localStorage.removeItem(claveBorrador());
    } catch { /* sin almacenamiento: solo se pierde la red de seguridad */ }
  }

  function borrarBorrador() {
    clearTimeout(esperaBorrador);
    try { localStorage.removeItem(claveBorrador()); } catch {}
  }

  function empezarEdicion() {
    editando = true;
    original = textosDe(actual);
    pintarGuion();
    $('lectura').querySelector('textarea')?.focus({ preventScroll: true });
  }

  function terminarEdicion() {
    editando = false;
    original = null;
    borrarBorrador();
    pintarGuion();
  }

  // Si quedó un borrador de otra vez (cerró sin pulsar Listo), ofrece recuperarlo.
  async function ofrecerBorrador() {
    let borrador = null;
    try { borrador = JSON.parse(localStorage.getItem(claveBorrador()) || 'null'); } catch {}
    if (!borrador) return;
    if (actual.aprobado) return borrarBorrador();
    if (borrador.version !== actual.version) {
      borrarBorrador();
      return avisar('Tenías cambios sin enviar, pero aifotos actualizó el guión mientras tanto, así que no se pueden aplicar. Revisa la versión nueva y vuelve a hacer tus cambios.');
    }
    const recuperar = await preguntar('Tienes cambios en este guión que no llegaste a enviar. ¿Quieres recuperarlos?', { si: 'Recuperar', no: 'Descartar' });
    if (!recuperar) return borrarBorrador();
    original = textosDe(actual);
    for (const b of actual.bloques) if (b.id in borrador.textos) b.texto = borrador.textos[b.id];
    editando = true;
    pintarGuion();
    estadoEdicion('Cambios sin enviar');
  }

  async function enviarCambios() {
    if (enviando) return;
    if (!hayCambiosSinEnviar()) return terminarEdicion();
    enviando = true;
    $('editar').disabled = true;
    estadoEdicion('Enviando…');
    try {
      const nueva = await pedir('PUT', `/guiones/${actual.id}`, {
        version: actual.version,
        bloques: actual.bloques.map(({ id, tipo, texto }) => ({ id, tipo, texto })),
      });
      actual.version = nueva.version;
      actual.actualizado = nueva.actualizado;
      actual.aprobado = nueva.aprobado;
      terminarEdicion();
      estadoEdicion('Cambios enviados ✓');
    } catch (e) {
      if (e.estado === 409) {
        // aifotos lo cambió mientras tanto: se muestra su versión.
        editando = false;
        original = null;
        reemplazar(e.datos.guion);
        estadoEdicion('');
        avisar('aifotos actualizó este guión mientras lo editabas, así que te mostramos la versión nueva. Revísala y vuelve a hacer tus cambios.');
        borrarBorrador();
      } else if (e.estado === 423) {
        editando = false;
        original = null;
        borrarBorrador();
        actual.aprobado = actual.aprobado || Date.now();
        pintarGuion();
        estadoEdicion('');
        avisar(e.message);
      } else {
        estadoEdicion('No se pudo enviar. Revisa tu conexión y vuelve a pulsar Listo.', true);
      }
    } finally {
      enviando = false;
      $('editar').disabled = false;
    }
  }

  function reemplazar(nueva) {
    const i = guiones.findIndex((g) => g.id === nueva.id);
    if (i >= 0) guiones[i] = nueva;
    if (actual && actual.id === nueva.id) { actual = nueva; pintarGuion(); }
  }

  $('editar').addEventListener('click', async () => {
    if (editando) return enviarCambios();
    if (actual.aprobado) return;
    empezarEdicion();
  });

  $('descartar').addEventListener('click', async () => {
    if (hayCambiosSinEnviar() && !(await preguntar('¿Descartar los cambios que hiciste? Volverá a quedar como estaba.', { si: 'Descartar', no: 'Seguir editando' }))) return;
    for (const b of actual.bloques) if (b.id in original) b.texto = original[b.id];
    terminarEdicion();
    estadoEdicion('');
  });

  // ---------- PDF y teleprompter ----------

  $('cliente-pdf').addEventListener('click', () => Exportar.pdf(actual, { cliente: nombreCliente }));
  $('cliente-teleprompter').addEventListener('click', () => Teleprompter.abrir(actual));

  // ---------- Aprobar ----------

  $('aprobar').addEventListener('click', async () => {
    if (!(await preguntar('¿Aprobar este guión? aifotos sabrá que estás de acuerdo con el texto.', { si: 'Sí, aprobar' }))) return;
    try {
      const { aprobado } = await pedir('POST', `/guiones/${actual.id}/aprobar`);
      actual.aprobado = aprobado;
      pintarEstado();
    } catch (e) {
      avisar(`No se pudo aprobar: ${e.message}`);
    }
  });

  // ---------- Chat ----------

  const claveLeidos = () => `guiones-creator:leidos:${codigo}:${actual.id}`;
  // El chat es un cajón que entra por la derecha (pantalla completa en el celular).
  const chatVisible = () => document.body.classList.contains('chat-abierto');
  function abrirChat() {
    document.body.classList.add('chat-abierto');
    if (actual) pintarChat({ alFinal: true });
  }
  function cerrarChat() { document.body.classList.remove('chat-abierto'); }
  $('chat-abrir').addEventListener('click', abrirChat);
  $('chat-cerrar').addEventListener('click', cerrarChat);

  // Frase citada que acompaña al próximo mensaje (al tocar "Comentar esta frase").
  let citaPendiente = null;
  function citarEnChat(cita) {
    citaPendiente = cita;
    $('chat-cita-texto').textContent = `“${cita.texto}”`;
    $('chat-cita').hidden = false;
    abrirChat();
    $('comentario-texto').focus();
  }
  function quitarCita() {
    citaPendiente = null;
    $('chat-cita').hidden = true;
  }
  $('chat-cita-quitar').addEventListener('click', quitarCita);

  function pintarChat(opciones = {}) {
    Chat.pintar($('comentarios-lista'), actual.comentarios || [], {
      yo: 'cliente',
      vacio: 'Aún no hay mensajes',
      alTocarCita: (c) => {
        if (window.innerWidth < 1200) cerrarChat(); // el cajón tapa el guion
        irA($('lectura').querySelector(`mark[data-comentario="${c.id}"]`));
      },
      alFinal: opciones.alFinal,
    });
    pintarSinLeer();
  }

  // Mensajes de aifotos que el cliente aún no ha visto (el globo rojo del botón del chat).
  function pintarSinLeer() {
    let leidos = 0;
    try { leidos = Number(localStorage.getItem(claveLeidos()) || 0); } catch {}
    if (chatVisible()) {
      const ultimo = Math.max(0, ...(actual.comentarios || []).map((c) => c.creado));
      try { localStorage.setItem(claveLeidos(), String(ultimo)); } catch {}
      leidos = ultimo;
    }
    const sinLeer = (actual.comentarios || []).filter((c) => c.autor === 'admin' && c.creado > leidos).length;
    $('sin-leer').textContent = sinLeer;
    $('sin-leer').hidden = !sinLeer;
    // Mientras la pestaña está en segundo plano, el número de mensajes nuevos se ve en su título.
    const nuevos = document.hidden ? (actual.comentarios || []).filter((c) => c.autor === 'admin' && c.creado > vistoAlSalir).length : sinLeer;
    Chat.contarEnPestana(`${actual.titulo || 'Guión'} · aifotos`, nuevos);
  }

  const ajustarCampo = Chat.prepararCampo($('comentario-texto'), $('form-comentario'));

  $('form-comentario').addEventListener('submit', async (e) => {
    e.preventDefault();
    const texto = $('comentario-texto').value.trim();
    if (!texto) return $('comentario-texto').focus();
    $('comentario-enviar').disabled = true;
    const enviado = await comentar(citaPendiente ? { texto, cita: citaPendiente } : { texto });
    $('comentario-enviar').disabled = false;
    if (!enviado) return;
    $('comentario-texto').value = '';
    ajustarCampo();
    if (citaPendiente) { quitarCita(); pintarGuion(); }
    pintarChat({ alFinal: true });
    $('comentario-texto').focus();
  });

  async function comentar(datos) {
    try {
      const comentario = await pedir('POST', `/guiones/${actual.id}/comentarios`, datos);
      (actual.comentarios ||= []).push(comentario);
      return comentario;
    } catch (err) {
      avisar(`No se pudo enviar el mensaje: ${err.message}`);
      return null;
    }
  }

  // Lleva la vista hasta un elemento y lo hace destellar un momento.
  function irA(nodo) {
    if (!nodo) return;
    nodo.scrollIntoView({ behavior: 'smooth', block: 'center' });
    nodo.classList.remove('destello');
    void nodo.offsetWidth; // reinicia la animación
    nodo.classList.add('destello');
  }

  // Tocar una frase resaltada lleva a su mensaje en el chat.
  $('lectura').addEventListener('click', (e) => {
    const marca = e.target.closest('mark[data-comentario]');
    if (!marca) return;
    if (!chatVisible()) abrirChat();
    irA($('comentarios-lista').querySelector(`[data-id="${marca.dataset.comentario}"] .burbuja`));
  });

  // Mensajes nuevos de aifotos (y cambios suyos en el guion) sin recargar la página.
  async function revisarNovedades() {
    if (document.hidden || !actual || enviando) return;
    try {
      const datos = await pedir('GET', '');
      guiones = datos.guiones;
      const nuevo = guiones.find((g) => g.id === actual.id);
      if (!nuevo) return;
      const deAifotos = (g) => (g.comentarios || []).filter((c) => c.autor === 'admin').length;
      const habiaMensajes = (actual.comentarios || []).length;
      if (deAifotos(nuevo) > deAifotos(actual)) Chat.sonar();
      if (!editando && nuevo.version !== actual.version) {
        actual = nuevo;
        pintarGuion();
      } else {
        actual.comentarios = nuevo.comentarios;
        actual.aprobado = editando ? actual.aprobado : nuevo.aprobado;
        if (!editando) Vista.render(actual, $('lectura'), { citas: citasDe(actual) });
        pintarEstado();
        pintarChat();
      }
      if ((actual.comentarios || []).length > habiaMensajes && !chatVisible()) pintarSinLeer();
    } catch { /* sin conexión: se intentará otra vez */ }
  }
  setInterval(revisarNovedades, CADA_CUANTO_REVISAR);
  // Al irse a otra pestaña se apunta la hora, para contar lo que llegue mientras tanto.
  let vistoAlSalir = Date.now();
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) vistoAlSalir = Date.now();
    else if (actual) pintarSinLeer();
    revisarNovedades();
  });

  // ---------- Comentar una frase seleccionada ----------

  let seleccion = null;     // { texto, bloque }
  let esperaSeleccion = null;

  function ocultarBurbuja() {
    $('burbuja').hidden = true;
    seleccion = null;
  }

  // Dónde se soltó el dedo o el ratón por última vez: en modo editar sirve
  // para poner la burbuja junto a la frase (dentro de un campo no hay otra forma).
  let ultimoPuntero = null;
  document.addEventListener('pointerup', (e) => { ultimoPuntero = { x: e.clientX, y: e.clientY }; }, true);

  // Frase seleccionada al leer: la selección normal de la página.
  function seleccionAlLeer() {
    const sel = window.getSelection();
    if (!sel.rangeCount || sel.isCollapsed) return null;
    const texto = sel.toString().trim();
    const nodo = sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement;
    if (texto.length < 2 || !$('lectura').contains(nodo)) return null;
    return { texto, bloque: nodo.closest('[data-bloque]')?.dataset.bloque || '', caja: sel.getRangeAt(0).getBoundingClientRect() };
  }

  // Frase seleccionada al editar: el trozo marcado dentro del campo de texto.
  function seleccionAlEditar() {
    const campo = document.activeElement;
    if (!campo || campo.tagName !== 'TEXTAREA' || !$('lectura').contains(campo)) return null;
    const texto = campo.value.slice(campo.selectionStart, campo.selectionEnd).trim();
    if (texto.length < 2) return null;
    const r = campo.getBoundingClientRect();
    const puntero = ultimoPuntero && ultimoPuntero.y >= r.top - 4 && ultimoPuntero.y <= r.bottom + 4 ? ultimoPuntero : null;
    const caja = puntero ? { left: puntero.x, width: 0, bottom: puntero.y + 6 } : { left: r.left, width: r.width, bottom: r.bottom };
    return { texto, bloque: campo.dataset.bloque || '', caja };
  }

  function revisarSeleccion() {
    if (!actual || $('guion').hidden) return ocultarBurbuja();
    const encontrada = editando ? seleccionAlEditar() : seleccionAlLeer();
    if (!encontrada) return ocultarBurbuja();
    seleccion = { texto: encontrada.texto.slice(0, 600), bloque: encontrada.bloque };

    const { caja } = encontrada;
    const burbuja = $('burbuja');
    burbuja.hidden = false;
    const ancho = burbuja.offsetWidth;
    const izquierda = Math.min(Math.max(caja.left + caja.width / 2 - ancho / 2, 12), document.documentElement.clientWidth - ancho - 12);
    burbuja.style.left = `${izquierda + window.scrollX}px`;
    burbuja.style.top = `${caja.bottom + window.scrollY + 10}px`;
  }

  function revisarEnUnMomento() {
    clearTimeout(esperaSeleccion);
    esperaSeleccion = setTimeout(revisarSeleccion, 120);
  }
  document.addEventListener('selectionchange', revisarEnUnMomento);
  // Dentro de un campo de texto no todos los navegadores avisan con selectionchange.
  for (const evento of ['select', 'mouseup', 'keyup', 'touchend']) $('lectura').addEventListener(evento, revisarEnUnMomento);

  // pointerdown (no click): en el celular, tocar fuera borra la selección antes del click.
  $('burbuja').addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (!seleccion) return;
    const elegido = seleccion;
    ocultarBurbuja();
    window.getSelection().removeAllRanges();
    citarEnChat(elegido);
  });

  // ---------- Navegación ----------

  // "#codigo" muestra la lista (o el único guion); "#codigo/idGuion" abre ese guion.
  function enrutar() {
    const [, id] = location.hash.slice(1).split('/');
    const g = guiones.find((x) => x.id === id);
    if (g) return mostrarGuion(g);
    if (guiones.length === 1) return mostrarGuion(guiones[0]);
    return mostrarLista();
  }

  // ---------- WhatsApp del cliente ----------
  // La primera vez se le pide su número, para que aifotos le avise directamente a su chat.
  // Si dice "Ahora no", se le vuelve a preguntar dentro de unos días.

  const claveSinWhatsApp = `guiones-creator:whatsapp-luego:${codigo}`;
  const TRES_DIAS = 3 * 24 * 60 * 60 * 1000;

  function pedirWhatsApp() {
    if (tieneTelefono) return;
    let luego = 0;
    try { luego = Number(localStorage.getItem(claveSinWhatsApp) || 0); } catch {}
    if (Date.now() - luego < TRES_DIAS || document.querySelector('dialog[open]')) return;
    $('whatsapp-error').textContent = '';
    $('dialogo-whatsapp').returnValue = '';
    $('dialogo-whatsapp').showModal();
    $('whatsapp-telefono').focus();
  }

  $('form-whatsapp').addEventListener('submit', async (e) => {
    if (e.submitter?.value !== 'guardar') {
      try { localStorage.setItem(claveSinWhatsApp, String(Date.now())); } catch {}
      return; // se cierra el diálogo
    }
    e.preventDefault();
    const numero = $('whatsapp-telefono').value.replace(/\D/g, '');
    const telefono = $('whatsapp-pais').value + numero;
    if (numero.length < 6 || telefono.length < 8 || telefono.length > 15) {
      $('whatsapp-error').textContent = $('whatsapp-pais').value
        ? 'Revisa el número: parece incompleto.'
        : 'Escribe el número con el código de tu país delante, por ejemplo 34 612 345 678.';
      return;
    }
    $('whatsapp-guardar').disabled = true;
    try {
      await pedir('POST', '/telefono', { telefono });
      tieneTelefono = true;
      $('dialogo-whatsapp').close();
      avisar('¡Gracias! Te avisaremos por WhatsApp cuando haya novedades.');
    } catch (err) {
      if (err.estado === 409) { tieneTelefono = true; $('dialogo-whatsapp').close(); return; }
      $('whatsapp-error').textContent = err.message;
    } finally {
      $('whatsapp-guardar').disabled = false;
    }
  });
  $('whatsapp-pais').addEventListener('change', () => {
    $('whatsapp-telefono').placeholder = $('whatsapp-pais').value ? '809 555 1234' : 'Código de país + número';
  });

  async function cargar() {
    if (!codigo) { $('estado').textContent = 'Este link no es válido. Pide uno nuevo a aifotos.'; return; }
    try {
      const datos = await pedir('GET', '');
      guiones = datos.guiones;
      nombreCliente = datos.cliente.nombre;
      tieneTelefono = datos.cliente.tieneTelefono !== false;
      if (!guiones.length) { $('estado').textContent = 'Todavía no hay guiones aquí.'; return; }
      $('estado').hidden = true;
      await enrutar();
      pedirWhatsApp();
    } catch (e) {
      $('estado').textContent = e.estado === 404 || e.estado === 410
        ? (e.estado === 410 ? e.message : 'Este link no existe o fue desactivado. Pide uno nuevo a aifotos.')
        : e.estado === 0
          ? 'Sin conexión a internet. Revisa tu conexión y recarga la página.'
          : 'No se pudieron cargar tus guiones. Inténtalo de nuevo en un momento.';
    }
  }

  $('volver').addEventListener('click', async () => {
    if (hayCambiosSinEnviar()) {
      if (!(await preguntar('Tienes cambios sin enviar. Si sales ahora quedarán guardados en este dispositivo para recuperarlos luego. ¿Salir?', { si: 'Salir', no: 'Quedarme' }))) return;
      guardarBorrador();
    }
    location.hash = codigo;
  });
  window.addEventListener('hashchange', () => { if (guiones.length) enrutar(); });
  window.addEventListener('beforeunload', (e) => {
    if (!hayCambiosSinEnviar()) return;
    guardarBorrador();
    e.preventDefault();
    e.returnValue = '';
  });
  cargar();
})();

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
  function avisar(texto) {
    aviso.textContent = texto;
    aviso.classList.add('visible');
    clearTimeout(avisoTiempo);
    avisoTiempo = setTimeout(() => aviso.classList.remove('visible'), 2800);
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
      if (guion === actual) estadoGuardado('Guardado ✓');
      pintarLista();
    } catch (e) {
      if (e.estado === 409) resolverConflicto(guion, e.datos.guion);
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

  function pintarAvisos() {
    const caja = $('doc-avisos');
    caja.replaceChildren();
    let aviso = null;
    if (actual.aprobado) aviso = elemento('p', 'aviso-doc aprobado', `✓ El cliente aprobó este guión el ${fechaHora(actual.aprobado)}. `);
    else if (actual.editado_por === 'cliente') aviso = elemento('p', 'aviso-doc editado', `✎ El cliente hizo cambios en este guión el ${fechaHora(actual.actualizado)}. Todavía no lo ha aprobado. `);
    if (!aviso) return;
    if (actual.editado_por === 'cliente') {
      const ver = elemento('button', 'boton-texto', 'Ver qué cambió');
      ver.addEventListener('click', () => { verCambios = true; cambiarModo('leer'); });
      aviso.append(ver);
    }
    caja.append(aviso);
  }

  function pintarComentariosDoc(opciones = {}) {
    const cliente = Almacen.obtenerCliente(actual.cliente_id);
    const nombre = cliente?.nombre || 'Cliente';
    $('chat-nombre').textContent = nombre;
    $('chat-inicial').textContent = nombre.trim().charAt(0).toUpperCase();
    Chat.pintar($('doc-comentarios'), actual.comentarios || [], {
      yo: 'admin',
      nombres: { admin: 'aifotos', cliente: nombre },
      vacio: 'Aún no hay mensajes. Lo que escribas aquí le aparece al cliente en su link.',
      alTocarCita: verFrase,
      alFinal: opciones.alFinal,
    });
  }

  function citasDe(g) {
    return (g.comentarios || []).filter((c) => c.cita).map((c) => ({ id: c.id, bloque: c.cita.bloque, texto: c.cita.texto }));
  }

  // Muestra la frase comentada: en la vista del cliente sale resaltada; si ya
  // no está igual (porque se cambió), se señala el bloque donde estaba.
  function verFrase(c) {
    verCambios = false;
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

  function pintarLista() {
    const lista = $('lista');
    lista.replaceChildren();
    const clientes = Almacen.listarClientes();
    for (const c of clientes) {
      const guiones = Almacen.guionesDe(c.id);
      const grupo = elemento('li', 'grupo');
      const cabecera = elemento('button', 'grupo-cliente' + (clienteAbierto === c.id ? ' activo' : ''));
      cabecera.append(elemento('span', 'grupo-nombre', c.nombre));
      if (!c.activo) cabecera.append(elemento('small', 'grupo-apagado', 'link apagado'));
      if (guiones.some((g) => novedades(g).length)) cabecera.append(elemento('span', 'punto-nuevo'));
      cabecera.append(elemento('small', 'grupo-cuenta', String(guiones.length)));
      cabecera.addEventListener('click', () => { abrirCliente(c.id); cerrarLateral(); });
      grupo.append(cabecera);

      const sub = elemento('ul', 'lista-guiones');
      for (const g of guiones) {
        const li = elemento('li');
        const boton = elemento('button', 'lista-item' + (actual && g.id === actual.id ? ' activo' : ''));
        const titulo = elemento('span', 'lista-titulo', g.titulo || 'Guión sin título');
        boton.append(titulo, elemento('span', 'lista-info', infoGuion(g)));
        if (g.aprobado || novedades(g).length) boton.append(insignias(g));
        boton.addEventListener('click', () => { abrir(g.id); cerrarLateral(); });
        li.append(boton);
        sub.append(li);
      }
      grupo.append(sub);
      lista.append(grupo);
    }
    if (!clientes.length) lista.append(elemento('li', 'lista-vacia', 'Aún no hay clientes.'));
  }

  function fecha(ms) {
    return new Date(ms).toLocaleDateString('es', { day: 'numeric', month: 'short' });
  }

  // ---------- Abrir un guion o un cliente ----------

  function recordar(valor) {
    try { localStorage.setItem('guiones-creator:ultimo', valor); } catch {}
  }

  function mostrar(vista) {
    $('vacio').hidden = vista !== 'vacio';
    $('documento').hidden = vista !== 'documento';
    $('panel-cliente').hidden = vista !== 'cliente';
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
    mostrar(actual ? 'documento' : 'vacio');
    estadoGuardado('');
    if (actual) {
      normalizar(actual);
      recordar(`g:${actual.id}`);
      marcarVisto(actual);
      $('titulo').value = actual.titulo;
      pintarCabeceraCliente();
      pintarAvisos();
      pintarComentariosDoc({ alFinal: true });
      pintarEditor();
      cambiarModo(modo);
    }
    pintarLista();
  }

  function pintarCabeceraCliente() {
    const c = Almacen.obtenerCliente(actual.cliente_id);
    $('doc-cliente-nombre').textContent = c ? c.nombre : '';
    $('doc-copiar').hidden = !c || !c.activo;
  }

  // ---------- Panel del cliente y su link ----------

  function abrirCliente(id) {
    if (temporizador) guardarYa();
    Menu.ocultar();
    actual = null;
    clienteAbierto = id;
    recordar(`c:${id}`);
    mostrar('cliente');
    pintarPanelCliente();
    pintarLista();
  }

  function pintarPanelCliente() {
    const c = Almacen.obtenerCliente(clienteAbierto);
    if (!c) return abrir(null);
    $('cliente-nombre').value = c.nombre;
    $('link-url').value = Almacen.linkDe(c);
    $('link-caja').classList.toggle('apagado', !c.activo);
    $('estado-link').textContent = c.activo ? 'Activo' : 'Desactivado';
    $('estado-link').className = `estado-link ${c.activo ? 'activo' : 'inactivo'}`;
    $('link-ayuda').textContent = c.activo
      ? `Con este link, ${c.nombre} ve todos sus guiones. No necesita cuenta ni contraseña.`
      : 'Este link está desactivado: quien lo abra no verá nada. Actívalo otra vez o genera uno nuevo.';
    $('link-copiar').disabled = !c.activo;
    $('link-whatsapp').disabled = !c.activo;
    $('link-activar').textContent = c.activo ? 'Desactivar link' : 'Activar link';

    const ul = $('cliente-guiones');
    ul.replaceChildren();
    for (const g of Almacen.guionesDe(c.id)) {
      const li = elemento('li');
      const tarjeta = elemento('button', 'tarjeta');
      const titulo = elemento('span', 'tarjeta-titulo', g.titulo || 'Guión sin título');
      titulo.append(insignias(g));
      const quehizo = novedades(g);
      tarjeta.append(titulo, elemento('span', 'lista-info', infoGuion(g) + (quehizo.length ? ` · el cliente ${quehizo.join(', ')}` : '')));
      tarjeta.addEventListener('click', () => abrir(g.id));
      li.append(tarjeta);
      ul.append(li);
    }
    if (!ul.children.length) ul.append(elemento('li', 'lista-vacia', 'Este cliente aún no tiene guiones.'));
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

  function enviarWhatsApp(cliente) {
    const texto = `Hola, aquí puedes ver y revisar tus guiones: ${Almacen.linkDe(cliente)}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank', 'noopener');
  }

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

  function crearSelectorTipo(b) {
    const select = document.createElement('select');
    select.className = 'bloque-tipo';
    select.setAttribute('aria-label', 'Tipo de bloque');
    for (const tipo of Guion.FORMATOS[actual.formato].tipos) {
      const op = new Option(Guion.nombreTipo(tipo, actual.formato), tipo);
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
    fila.className = 'bloque-dialogo';
    const personaje = campo('bloque-personaje', b.personaje, cine ? 'PERSONAJE' : '¿Quién habla? (opcional)');
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
      const acotacion = campo('bloque-acotacion', b.acotacion, '(acotación, opcional)');
      acotacion.setAttribute('aria-label', 'Acotación');
      acotacion.addEventListener('input', () => { b.acotacion = acotacion.value; guardarLuego(); });
      acotacion.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); caja.querySelector('textarea').focus(); }
      });
      fila.append(acotacion);
    }
    return fila;
  }

  function pintarBloques(enfocarId) {
    const contenedor = $('bloques');
    contenedor.replaceChildren();
    let numeroEscena = 0;

    actual.bloques.forEach((b, i) => {
      const caja = document.createElement('div');
      caja.className = `bloque tipo-${b.tipo}`;
      caja.dataset.id = b.id;

      const cabecera = document.createElement('div');
      cabecera.className = 'bloque-cabecera';
      if (b.tipo === 'escena') {
        const numero = document.createElement('span');
        numero.className = 'bloque-numero';
        numero.textContent = ++numeroEscena;
        cabecera.append(numero);
      }
      const info = document.createElement('span');
      info.className = 'bloque-info';
      info.textContent = infoBloque(b);
      const acciones = document.createElement('span');
      acciones.className = 'bloque-acciones';
      acciones.append(
        botonPequeno('↑', 'Subir bloque', () => mover(i, -1)),
        botonPequeno('↓', 'Bajar bloque', () => mover(i, 1)),
        botonPequeno('✕', 'Eliminar bloque', () => eliminarBloque(i)),
      );
      cabecera.append(crearSelectorTipo(b), info, acciones);
      caja.append(cabecera);

      if (b.tipo === 'camara') caja.append(crearCamposDialogo(b, caja));

      const area = document.createElement('textarea');
      area.className = 'bloque-texto';
      area.rows = 1;
      area.value = b.texto;
      area.placeholder = b.tipo === 'escena' && actual.formato === 'cine'
        ? 'INT. LUGAR - DÍA (escribe int o ext)'
        : b.tipo === 'escena' ? 'Ej.: INT. Restaurante - DÍA, o Hook / Cierre'
        : b.tipo === 'camara' && actual.formato === 'cine' ? 'Lo que dice el personaje'
        : Guion.TIPOS[b.tipo].ayuda;
      area.addEventListener('input', () => {
        if (b.tipo === 'escena') {
          const prefijo = Sugerencias.autocompletarPrefijo(area.value);
          if (prefijo) area.value = prefijo;
        }
        b.texto = area.value;
        ajustarAltura(area);
        info.textContent = infoBloque(b);
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

      caja.append(area);
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
    $('dato-duracion').textContent = `⏱ ${Guion.formatoDuracion(est.segundos)}`;
    $('dato-palabras').textContent = `${est.palabras} palabras`;
  }

  function pintarBotonesAgregar() {
    const caja = $('agregar');
    caja.replaceChildren();
    for (const tipo of Guion.FORMATOS[actual.formato].tipos) {
      const boton = document.createElement('button');
      boton.className = `chip chip-${tipo}`;
      boton.textContent = Guion.nombreTipo(tipo, actual.formato);
      boton.addEventListener('click', () => insertar(actual.bloques.length, tipo));
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
    $('modo-leer').hidden = modo !== 'leer';
    $('cambios-barra').hidden = true;
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

  let verCambios = false;
  const cambiosGuardados = new Map(); // id del guion → { version, cambios }

  async function cambiosDe(g) {
    const guardado = cambiosGuardados.get(g.id);
    if (guardado && guardado.version === g.version) return guardado.cambios;
    const cambios = await Almacen.cambios(g.id);
    cambiosGuardados.set(g.id, { version: g.version, cambios });
    return cambios;
  }

  // Pinta la vista del cliente al momento y, si hay cambios del cliente, ofrece marcarlos.
  async function pintarLectura() {
    const guion = actual;
    Vista.render(guion, $('modo-leer'), { citas: citasDe(guion) });
    let cambios = null;
    try { cambios = await cambiosDe(guion); } catch { /* sin conexión: solo la vista normal */ }
    if (guion !== actual || modo !== 'leer') return;
    $('cambios-barra').hidden = !cambios && !verCambios;
    if (!cambios) {
      if (verCambios) {
        $('ver-cambios').checked = false;
        $('cambios-info').textContent = 'Todavía no hay cambios del cliente que comparar: los cambios que haga desde ahora se marcarán aquí (los de antes de esta función no se guardaron).';
      }
      return;
    }
    $('ver-cambios').checked = verCambios;
    $('cambios-info').textContent = !verCambios ? ''
      : cambios.vigente
        ? `Cambios que hizo el cliente, comparados con tu versión anterior. Última edición: ${fechaHora(cambios.despues.fecha)}.`
        : `Así dejó el cliente el guión el ${fechaHora(cambios.despues.fecha)}. Después lo cambiaste tú; desmarca la casilla para ver la versión actual.`;
    if (verCambios) {
      Vista.render({ ...guion, bloques: cambios.despues.bloques }, $('modo-leer'), {
        antes: new Map(cambios.antes.bloques.map((b) => [b.id, b.texto])),
      });
      $('modo-leer').querySelector('del, ins')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  $('ver-cambios').addEventListener('change', () => {
    verCambios = $('ver-cambios').checked;
    pintarLectura();
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
      caja.append(label);
    }
    $('nuevo-titulo').value = '';
    llenarClientes('nuevo');
    $('dialogo-nuevo').returnValue = '';
    $('dialogo-nuevo').showModal();
    $('nuevo-titulo').focus();
  }

  $('dialogo-nuevo').addEventListener('close', async () => {
    if ($('dialogo-nuevo').returnValue !== 'crear') return;
    const formato = document.querySelector('input[name="nuevo-formato"]:checked')?.value || 'video';
    const g = await crear('nuevo', $('nuevo-titulo').value.trim(), formato);
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

  function resumenPegado() {
    const texto = $('pegar-texto').value;
    $('pegar-crear').disabled = !texto.trim();
    if (!texto.trim()) { $('pegar-resumen').textContent = ''; return; }
    const formato = formatoPegado();
    const bloques = Guion.desdeTexto(texto, formato);
    const auto = $('pegar-formato').value === 'auto' ? 'Formato detectado' : 'Formato';
    let resumen = `${auto}: ${Guion.FORMATOS[formato].nombre}.`;
    if (formato !== 'sencillo') {
      const cuenta = {};
      for (const b of bloques) cuenta[b.tipo] = (cuenta[b.tipo] || 0) + 1;
      const partes = Guion.FORMATOS[formato].tipos.filter((t) => cuenta[t])
        .map((t) => `${cuenta[t]} ${Guion.nombreTipo(t, formato, cuenta[t] !== 1).toLowerCase()}`);
      const personajes = Guion.personajes({ bloques }).length;
      if (personajes) partes.push(`${personajes} personaje${personajes === 1 ? '' : 's'}`);
      resumen += ` Se detectaron: ${partes.join(', ')}.`;
    }
    $('pegar-resumen').textContent = resumen;
  }

  $('dialogo-pegar').addEventListener('close', () => {
    if ($('dialogo-pegar').returnValue !== 'crear') return;
    const formato = formatoPegado();
    crear('pegar', $('pegar-titulo').value.trim(), formato, Guion.desdeTexto($('pegar-texto').value, formato));
  });

  // ---------- Eliminar ----------

  $('borrar').addEventListener('click', async () => {
    if (!confirm(`¿Eliminar "${actual.titulo || 'Guión sin título'}"? No se puede deshacer.`)) return;
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
    if (!confirm(`¿Eliminar a "${c.nombre}"${aviso}? Su link dejará de funcionar. No se puede deshacer.`)) return;
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
  $('doc-copiar').addEventListener('click', () => copiarLink(Almacen.obtenerCliente(actual.cliente_id)));
  $('doc-cliente-nombre').addEventListener('click', () => abrirCliente(actual.cliente_id));

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
  });

  // ---------- Ver lo que hizo el cliente sin recargar ----------
  // Cada poco (y al volver a esta pestaña) se piden los datos de nuevo. Si estás
  // escribiendo, se espera a la siguiente vez para no interrumpirte.

  let refrescando = false;
  async function refrescar() {
    if (refrescando || document.hidden || !Almacen.haySesion() || $('marco').hidden || hayCambiosSinGuardar()) return;
    if (document.querySelector('dialog[open]')) return;
    refrescando = true;
    try {
      const antes = actual;
      await Almacen.cargar();
      if (antes) {
        const nuevo = Almacen.obtener(antes.id);
        if (!nuevo) { abrir(null); return; }
        if (nuevo.version === antes.version) {
          // Nada cambió: se conserva el mismo objeto (y lo que hay en pantalla).
          antes.comentarios = nuevo.comentarios;
          antes.aprobado = nuevo.aprobado;
          Almacen.reemplazar(antes);
          pintarAvisos();
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
  window.addEventListener('focus', refrescar);
  document.addEventListener('visibilitychange', refrescar);

  // ---------- Móvil ----------

  function cerrarLateral() { $('lateral').classList.remove('abierto'); }

  // ---------- Entrar ----------

  function mostrarAcceso(mensaje = '') {
    $('marco').hidden = true;
    $('salir').hidden = true;
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

    let ultimo = null;
    try { ultimo = localStorage.getItem('guiones-creator:ultimo'); } catch {}
    const [tipo, id] = (ultimo || '').split(':');
    if (tipo === 'g' && Almacen.obtener(id)) abrir(id);
    else if (tipo === 'c' && Almacen.obtenerCliente(id)) abrirCliente(id);
    else if (Almacen.listarClientes().length) abrirCliente(Almacen.listarClientes()[0].id);
    else abrir(null);
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
  $('nuevo-cliente').addEventListener('click', nuevoCliente);
  ['nuevo', 'pegar'].forEach((d) => $(`${d}-cliente`).addEventListener('change', () => alternarClienteNuevo(d)));
  document.querySelectorAll('[data-accion]').forEach((b) =>
    b.addEventListener('click', () => (b.dataset.accion === 'nuevo' ? abrirNuevo() : abrirPegar())));
  document.querySelectorAll('.pestana').forEach((p) => p.addEventListener('click', () => cambiarModo(p.dataset.modo)));
  $('abrir-lista').addEventListener('click', () => $('lateral').classList.toggle('abierto'));
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

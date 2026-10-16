// Pantalla principal: lista de guiones, editor por bloques (o texto libre en
// el formato sencillo), sugerencias y vista del cliente.
(() => {
  const $ = (id) => document.getElementById(id);

  let actual = null;      // guión abierto
  let modo = 'editar';    // 'editar' | 'leer'
  let temporizador = null;

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

  function guardarYa() {
    clearTimeout(temporizador);
    temporizador = null;
    if (!actual) return;
    const ok = Almacen.guardar(actual);
    $('guardado').textContent = ok ? 'Guardado ✓' : 'No se pudo guardar';
    $('guardado').classList.toggle('error', !ok);
    pintarLista();
  }

  function guardarLuego() {
    $('guardado').textContent = 'Guardando…';
    $('guardado').classList.remove('error');
    clearTimeout(temporizador);
    temporizador = setTimeout(guardarYa, 600);
  }

  // ---------- Lista lateral ----------

  function pintarLista() {
    const guiones = Almacen.listar();
    const lista = $('lista');
    lista.replaceChildren();
    for (const g of guiones) {
      const li = document.createElement('li');
      const boton = document.createElement('button');
      boton.className = 'lista-item' + (actual && g.id === actual.id ? ' activo' : '');
      const titulo = document.createElement('span');
      titulo.className = 'lista-titulo';
      titulo.textContent = g.titulo || 'Guión sin título';
      const info = document.createElement('span');
      info.className = 'lista-info';
      const formato = Guion.FORMATOS[g.formato || 'video'].nombre;
      info.textContent = `${formato} · ${Guion.formatoDuracion(Guion.estadisticas(g.bloques).segundos)} · ${fecha(g.actualizado)}`;
      boton.append(titulo, info);
      boton.addEventListener('click', () => { abrir(g.id); cerrarLateral(); });
      li.append(boton);
      lista.append(li);
    }
    if (!guiones.length) {
      const li = document.createElement('li');
      li.className = 'lista-vacia';
      li.textContent = 'Aún no hay guiones.';
      lista.append(li);
    }
  }

  function fecha(ms) {
    return new Date(ms).toLocaleDateString('es', { day: 'numeric', month: 'short' });
  }

  // ---------- Abrir / crear ----------

  // Guiones de la Fase 1 no tenían formato; el formato sencillo es un único texto.
  function normalizar(g) {
    if (!g.formato) g.formato = 'video';
    if (g.formato === 'sencillo' && (g.bloques.length !== 1 || g.bloques[0].tipo !== 'parrafo')) {
      g.bloques = Guion.convertir(g.bloques, 'sencillo');
    }
    return g;
  }

  function abrir(id) {
    if (temporizador) guardarYa();
    Menu.ocultar();
    actual = id ? Almacen.obtener(id) : null;
    if (actual) {
      normalizar(actual);
      try { localStorage.setItem('guiones-creator:ultimo', actual.id); } catch {}
    }
    $('vacio').hidden = !!actual;
    $('documento').hidden = !actual;
    $('guardado').textContent = '';
    if (actual) {
      $('titulo').value = actual.titulo;
      pintarEditor();
      cambiarModo(modo);
    }
    pintarLista();
  }

  function crear(titulo, formato, bloques) {
    try { localStorage.setItem('guiones-creator:formato', formato); } catch {}
    const g = Almacen.crear(titulo, bloques || BLOQUES_INICIALES[formato](), formato);
    modo = 'editar';
    abrir(g.id);
    return g;
  }

  function formatoPreferido() {
    try { return localStorage.getItem('guiones-creator:formato') || 'video'; } catch { return 'video'; }
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
    if (modo === 'leer') Vista.render(actual, $('modo-leer'));
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
    if (modo === 'leer') Vista.render(actual, $('modo-leer'));
    else document.querySelectorAll('#modo-editar textarea').forEach(ajustarAltura);
  }

  // ---------- Nuevo guión ----------

  function abrirNuevo() {
    const caja = $('nuevo-formatos');
    const preferido = formatoPreferido();
    caja.replaceChildren();
    for (const [clave, f] of Object.entries(Guion.FORMATOS)) {
      const label = document.createElement('label');
      label.className = 'formato-opcion';
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'nuevo-formato';
      radio.value = clave;
      radio.checked = clave === preferido;
      const nombre = document.createElement('b');
      nombre.textContent = f.nombre;
      const desc = document.createElement('span');
      desc.textContent = f.descripcion;
      label.append(radio, nombre, desc);
      caja.append(label);
    }
    $('nuevo-titulo').value = '';
    $('dialogo-nuevo').returnValue = '';
    $('dialogo-nuevo').showModal();
    $('nuevo-titulo').focus();
  }

  $('dialogo-nuevo').addEventListener('close', () => {
    if ($('dialogo-nuevo').returnValue !== 'crear') return;
    const formato = document.querySelector('input[name="nuevo-formato"]:checked')?.value || 'video';
    crear($('nuevo-titulo').value.trim(), formato);
    $(formato === 'sencillo' ? 'sencillo' : 'titulo').focus();
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
    crear($('pegar-titulo').value.trim(), formato, Guion.desdeTexto($('pegar-texto').value, formato));
  });

  // ---------- Eliminar ----------

  $('borrar').addEventListener('click', () => {
    if (!confirm(`¿Eliminar "${actual.titulo || 'Guión sin título'}"? No se puede deshacer.`)) return;
    clearTimeout(temporizador);
    temporizador = null;
    Almacen.borrar(actual.id);
    const siguiente = Almacen.listar()[0];
    abrir(siguiente ? siguiente.id : null);
    avisar('Guión eliminado');
  });

  // ---------- Móvil ----------

  function cerrarLateral() { $('lateral').classList.remove('abierto'); }

  // ---------- Arranque ----------

  llenarSelectorFormato($('formato'), false);
  llenarSelectorFormato($('pegar-formato'), true);
  $('nuevo').addEventListener('click', abrirNuevo);
  $('pegar').addEventListener('click', abrirPegar);
  document.querySelectorAll('[data-accion]').forEach((b) =>
    b.addEventListener('click', () => (b.dataset.accion === 'nuevo' ? abrirNuevo() : abrirPegar())));
  document.querySelectorAll('.pestana').forEach((p) => p.addEventListener('click', () => cambiarModo(p.dataset.modo)));
  $('abrir-lista').addEventListener('click', () => $('lateral').classList.toggle('abierto'));
  $('titulo').addEventListener('input', () => { actual.titulo = $('titulo').value; guardarLuego(); });
  $('pegar-texto').addEventListener('input', resumenPegado);
  $('pegar-formato').addEventListener('change', resumenPegado);
  window.addEventListener('resize', () => Menu.ocultar());
  window.addEventListener('beforeunload', () => { if (temporizador) guardarYa(); });

  let ultimo = null;
  try { ultimo = localStorage.getItem('guiones-creator:ultimo'); } catch {}
  const inicial = (ultimo && Almacen.obtener(ultimo)) || Almacen.listar()[0];
  abrir(inicial ? inicial.id : null);
})();

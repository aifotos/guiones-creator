// Pantalla principal: lista de guiones, editor por bloques y vista del cliente.
(() => {
  const $ = (id) => document.getElementById(id);
  const ORDEN_TIPOS = ['escena', 'camara', 'voz', 'pantalla', 'nota'];

  let actual = null;      // guión abierto
  let modo = 'editar';    // 'editar' | 'leer'
  let temporizador = null;

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
      info.textContent = `${Guion.formatoDuracion(Guion.estadisticas(g.bloques).segundos)} · ${fecha(g.actualizado)}`;
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

  function abrir(id) {
    if (temporizador) guardarYa();
    actual = id ? Almacen.obtener(id) : null;
    if (actual) { try { localStorage.setItem('guiones-creator:ultimo', actual.id); } catch {} }
    $('vacio').hidden = !!actual;
    $('documento').hidden = !actual;
    $('guardado').textContent = '';
    if (actual) {
      $('titulo').value = actual.titulo;
      pintarBloques();
      cambiarModo(modo);
    }
    pintarLista();
  }

  function nuevo() {
    const g = Almacen.crear('', [Guion.nuevoBloque('escena'), Guion.nuevoBloque('camara')]);
    modo = 'editar';
    abrir(g.id);
    $('titulo').focus();
  }

  // ---------- Editor por bloques ----------

  function crearSelectorTipo(b) {
    const select = document.createElement('select');
    select.className = 'bloque-tipo';
    select.setAttribute('aria-label', 'Tipo de bloque');
    for (const tipo of ORDEN_TIPOS) {
      const op = new Option(Guion.TIPOS[tipo].nombre, tipo);
      op.selected = tipo === b.tipo;
      select.append(op);
    }
    select.addEventListener('change', () => {
      b.tipo = select.value;
      pintarBloques();
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

      const area = document.createElement('textarea');
      area.className = 'bloque-texto';
      area.rows = 1;
      area.value = b.texto;
      area.placeholder = Guion.TIPOS[b.tipo].ayuda;
      area.addEventListener('input', () => {
        b.texto = area.value;
        ajustarAltura(area);
        info.textContent = infoBloque(b);
        pintarDatos();
        guardarLuego();
      });
      area.addEventListener('keydown', (e) => teclaEnBloque(e, i, area));

      caja.append(cabecera, area);
      contenedor.append(caja);
    });

    // La altura solo se puede medir cuando ya están en pantalla.
    contenedor.querySelectorAll('textarea').forEach(ajustarAltura);
    if (enfocarId) {
      const area = contenedor.querySelector(`[data-id="${enfocarId}"] textarea`);
      if (area) { area.focus(); area.setSelectionRange(area.value.length, area.value.length); }
    }
    pintarDatos();
  }

  function teclaEnBloque(e, i, area) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      const tipo = actual.bloques[i].tipo === 'escena' ? 'camara' : actual.bloques[i].tipo;
      insertar(i + 1, tipo);
    } else if (e.key === 'Backspace' && area.value === '' && actual.bloques.length > 1) {
      e.preventDefault();
      const anterior = actual.bloques[i - 1] || actual.bloques[i + 1];
      actual.bloques.splice(i, 1);
      pintarBloques(anterior.id);
      guardarLuego();
    }
  }

  function insertar(posicion, tipo) {
    const b = Guion.nuevoBloque(tipo);
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
    pintarBloques();
    guardarLuego();
  }

  function pintarDatos() {
    const est = Guion.estadisticas(actual.bloques);
    $('dato-duracion').textContent = `⏱ ${Guion.formatoDuracion(est.segundos)}`;
    $('dato-palabras').textContent = `${est.palabras} palabras`;
  }

  function pintarBotonesAgregar() {
    const caja = $('agregar');
    for (const tipo of ORDEN_TIPOS) {
      const boton = document.createElement('button');
      boton.className = `chip chip-${tipo}`;
      boton.textContent = Guion.TIPOS[tipo].nombre;
      boton.addEventListener('click', () => insertar(actual.bloques.length, tipo));
      caja.append(boton);
    }
  }

  // ---------- Editar / Vista del cliente ----------

  function cambiarModo(nuevoModo) {
    modo = nuevoModo;
    document.querySelectorAll('.pestana').forEach((p) => p.classList.toggle('activa', p.dataset.modo === modo));
    $('modo-editar').hidden = modo !== 'editar';
    $('modo-leer').hidden = modo !== 'leer';
    if (modo === 'leer') Vista.render(actual, $('modo-leer'));
    else document.querySelectorAll('#bloques textarea').forEach(ajustarAltura);
  }

  // ---------- Pegar un guión ----------

  function abrirPegar() {
    $('pegar-titulo').value = '';
    $('pegar-texto').value = '';
    resumenPegado();
    $('dialogo-pegar').returnValue = '';  // si se cierra con Esc no debe repetir el último "Crear"
    $('dialogo-pegar').showModal();
    $('pegar-texto').focus();
  }

  function resumenPegado() {
    const bloques = Guion.desdeTexto($('pegar-texto').value);
    $('pegar-crear').disabled = !bloques.length;
    if (!bloques.length) { $('pegar-resumen').textContent = ''; return; }
    const cuenta = {};
    for (const b of bloques) cuenta[b.tipo] = (cuenta[b.tipo] || 0) + 1;
    const partes = ORDEN_TIPOS.filter((t) => cuenta[t]).map((t) => `${cuenta[t]} ${(cuenta[t] === 1 ? Guion.TIPOS[t].nombre : Guion.TIPOS[t].plural).toLowerCase()}`);
    $('pegar-resumen').textContent = `Se detectaron: ${partes.join(', ')}.`;
  }

  function crearDesdePegado() {
    const bloques = Guion.desdeTexto($('pegar-texto').value);
    if (!bloques.length) return;
    const g = Almacen.crear($('pegar-titulo').value.trim(), bloques);
    modo = 'editar';
    abrir(g.id);
  }

  // ---------- Móvil ----------

  function cerrarLateral() { $('lateral').classList.remove('abierto'); }

  // ---------- Arranque ----------

  $('nuevo').addEventListener('click', nuevo);
  $('pegar').addEventListener('click', abrirPegar);
  document.querySelectorAll('[data-accion]').forEach((b) =>
    b.addEventListener('click', () => (b.dataset.accion === 'nuevo' ? nuevo() : abrirPegar())));
  document.querySelectorAll('.pestana').forEach((p) => p.addEventListener('click', () => cambiarModo(p.dataset.modo)));
  $('abrir-lista').addEventListener('click', () => $('lateral').classList.toggle('abierto'));

  $('titulo').addEventListener('input', () => { actual.titulo = $('titulo').value; guardarLuego(); });
  $('borrar').addEventListener('click', () => {
    if (!confirm(`¿Eliminar "${actual.titulo || 'Guión sin título'}"? No se puede deshacer.`)) return;
    clearTimeout(temporizador);
    temporizador = null;
    Almacen.borrar(actual.id);
    const siguiente = Almacen.listar()[0];
    abrir(siguiente ? siguiente.id : null);
  });

  $('pegar-texto').addEventListener('input', resumenPegado);
  $('dialogo-pegar').addEventListener('close', () => {
    if ($('dialogo-pegar').returnValue === 'crear') crearDesdePegado();
  });

  window.addEventListener('beforeunload', () => { if (temporizador) guardarYa(); });

  pintarBotonesAgregar();
  let ultimo = null;
  try { ultimo = localStorage.getItem('guiones-creator:ultimo'); } catch {}
  const inicial = (ultimo && Almacen.obtener(ultimo)) || Almacen.listar()[0];
  abrir(inicial ? inicial.id : null);
})();

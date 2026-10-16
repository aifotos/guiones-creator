// Página que abre el cliente con su link (cliente.html#<código secreto>).
// El código va después de "#", así que nunca llega a los servidores de GitHub.
// Aquí el cliente lee sus guiones, cambia los textos, los aprueba y comenta.
(() => {
  const $ = (id) => document.getElementById(id);
  const codigo = location.hash.slice(1).split('/')[0];
  const base = `${CONFIG.api}/api/c/${encodeURIComponent(codigo)}`;

  let guiones = [];
  let actual = null;      // guion abierto
  let editando = false;
  let temporizador = null;
  let guardando = false;
  let otraVez = false;    // hubo cambios mientras se guardaba

  function el(etiqueta, clase, texto) {
    const nodo = document.createElement(etiqueta);
    if (clase) nodo.className = clase;
    if (texto != null) nodo.textContent = texto;
    return nodo;
  }

  const fecha = (ms) => new Date(ms).toLocaleDateString('es', { day: 'numeric', month: 'long' });
  const fechaHora = (ms) => new Date(ms).toLocaleString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

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
    const lista = $('lista');
    lista.replaceChildren(el('h1', 'cliente-titulo', 'Tus guiones'));
    for (const g of guiones) {
      const tarjeta = el('a', 'tarjeta');
      tarjeta.href = `#${codigo}/${g.id}`;
      const titulo = el('span', 'tarjeta-titulo', g.titulo || 'Guión sin título');
      titulo.append(el('span', `insignia ${g.aprobado ? 'aprobado' : 'pendiente'}`, g.aprobado ? 'Aprobado ✓' : 'Por revisar'));
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
    Vista.render(actual, $('lectura'), { editable: editando, alCambiar: guardarLuego, citas: citasDe(actual) });
    pintarEstado();
    pintarComentarios();
  }

  function pintarEstado() {
    const estado = $('estado-guion');
    estado.textContent = actual.aprobado ? `✓ Aprobaste este guión el ${fecha(actual.aprobado)}` : 'Pendiente de tu revisión';
    estado.className = `estado-guion ${actual.aprobado ? 'aprobado' : 'pendiente'}`;
    $('editar').querySelector('span').textContent = editando ? 'Listo' : 'Editar';
    $('editar').classList.toggle('activa', editando);
    $('aprobar').hidden = !!actual.aprobado || editando;
    $('ayuda-edicion').hidden = !editando;
    $('pista-seleccion').hidden = editando;
  }

  function mostrarGuion(g) {
    if (actual && actual !== g && hayCambios()) guardarYa();
    actual = g;
    editando = false;
    $('lista').hidden = true;
    $('volver').hidden = guiones.length < 2;
    $('guardado').textContent = '';
    pintarGuion();
    $('guion').hidden = false;
    $('acciones').hidden = false;
    document.title = `${g.titulo || 'Guión'} · aifotos`;
    window.scrollTo(0, 0);
  }

  // ---------- Editar ----------

  function hayCambios() { return !!temporizador || guardando; }

  function estadoGuardado(texto, error = false) {
    $('guardado').textContent = texto;
    $('guardado').classList.toggle('error', error);
  }

  function guardarLuego() {
    estadoGuardado('Guardando…');
    clearTimeout(temporizador);
    temporizador = setTimeout(guardarYa, 900);
  }

  async function guardarYa() {
    clearTimeout(temporizador);
    temporizador = null;
    if (guardando) { otraVez = true; return; }
    guardando = true;
    const guion = actual;
    try {
      const nueva = await pedir('PUT', `/guiones/${guion.id}`, {
        version: guion.version,
        bloques: guion.bloques.map(({ id, tipo, texto }) => ({ id, tipo, texto })),
      });
      guion.version = nueva.version;
      guion.actualizado = nueva.actualizado;
      const quitoAprobacion = guion.aprobado && !nueva.aprobado;
      guion.aprobado = nueva.aprobado;
      if (guion === actual) {
        estadoGuardado('Guardado ✓');
        if (quitoAprobacion) pintarEstado();
      }
    } catch (e) {
      if (e.estado === 409) {
        // aifotos lo cambió mientras tanto: se muestra su versión.
        reemplazar(e.datos.guion);
        estadoGuardado('');
        alert('aifotos acaba de actualizar este guión, así que te mostramos la versión nueva. Si cambiaste algo hace unos segundos, revisa que siga ahí.');
      } else {
        estadoGuardado('Sin conexión · reintentando…', true);
        temporizador = setTimeout(guardarYa, 4000);
      }
    } finally {
      guardando = false;
      if (otraVez) { otraVez = false; guardarYa(); }
    }
  }

  function reemplazar(nueva) {
    const i = guiones.findIndex((g) => g.id === nueva.id);
    if (i >= 0) guiones[i] = nueva;
    if (actual && actual.id === nueva.id) { actual = nueva; pintarGuion(); }
  }

  $('editar').addEventListener('click', async () => {
    if (editando) {
      editando = false;
      if (hayCambios()) await guardarYa();
      pintarGuion();
      return;
    }
    if (actual.aprobado && !confirm('Ya aprobaste este guión. Si cambias algo, tendrás que volver a aprobarlo. ¿Quieres editarlo?')) return;
    editando = true;
    pintarGuion();
    $('lectura').querySelector('textarea')?.focus({ preventScroll: true });
  });

  // ---------- Aprobar ----------

  $('aprobar').addEventListener('click', async () => {
    if (!confirm('¿Aprobar este guión? aifotos sabrá que estás de acuerdo con el texto.')) return;
    if (hayCambios()) await guardarYa();
    try {
      const { aprobado } = await pedir('POST', `/guiones/${actual.id}/aprobar`);
      actual.aprobado = aprobado;
      pintarEstado();
    } catch (e) {
      alert(`No se pudo aprobar: ${e.message}`);
    }
  });

  // ---------- Comentarios ----------

  function pintarComentarios() {
    const lista = $('comentarios-lista');
    lista.replaceChildren();
    const comentarios = actual.comentarios || [];
    for (const c of comentarios) {
      const li = el('li', `comentario${c.autor === 'cliente' ? ' propio' : ''}`);
      li.dataset.id = c.id;
      const cabecera = el('div', 'comentario-cabecera');
      cabecera.append(el('b', '', c.autor === 'cliente' ? 'Tú' : 'aifotos'), el('small', '', fechaHora(c.creado)));
      li.append(cabecera);
      if (c.cita) {
        const cita = el('blockquote', 'cita', `“${c.cita.texto}”`);
        cita.title = 'Ver en el guión';
        cita.addEventListener('click', () => irA($('lectura').querySelector(`mark[data-comentario="${c.id}"]`)));
        li.append(cita);
      }
      li.append(el('p', 'comentario-texto', c.texto));
      lista.append(li);
    }
    $('contador').textContent = comentarios.length || '';
    if (!lista.children.length) lista.append(el('li', 'lista-vacia', 'Aún no hay comentarios. Selecciona una frase del guión para comentarla, o escribe aquí abajo.'));
  }

  $('form-comentario').addEventListener('submit', async (e) => {
    e.preventDefault();
    const texto = $('comentario-texto').value.trim();
    if (!texto) return $('comentario-texto').focus();
    $('comentario-enviar').disabled = true;
    const enviado = await comentar({ texto });
    $('comentario-enviar').disabled = false;
    if (enviado) $('comentario-texto').value = '';
  });

  async function comentar(datos) {
    try {
      const comentario = await pedir('POST', `/guiones/${actual.id}/comentarios`, datos);
      (actual.comentarios ||= []).push(comentario);
      return comentario;
    } catch (err) {
      alert(`No se pudo enviar el comentario: ${err.message}`);
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

  // Tocar una frase resaltada lleva a su comentario.
  $('lectura').addEventListener('click', (e) => {
    const marca = e.target.closest('mark[data-comentario]');
    if (marca) irA($('comentarios-lista').querySelector(`[data-id="${marca.dataset.comentario}"]`));
  });

  // ---------- Comentar una frase seleccionada ----------

  let seleccion = null;     // { texto, bloque }
  let esperaSeleccion = null;

  function ocultarBurbuja() {
    $('burbuja').hidden = true;
    seleccion = null;
  }

  function revisarSeleccion() {
    const sel = window.getSelection();
    if (editando || !actual || $('guion').hidden || !sel.rangeCount || sel.isCollapsed) return ocultarBurbuja();
    const texto = sel.toString().trim();
    const nodo = sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement;
    if (texto.length < 2 || !$('lectura').contains(nodo)) return ocultarBurbuja();
    seleccion = { texto: texto.slice(0, 600), bloque: nodo.closest('[data-bloque]')?.dataset.bloque || '' };

    const caja = sel.getRangeAt(0).getBoundingClientRect();
    const burbuja = $('burbuja');
    burbuja.hidden = false;
    const ancho = burbuja.offsetWidth;
    const izquierda = Math.min(Math.max(caja.left + caja.width / 2 - ancho / 2, 12), document.documentElement.clientWidth - ancho - 12);
    burbuja.style.left = `${izquierda + window.scrollX}px`;
    burbuja.style.top = `${caja.bottom + window.scrollY + 10}px`;
  }

  document.addEventListener('selectionchange', () => {
    clearTimeout(esperaSeleccion);
    esperaSeleccion = setTimeout(revisarSeleccion, 120);
  });

  // pointerdown (no click): en el celular, tocar fuera borra la selección antes del click.
  $('burbuja').addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (!seleccion) return;
    const elegido = seleccion;
    $('cita-texto').textContent = `“${elegido.texto}”`;
    $('cita-comentario').value = '';
    $('dialogo-cita').returnValue = '';
    $('dialogo-cita').dataset.texto = elegido.texto;
    $('dialogo-cita').dataset.bloque = elegido.bloque;
    ocultarBurbuja();
    $('dialogo-cita').showModal();
    $('cita-comentario').focus();
  });

  $('dialogo-cita').addEventListener('close', async () => {
    const dialogo = $('dialogo-cita');
    if (dialogo.returnValue !== 'enviar') return;
    const comentario = await comentar({
      texto: $('cita-comentario').value.trim(),
      cita: { texto: dialogo.dataset.texto, bloque: dialogo.dataset.bloque },
    });
    if (!comentario) return;
    window.getSelection().removeAllRanges();
    pintarGuion();
    irA($('comentarios-lista').querySelector(`[data-id="${comentario.id}"]`));
  });

  // ---------- Navegación ----------

  // "#codigo" muestra la lista (o el único guion); "#codigo/idGuion" abre ese guion.
  function enrutar() {
    const [, id] = location.hash.slice(1).split('/');
    const g = guiones.find((x) => x.id === id);
    if (g) mostrarGuion(g);
    else if (guiones.length === 1) mostrarGuion(guiones[0]);
    else mostrarLista();
  }

  async function cargar() {
    if (!codigo) { $('estado').textContent = 'Este link no es válido. Pide uno nuevo a aifotos.'; return; }
    try {
      const datos = await pedir('GET', '');
      guiones = datos.guiones;
      $('saludo').textContent = datos.cliente.nombre;
      $('saludo').hidden = false;
      if (!guiones.length) { $('estado').textContent = 'Todavía no hay guiones aquí.'; return; }
      $('estado').hidden = true;
      enrutar();
    } catch (e) {
      $('estado').textContent = e.estado === 404
        ? 'Este link no existe o fue desactivado. Pide uno nuevo a aifotos.'
        : e.estado === 0
          ? 'Sin conexión a internet. Revisa tu conexión y recarga la página.'
          : 'No se pudieron cargar tus guiones. Inténtalo de nuevo en un momento.';
    }
  }

  $('volver').addEventListener('click', () => { location.hash = codigo; });
  window.addEventListener('hashchange', () => { if (guiones.length) enrutar(); });
  window.addEventListener('beforeunload', (e) => {
    if (!hayCambios()) return;
    guardarYa();
    e.preventDefault();
    e.returnValue = '';
  });
  cargar();
})();

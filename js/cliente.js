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

  function pintarGuion() {
    Vista.render(actual, $('lectura'), { editable: editando, alCambiar: guardarLuego });
    pintarEstado();
    pintarComentarios();
  }

  function pintarEstado() {
    const estado = $('estado-guion');
    estado.textContent = actual.aprobado ? `✓ Aprobaste este guión el ${fecha(actual.aprobado)}` : 'Pendiente de tu revisión';
    estado.className = `estado-guion ${actual.aprobado ? 'aprobado' : 'pendiente'}`;
    $('editar').textContent = editando ? 'Listo' : 'Editar';
    $('editar').classList.toggle('boton-principal', editando);
    $('aprobar').hidden = !!actual.aprobado || editando;
    $('ayuda-edicion').hidden = !editando;
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
    for (const c of actual.comentarios || []) {
      const li = el('li', `comentario${c.autor === 'cliente' ? ' propio' : ''}`);
      const cabecera = el('div', 'comentario-cabecera');
      cabecera.append(el('b', '', c.autor === 'cliente' ? 'Tú' : 'aifotos'), el('small', '', fechaHora(c.creado)));
      li.append(cabecera, el('p', 'comentario-texto', c.texto));
      lista.append(li);
    }
    if (!lista.children.length) lista.append(el('li', 'lista-vacia', 'Aún no hay comentarios. ¿Algo que quieras cambiar o preguntar?'));
  }

  $('form-comentario').addEventListener('submit', async (e) => {
    e.preventDefault();
    const texto = $('comentario-texto').value.trim();
    if (!texto) return $('comentario-texto').focus();
    $('comentario-enviar').disabled = true;
    try {
      const comentario = await pedir('POST', `/guiones/${actual.id}/comentarios`, { texto });
      (actual.comentarios ||= []).push(comentario);
      $('comentario-texto').value = '';
      pintarComentarios();
    } catch (err) {
      alert(`No se pudo enviar el comentario: ${err.message}`);
    } finally {
      $('comentario-enviar').disabled = false;
    }
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

// Página que abre el cliente con su link (cliente.html#<código secreto>).
// El código va después de "#", así que nunca llega a los servidores de GitHub.
(() => {
  const $ = (id) => document.getElementById(id);
  const codigo = location.hash.slice(1).split('/')[0];
  let guiones = [];

  function el(etiqueta, clase, texto) {
    const nodo = document.createElement(etiqueta);
    if (clase) nodo.className = clase;
    if (texto != null) nodo.textContent = texto;
    return nodo;
  }

  function fecha(ms) {
    return new Date(ms).toLocaleDateString('es', { day: 'numeric', month: 'long' });
  }

  function mostrarLista() {
    $('guion').hidden = true;
    const lista = $('lista');
    lista.replaceChildren(el('h1', 'cliente-titulo', 'Tus guiones'));
    for (const g of guiones) {
      const tarjeta = el('a', 'tarjeta');
      tarjeta.href = `#${codigo}/${g.id}`;
      tarjeta.append(
        el('span', 'tarjeta-titulo', g.titulo || 'Guión sin título'),
        el('span', 'lista-info', `${Guion.formatoDuracion(Guion.estadisticas(g.bloques).segundos)} · actualizado el ${fecha(g.actualizado)}`),
      );
      lista.append(tarjeta);
    }
    lista.hidden = false;
    window.scrollTo(0, 0);
  }

  function mostrarGuion(g) {
    $('lista').hidden = true;
    $('volver').hidden = guiones.length < 2;
    Vista.render(g, $('lectura'));
    $('guion').hidden = false;
    document.title = `${g.titulo || 'Guión'} · aifotos`;
    window.scrollTo(0, 0);
  }

  // "#token" muestra la lista (o el único guion); "#token/idGuion" abre ese guion.
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
      const r = await fetch(`${CONFIG.api}/api/c/${encodeURIComponent(codigo)}`);
      const datos = await r.json().catch(() => ({}));
      if (!r.ok) {
        $('estado').textContent = r.status === 404
          ? 'Este link no existe o fue desactivado. Pide uno nuevo a aifotos.'
          : 'No se pudieron cargar tus guiones. Inténtalo de nuevo en un momento.';
        return;
      }
      guiones = datos.guiones;
      $('saludo').textContent = datos.cliente.nombre;
      if (!guiones.length) { $('estado').textContent = 'Todavía no hay guiones aquí.'; return; }
      $('estado').hidden = true;
      enrutar();
    } catch {
      $('estado').textContent = 'Sin conexión a internet. Revisa tu conexión y recarga la página.';
    }
  }

  $('volver').addEventListener('click', () => { location.hash = codigo; });
  window.addEventListener('hashchange', () => { if (guiones.length) enrutar(); });
  cargar();
})();

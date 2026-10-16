// Vista de lectura: cómo ve el cliente el guion (rediseño v2). La usan la página
// del cliente y la pestaña "Vista del cliente" del panel.
// Con { editable: true } cada línea se convierte en un campo para cambiarla.
// Con { citas: [{ id, bloque, texto }] } las frases comentadas salen resaltadas.
// Con { antes: Map(idBloque → texto anterior) } se marcan los cambios:
// tachado lo que se borró y en verde lo que se añadió.
const Vista = (() => {
  let edicion = null; // { alCambiar } mientras se pinta en modo edición
  let citas = [];     // frases comentadas, mientras se pinta para leer
  let antes = null;   // textos anteriores, mientras se pintan los cambios

  // Un bloque se muestra si tiene texto, o si lo tenía antes (el cliente lo vació).
  const tieneTexto = (b) => !!b.texto.trim() || !!(antes && (antes.get(b.id) || '').trim());

  function el(etiqueta, clase, texto) {
    const nodo = document.createElement(etiqueta);
    if (clase) nodo.className = clase;
    if (texto != null) nodo.textContent = texto;
    return nodo;
  }

  function ajustarAltura(area) {
    area.style.height = 'auto';
    area.style.height = area.scrollHeight + 'px';
  }

  // Pinta el texto marcando lo borrado y lo nuevo respecto a la versión anterior.
  function marcarCambios(nodo, b) {
    const anterior = antes.has(b.id) ? antes.get(b.id) : '';
    for (const parte of Diferencias.comparar(anterior, b.texto)) {
      if (parte.tipo === 'igual') nodo.append(parte.texto);
      else nodo.append(el(parte.tipo === 'borrado' ? 'del' : 'ins', `cambio-${parte.tipo}`, parte.texto));
    }
  }

  // Envuelve en <mark> cada frase comentada que aparezca en el texto del bloque.
  function resaltar(nodo, b) {
    const propias = citas.filter((c) => c.texto && (c.bloque === b.id || !c.bloque));
    let resto = b.texto;
    while (propias.length && resto) {
      let mejor = null;
      for (const c of propias) {
        const i = resto.indexOf(c.texto);
        if (i >= 0 && (!mejor || i < mejor.i)) mejor = { i, c };
      }
      if (!mejor) break;
      if (mejor.i) nodo.append(resto.slice(0, mejor.i));
      const marca = el('mark', 'marca-comentario', mejor.c.texto);
      marca.dataset.comentario = mejor.c.id;
      nodo.append(marca);
      resto = resto.slice(mejor.i + mejor.c.texto.length);
      propias.splice(propias.indexOf(mejor.c), 1);
    }
    if (resto) nodo.append(resto);
  }

  // El texto de un bloque: fijo para leer, o un campo para editar.
  function texto(b, clase) {
    if (!edicion) {
      const nodo = el('span', clase);
      nodo.dataset.bloque = b.id;
      if (antes) marcarCambios(nodo, b); else resaltar(nodo, b);
      return nodo;
    }
    const area = el('textarea', `${clase} editable`);
    area.dataset.bloque = b.id;
    area.value = b.texto;
    area.rows = 1;
    area.spellcheck = true;
    area.setAttribute('aria-label', 'Editar texto');
    const { alCambiar } = edicion;
    area.addEventListener('input', () => {
      b.texto = area.value;
      ajustarAltura(area);
      alCambiar(b);
    });
    requestAnimationFrame(() => ajustarAltura(area));
    return area;
  }

  // Tramo de tiempo de cada escena ("0–3 s"), sumando lo que se dice en las anteriores.
  function tiempos(guion) {
    const mapa = new Map();
    let inicio = 0;
    for (const g of Guion.porEscenas(guion.bloques)) {
      const fin = inicio + g.segundos;
      if (g.escena && g.segundos >= 0.5) mapa.set(g.escena.id, `${Math.round(inicio)}–${Math.round(fin)} s`);
      inicio = fin;
    }
    return mapa;
  }

  function cabecera(guion) {
    const est = Guion.estadisticas(guion.bloques);
    const caja = el('div', 'lectura-cabecera');
    caja.append(
      el('h2', 'lectura-titulo', guion.titulo || 'Guión sin título'),
      el('span', 'lectura-resumen', `${Guion.FORMATOS[guion.formato]?.nombre || ''} · ≈ ${Guion.formatoDuracion(est.segundos)}`),
    );
    return caja;
  }

  const vacio = () => el('p', 'lectura-vacio', 'Este guión todavía no tiene contenido.');

  // Una línea que se puede tocar para comentarla: quién la dice (si es hablada) y el texto.
  function linea(b, formato) {
    const caja = el('div', `linea linea-${b.tipo}`);
    caja.dataset.linea = b.id;
    const hablado = b.tipo === 'camara' || b.tipo === 'voz';
    const quien = hablado ? (b.personaje || '') : '';
    if (quien) {
      const etiqueta = el('span', 'linea-quien', quien + (b.tipo === 'voz' ? ' · voz en off' : ''));
      if (formato === 'cine' && b.acotacion && b.acotacion.trim()) etiqueta.append(el('span', 'linea-acotacion', ` (${b.acotacion.trim().replace(/^\(|\)$/g, '')})`));
      caja.append(etiqueta);
    }
    caja.append(texto(b, 'linea-texto'));
    return caja;
  }

  function bloques(guion, contenedor) {
    const visibles = guion.bloques.filter((b) => tieneTexto(b) || b.tipo === 'escena');
    if (!visibles.length) return contenedor.append(vacio());
    const tramos = tiempos(guion);
    for (const b of visibles) {
      if (b.tipo === 'escena') {
        const titulo = el('div', 'lectura-escena-titulo');
        titulo.append(el('span', 'lectura-escena-texto', b.texto || 'Escena'));
        if (tramos.has(b.id)) titulo.append(el('span', 'lectura-escena-duracion', tramos.get(b.id)));
        contenedor.append(titulo);
      } else if (b.tipo === 'pantalla') {
        const caja = el('div', 'lectura-pantalla');
        caja.dataset.linea = b.id;
        caja.append(el('span', 'lectura-etiqueta', 'En pantalla'), texto(b, 'lectura-rotulo'));
        contenedor.append(caja);
      } else {
        contenedor.append(linea(b, guion.formato));
      }
    }
  }

  // Sencillo: cada párrafo es una línea (en edición, un solo campo con todo el texto).
  function sencillo(guion, contenedor) {
    const b = guion.bloques[0];
    if (edicion) return contenedor.append(texto(b, 'linea-texto linea-sencillo'));
    const contenido = guion.bloques.map((x) => x.texto).join('\n\n').trim();
    if (!contenido) return contenedor.append(vacio());
    if (antes) {
      const caja = el('div', 'linea linea-parrafo');
      caja.append(texto(b, 'linea-texto'));
      return contenedor.append(caja);
    }
    for (const parrafo of contenido.split(/\n\s*\n/)) {
      const caja = el('div', 'linea linea-parrafo');
      caja.dataset.linea = b.id;
      const nodo = el('span', 'linea-texto');
      nodo.dataset.bloque = b.id;
      resaltar(nodo, { id: b.id, texto: parrafo.trim() });
      caja.append(nodo);
      contenedor.append(caja);
    }
  }

  function render(guion, contenedor, opciones = {}) {
    edicion = opciones.editable ? { alCambiar: opciones.alCambiar || (() => {}) } : null;
    citas = (opciones.citas || []).filter((c) => c && c.texto);
    antes = opciones.antes || null;
    contenedor.replaceChildren(cabecera(guion));
    contenedor.classList.add('lectura');
    contenedor.classList.toggle('en-edicion', !!edicion);
    contenedor.dataset.formato = guion.formato;
    if (opciones.aviso) contenedor.append(opciones.aviso);
    (guion.formato === 'sencillo' ? sencillo : bloques)(guion, contenedor);
    edicion = null;
    citas = [];
    antes = null;
  }

  return { render };
})();

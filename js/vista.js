// Vista de lectura: cómo ve el cliente el guión, según su formato.
// Con { editable: true } cada texto se convierte en un campo que se puede
// cambiar en el mismo sitio (la página del cliente lo usa para editar).
// Con { citas: [{ id, bloque, texto }] } las frases comentadas salen resaltadas.
// Con { antes: Map(idBloque → texto anterior) } se marcan los cambios:
// tachado lo que se borró y en verde lo que se añadió.
const Vista = (() => {
  let edicion = null; // { alCambiar } mientras se pinta en modo edición
  let citas = [];     // frases comentadas, mientras se pinta para leer
  let antes = null;   // textos anteriores, mientras se pintan los cambios

  // Un bloque se muestra si tiene texto, o si lo tenía antes (el cliente lo vació).
  const tieneTexto = (b) => !!b.texto.trim() || !!(antes && (antes.get(b.id) || '').trim());

  // Pinta el texto marcando lo borrado y lo nuevo respecto a la versión anterior.
  function marcarCambios(nodo, b) {
    const anterior = antes.has(b.id) ? antes.get(b.id) : '';
    for (const parte of Diferencias.comparar(anterior, b.texto)) {
      if (parte.tipo === 'igual') nodo.append(parte.texto);
      else nodo.append(el(parte.tipo === 'borrado' ? 'del' : 'ins', `cambio-${parte.tipo}`, parte.texto));
    }
  }

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
      const nodo = el('div', clase);
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

  function cabecera(guion) {
    const est = Guion.estadisticas(guion.bloques);
    const caja = el('header', 'lectura-cabecera');
    caja.append(el('h1', 'lectura-titulo', guion.titulo || 'Guión sin título'));
    caja.append(el('p', 'lectura-resumen', `Duración aproximada ${Guion.formatoDuracion(est.segundos)}`));
    return caja;
  }

  function vacio() {
    return el('p', 'lectura-vacio', 'Este guión todavía no tiene contenido.');
  }

  // ---------- Sencillo: solo párrafos ----------

  function sencillo(guion, contenedor) {
    if (edicion) return contenedor.append(texto(guion.bloques[0], 'lectura-parrafos'));
    if (antes) return contenedor.append(texto(guion.bloques[0], 'lectura-parrafos lectura-parrafos-cambios'));
    const contenido = guion.bloques.map((b) => b.texto).join('\n\n').trim();
    if (!contenido) return contenedor.append(vacio());
    for (const parrafo of contenido.split(/\n\s*\n/)) {
      const p = el('p', 'lectura-parrafo');
      p.dataset.bloque = guion.bloques[0].id;
      resaltar(p, { id: guion.bloques[0].id, texto: parrafo.trim() });
      contenedor.append(p);
    }
  }

  // ---------- Video / redes ----------

  function bloqueVideo(b) {
    const caja = el('div', `lectura-bloque lectura-${b.tipo}`);
    if (b.tipo === 'camara' && b.personaje) caja.append(el('div', 'lectura-etiqueta lectura-quien', b.personaje));
    else if (b.tipo !== 'camara') caja.append(el('div', 'lectura-etiqueta', Guion.nombreTipo(b.tipo, 'video')));
    caja.append(texto(b, 'lectura-texto'));
    return caja;
  }

  function video(guion, contenedor) {
    const visibles = guion.bloques.filter((b) => tieneTexto(b) || b.tipo === 'escena');
    if (!visibles.length) return contenedor.append(vacio());
    for (const grupo of Guion.porEscenas(visibles)) {
      const seccion = el('section', 'lectura-escena');
      if (grupo.escena) {
        const titulo = el('div', 'lectura-escena-titulo');
        titulo.append(el('span', 'lectura-escena-numero', `Escena ${grupo.numero}`));
        if (tieneTexto(grupo.escena)) titulo.append(texto(grupo.escena, 'lectura-escena-texto'));
        if (grupo.segundos) titulo.append(el('span', 'lectura-escena-duracion', Guion.formatoDuracion(grupo.segundos)));
        seccion.append(titulo);
      }
      for (const b of grupo.bloques) if (tieneTexto(b)) seccion.append(bloqueVideo(b));
      contenedor.append(seccion);
    }
  }

  // ---------- Cinematográfico (screenplay) ----------

  function cine(guion, contenedor) {
    const pagina = el('div', 'guion-cine');
    let numero = 0;
    for (const b of guion.bloques) {
      if (!tieneTexto(b) && !(b.tipo === 'camara' && b.personaje)) continue;
      if (b.tipo === 'escena') {
        const linea = el('div', 'cine-escena');
        linea.append(el('span', 'cine-numero', String(++numero)), texto(b, 'cine-escena-texto'));
        pagina.append(linea);
      } else if (b.tipo === 'camara') {
        const dialogo = el('div', 'cine-dialogo');
        dialogo.append(el('div', 'cine-personaje', b.personaje || ''));
        if (b.acotacion && b.acotacion.trim()) dialogo.append(el('div', 'cine-acotacion', `(${b.acotacion.trim().replace(/^\(|\)$/g, '')})`));
        dialogo.append(texto(b, 'cine-texto'));
        pagina.append(dialogo);
      } else {
        pagina.append(texto(b, `cine-${b.tipo}`));
      }
    }
    contenedor.append(pagina.childNodes.length ? pagina : vacio());
  }

  function render(guion, contenedor, opciones = {}) {
    edicion = opciones.editable ? { alCambiar: opciones.alCambiar || (() => {}) } : null;
    citas = (opciones.citas || []).filter((c) => c && c.texto);
    antes = opciones.antes || null;
    contenedor.replaceChildren(cabecera(guion));
    contenedor.className = `lectura lectura-formato-${guion.formato}${edicion ? ' en-edicion' : ''}`;
    ({ sencillo, video, cine }[guion.formato] || video)(guion, contenedor);
    edicion = null;
    citas = [];
    antes = null;
  }

  return { render };
})();

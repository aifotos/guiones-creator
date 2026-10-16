// Vista de lectura: cómo ve el cliente el guión, según su formato.
// Con { editable: true } cada texto se convierte en un campo que se puede
// cambiar en el mismo sitio (la página del cliente lo usa para editar).
const Vista = (() => {
  let edicion = null; // { alCambiar } mientras se pinta en modo edición

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

  // El texto de un bloque: fijo para leer, o un campo para editar.
  function texto(b, clase) {
    if (!edicion) return el('div', clase, b.texto);
    const area = el('textarea', `${clase} editable`);
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
    const contenido = guion.bloques.map((b) => b.texto).join('\n\n').trim();
    if (!contenido) return contenedor.append(vacio());
    for (const parrafo of contenido.split(/\n\s*\n/)) contenedor.append(el('p', 'lectura-parrafo', parrafo.trim()));
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
    const visibles = guion.bloques.filter((b) => b.texto.trim() || b.tipo === 'escena');
    if (!visibles.length) return contenedor.append(vacio());
    for (const grupo of Guion.porEscenas(visibles)) {
      const seccion = el('section', 'lectura-escena');
      if (grupo.escena) {
        const titulo = el('div', 'lectura-escena-titulo');
        titulo.append(el('span', 'lectura-escena-numero', `Escena ${grupo.numero}`));
        if (grupo.escena.texto.trim()) titulo.append(texto(grupo.escena, 'lectura-escena-texto'));
        if (grupo.segundos) titulo.append(el('span', 'lectura-escena-duracion', Guion.formatoDuracion(grupo.segundos)));
        seccion.append(titulo);
      }
      for (const b of grupo.bloques) if (b.texto.trim()) seccion.append(bloqueVideo(b));
      contenedor.append(seccion);
    }
  }

  // ---------- Cinematográfico (screenplay) ----------

  function cine(guion, contenedor) {
    const pagina = el('div', 'guion-cine');
    let numero = 0;
    for (const b of guion.bloques) {
      if (!b.texto.trim() && !(b.tipo === 'camara' && b.personaje)) continue;
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
    contenedor.replaceChildren(cabecera(guion));
    contenedor.className = `lectura lectura-formato-${guion.formato}${edicion ? ' en-edicion' : ''}`;
    ({ sencillo, video, cine }[guion.formato] || video)(guion, contenedor);
    edicion = null;
  }

  return { render };
})();

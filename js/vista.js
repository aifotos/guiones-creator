// Vista de lectura: cómo verá el cliente el guión, según su formato.
// En la Fase 3 la página del cliente reutiliza esta misma función.
const Vista = (() => {
  function el(etiqueta, clase, texto) {
    const nodo = document.createElement(etiqueta);
    if (clase) nodo.className = clase;
    if (texto != null) nodo.textContent = texto;
    return nodo;
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
    const texto = guion.bloques.map((b) => b.texto).join('\n\n').trim();
    if (!texto) return contenedor.append(vacio());
    for (const parrafo of texto.split(/\n\s*\n/)) contenedor.append(el('p', 'lectura-parrafo', parrafo.trim()));
  }

  // ---------- Video / redes ----------

  function bloqueVideo(b) {
    const caja = el('div', `lectura-bloque lectura-${b.tipo}`);
    if (b.tipo === 'camara' && b.personaje) caja.append(el('div', 'lectura-etiqueta lectura-quien', b.personaje));
    else if (b.tipo !== 'camara') caja.append(el('div', 'lectura-etiqueta', Guion.nombreTipo(b.tipo, 'video')));
    caja.append(el('div', 'lectura-texto', b.texto));
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
        if (grupo.escena.texto.trim()) titulo.append(el('span', 'lectura-escena-texto', grupo.escena.texto));
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
        linea.append(el('span', 'cine-numero', String(++numero)), el('span', '', b.texto.toUpperCase()));
        pagina.append(linea);
      } else if (b.tipo === 'camara') {
        const dialogo = el('div', 'cine-dialogo');
        dialogo.append(el('div', 'cine-personaje', (b.personaje || '').toUpperCase()));
        if (b.acotacion && b.acotacion.trim()) dialogo.append(el('div', 'cine-acotacion', `(${b.acotacion.trim().replace(/^\(|\)$/g, '')})`));
        dialogo.append(el('div', 'cine-texto', b.texto));
        pagina.append(dialogo);
      } else {
        pagina.append(el('div', `cine-${b.tipo}`, b.tipo === 'transicion' ? b.texto.toUpperCase() : b.texto));
      }
    }
    contenedor.append(pagina.childNodes.length ? pagina : vacio());
  }

  function render(guion, contenedor) {
    contenedor.replaceChildren(cabecera(guion));
    contenedor.className = `lectura lectura-formato-${guion.formato}`;
    ({ sencillo, video, cine }[guion.formato] || video)(guion, contenedor);
  }

  return { render };
})();

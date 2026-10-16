// Vista de lectura: cómo verá el cliente el guión.
// En la Fase 3 la página del cliente reutiliza esta misma función.
const Vista = (() => {
  function el(etiqueta, clase, texto) {
    const nodo = document.createElement(etiqueta);
    if (clase) nodo.className = clase;
    if (texto != null) nodo.textContent = texto;
    return nodo;
  }

  function bloque(b) {
    const caja = el('div', `lectura-bloque lectura-${b.tipo}`);
    if (b.tipo !== 'camara') caja.append(el('div', 'lectura-etiqueta', Guion.TIPOS[b.tipo].nombre));
    caja.append(el('div', 'lectura-texto', b.texto));
    return caja;
  }

  function render(guion, contenedor) {
    contenedor.replaceChildren();
    const est = Guion.estadisticas(guion.bloques);

    const cabecera = el('header', 'lectura-cabecera');
    cabecera.append(el('h1', 'lectura-titulo', guion.titulo || 'Guión sin título'));
    cabecera.append(el('p', 'lectura-resumen',
      `Duración aproximada ${Guion.formatoDuracion(est.segundos)} · ${est.habladas} palabras habladas`));
    contenedor.append(cabecera);

    const visibles = guion.bloques.filter((b) => b.texto.trim() || b.tipo === 'escena');
    if (!visibles.length) {
      contenedor.append(el('p', 'lectura-vacio', 'Este guión todavía no tiene contenido.'));
      return;
    }

    for (const grupo of Guion.porEscenas(visibles)) {
      const seccion = el('section', 'lectura-escena');
      if (grupo.escena) {
        const titulo = el('div', 'lectura-escena-titulo');
        titulo.append(el('span', 'lectura-escena-numero', `Escena ${grupo.numero}`));
        if (grupo.escena.texto.trim()) titulo.append(el('span', 'lectura-escena-texto', grupo.escena.texto));
        if (grupo.segundos) titulo.append(el('span', 'lectura-escena-duracion', Guion.formatoDuracion(grupo.segundos)));
        seccion.append(titulo);
      }
      for (const b of grupo.bloques) if (b.texto.trim()) seccion.append(bloque(b));
      contenedor.append(seccion);
    }
  }

  return { render };
})();

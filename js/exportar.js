// Exportar a PDF con la marca aifotos. Se usa la impresión del navegador:
// en el cuadro de imprimir se elige "Guardar como PDF" (en el iPhone, el
// botón de compartir → "Guardar en Archivos").
const Exportar = (() => {
  function el(etiqueta, clase, texto) {
    const nodo = document.createElement(etiqueta);
    if (clase) nodo.className = clase;
    if (texto != null) nodo.textContent = texto;
    return nodo;
  }

  // Nombre del archivo: el navegador usa el título de la página al guardar el PDF.
  const limpiar = (t) => String(t || '').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();

  function pdf(guion, { cliente = '' } = {}) {
    let hoja = document.getElementById('impresion');
    if (!hoja) {
      hoja = el('div', 'impresion');
      hoja.id = 'impresion';
      document.body.append(hoja);
    }
    hoja.replaceChildren();

    const cabecera = el('header', 'impresion-cabecera');
    const logo = el('img', 'impresion-logo');
    logo.src = 'assets/logo-aifotos.png';
    logo.alt = 'aifotos';
    const datos = el('div', 'impresion-datos');
    if (cliente) datos.append(el('span', '', `Cliente: ${cliente}`));
    datos.append(
      el('span', '', Guion.FORMATOS[guion.formato]?.nombre || ''),
      el('span', '', `Duración aprox. ${Guion.formatoDuracion(Guion.estadisticas(guion.bloques).segundos)}`),
      el('span', '', new Date().toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })),
    );
    cabecera.append(logo, datos);

    const cuerpo = el('article', 'lectura');
    Vista.render(guion, cuerpo);
    if (guion.aprobado) {
      cuerpo.querySelector('.lectura-cabecera')?.append(
        el('p', 'impresion-aprobado', `✓ Aprobado por el cliente el ${new Date(guion.aprobado).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })}`));
    }

    hoja.append(cabecera, cuerpo, el('footer', 'impresion-pie', 'Guiones Creator by aifotos'));

    const tituloAntes = document.title;
    document.title = limpiar(['Guion', guion.titulo || 'sin título', cliente].filter(Boolean).join(' - '));
    const restaurar = () => { document.title = tituloAntes; };
    window.addEventListener('afterprint', restaurar, { once: true });
    // Esperar a que cargue el logo para que salga en el PDF.
    const imprimir = () => setTimeout(() => window.print(), 50);
    if (logo.complete) imprimir(); else logo.addEventListener('load', imprimir, { once: true });
  }

  return { pdf };
})();

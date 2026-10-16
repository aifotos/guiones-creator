// Piezas visuales compartidas del rediseño v2: iconos Lucide, avatares de
// cliente con forma orgánica y los cuatro estados de un guion.
const UI = (() => {
  // Trazos de Lucide (stroke 2.75, puntas redondeadas: ver .ico en app.css).
  const ICONOS = {
    plus: '<path d="M5 12h14M12 5v14"/>',
    clipboard: '<rect width="8" height="4" x="8" y="2" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>',
    house: '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    sliders: '<path d="M20 7h-9M14 17H5"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/>',
    atras: '<path d="m12 19-7-7 7-7M19 12H5"/>',
    chat: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
    monitor: '<rect width="20" height="14" x="2" y="3" rx="2"/><path d="M8 21h8M12 17v4"/>',
    descargar: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
    historial: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5M12 7v5l4 2"/>',
    papelera: '<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"/>',
    enviar: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    lapiz: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
  };

  function icono(nombre, tamano = 16) {
    const plantilla = document.createElement('template');
    plantilla.innerHTML = `<svg class="ico" viewBox="0 0 24 24" width="${tamano}" height="${tamano}" aria-hidden="true">${ICONOS[nombre] || ''}</svg>`;
    return plantilla.content.firstChild;
  }

  // Color y forma del avatar: por orden de alta del cliente, en rotación (como en el prototipo).
  const COLORES = [['#c67139', '#f9f4ed'], ['#7a8a5e', '#f9f4ed'], ['#F9AE34', '#201e1d'], ['#201e1d', '#f5ead8']];
  const FORMAS = [
    '62% 38% 55% 45% / 50% 60% 40% 50%',
    '45% 55% 40% 60% / 60% 45% 55% 40%',
    '55% 45% 62% 38% / 42% 58% 42% 58%',
    '40% 60% 50% 50% / 55% 40% 60% 45%',
  ];

  function iniciales(nombre) {
    const palabras = String(nombre || '').trim().split(/\s+/).filter(Boolean);
    const dos = palabras.length > 1 ? palabras[0][0] + palabras[1][0] : (palabras[0] || '?').slice(0, 2);
    return dos.toUpperCase();
  }

  // indice: posición del cliente por fecha de alta (estable aunque cambie el orden de la lista).
  function avatar(nombre, indice, clase = 'avatar') {
    const span = document.createElement('span');
    span.className = clase;
    const [fondo, texto] = COLORES[indice % COLORES.length];
    span.style.background = fondo;
    span.style.color = texto;
    span.style.borderRadius = FORMAS[indice % FORMAS.length];
    span.textContent = iniciales(nombre);
    span.setAttribute('aria-hidden', 'true');
    return span;
  }

  const forma = (indice) => FORMAS[indice % FORMAS.length];
  const colores = (indice) => COLORES[indice % COLORES.length];

  // Los cuatro estados de un guion (fondo / texto / punto).
  const ESTADOS = {
    borrador: { etiqueta: 'Borrador', fondo: '#eee7db', texto: '#474238', punto: '#a19786' },
    esperando: { etiqueta: 'Esperando al cliente', fondo: '#FCE3B0', texto: '#6b4a0c', punto: '#e09a22' },
    editado: { etiqueta: 'El cliente editó', fondo: '#ffe1d0', texto: '#8c491a', punto: '#c67139' },
    aprobado: { etiqueta: 'Aprobado', fondo: '#e1eecc', texto: '#3d472b', punto: '#7a8a5e' },
  };

  return { icono, avatar, iniciales, forma, colores, ESTADOS };
})();

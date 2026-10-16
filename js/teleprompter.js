// Modo teleprompter (rediseño v2): lo que se dice, grande sobre fondo oscuro, pasando
// solo para leerlo mirando a cámara, con una franja a la altura de los ojos.
// Teclas: espacio (pausa), ↑/↓ (velocidad), +/− (tamaño), M (espejo, para los
// teleprompter con cristal), R (desde el principio), Esc (salir).
const Teleprompter = (() => {
  const CLAVE = 'guiones-creator:teleprompter';
  // tamano: null = el del diseño (46 px; 30 en el celular), hasta que lo cambies con +/−.
  let ajustes = { velocidad: 4, tamano: null, espejo: false };
  try { ajustes = { ...ajustes, ...JSON.parse(localStorage.getItem('guiones-creator:teleprompter-v2') || '{}') }; } catch {}

  let caja = null, texto = null, marcador = null, estado = null;
  let corriendo = false, ultimo = 0, animacion = null, cuentaAtras = null, posicion = 0;

  function el(etiqueta, clase, contenido) {
    const nodo = document.createElement(etiqueta);
    if (clase) nodo.className = clase;
    if (contenido != null) nodo.textContent = contenido;
    return nodo;
  }

  function guardarAjustes() {
    try { localStorage.setItem(`${CLAVE}-v2`, JSON.stringify(ajustes)); } catch {}
  }

  // Solo lo que se dice en voz alta: quién lo dice y el texto.
  function linea(quien, dicho) {
    const caja = el('div', 'tp-linea');
    if (quien) caja.append(el('span', 'tp-quien', quien));
    caja.append(el('span', 'tp-texto', dicho));
    return caja;
  }

  function contenido(guion) {
    const piezas = [];
    for (const b of guion.bloques) {
      if (!b.texto.trim()) continue;
      if (b.tipo === 'parrafo') for (const p of b.texto.split(/\n\s*\n/)) piezas.push(linea('', p.trim()));
      else if (b.tipo === 'camara' || b.tipo === 'voz') piezas.push(linea(b.personaje || 'Voz', b.texto));
    }
    if (!piezas.length) piezas.push(linea('', 'Este guión todavía no tiene texto para decir.'));
    return piezas;
  }

  function aplicarAjustes() {
    texto.style.setProperty('--tp-tamano', ajustes.tamano ? `${ajustes.tamano}px` : '');
    caja.classList.toggle('espejo', ajustes.espejo);
    estado.textContent = ajustes.velocidad;
    caja.querySelector('.tp-velocidad').value = ajustes.velocidad;
  }

  function paso(ahora) {
    if (!corriendo) return;
    const dt = Math.min((ahora - ultimo) / 1000, 0.1);
    ultimo = ahora;
    posicion += ajustes.velocidad * 12 * dt; // px por segundo
    texto.scrollTop = posicion;
    if (texto.scrollTop + texto.clientHeight >= texto.scrollHeight - 1) return pausar();
    animacion = requestAnimationFrame(paso);
  }

  function arrancar() {
    if (corriendo || cuentaAtras) return;
    let n = 3;
    marcador.textContent = n;
    marcador.hidden = false;
    cuentaAtras = setInterval(() => {
      n -= 1;
      if (n > 0) { marcador.textContent = n; return; }
      clearInterval(cuentaAtras);
      cuentaAtras = null;
      marcador.hidden = true;
      corriendo = true;
      caja.classList.add('corriendo');
      posicion = texto.scrollTop;
      ultimo = performance.now();
      animacion = requestAnimationFrame(paso);
      pintarBotonPlay();
    }, 700);
  }

  function pausar() {
    corriendo = false;
    clearInterval(cuentaAtras);
    cuentaAtras = null;
    marcador.hidden = true;
    cancelAnimationFrame(animacion);
    caja.classList.remove('corriendo');
    pintarBotonPlay();
  }

  const alternar = () => (corriendo || cuentaAtras ? pausar() : arrancar());

  function pintarBotonPlay() {
    const boton = caja.querySelector('.tp-play');
    boton.textContent = corriendo || cuentaAtras ? '❚❚' : '▶';
    boton.setAttribute('aria-label', corriendo || cuentaAtras ? 'Pausar' : 'Reproducir');
  }

  function cambiar(que, delta) {
    if (que === 'velocidad') ajustes.velocidad = Math.min(10, Math.max(1, ajustes.velocidad + delta));
    if (que === 'tamano') {
      const actual = ajustes.tamano || parseFloat(getComputedStyle(texto.querySelector('.tp-texto')).fontSize);
      ajustes.tamano = Math.min(120, Math.max(20, actual + delta));
    }
    guardarAjustes();
    aplicarAjustes();
  }

  function reiniciar() {
    pausar();
    texto.scrollTop = 0;
    posicion = 0;
  }

  function cerrar() {
    pausar();
    document.removeEventListener('keydown', teclas, true);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    caja.remove();
    caja = null;
  }

  function teclas(e) {
    const mapa = {
      ' ': alternar,
      ArrowUp: () => cambiar('velocidad', 1),
      ArrowDown: () => cambiar('velocidad', -1),
      '+': () => cambiar('tamano', 4),
      '=': () => cambiar('tamano', 4),
      '-': () => cambiar('tamano', -4),
      m: () => { ajustes.espejo = !ajustes.espejo; guardarAjustes(); aplicarAjustes(); },
      r: reiniciar,
      Escape: cerrar,
    };
    const accion = mapa[e.key] || mapa[e.key.toLowerCase()];
    if (!accion) return;
    e.preventDefault();
    e.stopPropagation();
    accion();
  }

  function abrir(guion) {
    if (caja) cerrar();
    caja = el('div', 'teleprompter');
    caja.setAttribute('role', 'dialog');
    caja.setAttribute('aria-label', 'Teleprompter');
    texto = el('div', 'tp-rollo');
    texto.append(...contenido(guion));
    marcador = el('div', 'tp-cuenta');
    marcador.hidden = true;

    const salir = el('button', 'tp-salir');
    salir.setAttribute('aria-label', 'Salir del teleprompter');
    salir.append(UI.icono('x', 16));
    salir.addEventListener('click', cerrar);

    // Barra de abajo: reproducir, reiniciar y velocidad
    const play = el('button', 'tp-play', '▶');
    play.setAttribute('aria-label', 'Reproducir');
    play.addEventListener('click', (e) => { e.stopPropagation(); alternar(); });
    const desde = el('button', 'tp-reiniciar', 'Reiniciar');
    desde.addEventListener('click', reiniciar);
    const velocidad = el('label', 'tp-control', 'Velocidad');
    const rango = el('input', 'tp-velocidad');
    Object.assign(rango, { type: 'range', min: 1, max: 10 });
    rango.addEventListener('input', () => { ajustes.velocidad = Number(rango.value); guardarAjustes(); aplicarAjustes(); });
    estado = el('span', 'tp-numero');
    velocidad.append(rango, estado);
    const controles = el('div', 'tp-controles');
    controles.append(play, desde, velocidad);

    caja.append(el('div', 'tp-franja'), el('div', 'tp-sombra-arriba'), el('div', 'tp-sombra-abajo'), salir, texto, marcador, controles);
    // Tocar el texto pausa o reanuda (útil desde el celular o con un mando).
    texto.addEventListener('click', alternar);
    document.body.append(caja);
    document.addEventListener('keydown', teclas, true);
    aplicarAjustes();
    caja.requestFullscreen?.().catch(() => {});
  }

  return { abrir };
})();

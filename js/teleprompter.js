// Modo teleprompter: el texto que se dice, grande, pasando solo para leerlo
// mirando a cámara. Teclas: espacio (pausa), ↑/↓ (velocidad), +/− (tamaño),
// M (espejo, para los teleprompter con cristal), R (desde el principio), Esc (salir).
const Teleprompter = (() => {
  const CLAVE = 'guiones-creator:teleprompter';
  let ajustes = { velocidad: 5, tamano: 56, espejo: false };
  try { ajustes = { ...ajustes, ...JSON.parse(localStorage.getItem(CLAVE) || '{}') }; } catch {}

  let caja = null, texto = null, marcador = null, estado = null;
  let corriendo = false, ultimo = 0, animacion = null, cuentaAtras = null, posicion = 0;

  function el(etiqueta, clase, contenido) {
    const nodo = document.createElement(etiqueta);
    if (clase) nodo.className = clase;
    if (contenido != null) nodo.textContent = contenido;
    return nodo;
  }

  function guardarAjustes() {
    try { localStorage.setItem(CLAVE, JSON.stringify(ajustes)); } catch {}
  }

  // Solo lo que se dice en voz alta; las escenas quedan como separadores pequeños.
  function contenido(guion) {
    const piezas = [];
    for (const b of guion.bloques) {
      if (!b.texto.trim()) continue;
      if (b.tipo === 'escena') piezas.push(el('div', 'tp-escena', b.texto));
      else if (b.tipo === 'parrafo') for (const p of b.texto.split(/\n\s*\n/)) piezas.push(el('p', 'tp-texto', p.trim()));
      else if (b.tipo === 'camara' || b.tipo === 'voz') {
        const quien = b.tipo === 'voz' ? `${b.personaje || 'Voz en off'}` : b.personaje;
        if (quien) piezas.push(el('div', 'tp-quien', quien));
        piezas.push(el('p', 'tp-texto', b.texto));
      }
    }
    if (!piezas.length) piezas.push(el('p', 'tp-texto', 'Este guión todavía no tiene texto para decir.'));
    return piezas;
  }

  function aplicarAjustes() {
    texto.style.fontSize = `${ajustes.tamano}px`;
    caja.classList.toggle('espejo', ajustes.espejo);
    estado.textContent = `Velocidad ${ajustes.velocidad} · Tamaño ${ajustes.tamano}`;
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
    caja.querySelector('.tp-play').textContent = corriendo || cuentaAtras ? '⏸ Pausa' : '▶ Empezar';
  }

  function cambiar(que, delta) {
    if (que === 'velocidad') ajustes.velocidad = Math.min(20, Math.max(1, ajustes.velocidad + delta));
    if (que === 'tamano') ajustes.tamano = Math.min(120, Math.max(28, ajustes.tamano + delta));
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

  function boton(contenidoBoton, titulo, accion, clase = '') {
    const b = el('button', `tp-boton ${clase}`, contenidoBoton);
    b.type = 'button';
    b.title = titulo;
    b.setAttribute('aria-label', titulo);
    b.addEventListener('click', (e) => { e.stopPropagation(); accion(); });
    return b;
  }

  function abrir(guion) {
    if (caja) cerrar();
    caja = el('div', 'teleprompter');
    caja.setAttribute('role', 'dialog');
    caja.setAttribute('aria-label', 'Teleprompter');
    texto = el('div', 'tp-rollo');
    const interior = el('div', 'tp-interior');
    interior.append(el('h1', 'tp-titulo', guion.titulo || 'Guión'), ...contenido(guion), el('div', 'tp-fin', '— Fin —'));
    texto.append(interior);
    marcador = el('div', 'tp-cuenta');
    marcador.hidden = true;
    estado = el('span', 'tp-estado');

    const controles = el('div', 'tp-controles');
    controles.append(
      boton('⏮', 'Desde el principio (R)', reiniciar),
      boton('▶ Empezar', 'Empezar o pausar (espacio)', alternar, 'tp-play'),
      boton('🐢', 'Más lento (↓)', () => cambiar('velocidad', -1)),
      boton('🐇', 'Más rápido (↑)', () => cambiar('velocidad', 1)),
      boton('A−', 'Letra más pequeña (−)', () => cambiar('tamano', -4)),
      boton('A+', 'Letra más grande (+)', () => cambiar('tamano', 4)),
      boton('⇋', 'Espejo, para teleprompter con cristal (M)', () => { ajustes.espejo = !ajustes.espejo; guardarAjustes(); aplicarAjustes(); }),
      estado,
      boton('✕', 'Salir (Esc)', cerrar, 'tp-salir'),
    );

    caja.append(texto, el('div', 'tp-guia'), marcador, controles);
    // Tocar el texto pausa o reanuda (útil desde el celular o con un mando).
    texto.addEventListener('click', alternar);
    document.body.append(caja);
    document.addEventListener('keydown', teclas, true);
    aplicarAjustes();
    caja.requestFullscreen?.().catch(() => {});
  }

  return { abrir };
})();

// Teleprompter con seguimiento por voz (portado de prompter-web, que replica Prompt+):
// el texto avanza mientras lees en voz alta, la línea actual queda en la franja verde y
// las palabras dichas pasan a gris oscuro al instante. Sin voz, sube a velocidad constante.
// Usa MotorTeleprompter (coincidencias) y VozTeleprompter (reconocimiento y micrófono).
// Teclas: espacio (iniciar/detener), ↑↓ o RePág/AvPág (línea; sirve con pedales Bluetooth),
// ←→ (palabra), Inicio o R (al comienzo), + − (tamaño), V (voz), M (espejo),
// F (pantalla completa), Esc (detener; si no está leyendo, salir).
const Teleprompter = (() => {
  const CLAVE = 'guiones-creator:teleprompter-v3';
  const CLAVE_POSICIONES = 'guiones-creator:teleprompter-posiciones';
  const estrecha = Math.min(innerWidth, innerHeight) < 600;
  const POR_DEFECTO = {
    tamano: estrecha ? 34 : 52, interlineado: 1.25, ancho: 100, margen: 0, arriba: estrecha ? 28 : 32,
    guia: 1, colorGuia: '#69c559', alineacion: 'center', espejo: 'off', letra: '#ffffff', fondo: '#000000',
    voz: 1, velocidad: 4, crono: 1, cuenta: 0, idioma: VozTeleprompter.idiomaPorDefecto(),
  };
  const leer = (clave, d) => { try { const v = localStorage.getItem(clave); return v == null ? d : JSON.parse(v); } catch { return d; } };
  const guardar = (clave, v) => { try { localStorage.setItem(clave, JSON.stringify(v)); } catch {} };
  const A = { ...POR_DEFECTO, ...leer(CLAVE, {}) };
  const guardarAjustes = () => guardar(CLAVE, A);

  // Iconos de la barra (los de Prompt+).
  const SVG = {
    ajustes: '<svg viewBox="0 0 24 24"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.48.48 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.49.49 0 0 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6A3.6 3.6 0 1 1 12 8.4a3.6 3.6 0 0 1 0 7.2z"/></svg>',
    voz: '<svg viewBox="0 0 24 24"><path d="M9 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4zm7.76-9.64-1.68 1.69a3.4 3.4 0 0 1 0 3.89l1.68 1.69c2.02-2.02 2.02-5.07 0-7.27zM20.07 2l-1.63 1.63c2.77 3.02 2.77 7.56 0 10.74L20.07 16c3.9-3.89 3.91-9.95 0-14z"/></svg>',
    play: '<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="21" stroke="#69c559" stroke-width="3.5"/><path d="M19 15.5v17l13.5-8.5z" fill="#69c559"/></svg>',
    pantalla: '<svg viewBox="0 0 24 24"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>',
    salir: '<svg viewBox="0 0 24 24"><path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>',
    atras: '<svg viewBox="0 0 24 24"><path d="M11 18V6l-8.5 6 8.5 6zm.5-6 8.5 6V6l-8.5 6z"/></svg>',
    adelante: '<svg viewBox="0 0 24 24"><path d="m4 18 8.5-6L4 6v12zm9-12v12l8.5-6L13 6z"/></svg>',
    stop: '<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="21" stroke="#ff3b30" stroke-width="3.5"/><rect x="16.5" y="16.5" width="15" height="15" rx="2" fill="#ff3b30"/></svg>',
    inicio: '<svg viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/></svg>',
    cerrarHoja: '<svg viewBox="0 0 24 24"><path d="M5 9l7 7 7-7"/></svg>',
    texto: '<svg viewBox="0 0 24 24"><path d="M9 4v3h5v12h3V7h5V4H9zm-6 8h3v7h3v-7h3V9H3v3z"/></svg>',
    tiempo: '<svg viewBox="0 0 24 24"><path d="M15 1H9v2h6V1zm-4 13h2V8h-2v6zm8.03-6.61 1.42-1.42c-.43-.51-.9-.99-1.41-1.41l-1.42 1.42A8.96 8.96 0 0 0 12 4a9 9 0 1 0 9 9c0-2.12-.74-4.07-1.97-5.61zM12 20a7 7 0 1 1 0-14 7 7 0 0 1 0 14z"/></svg>',
    ayuda: '<svg viewBox="0 0 24 24"><path d="M11 18h2v-2h-2v2zm1-16a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16zm0-14a4 4 0 0 0-4 4h2a2 2 0 1 1 4 0c0 2-3 1.75-3 5h2c0-2.25 3-2.5 3-5a4 4 0 0 0-4-4z"/></svg>',
  };

  const control = (titulo, clave, min, max, paso, izq, der) => `
    <div class="tp-ctl"><div class="tp-ch"><span>${titulo}</span><b data-valor="${clave}"></b></div>
      <div class="tp-cs"><small>${izq}</small><input type="range" data-k="${clave}" min="${min}" max="${max}" step="${paso}" aria-label="${titulo}"><small>${der}</small></div></div>`;
  const segmentos = (titulo, clave, opciones) => `
    <div class="tp-ctl"><span class="tp-lbl">${titulo}</span>
      <div class="tp-seg" data-k="${clave}">${opciones.map(([v, n]) => `<button data-v="${v}">${n}</button>`).join('')}</div></div>`;

  const PLANTILLA = `
    <div class="tp-sonda"></div>
    <main class="tp-escenario">
      <div class="tp-espejo">
        <div class="tp-guia"></div>
        <div class="tp-rollo"><div class="tp-texto"><div class="tp-columna"></div></div></div>
      </div>
      <div class="tp-cuenta" hidden></div>
      <div class="tp-aviso" hidden></div>
      <div class="tp-crono" hidden>00:00</div>
      <div class="tp-pildora-onda"><canvas class="tp-onda-a"></canvas></div>
    </main>
    <nav class="tp-barra">
      <div class="tp-fila tp-barra-inicio">
        <button class="tp-b" data-accion="ajustes">${SVG.ajustes}<span>Ajustes</span></button>
        <button class="tp-b tp-voz" data-accion="voz"><span class="tp-punto">${SVG.voz}</span><span>Voz</span></button>
        <button class="tp-b tp-grande" data-accion="iniciar" aria-label="Iniciar">${SVG.play}</button>
        <button class="tp-b tp-boton-pantalla" data-accion="pantalla">${SVG.pantalla}<span>Pantalla</span></button>
        <button class="tp-b" data-accion="salir">${SVG.salir}<span>Salir</span></button>
      </div>
      <div class="tp-fila tp-barra-lectura" hidden>
        <button class="tp-b" data-accion="atras" aria-label="Atrás">${SVG.atras}</button>
        <button class="tp-b" data-accion="adelante" aria-label="Adelante">${SVG.adelante}</button>
        <button class="tp-b tp-grande" data-accion="detener" aria-label="Detener">${SVG.stop}</button>
        <div class="tp-b"><canvas class="tp-onda-b"></canvas></div>
        <button class="tp-b" data-accion="comienzo" aria-label="Volver al inicio">${SVG.inicio}</button>
      </div>
    </nav>
    <section class="tp-hoja" aria-label="Ajustes del teleprompter">
      <div class="tp-hoja-cuerpo">
        <div class="tp-panel" data-panel="texto">
          ${control('Tamaño de letra', 'tamano', 16, 140, 1, 'Pequeña', 'Grande')}
          ${control('Interlineado', 'interlineado', 1, 2, 0.01, 'Simple', 'Doble')}
          ${control('Área de texto', 'ancho', 30, 100, 1, 'Angosta', 'Ancha')}
          <div class="tp-ctl"><div class="tp-ch"><span>Margen</span></div>
            <div class="tp-cs"><small>Izq.</small><input type="range" data-k="margen" min="0" max="50" step="1" aria-label="Margen izquierdo"><b data-valor="margen"></b></div>
            <div class="tp-cs"><small>Arriba</small><input type="range" data-k="arriba" min="0" max="80" step="1" aria-label="Posición de la guía"><b data-valor="arriba"></b></div></div>
          <div class="tp-ctl"><span class="tp-lbl">Mostrar guía</span>
            <div class="tp-cs"><div class="tp-seg" data-k="guia"><button data-v="0">No</button><button data-v="1">Sí</button></div><span class="tp-crece"></span><label class="tp-color" title="Color de la guía"><input type="color" data-k="colorGuia" aria-label="Color de la guía"></label></div></div>
          ${segmentos('Alineación', 'alineacion', [['left', 'Izquierda'], ['center', 'Centro'], ['right', 'Derecha']])}
          ${segmentos('Espejo', 'espejo', [['off', 'No'], ['h', 'Horizontal'], ['v', 'Vertical']])}
          <div class="tp-ctl tp-dos">
            <div><span class="tp-lbl">Color de letra</span><label class="tp-color"><input type="color" data-k="letra" aria-label="Color de letra"></label></div>
            <div><span class="tp-lbl">Color de fondo</span><label class="tp-color"><input type="color" data-k="fondo" aria-label="Color de fondo"></label></div>
          </div>
        </div>
        <div class="tp-panel" data-panel="tiempo" hidden>
          ${segmentos('Cronómetro', 'crono', [['0', 'No'], ['1', 'Sí']])}
          ${segmentos('Cuenta regresiva al iniciar', 'cuenta', [['0', 'No'], ['3', '3 s'], ['5', '5 s']])}
          ${control('Velocidad sin voz', 'velocidad', 0.5, 10, 0.5, 'Lenta', 'Rápida')}
          <div class="tp-ctl"><span class="tp-lbl">Idioma de la voz</span><select data-k="idioma" aria-label="Idioma de la voz">
            ${VozTeleprompter.IDIOMAS.map(([v, n]) => `<option value="${v}">${n}</option>`).join('')}</select></div>
          <div class="tp-ctl tp-fila-pantalla"><span class="tp-lbl">Pantalla</span><button class="tp-btn" data-accion="pantalla">Pantalla completa</button></div>
        </div>
        <div class="tp-panel tp-ayuda" data-panel="ayuda" hidden>
          <div>
            <h3>Cómo funciona</h3>
            <p>Pulsa el botón verde y lee en voz alta. La línea que estás leyendo se queda en la franja verde y las palabras que ya dijiste se atenúan. Si te saltas una palabra, te equivocas o improvisas, el teleprompter busca dónde estás y sigue contigo. Si haces una pausa, el texto espera.</p>
            <h3>Durante la lectura</h3>
            <p>Con voz: <b>⏪ ⏩</b> saltan una línea. Toca cualquier palabra o arrastra el texto para continuar desde ahí. <b>⏮</b> vuelve al inicio.<br>Sin voz (botón Voz apagado): el texto sube solo y <b>⏪ ⏩</b> cambian la velocidad.</p>
            <h3>Teclado y controles remotos</h3>
            <p><kbd>Espacio</kbd> iniciar/detener · <kbd>↑</kbd> <kbd>↓</kbd> o <kbd>RePág</kbd> <kbd>AvPág</kbd> línea anterior/siguiente (sirve con pedales y controles Bluetooth) · <kbd>Inicio</kbd> volver al comienzo · <kbd>+</kbd> <kbd>−</kbd> tamaño · <kbd>V</kbd> voz · <kbd>M</kbd> espejo · <kbd>F</kbd> pantalla completa · <kbd>Esc</kbd> detener o salir</p>
            <h3>Navegadores</h3>
            <p>Chrome o Edge en Windows, Mac y Android. Safari en iPhone, iPad y Mac. Firefox no tiene reconocimiento de voz (usa el modo sin voz).</p>
            <h3>Privacidad</h3>
            <p>El audio lo convierte en texto el servicio de voz del navegador (Google en Chrome y Edge, Apple en Safari). El texto del guion no sale de tu dispositivo.</p>
          </div>
        </div>
      </div>
      <div class="tp-pestanas">
        <button data-pestana="cerrar" class="tp-chevron">${SVG.cerrarHoja}<span>Atrás</span></button>
        <button data-pestana="texto" aria-label="Texto">${SVG.texto}</button>
        <button data-pestana="tiempo" aria-label="Tiempo">${SVG.tiempo}</button>
        <button data-pestana="ayuda" aria-label="Ayuda">${SVG.ayuda}</button>
        <i class="tp-indicador"></i>
      </div>
    </section>
    <div class="tp-modal" hidden role="alertdialog" aria-modal="true"><div class="tp-tarjeta"><h2></h2><p></p><button>Entendido</button></div></div>`;

  // ---------- Estado de la sesión abierta ----------
  let caja = null, q = null, guionId = '';
  let escenario, espejo, guia, rollo, texto, columna;
  let palabras = [], claves = [], alturas = [], cursor = 0, leidasHasta = 0;
  let H = 0, guiaArriba = 0, guiaAlto = 0, ultimoY = 0, destinoY = null;
  let leyendo = false, modo = 'voz', contando = false, autoY = 0, t0 = 0, cronoIv = 0, bloqueo = null;
  let escucha = null, mic = null, finTimer = 0, avisoTimer = 0;
  let tocando = false, usuarioHasta = 0, usuarioMovio = false, ultimo = 0, fase = 0, animacion = 0, observador = null;

  // ---------- Texto del guion ----------

  // Solo lo que se dice en voz alta. Quién lo dice va aparte y no cuenta para el seguimiento.
  function pintarContenido(guion) {
    columna.textContent = '';
    for (const b of guion.bloques || []) {
      if (!['parrafo', 'camara', 'voz'].includes(b.tipo) || !b.texto.trim()) continue;
      const quien = b.tipo === 'parrafo' ? '' : (b.personaje || (b.tipo === 'voz' ? 'Voz en off' : ''));
      if (quien) {
        const etiqueta = document.createElement('div');
        etiqueta.className = 'tp-quien';
        etiqueta.textContent = quien;
        columna.append(etiqueta);
      }
      for (const parrafo of b.texto.split(/\n\s*\n/)) {
        if (!parrafo.trim()) continue;
        const p = document.createElement('p');
        p.className = 'tp-parrafo';
        parrafo.trim().split('\n').forEach((l, i) => { if (i) p.append(document.createElement('br')); p.append(l); });
        columna.append(p);
      }
    }
    if (!columna.childNodes.length) {
      columna.innerHTML = '<p class="tp-vacio">Este guión todavía no tiene texto para decir.</p>';
      return;
    }
    // Cada palabra en su <span class="w"> para poder atenuarla y tocarla.
    const caminante = document.createTreeWalker(columna, NodeFilter.SHOW_TEXT), nodos = [];
    while (caminante.nextNode()) if (!caminante.currentNode.parentElement.closest('.tp-quien')) nodos.push(caminante.currentNode);
    for (const n of nodos) {
      const trozo = document.createDocumentFragment();
      for (const parte of n.nodeValue.split(/(\s+)/)) {
        if (!parte) continue;
        if (/^\s+$/.test(parte)) { trozo.append(parte); continue; }
        const span = document.createElement('span');
        span.className = 'w';
        span.textContent = parte;
        const clave = MotorTeleprompter.norm(parte);
        if (clave) { span.dataset.i = palabras.length; palabras.push({ el: span, clave }); }
        trozo.append(span);
      }
      n.replaceWith(trozo);
    }
  }

  // Dónde se quedó la última vez en este guion (si el texto no cambió).
  function posicionGuardada() {
    const p = leer(CLAVE_POSICIONES, {})[guionId];
    return p && p.n === palabras.length ? Math.min(p.pos, palabras.length) : 0;
  }
  function guardarPosicion() {
    if (!guionId) return;
    const todas = leer(CLAVE_POSICIONES, {});
    todas[guionId] = { pos: cursor >= palabras.length ? 0 : cursor, n: palabras.length };
    guardar(CLAVE_POSICIONES, todas);
  }

  // ---------- Escenario: franja, desplazamiento y cursor ----------

  const margenSeguro = () => parseFloat(getComputedStyle(q('.tp-sonda')).paddingTop) || 0;
  function irA(y) { rollo.scrollTop = y; ultimoY = rollo.scrollTop; }

  function maquetar() {
    H = escenario.clientHeight;
    if (!H) return;
    guiaAlto = A.tamano * A.interlineado;
    guiaArriba = Math.max(margenSeguro(), Math.min(H * A.arriba / 100, H - guiaAlto));
    guia.style.top = `${guiaArriba}px`;
    guia.style.height = `${guiaAlto}px`;
    texto.style.paddingTop = `${guiaArriba}px`;
    texto.style.paddingBottom = `${Math.max(0, H - guiaArriba - guiaAlto)}px`;
    alturas = palabras.map((p) => p.el.offsetTop + p.el.offsetHeight / 2);
  }
  function maquetarSinPerderse() {
    const i = cursor;
    maquetar();
    destinoY = null;
    if (leyendo && modo === 'auto') autoY = yPara(i);
    irA(yPara(i));
  }
  function yPara(i) {
    if (!palabras.length) return 0;
    i = Math.min(i, palabras.length - 1);
    return Math.max(0, alturas[i] - guiaArriba - guiaAlto / 2);
  }
  function seguirCursor(alInstante) {
    const y = yPara(cursor);
    if (alInstante) { destinoY = null; irA(y); } else destinoY = y;
  }
  function palabraEnLaGuia() {
    if (!palabras.length) return 0;
    const c = rollo.scrollTop + guiaArriba;
    let lo = 0, hi = palabras.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (alturas[m] < c) lo = m + 1; else hi = m; }
    return lo;
  }
  // Las palabras ya dichas pasan a gris al instante (clase .r, sin transición).
  function pintarLeidas() {
    const n = Math.min(cursor, palabras.length);
    if (n > leidasHasta) for (let i = leidasHasta; i < n; i++) palabras[i].el.classList.add('r');
    else for (let i = n; i < leidasHasta; i++) palabras[i].el.classList.remove('r');
    leidasHasta = n;
  }
  function ponerCursor(i, seguir = true) {
    cursor = Math.max(0, Math.min(i, palabras.length));
    pintarLeidas();
    if (seguir) seguirCursor(false);
  }
  const mismaLinea = (a, b) => Math.abs(alturas[a] - alturas[b]) < 2;
  function inicioDeLinea(i) {
    if (!palabras.length) return 0;
    i = Math.min(i, palabras.length - 1);
    while (i > 0 && mismaLinea(i - 1, i)) i--;
    return i;
  }
  function lineaAnterior() { const i = inicioDeLinea(cursor); return i > 0 ? inicioDeLinea(i - 1) : 0; }
  function lineaSiguiente() {
    if (!palabras.length) return 0;
    const s = Math.min(cursor, palabras.length - 1);
    let i = s;
    while (i < palabras.length && mismaLinea(i, s)) i++;
    return i;
  }

  // ---------- Ajustes ----------

  const FORMATO = { tamano: (v) => `${v}pt`, interlineado: (v) => `${(+v).toFixed(2)}x`, ancho: (v) => `${v}%`, margen: (v) => `${v}%`, arriba: (v) => `${v}%`, velocidad: (v) => (+v).toFixed(1) };

  function aplicarAjustes() {
    caja.style.setProperty('--tp-fs', `${A.tamano}px`);
    caja.style.setProperty('--tp-lh', A.interlineado);
    caja.style.setProperty('--tp-letra', A.letra);
    caja.style.setProperty('--tp-fondo', A.fondo);
    caja.style.setProperty('--tp-guia', A.colorGuia);
    guia.hidden = !A.guia;
    texto.style.textAlign = A.alineacion;
    espejo.className = `tp-espejo${A.espejo === 'h' ? ' mh' : A.espejo === 'v' ? ' mv' : ''}`;
    const ancho = Math.min(A.ancho, 100 - A.margen), libre = 100 - ancho;
    columna.style.width = `${ancho}%`;
    columna.style.marginLeft = `${A.alineacion === 'left' ? A.margen : A.alineacion === 'center' ? Math.min(libre, libre / 2 + A.margen / 2) : libre}%`;
    q('.tp-voz').classList.toggle('activa', !!A.voz);
    pintarBarra();
    sincronizarControles();
    maquetarSinPerderse();
  }

  function pintarRango(r) { r.style.setProperty('--p', `${(r.value - r.min) / (r.max - r.min) * 100}%`); }
  function sincronizarControles() {
    caja.querySelectorAll('.tp-hoja input[type=range]').forEach((r) => { r.value = A[r.dataset.k]; pintarRango(r); });
    caja.querySelectorAll('[data-valor]').forEach((b) => { b.textContent = FORMATO[b.dataset.valor](A[b.dataset.valor]); });
    caja.querySelectorAll('.tp-seg').forEach((s) => s.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === String(A[s.dataset.k]))));
    caja.querySelectorAll('.tp-hoja input[type=color]').forEach((c) => { c.value = A[c.dataset.k]; c.parentElement.style.background = A[c.dataset.k]; });
    q('select[data-k=idioma]').value = A.idioma;
  }

  const PESTANAS = ['cerrar', 'texto', 'tiempo', 'ayuda'];
  function mostrarPestana(nombre) {
    caja.querySelectorAll('.tp-pestanas button').forEach((b) => b.classList.toggle('on', b.dataset.pestana === nombre));
    caja.querySelectorAll('.tp-panel').forEach((p) => { p.hidden = p.dataset.panel !== nombre; });
    q('.tp-indicador').style.left = `${PESTANAS.indexOf(nombre) * 25 + 6.25}%`;
    q('.tp-hoja-cuerpo').scrollTop = 0;
  }
  function abrirHoja() { if (leyendo) return; mostrarPestana('texto'); q('.tp-hoja').classList.add('abierta'); }
  function cerrarHoja() { q('.tp-hoja').classList.remove('abierta'); }
  const hojaAbierta = () => q('.tp-hoja').classList.contains('abierta');

  // ---------- Pantalla completa, avisos ----------

  const puedePantalla = !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen);
  function pantallaCompleta() {
    if (!puedePantalla) return;
    const d = document;
    if (d.fullscreenElement || d.webkitFullscreenElement) (d.exitFullscreen || d.webkitExitFullscreen).call(d);
    else { const p = (caja.requestFullscreen || caja.webkitRequestFullscreen).call(caja); p?.catch?.(() => {}); }
  }

  function aviso(mensaje, ms = 2400) {
    const t = q('.tp-aviso');
    t.textContent = mensaje;
    t.hidden = false;
    clearTimeout(avisoTimer);
    avisoTimer = setTimeout(() => { t.hidden = true; }, ms);
  }
  function modal(titulo, cuerpo) {
    q('.tp-modal h2').textContent = titulo;
    q('.tp-modal p').textContent = cuerpo;
    q('.tp-modal').hidden = false;
    q('.tp-modal button').focus();
  }

  function ayudaMicrofono(codigo) {
    if (codigo === 'idioma') return modal('Idioma no disponible', 'Este navegador no reconoce el idioma elegido. Cambia el idioma en Ajustes → pestaña del reloj.');
    if (VozTeleprompter.esIOS && VozTeleprompter.instalada) return modal('Abre la página en Safari', 'En iPhone y iPad el micrófono a veces no está disponible desde el ícono de la pantalla de inicio. Abre la misma dirección en Safari y permite el micrófono.');
    if (codigo === 'microfono') return modal('No se encontró un micrófono', 'Revisa que haya un micrófono conectado y que ninguna otra app lo esté usando.');
    if (!window.isSecureContext) return modal('Se necesita una conexión segura', 'El micrófono solo funciona en páginas https o en localhost.');
    modal('Permite el micrófono', VozTeleprompter.esIOS
      ? 'En Safari toca «aA» en la barra de direcciones → Configuración del sitio web → Micrófono → Permitir. Luego vuelve a pulsar el botón verde.'
      : 'Toca el ícono del candado (o de ajustes) junto a la dirección, permite el Micrófono y vuelve a pulsar el botón verde.');
  }

  // ---------- Lectura ----------

  function pintarBarra() {
    q('.tp-barra-inicio').hidden = leyendo;
    q('.tp-barra-lectura').hidden = !leyendo;
    q('.tp-pildora-onda').hidden = leyendo || !A.voz;
    q('.tp-crono').hidden = !(leyendo && A.crono && !contando);
    requestAnimationFrame(medirLienzos);
  }
  function pintarCrono() {
    const s = Math.floor((performance.now() - t0) / 1000);
    q('.tp-crono').textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }
  function cuentaAtras(n) {
    return new Promise((listo) => {
      const el = q('.tp-cuenta');
      let k = n;
      el.textContent = k;
      el.hidden = false;
      const iv = setInterval(() => {
        if (!leyendo) { clearInterval(iv); el.hidden = true; listo(false); return; }
        if (--k <= 0) { clearInterval(iv); el.hidden = true; listo(true); } else el.textContent = k;
      }, 1000);
    });
  }
  // Pantalla siempre encendida mientras se lee.
  async function pedirBloqueo() { try { bloqueo = await navigator.wakeLock.request('screen'); } catch { bloqueo = null; } }
  function soltarBloqueo() { try { bloqueo?.release(); } catch {} bloqueo = null; }
  function alVolver() { if (document.visibilityState === 'visible' && leyendo) pedirBloqueo(); }

  function alOir(oidas) {
    mic?.pulso();
    const nuevo = MotorTeleprompter.avanzar(claves, cursor, oidas);
    if (nuevo !== cursor) ponerCursor(nuevo);
    if (cursor >= palabras.length) {
      clearTimeout(finTimer);
      finTimer = setTimeout(() => { if (leyendo && cursor >= palabras.length) detener(); }, 1800);
    }
  }
  function alErrorDeVoz(codigo) {
    if (codigo === 'red') return aviso('Sin conexión: el reconocimiento de voz necesita internet en este navegador.', 3500);
    detener();
    ayudaMicrofono(codigo);
  }

  async function iniciar() {
    if (leyendo) return;
    if (!palabras.length) { aviso('Este guión todavía no tiene texto para decir.'); return; }
    if (cursor >= palabras.length) ponerCursor(0, false);
    modo = A.voz && VozTeleprompter.disponible ? 'voz' : 'auto';
    if (A.voz && !VozTeleprompter.disponible) aviso('Este navegador no reconoce voz. Usa Chrome, Edge o Safari. Ahora va en modo automático.', 4000);
    leyendo = true;
    caja.classList.add('leyendo');
    cerrarHoja();
    seguirCursor(false);
    pedirBloqueo();
    if (A.cuenta) {
      contando = true;
      pintarBarra();
      const sigue = await cuentaAtras(A.cuenta);
      contando = false;
      if (!sigue || !leyendo) return;
    }
    pintarBarra();
    t0 = performance.now();
    pintarCrono();
    cronoIv = setInterval(pintarCrono, 250);
    if (modo === 'voz') {
      escucha = VozTeleprompter.escuchar({ idioma: A.idioma, alOir, alError: alErrorDeVoz });
      mic = VozTeleprompter.medidor();
    } else autoY = rollo.scrollTop;
  }

  function detener() {
    if (!leyendo) return;
    leyendo = false;
    contando = false;
    q('.tp-cuenta').hidden = true;
    escucha?.detener(); escucha = null;
    mic?.apagar(); mic = null;
    clearInterval(cronoIv);
    clearTimeout(finTimer);
    soltarBloqueo();
    caja.classList.remove('leyendo');
    pintarBarra();
    guardarPosicion();
  }
  const alternar = () => (leyendo ? detener() : iniciar());

  function cambiarVelocidad(d) {
    A.velocidad = Math.max(0.5, Math.min(10, A.velocidad + d));
    guardarAjustes();
    sincronizarControles();
    aviso(`Velocidad ${A.velocidad.toFixed(1)}`, 1200);
  }
  function atras() { if (leyendo && modo === 'auto') return cambiarVelocidad(-0.5); ponerCursor(lineaAnterior()); }
  function adelante() { if (leyendo && modo === 'auto') return cambiarVelocidad(0.5); ponerCursor(lineaSiguiente()); }
  function alComienzo() {
    ponerCursor(0);
    if (leyendo && modo === 'auto') { destinoY = null; autoY = 0; irA(0); }
  }
  const pxPorSegundo = () => A.velocidad * 0.08 * A.tamano * A.interlineado;
  function alternarVoz() {
    A.voz = A.voz ? 0 : 1;
    guardarAjustes();
    aplicarAjustes();
    aviso(A.voz ? (VozTeleprompter.disponible ? 'Seguimiento por voz activado' : 'Este navegador no reconoce voz; se usará el modo automático')
      : 'Voz desactivada: el texto subirá a velocidad constante');
  }
  function cambiarTamano(d) { A.tamano = Math.max(16, Math.min(140, A.tamano + d)); guardarAjustes(); aplicarAjustes(); }

  // ---------- Onda del micrófono ----------

  function medirLienzos() {
    if (!caja) return;
    const d = devicePixelRatio || 1;
    for (const c of caja.querySelectorAll('canvas')) {
      const r = c.getBoundingClientRect();
      if (r.width) { c.width = Math.round(r.width * d); c.height = Math.round(r.height * d); }
    }
  }
  function dibujarOnda(c, amplitud) {
    const ctx = c.getContext('2d'), W = c.width, Ha = c.height;
    if (!W) return;
    ctx.clearRect(0, 0, W, Ha);
    const grosor = Math.max(1.5, Ha / 14);
    ctx.lineWidth = grosor; ctx.strokeStyle = '#fff'; ctx.lineCap = 'round';
    ctx.beginPath();
    for (let x = 0; x <= W; x += 2) {
      const t = x / W, envolvente = Math.sin(Math.PI * t);
      const y = Ha / 2 + Math.sin(t * Math.PI * 4 + fase) * amplitud * envolvente * (Ha / 2 - grosor);
      x ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.stroke();
  }

  // ---------- Bucle de animación ----------

  function cuadro(ahora) {
    const dt = Math.min(0.25, (ahora - ultimo) / 1000);
    ultimo = ahora;
    if (tocando || ahora < usuarioHasta) destinoY = null;            // el usuario está arrastrando el texto
    else if (usuarioMovio) {                                         // lo soltó: seguir desde la palabra en la franja
      usuarioMovio = false;
      ultimoY = rollo.scrollTop;
      ponerCursor(palabraEnLaGuia(), false);
      if (leyendo && modo === 'auto') autoY = rollo.scrollTop; else seguirCursor(false);
    } else if (leyendo && modo === 'auto' && !contando) {
      const max = rollo.scrollHeight - rollo.clientHeight;
      autoY = Math.min(max, autoY + pxPorSegundo() * dt);
      irA(autoY);
      const i = palabraEnLaGuia();
      if (i !== cursor) ponerCursor(i, false);
      if (autoY >= max - 1 && cursor >= palabras.length - 1) { ponerCursor(palabras.length, false); detener(); }
    } else if (destinoY != null) {
      const c = rollo.scrollTop, d = destinoY - c;
      if (Math.abs(d) <= 1) { irA(destinoY); destinoY = null; }
      else { let paso = d * Math.min(1, dt * 7); if (Math.abs(paso) < 1) paso = Math.sign(d); irA(c + paso); }
    }
    const nivel = mic ? mic.leer(dt) : 0;
    fase += dt * (leyendo ? 7 : 2);
    if (leyendo) dibujarOnda(q('.tp-onda-b'), modo === 'voz' ? 0.06 + nivel * 0.94 : 0.05);
    else if (!q('.tp-pildora-onda').hidden) dibujarOnda(q('.tp-onda-a'), 0.32);
    animacion = requestAnimationFrame(cuadro);
  }

  // ---------- Teclado y controles ----------

  function teclas(e) {
    e.stopPropagation(); // que no lleguen a los atajos de la app de atrás
    if (!q('.tp-modal').hidden) {
      if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); q('.tp-modal').hidden = true; }
      return;
    }
    if (e.target.closest?.('input,select')) return;
    if (hojaAbierta()) { if (e.key === 'Escape') cerrarHoja(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const mapa = {
      ' ': alternar,
      Escape: () => (leyendo ? detener() : cerrar()),
      ArrowUp: atras, PageUp: atras,
      ArrowDown: adelante, PageDown: adelante,
      ArrowLeft: () => ponerCursor(cursor - 1),
      ArrowRight: () => ponerCursor(cursor + 1),
      Home: alComienzo, r: alComienzo,
      '+': () => cambiarTamano(2), '=': () => cambiarTamano(2),
      '-': () => cambiarTamano(-2), _: () => cambiarTamano(-2),
      v: () => { if (!leyendo) alternarVoz(); },
      m: () => { A.espejo = A.espejo === 'off' ? 'h' : 'off'; guardarAjustes(); aplicarAjustes(); },
      f: pantallaCompleta,
    };
    const accion = mapa[e.key] || mapa[e.key.toLowerCase()];
    if (!accion) return;
    e.preventDefault();
    accion();
  }

  function conectarControles() {
    const acciones = {
      ajustes: abrirHoja, voz: alternarVoz, iniciar, pantalla: pantallaCompleta, salir: cerrar,
      atras, adelante, detener, comienzo: alComienzo,
    };
    caja.addEventListener('click', (e) => {
      const b = e.target.closest('[data-accion]');
      if (b) acciones[b.dataset.accion]();
    });
    q('.tp-pestanas').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (b) b.dataset.pestana === 'cerrar' ? cerrarHoja() : mostrarPestana(b.dataset.pestana);
    });
    caja.querySelectorAll('.tp-hoja input').forEach((i) => i.addEventListener('input', () => {
      A[i.dataset.k] = i.type === 'range' ? +i.value : i.value;
      guardarAjustes();
      aplicarAjustes();
    }));
    caja.querySelectorAll('.tp-seg').forEach((s) => s.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      A[s.dataset.k] = typeof POR_DEFECTO[s.dataset.k] === 'number' ? +b.dataset.v : b.dataset.v;
      guardarAjustes();
      aplicarAjustes();
    }));
    q('select[data-k=idioma]').addEventListener('change', (e) => { A.idioma = e.target.value; guardarAjustes(); });
    q('.tp-modal button').addEventListener('click', () => { q('.tp-modal').hidden = true; });

    // Tocar una palabra: seguir desde ahí.
    columna.addEventListener('click', (e) => {
      const w = e.target.closest('.w');
      if (!w || w.dataset.i == null) return;
      ponerCursor(+w.dataset.i);
      if (leyendo && modo === 'auto') { destinoY = null; autoY = yPara(cursor); irA(autoY); }
    });
    // Arrastrar el texto: al soltarlo, la palabra que quede en la franja es la nueva posición.
    rollo.addEventListener('touchstart', () => { tocando = true; }, { passive: true });
    const soltar = () => { tocando = false; usuarioHasta = performance.now() + 300; };
    rollo.addEventListener('touchend', soltar, { passive: true });
    rollo.addEventListener('touchcancel', soltar, { passive: true });
    rollo.addEventListener('wheel', () => { usuarioHasta = performance.now() + 350; }, { passive: true });
    rollo.addEventListener('scroll', () => {
      if (Math.abs(rollo.scrollTop - ultimoY) > 2) { usuarioMovio = true; usuarioHasta = Math.max(usuarioHasta, performance.now() + 200); }
    }, { passive: true });
  }

  // ---------- Abrir y cerrar ----------

  function cerrar() {
    if (!caja) return;
    detener();
    cancelAnimationFrame(animacion);
    observador?.disconnect();
    clearTimeout(avisoTimer);
    document.removeEventListener('keydown', teclas, true);
    document.removeEventListener('visibilitychange', alVolver);
    if (document.fullscreenElement || document.webkitFullscreenElement) (document.exitFullscreen || document.webkitExitFullscreen).call(document)?.catch?.(() => {});
    caja.remove();
    caja = null;
  }

  function abrir(guion) {
    if (caja) cerrar();
    document.activeElement?.blur?.();
    caja = document.createElement('div');
    caja.className = 'teleprompter';
    caja.setAttribute('role', 'dialog');
    caja.setAttribute('aria-label', 'Teleprompter');
    caja.innerHTML = PLANTILLA;
    q = (selector) => caja.querySelector(selector);
    escenario = q('.tp-escenario'); espejo = q('.tp-espejo'); guia = q('.tp-guia');
    rollo = q('.tp-rollo'); texto = q('.tp-texto'); columna = q('.tp-columna');
    if (!puedePantalla) {
      q('.tp-fila-pantalla').hidden = true;
      q('.tp-boton-pantalla').style.visibility = 'hidden';
    }

    guionId = guion.id || '';
    palabras = []; cursor = 0; leidasHasta = 0; destinoY = null; leyendo = false; contando = false;
    pintarContenido(guion);
    claves = palabras.map((p) => p.clave);
    conectarControles();
    document.body.append(caja);
    document.addEventListener('keydown', teclas, true);
    document.addEventListener('visibilitychange', alVolver);

    aplicarAjustes();
    cursor = posicionGuardada();
    pintarLeidas();
    seguirCursor(true);
    observador = new ResizeObserver(() => requestAnimationFrame(() => { if (caja) { maquetarSinPerderse(); medirLienzos(); } }));
    observador.observe(escenario);
    document.fonts?.ready.then(() => { if (caja) maquetarSinPerderse(); });
    ultimo = performance.now();
    animacion = requestAnimationFrame(cuadro);
    caja.requestFullscreen?.().catch(() => {});
  }

  return { abrir };
})();

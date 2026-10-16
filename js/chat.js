// Chat de comentarios con aspecto de WhatsApp, en los colores de aifotos.
// Lo usan la página del cliente y tu panel.
const Chat = (() => {
  function el(etiqueta, clase, texto) {
    const nodo = document.createElement(etiqueta);
    if (clase) nodo.className = clase;
    if (texto != null) nodo.textContent = texto;
    return nodo;
  }

  const hora = (ms) => new Date(ms).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });

  function dia(ms) {
    const fecha = new Date(ms);
    const hoy = new Date();
    const ayer = new Date();
    ayer.setDate(hoy.getDate() - 1);
    if (fecha.toDateString() === hoy.toDateString()) return 'Hoy';
    if (fecha.toDateString() === ayer.toDateString()) return 'Ayer';
    return fecha.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' });
  }

  // opciones: { yo: 'cliente' | 'admin', nombres: { admin, cliente }, alTocarCita(c), vacio, alFinal }
  function pintar(lista, comentarios, opciones) {
    // Si estabas leyendo mensajes antiguos no te mueve; si estabas al final, sigue al final.
    const estabaAbajo = lista.scrollHeight - lista.scrollTop - lista.clientHeight < 80;
    lista.replaceChildren();
    let diaAnterior = '';
    for (const c of comentarios) {
      const d = dia(c.creado);
      if (d !== diaAnterior) {
        const separador = el('li', 'chat-dia');
        separador.append(el('span', '', d));
        lista.append(separador);
        diaAnterior = d;
      }
      const propio = c.autor === opciones.yo;
      const li = el('li', `mensaje ${propio ? 'propio' : 'ajeno'}`);
      li.dataset.id = c.id;
      const burbuja = el('div', 'burbuja');
      if (!propio) burbuja.append(el('span', 'mensaje-autor', opciones.nombres[c.autor] || ''));
      if (c.cita) {
        const cita = el('button', 'mensaje-cita');
        cita.type = 'button';
        cita.title = 'Ver la frase en el guión';
        cita.append(el('span', 'mensaje-cita-titulo', 'Frase del guión'), el('span', 'mensaje-cita-texto', c.cita.texto));
        cita.addEventListener('click', () => opciones.alTocarCita?.(c));
        burbuja.append(cita);
      }
      const texto = el('p', 'mensaje-texto', c.texto);
      const pie = el('span', 'mensaje-hora', hora(c.creado));
      if (propio) pie.append(el('span', 'mensaje-visto', ' ✓✓'));
      texto.append(pie);
      burbuja.append(texto);
      li.append(burbuja);
      lista.append(li);
    }
    if (!comentarios.length) lista.append(el('li', 'chat-vacio', opciones.vacio || 'Aún no hay mensajes.'));
    if (estabaAbajo || opciones.alFinal) lista.scrollTop = lista.scrollHeight;
  }

  // Campo para escribir: crece con el texto. En computadora Enter envía y
  // Mayús+Enter salta de línea; en el celular Enter salta de línea, como en WhatsApp.
  function prepararCampo(campo, formulario) {
    const ajustar = () => {
      campo.style.height = 'auto';
      campo.style.height = `${Math.min(campo.scrollHeight, 140)}px`;
    };
    campo.addEventListener('input', ajustar);
    campo.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && window.matchMedia('(pointer: fine)').matches) {
        e.preventDefault();
        formulario.requestSubmit();
      }
    });
    return ajustar;
  }

  // Ventana de chat flotante con forma de celular. En pantallas grandes va junto
  // al guion y empieza abierta; en pantallas medianas y en el celular empieza
  // cerrada y se abre con el botón redondo (en el celular, a pantalla completa).
  // Recuerda si la dejaste abierta o minimizada.
  // anchoAbierto: desde qué ancho de ventana cabe junto al guion y empieza abierto.
  function flotante({ telefono, botonAbrir, botonesCerrar, clave, alAbrir, anchoAbierto = 1200 }) {
    const esCelular = () => window.innerWidth <= 900;
    let minimizado;
    try {
      const guardado = localStorage.getItem(clave);
      minimizado = guardado === null ? window.innerWidth < anchoAbierto : guardado === '1';
    } catch {
      minimizado = window.innerWidth < anchoAbierto;
    }
    if (esCelular()) minimizado = true;

    function aplicar() {
      telefono.classList.toggle('minimizado', minimizado);
      document.body.classList.toggle('chat-minimizado', minimizado);
    }

    function poner(valor) {
      minimizado = valor;
      if (!esCelular()) { try { localStorage.setItem(clave, valor ? '1' : '0'); } catch {} }
      aplicar();
      if (!valor) alAbrir?.();
    }

    botonAbrir.addEventListener('click', () => poner(false));
    for (const boton of botonesCerrar) boton.addEventListener('click', () => poner(true));
    aplicar();

    // La hora de la barra de estado del celular dibujado es la hora real.
    const reloj = telefono.querySelector('.telefono-hora');
    const ponerHora = () => { if (reloj) reloj.textContent = hora(Date.now()); };
    ponerHora();
    setInterval(ponerHora, 30000);

    return { abrir: () => poner(false), cerrar: () => poner(true), visible: () => !minimizado };
  }

  // Sonido corto de "mensaje nuevo" (dos notas), creado en el navegador: no hace falta archivo.
  // Los navegadores solo dejan sonar después de que la persona haya tocado la página una vez.
  let audio = null;
  function sonar() {
    try {
      audio ||= new (window.AudioContext || window.webkitAudioContext)();
      const ahora = audio.currentTime;
      [[880, 0], [1318.5, 0.12]].forEach(([frecuencia, retraso]) => {
        const nota = audio.createOscillator();
        const volumen = audio.createGain();
        nota.type = 'sine';
        nota.frequency.value = frecuencia;
        volumen.gain.setValueAtTime(0.0001, ahora + retraso);
        volumen.gain.exponentialRampToValueAtTime(0.18, ahora + retraso + 0.02);
        volumen.gain.exponentialRampToValueAtTime(0.0001, ahora + retraso + 0.35);
        nota.connect(volumen).connect(audio.destination);
        nota.start(ahora + retraso);
        nota.stop(ahora + retraso + 0.4);
      });
    } catch { /* sin sonido: no pasa nada */ }
  }

  // "(3) Título": el número de novedades se ve en la pestaña aunque estés en otra.
  function contarEnPestana(titulo, cuantas) {
    document.title = cuantas ? `(${cuantas}) ${titulo}` : titulo;
  }

  return { pintar, prepararCampo, flotante, sonar, contarEnPestana };
})();

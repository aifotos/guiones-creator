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

  // opciones: { yo: 'cliente' | 'admin', alTocarCita(c), vacio, alFinal }
  // Propios a la derecha (negro), del otro a la izquierda (papel); la cita va encima, en ámbar.
  function pintar(lista, comentarios, opciones) {
    // Si estabas leyendo mensajes antiguos no te mueve; si estabas al final, sigue al final.
    const estabaAbajo = lista.scrollHeight - lista.scrollTop - lista.clientHeight < 80;
    lista.replaceChildren();
    let diaAnterior = '';
    for (const c of comentarios) {
      const d = dia(c.creado);
      if (d !== diaAnterior) {
        lista.append(el('li', 'chat-evento', d));
        diaAnterior = d;
      }
      const propio = c.autor === opciones.yo;
      const li = el('li', `mensaje ${propio ? 'propio' : 'ajeno'}`);
      li.dataset.id = c.id;
      const cuerpo = el('div', 'mensaje-cuerpo');
      if (c.cita) {
        const cita = el('button', 'mensaje-cita', `“${c.cita.texto}”`);
        cita.type = 'button';
        cita.title = 'Ver la frase en el guión';
        cita.addEventListener('click', () => opciones.alTocarCita?.(c));
        cuerpo.append(cita);
      }
      cuerpo.append(el('span', 'burbuja', c.texto), el('span', 'mensaje-hora', hora(c.creado)));
      li.append(cuerpo);
      lista.append(li);
    }
    if (!comentarios.length) lista.append(el('li', 'chat-evento', opciones.vacio || 'Aún no hay mensajes'));
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

  return { pintar, prepararCampo, sonar, contarEnPestana };
})();

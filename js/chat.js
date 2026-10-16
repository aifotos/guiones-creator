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

  return { pintar, prepararCampo };
})();

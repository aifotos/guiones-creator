// Modelo del guión: formatos, tipos de bloque, análisis del texto pegado,
// conversión entre formatos y estadísticas (palabras y duración).
const Guion = (() => {
  // tiempo: si sus palabras cuentan para la duración del video.
  const TIPOS = {
    escena:     { nombre: 'Escena',            plural: 'escenas',            tiempo: false, ayuda: 'Escribe int o ext y elige una sugerencia' },
    accion:     { nombre: 'Acción',            plural: 'acciones',           tiempo: true,  ayuda: 'Lo que se ve: qué pasa y qué hacen los personajes' },
    camara:     { nombre: 'En cámara',         plural: 'en cámara',          tiempo: true,  ayuda: 'Lo que dice la persona frente a la cámara' },
    voz:        { nombre: 'Voz en off',        plural: 'voces en off',       tiempo: true,  ayuda: 'Narración que se escucha sin ver a quien habla' },
    pantalla:   { nombre: 'Texto en pantalla', plural: 'textos en pantalla', tiempo: false, ayuda: 'Títulos, rótulos o subtítulos que aparecen escritos' },
    nota:       { nombre: 'Nota de dirección', plural: 'notas de dirección', tiempo: false, ayuda: 'Indicaciones de toma, B-roll, música…' },
    transicion: { nombre: 'Transición',        plural: 'transiciones',       tiempo: false, ayuda: 'CORTE A:, FUNDIDO A NEGRO…' },
    parrafo:    { nombre: 'Texto',             plural: 'textos',             tiempo: true,  ayuda: 'Escribe el guión tal como lo leerá tu cliente…' },
  };

  const FORMATOS = {
    sencillo: {
      nombre: 'Sencillo',
      descripcion: 'Solo el texto, sin términos técnicos. Ideal para cualquier cliente.',
      tipos: ['parrafo'],
    },
    video: {
      nombre: 'Video / redes',
      descripcion: 'Reels y anuncios: escenas, en cámara, voz en off, texto en pantalla y notas.',
      tipos: ['escena', 'camara', 'voz', 'pantalla', 'nota'],
    },
    cine: {
      nombre: 'Cinematográfico',
      descripcion: 'Formato de cine: INT./EXT., acción, personajes y diálogos.',
      tipos: ['escena', 'accion', 'camara', 'transicion'],
      nombres: { escena: ['Encabezado', 'encabezados'], camara: ['Diálogo', 'diálogos'] },
    },
  };

  // Qué bloque sigue al pulsar ⌘ + Enter, como en los programas de guion.
  const SIGUIENTE = {
    video: { escena: 'camara' },
    cine: { escena: 'accion', accion: 'camara', camara: 'accion', transicion: 'escena' },
  };

  // ~150 palabras por minuto: ritmo natural hablando en español.
  const PALABRAS_POR_SEGUNDO = 2.5;

  function nombreTipo(tipo, formato, plural = false) {
    const propio = FORMATOS[formato]?.nombres?.[tipo];
    if (propio) return propio[plural ? 1 : 0];
    return plural ? TIPOS[tipo].plural : TIPOS[tipo].nombre;
  }

  function siguienteTipo(formato, tipo) {
    return SIGUIENTE[formato]?.[tipo] || tipo;
  }

  function nuevoId() {
    if (globalThis.crypto && crypto.randomUUID) return crypto.randomUUID();
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  function nuevoBloque(tipo = 'camara', texto = '', extra = {}) {
    return { id: nuevoId(), tipo, texto, ...extra };
  }

  // ---------- Encabezados de escena ----------

  // "int casa - noche" → "INT. casa - noche"; "12 EXT. PARQUE - DÍA 12" → "EXT. PARQUE - DÍA"
  function normalizarEncabezado(t) {
    let s = t.trim();
    const numerado = s.match(/^\d+[A-Z]?[.)]?\s+(?=(?:INT|EXT|I\/E))/i);
    if (numerado) s = s.slice(numerado[0].length).replace(/\s+\d+[A-Z]?$/, '');
    return s
      .replace(/^(int|ext)\.?\s*\/\s*(int|ext)\.?\s*/i, (_, a, b) => `${a.toUpperCase()}./${b.toUpperCase()}. `)
      .replace(/^i\/e\.?\s*/i, 'INT./EXT. ')
      .replace(/^(int|ext)(?:\.\s*|\s+)/i, (_, a) => `${a.toUpperCase()}. `)
      .trim();
  }

  // ---------- Análisis del texto pegado ----------

  const SEP = '\\s*(?:\\([^)]*\\))?\\s*[:\\-–—]\\s*';
  const ETIQUETAS = [
    ['voz',      'v\\.?\\s?o\\.?|voz(?:\\s+en)?\\s+off|off|narrador(?:a)?|narraci[oó]n|locuci[oó]n|locutor(?:a)?|audio'],
    ['pantalla', 'texto(?:\\s+en\\s+pantalla)?|t\\.?e\\.?p\\.?|super|z[oó]calo|gr[aá]fico|subt[ií]tulo|t[ií]tulo|on[\\s-]?screen(?:\\s+text)?'],
    ['nota',     'nota|direcci[oó]n|acci[oó]n|b-?roll|m[uú]sica|sonido|sfx|efecto|video|visual|imagen|plano|transici[oó]n'],
    ['camara',   'en\\s+c[aá]mara|c[aá]mara|on\\s*cam|di[aá]logo|talento|host|presentador(?:a)?|texto hablado'],
  ].map(([tipo, src]) => [tipo, new RegExp(`^(?:${src})${SEP}`, 'i')]);

  const RE_ENCABEZADO = /^(?:\d+[A-Z]?[.)]?\s+)?(?:(?:INT|EXT)\.?\s*\/\s*(?:INT|EXT)\.?|I\/E\.?|INT\.|EXT\.|INT(?=\s)|EXT(?=\s))\s*\S/i;
  const RE_INTERIOR = /^(?:interior|exterior)\b[\s.,:\-–—]+\S/i;
  const RE_ESCENA = /^[\[(]?\s*(?:escena|scene|toma|secuencia|esc\.)\s*(?:#?\s*\d+[A-Z]?\s*[\])]?\s*(?:[:.\-–—]\s*|\s|$)|[\])]?\s*[:\-–—]\s*|[\])]?\s*$)/i;
  const RE_SECCION = /^[\[(]?\s*(hook|gancho|intro(?:ducci[oó]n)?|apertura|desarrollo|cuerpo|contexto|problema|soluci[oó]n|beneficios?|oferta|prueba social|testimonios?|cta|call to action|llamada a la acci[oó]n|cierre|final|outro|remate|punchline|conclusi[oó]n)\s*\d*\s*[\])]?\s*(?:[:.\-–—]\s*(.*)|$)/i;
  const RE_TRANSICION = /^(?:corte a|corta a|fundido(?:\s+(?:a negro|a blanco|de entrada|de salida|encadenado|a))?|encadenado|disolvencia(?:\s+a)?|cut to|smash cut(?: to)?|match cut(?: to)?|fade (?:in|out|to black)|dissolve to)\s*[:.]?$|^[A-ZÁÉÍÓÚÑ ]{2,30}(?: A| TO):$/i;
  const RE_PARENTESIS = /^[(\[](.*)[)\]]$/;
  const RE_NOMBRE = /^([\p{Lu}][\p{L}.'’]*(?:\s+[\p{Lu}][\p{L}.'’]*){0,2})\s*(?:\(([^)]*)\))?\s*:\s+(.+)$/u;
  const RE_TIEMPO = /^[\[(]?\s*(?:\d{1,2}:\d{2}(?:\s*(?:-|–|—|a)\s*\d{1,2}:\d{2})?|\d+\s*(?:-|–|—|a)\s*\d+\s*(?:s|seg|segundos)\b)\s*[\])]?\s*[:\-–—|]?\s*/i;
  const RE_CABECERA_TABLA = /^(?:video|visual|imagen|audio|texto|tiempo|duraci[oó]n|escena|plano|sonido|di[aá]logo|n[ºo°.]?|#)$/i;
  // Frases que describen la imagen, no lo que se dice: "Plano medio de…", "Vemos a…"
  const RE_DESCRIPCION = /^(?:plano|primer[ií]simo|primer plano|gran plano|toma (?:a[eé]rea|de|general|cenital|abierta|cerrada)|close[\s-]?up|b-?roll|insert\b|detalle de|vista (?:a[eé]rea|de)|travel+ing|paneo|zoom|c[aá]mara (?:lenta|sigue|se )|vemos|se ve\b|aparece|cortinilla)/i;
  const RE_EXTENSION = /\((?:v\.?\s?o\.?|o\.?\s?s\.?|o\.?\s?c\.?|cont)/i;

  const PICTO = /^[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}️‍\s]+/u;
  const EMOJI_TIPO = [[/🎬|🎥|📹|🎞/u, 'escena'], [/🎙|🎤|🗣|🔊/u, 'voz'], [/📝|🔤|✍/u, 'pantalla'], [/💡|📌|⚠|👉/u, 'nota']];

  // Quita viñetas, markdown y emojis, pero recuerda el emoji como pista del tipo.
  function limpiarLinea(linea) {
    let texto = linea.replace(/ /g, ' ').trim()
      .replace(/^#{1,6}\s+/, '').replace(/^>\s?/, '').replace(/^[-*•·▪►]\s+/, '');
    let pista = null;
    const emoji = texto.match(PICTO);
    if (emoji) {
      for (const [re, tipo] of EMOJI_TIPO) if (re.test(emoji[0])) { pista = tipo; break; }
      texto = texto.slice(emoji[0].length);
    }
    texto = texto.replace(/\*\*(.+?)\*\*/g, '$1').replace(/__(.+?)__/g, '$1').trim();
    return { texto, pista };
  }

  const claveNombre = (n) => n.replace(/\s*\([^)]*\)/g, '').trim().toUpperCase();

  function esMayusculas(t) {
    return /\p{L}/u.test(t) && t === t.toUpperCase();
  }

  // Nombre de personaje en su propia línea, como en los guiones de cine: "MARÍA (V.O.)"
  function pareceCue(t) {
    if (t.length > 40 || /[.!?,;:¡¿]$/.test(t)) return false;
    const base = claveNombre(t);
    if (!base || !esMayusculas(base) || base.split(/\s+/).length > 4) return false;
    return !/^(?:FIN|THE END|FADE IN|CONTINUAR[ÁA]|CONTINUED)$/.test(base);
  }

  function etiquetaSeccion(palabra) {
    return /^cta$/i.test(palabra) ? 'CTA' : palabra.charAt(0).toUpperCase() + palabra.slice(1).toLowerCase();
  }

  // Une dos líneas: si la anterior acaba la frase, salto de línea; si no, era la misma frase partida.
  function unir(a, b) {
    if (!a) return b;
    return /[.!?…:;"»)\]]$/.test(a) ? `${a}\n${b}` : `${a} ${b}`;
  }

  // Convierte cada línea en una "pieza" (escena, personaje, diálogo…).
  function tokenizar(texto, formato) {
    const crudas = texto.replace(/\r\n?/g, '\n').split('\n');
    const lineas = crudas.map(limpiarLinea);

    // Primera pasada: qué nombres se repiten, para distinguir personajes de títulos.
    const veces = new Map();
    const contar = (n) => veces.set(claveNombre(n), (veces.get(claveNombre(n)) || 0) + 1);
    lineas.forEach(({ texto: t }, i) => {
      const m = t.match(RE_NOMBRE);
      if (m && !ETIQUETAS.some(([, re]) => re.test(t)) && !RE_SECCION.test(t)) contar(m[1]);
      else if (pareceCue(t) && siguienteEsTexto(i)) contar(t);
    });
    const seRepite = (n) => veces.get(claveNombre(n)) >= 2 || RE_EXTENSION.test(n);
    const esPersonaje = (n) => esMayusculas(claveNombre(n)) && seRepite(n);

    function siguienteEsTexto(i) {
      for (let j = i + 1; j < lineas.length; j++) {
        const t = lineas[j].texto;
        if (!t) return false;
        return !RE_ENCABEZADO.test(t) && !RE_TRANSICION.test(t) && !(pareceCue(t) && !RE_PARENTESIS.test(t));
      }
      return false;
    }

    const piezas = [];
    lineas.forEach(({ texto: original, pista }, i) => {
      let t = original;
      if (!t) { piezas.push({ k: 'blanco' }); return; }

      // Filas de una tabla copiada de Docs/Excel: columna de imagen y columna de audio.
      if (crudas[i].includes('\t')) {
        const cols = crudas[i].split('\t').map((c) => limpiarLinea(c).texto).filter(Boolean);
        if (cols.length >= 2 && cols.every((c) => RE_CABECERA_TABLA.test(c))) return;
        const utiles = cols.filter((c) => c.replace(RE_TIEMPO, '').trim());
        if (utiles.length >= 2) {
          piezas.push({ k: 'bloque', tipo: 'nota', texto: utiles[0] });
          piezas.push({ k: 'bloque', tipo: 'camara', texto: utiles.slice(1).join(' ') });
          piezas.push({ k: 'blanco' });
          return;
        }
        t = utiles.join(' ') || t;
      }

      // Marcas de tiempo "0:00-0:05" o "[0-3 s]": si van solas, abren un tramo.
      const tiempo = t.match(RE_TIEMPO);
      if (tiempo) {
        const resto = t.slice(tiempo[0].length).trim();
        if (!resto) { piezas.push({ k: 'escena', texto: tiempo[0].replace(/[\[\]()|:\-–—\s]+$/, '').replace(/^[\[(]\s*/, '') }); return; }
        t = resto;
      }

      let m;
      if (RE_ENCABEZADO.test(t) || (RE_INTERIOR.test(t) && t.length < 80)) {
        piezas.push({ k: 'escena', texto: normalizarEncabezado(t) });
      } else if ((m = t.match(RE_ESCENA))) {
        piezas.push({ k: 'escena', texto: t.slice(m[0].length).trim() });
      } else if ((m = t.match(RE_SECCION))) {
        piezas.push({ k: 'escena', texto: etiquetaSeccion(m[1]) });
        if (m[2] && m[2].trim()) piezas.push({ k: 'bloque', tipo: 'camara', texto: m[2].trim() });
      } else if (RE_TRANSICION.test(t)) {
        piezas.push({ k: 'transicion', texto: t.toUpperCase() });
      } else if (ETIQUETAS.some(([, re]) => re.test(t))) {
        const [tipo, re] = ETIQUETAS.find(([, r]) => r.test(t));
        piezas.push({ k: 'bloque', tipo, texto: t.replace(re, '').trim() });
      } else if ((m = t.match(RE_PARENTESIS))) {
        piezas.push({ k: 'acotacion', texto: m[1].trim() });
      } else if ((m = t.match(RE_NOMBRE)) && seRepite(m[1])) {
        piezas.push({ k: 'bloque', tipo: 'camara', texto: m[3].trim(), personaje: claveNombre(m[1]), acotacion: (m[2] || '').trim() });
      } else if (pareceCue(t) && siguienteEsTexto(i)) {
        // En cine, un nombre en mayúsculas es un personaje. En video solo si se repite;
        // si no, es un título de sección ("BENEFICIOS DEL PRODUCTO").
        if (formato === 'cine' || esPersonaje(t)) piezas.push({ k: 'cue', nombre: t.toUpperCase() });
        else piezas.push({ k: 'escena', texto: t });
      } else if (pista) {
        piezas.push({ k: 'bloque', tipo: pista, texto: t });
      } else if (RE_DESCRIPCION.test(t)) {
        piezas.push({ k: 'bloque', tipo: 'nota', texto: t });
      } else {
        piezas.push({ k: 'texto', texto: t });
      }
    });
    return piezas;
  }

  // Junta las piezas en bloques. Lo que no se pudo clasificar queda como 'texto'.
  function ensamblar(piezas) {
    const bloques = [];
    let actual = null;
    let cue = null;
    for (const p of piezas) {
      if (p.k === 'blanco') {
        actual = null;
      } else if (p.k === 'escena' || p.k === 'transicion') {
        bloques.push(nuevoBloque(p.k, p.texto));
        actual = null; cue = null;
      } else if (p.k === 'cue') {
        cue = { personaje: p.nombre.replace(/\s+/g, ' ').trim(), acotacion: '' };
        actual = null;
      } else if (p.k === 'acotacion') {
        if (cue) cue.acotacion = p.texto;
        else if (actual && actual.tipo === 'camara' && actual.personaje) actual.texto += ` (${p.texto})`;
        else { bloques.push(nuevoBloque('nota', p.texto)); actual = null; }
      } else if (p.k === 'bloque') {
        const extra = p.personaje ? { personaje: p.personaje, acotacion: p.acotacion || '' } : {};
        actual = nuevoBloque(p.tipo, p.texto, extra);
        bloques.push(actual);
        cue = null;
      } else if (cue) {
        actual = nuevoBloque('camara', p.texto, cue);
        bloques.push(actual);
        cue = null;
      } else if (actual) {
        actual.texto = unir(actual.texto, p.texto);
      } else {
        actual = nuevoBloque('texto', p.texto);
        bloques.push(actual);
      }
    }
    return bloques;
  }

  // Adivina qué formato tiene un guión pegado.
  function detectarFormato(texto) {
    const piezas = tokenizar(texto, 'cine');
    const n = (k, f = () => true) => piezas.filter((p) => p.k === k && f(p)).length;
    const encabezados = n('escena', (p) => /^(?:INT|EXT)\./.test(p.texto));
    const personajes = n('cue') + n('bloque', (p) => p.personaje);
    const tecnicos = n('escena') + n('bloque', (p) => p.tipo !== 'camara') + n('acotacion') + n('transicion');
    if ((encabezados && personajes) || personajes >= 3 || encabezados >= 2) return 'cine';
    if (tecnicos) return 'video';
    return 'sencillo';
  }

  function desdeTexto(texto, formato) {
    const sinClasificar = { video: 'camara', cine: 'accion', sencillo: 'parrafo' }[formato];
    const bloques = ensamblar(tokenizar(texto, formato));
    for (const b of bloques) if (b.tipo === 'texto') b.tipo = sinClasificar;
    return convertir(bloques, formato);
  }

  // ---------- Cambiar de formato ----------

  const HABLADOS = ['camara', 'voz', 'parrafo'];

  function nombreBonito(personaje) {
    return claveNombre(personaje).toLowerCase().replace(/(^|\s)\p{L}/gu, (c) => c.toUpperCase());
  }

  // Cuántos bloques con texto se perderían al pasar a "sencillo" (que solo guarda lo hablado).
  function seQuitarian(bloques, destino) {
    if (destino !== 'sencillo') return 0;
    return bloques.filter((b) => !HABLADOS.includes(b.tipo) && b.texto.trim()).length;
  }

  function convertir(bloques, destino) {
    if (destino === 'sencillo') {
      const texto = bloques
        .filter((b) => HABLADOS.includes(b.tipo) && b.texto.trim())
        .map((b) => (b.personaje && b.tipo !== 'parrafo' ? `${nombreBonito(b.personaje)}: ${b.texto}` : b.texto))
        .join('\n\n');
      return [nuevoBloque('parrafo', texto)];
    }

    const salida = [];
    for (const b of bloques) {
      if (b.tipo === 'parrafo') {
        for (const parte of b.texto.split(/\n\s*\n/)) if (parte.trim()) salida.push(nuevoBloque('camara', parte.trim()));
        continue;
      }
      const c = { ...b };
      if (destino === 'video') {
        if (c.tipo === 'accion' || c.tipo === 'transicion') c.tipo = 'nota';
      } else if (destino === 'cine') {
        if (c.tipo === 'escena') c.texto = normalizarEncabezado(c.texto).toUpperCase();
        if (c.tipo === 'nota') c.tipo = 'accion';
        if (c.tipo === 'pantalla') { c.tipo = 'accion'; c.texto = `TEXTO EN PANTALLA: ${c.texto}`; }
        if (c.tipo === 'voz') { c.tipo = 'camara'; c.personaje = `${c.personaje ? claveNombre(c.personaje) : 'NARRADOR'} (V.O.)`; }
        if (c.personaje) c.personaje = c.personaje.toUpperCase();
      }
      salida.push(c);
    }
    return salida.length ? salida : [nuevoBloque(FORMATOS[destino].tipos[0])];
  }

  // ---------- Estadísticas ----------

  function contarPalabras(texto) {
    return (texto.match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu) || []).length;
  }

  function segundosDe(bloque) {
    if (!TIPOS[bloque.tipo]?.tiempo) return 0;
    return contarPalabras(bloque.texto) / PALABRAS_POR_SEGUNDO;
  }

  function estadisticas(bloques) {
    let palabras = 0, habladas = 0, segundos = 0;
    for (const b of bloques) {
      const n = contarPalabras(b.texto);
      palabras += n;
      if (TIPOS[b.tipo]?.tiempo) { habladas += n; segundos += segundosDe(b); }
    }
    return { palabras, habladas, segundos };
  }

  // Agrupa los bloques por escena para mostrar la duración de cada una.
  function porEscenas(bloques) {
    const grupos = [];
    let grupo = { escena: null, numero: 0, bloques: [] };
    let numero = 0;
    for (const b of bloques) {
      if (b.tipo === 'escena') {
        if (grupo.escena || grupo.bloques.length) grupos.push(grupo);
        grupo = { escena: b, numero: ++numero, bloques: [] };
      } else {
        grupo.bloques.push(b);
      }
    }
    if (grupo.escena || grupo.bloques.length) grupos.push(grupo);
    for (const g of grupos) g.segundos = g.bloques.reduce((s, b) => s + segundosDe(b), 0);
    return grupos;
  }

  // Personajes que aparecen en los diálogos (sin "(V.O.)"), más los añadidos a mano.
  function personajes(guion) {
    const lista = new Map();
    for (const p of guion.personajes || []) lista.set(claveNombre(p), 0);
    for (const b of guion.bloques) {
      if (b.tipo === 'camara' && b.personaje && claveNombre(b.personaje)) {
        const k = claveNombre(b.personaje);
        lista.set(k, (lista.get(k) || 0) + 1);
      }
    }
    return [...lista].map(([nombre, dialogos]) => ({ nombre, dialogos }));
  }

  function formatoDuracion(segundos) {
    const s = Math.round(segundos);
    if (s < 60) return `${s} s`;
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} min`;
  }

  return {
    TIPOS, FORMATOS, nombreTipo, siguienteTipo, nuevoId, nuevoBloque,
    normalizarEncabezado, claveNombre, desdeTexto, detectarFormato, convertir, seQuitarian,
    contarPalabras, segundosDe, estadisticas, porEscenas, personajes, formatoDuracion,
  };
})();

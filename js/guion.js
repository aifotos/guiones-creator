// Modelo del guión: tipos de bloque, convertir texto pegado en bloques
// y estadísticas (palabras y duración).
const Guion = (() => {
  const TIPOS = {
    escena:   { nombre: 'Escena', plural: 'escenas',            hablado: false, ayuda: 'Ej.: Exterior del local, de día' },
    camara:   { nombre: 'En cámara', plural: 'en cámara',         hablado: true,  ayuda: 'Lo que dice la persona frente a la cámara' },
    voz:      { nombre: 'Voz en off', plural: 'voces en off',        hablado: true,  ayuda: 'Narración que se escucha sin ver a quien habla' },
    pantalla: { nombre: 'Texto en pantalla', plural: 'textos en pantalla', hablado: false, ayuda: 'Títulos, rótulos o subtítulos que aparecen escritos' },
    nota:     { nombre: 'Nota de dirección', plural: 'notas de dirección', hablado: false, ayuda: 'Indicaciones de toma, B-roll, música…' },
  };

  // ~150 palabras por minuto: ritmo natural hablando en español.
  const PALABRAS_POR_SEGUNDO = 2.5;

  // Prefijos que la gente suele escribir en sus guiones ("VO:", "Escena 2:"…).
  // Si una línea empieza así, se convierte en ese tipo de bloque.
  const SEP = '\\s*[:\\-–—]\\s*';
  const PREFIJOS = [
    ['escena',   new RegExp('^\\s*(?:escena|toma)\\s*(?:#?\\d+\\s*[:.\\-–—]?\\s*|[:\\-–—]\\s*|$)', 'i')],
    ['escena',   /^\s*(?=(?:INT|EXT)\.\s)/],
    ['voz',      new RegExp('^\\s*(?:v\\.?\\s?o\\.?|voz(?:\\s+en)?\\s+off|off|narrador(?:a)?|locuci[oó]n)' + SEP, 'i')],
    ['pantalla', new RegExp('^\\s*(?:texto(?:\\s+en\\s+pantalla)?|t\\.?e\\.?p\\.?|super|z[oó]calo|gr[aá]fico|subt[ií]tulo)' + SEP, 'i')],
    ['nota',     new RegExp('^\\s*(?:nota|direcci[oó]n|acci[oó]n|b-?roll|m[uú]sica|sonido)' + SEP, 'i')],
    ['camara',   new RegExp('^\\s*(?:en\\s+c[aá]mara|c[aá]mara|on\\s*cam|di[aá]logo|talento|host|presentador(?:a)?)' + SEP, 'i')],
  ];

  function nuevoId() {
    if (globalThis.crypto && crypto.randomUUID) return crypto.randomUUID();
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  function nuevoBloque(tipo = 'camara', texto = '') {
    return { id: nuevoId(), tipo, texto };
  }

  function detectarTipo(linea) {
    for (const [tipo, re] of PREFIJOS) {
      if (re.test(linea)) return { tipo, texto: linea.replace(re, '').trim() };
    }
    // Líneas entre paréntesis o corchetes: indicaciones, no diálogo.
    const acotacion = linea.trim().match(/^[(\[](.*)[)\]]$/);
    if (acotacion) return { tipo: 'nota', texto: acotacion[1].trim() };
    return null;
  }

  // Convierte un guión pegado como texto en una lista de bloques.
  // Una línea en blanco separa bloques; una línea con prefijo empieza uno nuevo;
  // las líneas seguidas sin prefijo se juntan en el mismo bloque.
  function desdeTexto(texto) {
    const bloques = [];
    let actual = null;
    for (const linea of texto.replace(/\r\n?/g, '\n').split('\n')) {
      if (!linea.trim()) { actual = null; continue; }
      const detectado = detectarTipo(linea);
      if (detectado) {
        actual = nuevoBloque(detectado.tipo, detectado.texto);
        bloques.push(actual);
        if (detectado.tipo === 'escena') actual = null;
      } else if (actual) {
        actual.texto += (actual.texto ? '\n' : '') + linea.trim();
      } else {
        actual = nuevoBloque('camara', linea.trim());
        bloques.push(actual);
      }
    }
    return bloques;
  }

  function contarPalabras(texto) {
    return (texto.match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu) || []).length;
  }

  function segundosDe(bloque) {
    if (!TIPOS[bloque.tipo]?.hablado) return 0;
    return contarPalabras(bloque.texto) / PALABRAS_POR_SEGUNDO;
  }

  function estadisticas(bloques) {
    let palabras = 0, habladas = 0, segundos = 0;
    for (const b of bloques) {
      const n = contarPalabras(b.texto);
      palabras += n;
      if (TIPOS[b.tipo]?.hablado) { habladas += n; segundos += segundosDe(b); }
    }
    return { palabras, habladas, segundos };
  }

  // Agrupa los bloques por escena para mostrar la duración de cada una.
  // Lo que va antes de la primera escena queda en un grupo sin escena.
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

  function formatoDuracion(segundos) {
    const s = Math.round(segundos);
    if (s < 60) return `${s} s`;
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} min`;
  }

  return { TIPOS, nuevoId, nuevoBloque, desdeTexto, contarPalabras, segundosDe, estadisticas, porEscenas, formatoDuracion };
})();

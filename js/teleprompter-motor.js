// Motor del seguimiento por voz del teleprompter (portado de prompter-web, que copia
// el SpeechHandler de Prompt+): un cursor de palabra, una ventana hacia atrás y hacia
// adelante, y tolerancia a palabras saltadas. Funciones puras: no tocan la página.
const MotorTeleprompter = (() => {
  const FRASE = 8;          // cuántas de las últimas palabras oídas se buscan en el guion
  const ADELANTE = 30;      // ventana de búsqueda desde el cursor
  const ATRAS = 20;
  const MAX_SALTOS = 2;     // desajustes tolerados al alinear la frase
  const RELEER_PALABRAS = 3; // para retroceder (re-lectura) hacen falta 3 coincidencias…
  const RELEER_DISTANCIA = 3; // …y al menos 3 palabras de distancia
  // Una sola de estas palabras no basta para mover el cursor.
  const COMUNES = new Set(('a an and are as at be but by for if in is it of on or so that the to was we you i ' +
    'de la el en y que los las un una por con para es se no lo al del su sus mi tu o como mas pero le les me te nos ya muy e u').split(' '));

  // Minúsculas, sin acentos ni puntuación: "¡Hola," → "hola".
  const norm = (palabra) => palabra.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]+/gu, '');
  const aPalabras = (texto) => texto.split(/\s+/).map(norm).filter(Boolean);

  // Cuántas palabras de la frase coinciden a partir de la palabra `desde` del guion
  // y dónde termina la coincidencia.
  function alinear(claves, desde, frase) {
    let s = desde, p = 0, coinciden = 0, fin = desde, saltos = 0;
    while (s < claves.length && p < frase.length && saltos <= MAX_SALTOS) {
      if (claves[s] === frase[p]) { coinciden++; s++; p++; fin = s; }
      else if (s + 1 < claves.length && claves[s + 1] === frase[p]) { s++; saltos++; }      // se saltó una palabra del guion
      else if (p + 1 < frase.length && claves[s] === frase[p + 1]) { p++; saltos++; }      // dijo una palabra de más
      else { s++; p++; saltos++; }                                                         // dijo otra palabra
    }
    return { coinciden, fin };
  }

  // Nueva posición del cursor (índice de la siguiente palabra por leer) según lo oído.
  // Como la ventana es estrecha, que el reconocedor repita resultados no lo hace avanzar dos veces.
  function avanzar(claves, cursor, oidas) {
    const frase = oidas.slice(-FRASE);
    if (!frase.length) return cursor;
    let mejorFin = cursor, mejorInicio = cursor, mejorPuntaje = 0, mejorCoinciden = 0;
    const desde = Math.max(0, cursor - ATRAS), hasta = Math.min(claves.length, cursor + ADELANTE);
    for (let i = desde; i < hasta; i++) {
      if (claves[i] !== frase[0]) continue;
      const { coinciden, fin } = alinear(claves, i, frase);
      if (!coinciden) continue;
      if (coinciden < 2 && (i !== cursor || COMUNES.has(frase[0]))) continue;
      const distancia = i >= cursor ? i - cursor : (cursor - i) * 2; // ir hacia atrás cuenta el doble
      const puntaje = coinciden * coinciden / (1 + distancia);
      if (puntaje > mejorPuntaje) { mejorPuntaje = puntaje; mejorFin = fin; mejorInicio = i; mejorCoinciden = coinciden; }
    }
    if (mejorFin < cursor && (mejorCoinciden < RELEER_PALABRAS || cursor - mejorInicio < RELEER_DISTANCIA)) return cursor;
    return mejorFin;
  }

  return { FRASE, norm, aPalabras, avanzar };
})();

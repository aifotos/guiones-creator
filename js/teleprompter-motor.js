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
  const PREFIJO = 3;        // la última palabra oída puede llegar a medias ("bienven…")
  // Una sola de estas palabras no basta para mover el cursor.
  const COMUNES = new Set(('a an and are as at be but by for if in is it of on or so that the to was we you i ' +
    'de la el en y que los las un una por con para es se no lo al del su sus mi tu o como mas pero le les me te nos ya muy e u').split(' '));
  // El reconocedor a veces escribe "3" donde el guion dice "tres", o al revés.
  const NUMEROS = Object.fromEntries([
    ...'cero uno dos tres cuatro cinco seis siete ocho nueve diez once doce trece catorce quince dieciseis diecisiete dieciocho diecinueve veinte'.split(' ').map((n, i) => [n, String(i)]),
    ...'zero one two three four five six seven eight nine ten eleven twelve'.split(' ').map((n, i) => [n, String(i)]),
  ]);

  // Minúsculas, sin acentos ni puntuación: "¡Hola," → "hola".
  const norm = (palabra) => {
    const n = palabra.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]+/gu, '');
    return NUMEROS[n] || n;
  };
  const aPalabras = (texto) => texto.split(/\s+/).map(norm).filter(Boolean);

  // ¿Difieren en una sola letra (cambiada, sobrante o faltante)?
  function unaLetra(a, b) {
    if (Math.abs(a.length - b.length) > 1) return false;
    let i = 0, j = 0, diferencias = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) { i++; j++; continue; }
      if (++diferencias > 1) return false;
      if (a.length > b.length) i++;
      else if (b.length > a.length) j++;
      else { i++; j++; }
    }
    return diferencias + (a.length - i) + (b.length - j) <= 1;
  }

  // Lo que oyó el reconocedor equivale a la palabra del guion: igual, con una letra
  // distinta (palabras largas) o, si es la última oída, su comienzo.
  function parecidas(delGuion, oida, esUltima) {
    if (delGuion === oida) return true;
    if (esUltima && oida.length >= PREFIJO && delGuion.startsWith(oida)) return true;
    return oida.length >= 5 && delGuion.length >= 5 && unaLetra(delGuion, oida);
  }

  // Cuántas palabras de la frase (desde la palabra `p` de la frase) coinciden a partir
  // de la palabra `desde` del guion, y dónde termina la coincidencia.
  function alinear(claves, desde, frase, p) {
    let s = desde, coinciden = 0, fin = desde, saltos = 0;
    const ultima = frase.length - 1;
    while (s < claves.length && p < frase.length && saltos <= MAX_SALTOS) {
      if (parecidas(claves[s], frase[p], p === ultima)) { coinciden++; s++; p++; fin = s; }
      else if (s + 1 < claves.length && parecidas(claves[s + 1], frase[p], p === ultima)) { s++; saltos++; } // se saltó una palabra del guion
      else if (p + 1 < frase.length && parecidas(claves[s], frase[p + 1], p + 1 === ultima)) { p++; saltos++; } // dijo una palabra de más
      else { s++; p++; saltos++; }                                                                       // dijo otra palabra
    }
    return { coinciden, fin };
  }

  // Nueva posición del cursor (índice de la siguiente palabra por leer) según lo oído.
  // La frase puede empezar en cualquiera de las palabras oídas, así una palabra mal
  // reconocida al principio no frena el seguimiento. El puntaje castiga cuánto saltaría
  // el cursor: ir hacia atrás cuesta el doble, y repetir resultados no avanza dos veces.
  function avanzar(claves, cursor, oidas) {
    const frase = oidas.slice(-FRASE);
    if (!frase.length) return cursor;
    let mejorFin = cursor, mejorInicio = cursor, mejorPuntaje = 0, mejorCoinciden = 0;
    const desde = Math.max(0, cursor - ATRAS), hasta = Math.min(claves.length, cursor + ADELANTE);
    for (let k = 0; k < frase.length; k++) {
      const esUltima = k === frase.length - 1;
      for (let i = desde; i < hasta; i++) {
        if (!parecidas(claves[i], frase[k], esUltima)) continue;
        const { coinciden, fin } = alinear(claves, i, frase, k);
        if (coinciden < 2 && (i !== cursor || COMUNES.has(frase[k]))) continue;
        const salto = fin >= cursor ? fin - cursor : (cursor - fin) * 2;
        const puntaje = coinciden * coinciden / (1 + salto);
        if (puntaje > mejorPuntaje) { mejorPuntaje = puntaje; mejorFin = fin; mejorInicio = i; mejorCoinciden = coinciden; }
      }
    }
    if (mejorFin < cursor && (mejorCoinciden < RELEER_PALABRAS || cursor - mejorInicio < RELEER_DISTANCIA)) return cursor;
    return mejorFin;
  }

  return { FRASE, norm, aPalabras, avanzar };
})();

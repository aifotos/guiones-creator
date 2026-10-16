// Sugerencias mientras escribes: encabezados de escena (INT./EXT., lugar, momento
// del día) y nombres de personajes.
const Sugerencias = (() => {
  const PREFIJOS = [
    { valor: 'INT.', detalle: 'Interior', alias: ['int', 'interior', 'dentro', 'adentro'] },
    { valor: 'EXT.', detalle: 'Exterior', alias: ['ext', 'exterior', 'fuera', 'afuera', 'calle'] },
    { valor: 'INT./EXT.', detalle: 'Interior y exterior', alias: ['int/ext', 'i/e', 'int./ext.'] },
  ];
  const MOMENTOS = ['DÍA', 'NOCHE', 'TARDE', 'MAÑANA', 'AMANECER', 'ATARDECER', 'ANOCHECER', 'MEDIODÍA', 'CONTINUO', 'MÁS TARDE', 'MOMENTOS DESPUÉS'];
  const RE_PREFIJO = /^\s*(INT\.\/EXT\.|EXT\.\/INT\.|INT\.|EXT\.)\s*/i;
  // "…, de noche", "… por la tarde" al final del lugar.
  const RE_MOMENTO_NATURAL = /^(.*?)[,\s]+(?:de\s+|por\s+la\s+|en\s+la\s+|al\s+)?(d[ií]a|noche|tarde|mañana|amanecer|atardecer|anochecer|mediod[ií]a)\s*$/i;

  const sinAcentos = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const momentoDe = (palabra) => MOMENTOS.find((m) => sinAcentos(m) === sinAcentos(palabra)) || palabra.toUpperCase();

  // Lugares ya usados en el guión, para no tener que reescribirlos.
  function lugaresUsados(textos) {
    const lugares = new Map();
    for (const t of textos) {
      const p = t.match(RE_PREFIJO);
      if (!p) continue;
      const lugar = t.slice(p[0].length).split(/\s+[-–—]\s*/)[0].trim();
      if (lugar) lugares.set(sinAcentos(lugar), lugar);
    }
    return [...lugares.values()];
  }

  // Devuelve [{ etiqueta, detalle, valor }]; "valor" es el texto completo que queda en el bloque.
  function escena(texto, otrasEscenas, mayusculas) {
    const fmt = (s) => (mayusculas ? s.toUpperCase() : s);
    const t = texto.replace(/\n/g, ' ');
    const p = t.match(RE_PREFIJO);

    if (!p) {
      const [primera, ...resto] = t.trim().split(/\s+/);
      const palabra = sinAcentos(primera || '');
      // Escribió "exterior del parque de noche": ofrece convertirlo en encabezado.
      if (resto.length) {
        const prefijo = PREFIJOS.find((x) => x.alias.includes(palabra.replace(/\.$/, '')));
        if (!prefijo) return [];
        let lugar = resto.join(' ').replace(/^(?:del?|la|el|en)\s+/i, '');
        const natural = lugar.match(RE_MOMENTO_NATURAL);
        const valor = natural && natural[1].trim()
          ? `${prefijo.valor} ${fmt(natural[1].trim())} - ${momentoDe(natural[2])}`
          : `${prefijo.valor} ${fmt(lugar)}`;
        return [{ etiqueta: valor, detalle: prefijo.detalle, valor }];
      }
      return PREFIJOS
        .filter((x) => !palabra || x.alias.some((a) => a.startsWith(palabra)))
        .map((x) => ({ etiqueta: x.valor, detalle: x.detalle, valor: `${x.valor} ` }));
    }

    const prefijo = p[1].toUpperCase();
    const resto = t.slice(p[0].length);
    const guion = resto.match(/^(.*?)\s*[-–—]\s*(.*)$/);

    if (guion) {
      const lugar = guion[1].trim();
      const parcial = sinAcentos(guion[2].trim());
      return MOMENTOS
        .filter((m) => sinAcentos(m).startsWith(parcial) && sinAcentos(m) !== parcial)
        .slice(0, 6)
        .map((m) => ({ etiqueta: m, detalle: 'Momento del día', valor: `${prefijo} ${lugar} - ${m}` }));
    }

    const lugar = resto.trim();
    const sugerencias = [];
    const natural = lugar.match(RE_MOMENTO_NATURAL);
    if (natural && natural[1].trim()) {
      const valor = `${prefijo} ${fmt(natural[1].trim())} - ${momentoDe(natural[2])}`;
      sugerencias.push({ etiqueta: valor, detalle: 'Ordenar encabezado', valor });
    }
    for (const usado of lugaresUsados(otrasEscenas)) {
      if (sinAcentos(usado).startsWith(sinAcentos(lugar)) && sinAcentos(usado) !== sinAcentos(lugar)) {
        sugerencias.push({ etiqueta: usado, detalle: 'Lugar ya usado', valor: `${prefijo} ${usado} - ` });
      }
    }
    if (lugar && /\s$/.test(resto)) {
      for (const m of MOMENTOS.slice(0, 4)) sugerencias.push({ etiqueta: `- ${m}`, detalle: 'Momento del día', valor: `${prefijo} ${lugar} - ${m}` });
    }
    return sugerencias.slice(0, 6);
  }

  // "int " o "ext " al empezar se convierte solo en "INT. " / "EXT. ".
  function autocompletarPrefijo(texto) {
    const m = texto.match(/^(int|ext|i\/e|int\/ext)\s$/i);
    if (!m) return null;
    const valor = { int: 'INT.', ext: 'EXT.', 'i/e': 'INT./EXT.', 'int/ext': 'INT./EXT.' }[m[1].toLowerCase()];
    return `${valor} `;
  }

  function personaje(texto, nombres) {
    const parcial = sinAcentos(texto.trim());
    return nombres
      .filter((n) => sinAcentos(n).startsWith(parcial) && sinAcentos(n) !== parcial)
      .slice(0, 6)
      .map((n) => ({ etiqueta: n, detalle: 'Personaje', valor: n }));
  }

  return { escena, autocompletarPrefijo, personaje };
})();

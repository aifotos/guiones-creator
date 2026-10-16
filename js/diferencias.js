// Compara dos textos palabra por palabra y dice qué se quedó igual, qué se
// borró y qué es nuevo. Sirve para ver los cambios que hizo el cliente.
const Diferencias = (() => {
  // Palabras, signos y espacios por separado: así "mí" y "mí," solo difieren en la coma,
  // y los saltos de línea se conservan.
  const trozos = (t) => t.match(/\s+|[\p{L}\p{N}]+|[^\s\p{L}\p{N}]/gu) || [];

  function juntar(partes) {
    const salida = [];
    for (const p of partes) {
      if (!p.texto) continue;
      const ultima = salida[salida.length - 1];
      if (ultima && ultima.tipo === p.tipo) ultima.texto += p.texto;
      else salida.push({ ...p });
    }
    return salida;
  }

  // Devuelve [{ tipo: 'igual' | 'borrado' | 'nuevo', texto }]
  function comparar(antes, despues) {
    const a = trozos(antes);
    const b = trozos(despues);

    // Lo que coincide al principio y al final no hace falta compararlo.
    let inicio = 0;
    while (inicio < a.length && inicio < b.length && a[inicio] === b[inicio]) inicio++;
    let finA = a.length, finB = b.length;
    while (finA > inicio && finB > inicio && a[finA - 1] === b[finB - 1]) { finA--; finB--; }
    const A = a.slice(inicio, finA);
    const B = b.slice(inicio, finB);

    const medio = [];
    if (A.length * B.length > 4_000_000) {
      // Textos enormes y muy distintos: se marca todo el tramo como reemplazado.
      medio.push({ tipo: 'borrado', texto: A.join('') }, { tipo: 'nuevo', texto: B.join('') });
    } else {
      // Subsecuencia común más larga: lo que no está en ella se borró o es nuevo.
      const tabla = Array.from({ length: A.length + 1 }, () => new Uint32Array(B.length + 1));
      for (let i = A.length - 1; i >= 0; i--) {
        for (let j = B.length - 1; j >= 0; j--) {
          tabla[i][j] = A[i] === B[j] ? tabla[i + 1][j + 1] + 1 : Math.max(tabla[i + 1][j], tabla[i][j + 1]);
        }
      }
      let i = 0, j = 0;
      while (i < A.length && j < B.length) {
        if (A[i] === B[j]) { medio.push({ tipo: 'igual', texto: A[i] }); i++; j++; }
        else if (tabla[i + 1][j] >= tabla[i][j + 1]) medio.push({ tipo: 'borrado', texto: A[i++] });
        else medio.push({ tipo: 'nuevo', texto: B[j++] });
      }
      while (i < A.length) medio.push({ tipo: 'borrado', texto: A[i++] });
      while (j < B.length) medio.push({ tipo: 'nuevo', texto: B[j++] });
    }

    // Cambios separados solo por espacios se leen mejor como un único cambio:
    // "[-el 80% de la gente come-] {+casi todos comemos+}" en vez de palabra a palabra.
    const partes = juntar([{ tipo: 'igual', texto: a.slice(0, inicio).join('') }, ...medio, { tipo: 'igual', texto: a.slice(finA).join('') }]);
    const salida = [];
    let k = 0;
    while (k < partes.length) {
      if (partes[k].tipo === 'igual') { salida.push(partes[k++]); continue; }
      let borrado = '', nuevo = '';
      while (k < partes.length) {
        const p = partes[k];
        const espacioEntreCambios = p.tipo === 'igual' && !p.texto.trim() && k + 1 < partes.length && partes[k + 1].tipo !== 'igual';
        if (p.tipo === 'borrado') borrado += p.texto;
        else if (p.tipo === 'nuevo') nuevo += p.texto;
        else if (espacioEntreCambios) { borrado += p.texto; nuevo += p.texto; }
        else break;
        k++;
      }
      salida.push({ tipo: 'borrado', texto: borrado }, { tipo: 'nuevo', texto: nuevo });
    }
    return juntar(salida);
  }

  return { comparar };
})();

// Plantillas para empezar un guion nuevo. Lo que va entre [corchetes] son
// indicaciones para reemplazar. Además de estas, puedes guardar las tuyas.
const Plantillas = (() => {
  const b = (tipo, texto, extra = {}) => ({ tipo, texto, ...extra });

  const INCLUIDAS = [
    // ---------- Video / redes ----------
    {
      id: 'reel-3-partes',
      nombre: 'Reel en 3 partes (gancho · valor · llamada a la acción)',
      formato: 'video',
      bloques: [
        b('escena', 'Gancho (0–3 s)'),
        b('camara', '[Pregunta o frase que atrape en los primeros 3 segundos]'),
        b('pantalla', '[Texto grande que refuerce el gancho]'),
        b('escena', 'Valor (3–25 s)'),
        b('camara', '[Explica el beneficio, el truco o la historia]'),
        b('nota', '[B-roll que apoye lo que se dice]'),
        b('escena', 'Llamada a la acción (últimos 5 s)'),
        b('camara', '[Qué tiene que hacer la persona: seguir, comprar, reservar…]'),
        b('pantalla', '[@usuario · link · código de descuento]'),
      ],
    },
    {
      id: 'anuncio-30',
      nombre: 'Anuncio de 30 segundos (problema · solución · oferta)',
      formato: 'video',
      bloques: [
        b('escena', 'Problema'),
        b('nota', '[Plano de la persona con el problema]'),
        b('voz', '[¿Te pasa que…? Describe el problema en una frase]'),
        b('escena', 'Solución'),
        b('nota', '[Producto o servicio en uso]'),
        b('voz', '[Presenta la solución y su beneficio principal]'),
        b('escena', 'Oferta'),
        b('pantalla', '[Precio, descuento o fecha límite]'),
        b('voz', '[Llamada a la acción clara]'),
        b('pantalla', '[Logo · web · teléfono]'),
      ],
    },
    {
      id: 'testimonio',
      nombre: 'Testimonio de cliente',
      formato: 'video',
      bloques: [
        b('escena', 'Presentación'),
        b('camara', '[Hola, soy… y me dedico a…]', { personaje: 'CLIENTE' }),
        b('escena', 'Antes'),
        b('camara', '[Cuál era el problema antes de conocer el servicio]', { personaje: 'CLIENTE' }),
        b('escena', 'Después'),
        b('camara', '[Qué cambió y qué resultado obtuvo]', { personaje: 'CLIENTE' }),
        b('nota', '[B-roll del cliente usando el producto o en su negocio]'),
        b('escena', 'Recomendación'),
        b('camara', '[Se lo recomiendo a… porque…]', { personaje: 'CLIENTE' }),
        b('pantalla', '[Nombre del cliente · negocio]'),
      ],
    },
    {
      id: 'producto',
      nombre: 'Presentación de producto o servicio',
      formato: 'video',
      bloques: [
        b('escena', 'Apertura'),
        b('nota', '[Plano detalle del producto]'),
        b('camara', '[Te presento… / Esto es…]'),
        b('escena', 'Qué es y para quién'),
        b('camara', '[Qué hace y a quién va dirigido]'),
        b('escena', 'Tres razones'),
        b('pantalla', '1. [Primer beneficio]'),
        b('pantalla', '2. [Segundo beneficio]'),
        b('pantalla', '3. [Tercer beneficio]'),
        b('escena', 'Cierre'),
        b('camara', '[Dónde conseguirlo y llamada a la acción]'),
      ],
    },
    {
      id: 'tutorial',
      nombre: 'Tutorial paso a paso',
      formato: 'video',
      bloques: [
        b('escena', 'Introducción'),
        b('camara', '[Hoy te enseño a… en X pasos]'),
        b('escena', 'Paso 1'),
        b('camara', '[Explica el primer paso]'),
        b('nota', '[Plano cercano de las manos / la pantalla]'),
        b('escena', 'Paso 2'),
        b('camara', '[Explica el segundo paso]'),
        b('escena', 'Paso 3'),
        b('camara', '[Explica el tercer paso]'),
        b('escena', 'Resultado'),
        b('camara', '[Muestra el resultado final y despídete]'),
      ],
    },

    // ---------- Cinematográfico ----------
    {
      id: 'corto-3-actos',
      nombre: 'Cortometraje en 3 actos',
      formato: 'cine',
      bloques: [
        b('transicion', 'FADE IN:'),
        b('escena', 'INT. [LUGAR] - DÍA'),
        b('accion', '[Acto 1: presenta al protagonista y su mundo]'),
        b('camara', '[Primera línea del protagonista]', { personaje: 'PROTAGONISTA', acotacion: '' }),
        b('accion', '[Ocurre algo que cambia su día: el detonante]'),
        b('transicion', 'CORTE A:'),
        b('escena', 'EXT. [LUGAR] - NOCHE'),
        b('accion', '[Acto 2: el protagonista intenta resolver el conflicto y las cosas se complican]'),
        b('camara', '[Diálogo con el antagonista o un aliado]', { personaje: 'PERSONAJE 2', acotacion: '' }),
        b('transicion', 'CORTE A:'),
        b('escena', 'INT. [LUGAR] - DÍA'),
        b('accion', '[Acto 3: el clímax y cómo termina todo]'),
        b('transicion', 'FUNDIDO A NEGRO.'),
      ],
    },
    {
      id: 'escena-dialogo',
      nombre: 'Escena de diálogo entre dos personajes',
      formato: 'cine',
      bloques: [
        b('escena', 'INT. [LUGAR] - [MOMENTO]'),
        b('accion', '[Describe el lugar y qué están haciendo los personajes]'),
        b('camara', '[Primera línea]', { personaje: 'PERSONAJE A', acotacion: '' }),
        b('camara', '[Respuesta]', { personaje: 'PERSONAJE B', acotacion: '' }),
        b('accion', '[Una acción o un silencio que cambie el tono]'),
        b('camara', '[Línea final]', { personaje: 'PERSONAJE A', acotacion: '' }),
      ],
    },

    // ---------- Sencillo ----------
    {
      id: 'locucion-corporativa',
      nombre: 'Locución para video corporativo',
      formato: 'sencillo',
      bloques: [b('parrafo', '[Nombre de la empresa] nació para [propósito].\n\nCada día [qué hacen y para quién].\n\nNos distingue [lo que los hace únicos].\n\n[Nombre de la empresa]: [eslogan].')],
    },
    {
      id: 'mensaje-presentacion',
      nombre: 'Mensaje de presentación personal',
      formato: 'sencillo',
      bloques: [b('parrafo', 'Hola, soy [nombre] y me dedico a [actividad].\n\n[Qué problema resuelves o qué ofreces].\n\nSi quieres [beneficio], [cómo contactarte].')],
    },
  ];

  // Copia los bloques con identificadores nuevos (cada guion tiene los suyos).
  function bloquesDe(plantilla) {
    return plantilla.bloques.map((x) => Guion.nuevoBloque(x.tipo, x.texto, x.personaje != null ? { personaje: x.personaje, acotacion: x.acotacion || '' } : {}));
  }

  const incluidas = (formato) => INCLUIDAS.filter((p) => p.formato === formato);

  return { incluidas, bloquesDe };
})();

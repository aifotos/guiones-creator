// Reconocimiento de voz del teleprompter (Web Speech API) y medidor del micrófono.
// Chrome y Edge mandan el audio a Google; Safari, a Apple. Firefox no tiene reconocimiento.
const VozTeleprompter = (() => {
  const ua = navigator.userAgent;
  const esIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const esAndroid = /Android/i.test(ua);
  const instalada = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const Reconocedor = window.SpeechRecognition || window.webkitSpeechRecognition || null;

  const IDIOMAS = [['es-ES', 'Español (España)'], ['es-MX', 'Español (México)'], ['es-US', 'Español (EE. UU.)'], ['es-AR', 'Español (Argentina)'],
    ['es-CO', 'Español (Colombia)'], ['es-CL', 'Español (Chile)'], ['es-PE', 'Español (Perú)'], ['es-VE', 'Español (Venezuela)'],
    ['en-US', 'English (US)'], ['en-GB', 'English (UK)'], ['pt-BR', 'Português (Brasil)'], ['fr-FR', 'Français'], ['de-DE', 'Deutsch'], ['it-IT', 'Italiano']];

  function idiomaPorDefecto() {
    const l = (navigator.language || 'es-ES').toLowerCase();
    const exacto = IDIOMAS.find((x) => x[0].toLowerCase() === l);
    if (exacto) return exacto[0];
    const parecido = IDIOMAS.find((x) => x[0].startsWith(l.slice(0, 2)));
    return parecido ? parecido[0] : 'es-ES';
  }

  // Escucha sin parar hasta detener(). Android y Safari cortan las sesiones solas, así que
  // se reinicia al terminar, y un vigilante la reinicia si pasan 12 s sin eventos.
  // alOir(palabras): las últimas palabras oídas, normalizadas.
  // alError(codigo): 'permiso', 'microfono', 'idioma' (fatales) o 'red' (se reintenta).
  function escuchar({ idioma, alOir, alError }) {
    let rec = null, sesion = 0, fatal = false, errores = 0, ultimoEvento = Date.now();

    function lanzar(id) {
      if (id !== sesion || fatal) return;
      const r = new Reconocedor();
      r.lang = idioma; r.continuous = true; r.interimResults = true; r.maxAlternatives = 1;
      r.onstart = r.onaudiostart = () => { ultimoEvento = Date.now(); };
      r.onresult = (e) => {
        if (id !== sesion) return;
        ultimoEvento = Date.now(); errores = 0;
        const oidas = [];
        for (let i = e.results.length - 1; i >= 0 && oidas.length < MotorTeleprompter.FRASE * 2; i--) {
          oidas.unshift(...MotorTeleprompter.aPalabras(e.results[i][0].transcript));
        }
        alOir(oidas);
      };
      r.onerror = (e) => {
        if (id !== sesion) return;
        const fatales = { 'not-allowed': 'permiso', 'service-not-allowed': 'permiso', 'audio-capture': 'microfono', 'language-not-supported': 'idioma' };
        if (fatales[e.error]) { fatal = true; detener(); alError(fatales[e.error]); return; }
        if (e.error === 'network') alError('red');
        if (e.error !== 'no-speech' && e.error !== 'aborted') errores++;
      };
      r.onend = () => {
        if (id !== sesion || fatal) return;
        setTimeout(() => lanzar(id), errores ? Math.min(5000, 250 * 2 ** errores) : 100);
      };
      try { r.start(); rec = r; ultimoEvento = Date.now(); } catch { setTimeout(() => lanzar(id), 400); }
    }

    function arrancar() { sesion++; lanzar(sesion); }
    function parar() {
      sesion++;
      if (rec) { try { rec.abort(); } catch {} rec = null; }
    }

    const vigilante = setInterval(() => {
      if (!fatal && Date.now() - ultimoEvento > 12000) { parar(); ultimoEvento = Date.now(); arrancar(); }
    }, 4000);

    function detener() { clearInterval(vigilante); parar(); }

    arrancar();
    return { detener };
  }

  // Nivel del micrófono para la onda. En Android y iOS no se abre el micrófono a la vez
  // que el reconocimiento (compiten por él): ahí la onda se simula con cada resultado.
  const medidorReal = !!navigator.mediaDevices?.getUserMedia && !esIOS && !esAndroid && !!window.chrome;

  function medidor() {
    let flujo = null, contexto = null, analizador = null, muestras = null, objetivo = 0, nivel = 0, apagado = false;

    if (medidorReal) {
      navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }).then((f) => {
        flujo = f;
        if (apagado) return apagar();
        contexto = new (window.AudioContext || window.webkitAudioContext)();
        analizador = contexto.createAnalyser();
        analizador.fftSize = 512;
        muestras = new Float32Array(analizador.fftSize);
        contexto.createMediaStreamSource(flujo).connect(analizador);
      }).catch(() => apagar());
    }

    function apagar() {
      apagado = true;
      if (flujo) flujo.getTracks().forEach((t) => t.stop());
      if (contexto) contexto.close().catch(() => {});
      flujo = contexto = analizador = null;
    }

    // Se llama con cada resultado del reconocedor cuando no hay medidor real.
    function pulso() { if (!analizador) objetivo = Math.max(objetivo, 0.55 + Math.random() * 0.45); }

    // De 0 a 1, suavizado; dt en segundos.
    function leer(dt) {
      if (analizador) {
        analizador.getFloatTimeDomainData(muestras);
        let s = 0;
        for (let i = 0; i < muestras.length; i++) s += muestras[i] * muestras[i];
        objetivo = Math.min(1, Math.sqrt(s / muestras.length) * 7);
      } else objetivo *= Math.pow(0.15, dt);
      nivel += (objetivo - nivel) * Math.min(1, dt * 12);
      return nivel;
    }

    return { pulso, leer, apagar };
  }

  return { disponible: !!Reconocedor, esIOS, instalada, IDIOMAS, idiomaPorDefecto, escuchar, medidor };
})();

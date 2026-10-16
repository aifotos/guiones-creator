// Direcciones de la app. Nada secreto: la API exige contraseña o el link del cliente.
const CONFIG = (() => {
  const local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  const publico = 'https://aifotos.github.io/guiones-creator/';
  return {
    // Probando en esta Mac (localhost) se usa la API local de `wrangler dev`.
    api: local ? 'http://localhost:8787' : 'https://guiones-creator-api.aifotos.workers.dev',
    // Dirección donde el cliente abre su link. Abriendo el archivo con doble
    // clic (file://) los links apuntan igualmente a la web publicada.
    sitio: location.protocol.startsWith('http') ? new URL('.', location.href).href : publico,
  };
})();

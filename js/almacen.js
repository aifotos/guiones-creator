// Dónde se guardan los guiones.
// Fase 1: en el navegador de esta Mac (localStorage).
// Fase 2: se cambiará por la base de datos de Cloudflare sin tocar el resto de la app.
const Almacen = (() => {
  const CLAVE = 'guiones-creator:guiones:v1';

  function leerTodo() {
    try {
      const datos = JSON.parse(localStorage.getItem(CLAVE) || '[]');
      return Array.isArray(datos) ? datos : [];
    } catch {
      return [];
    }
  }

  function escribirTodo(guiones) {
    try {
      localStorage.setItem(CLAVE, JSON.stringify(guiones));
      return true;
    } catch {
      return false;
    }
  }

  function listar() {
    return leerTodo().sort((a, b) => b.actualizado - a.actualizado);
  }

  function obtener(id) {
    return leerTodo().find((g) => g.id === id) || null;
  }

  function guardar(guion) {
    guion.actualizado = Date.now();
    const todos = leerTodo();
    const i = todos.findIndex((g) => g.id === guion.id);
    if (i >= 0) todos[i] = guion; else todos.push(guion);
    return escribirTodo(todos);
  }

  function borrar(id) {
    return escribirTodo(leerTodo().filter((g) => g.id !== id));
  }

  function crear(titulo = '', bloques = [], formato = 'video') {
    const guion = { id: Guion.nuevoId(), titulo, formato, bloques, personajes: [], creado: Date.now(), actualizado: Date.now() };
    guardar(guion);
    return guion;
  }

  return { listar, obtener, guardar, borrar, crear };
})();

# Guiones Creator by aifotos — Roadmap

App web para redactar o pegar guiones y compartirlos con cada cliente mediante
un link propio, donde el cliente puede leerlos y editarlos. Funciona en línea
aunque la MacBook esté apagada.

---

## Cómo va a funcionar (explicado sin tecnicismos)

```
 TÚ (panel con contraseña)                       CLIENTE (solo con su link)
 ─────────────────────────                       ──────────────────────────
 1. Creas un cliente: "Restaurante X"
 2. Pegas o escribes el guión
 3. La app te da un link:          ───envías──▶  4. Abre el link en su celular o PC
    guiones.../c/k7Qx9...                        5. Lee el guión y lo corrige
 6. Ves qué cambió el cliente      ◀──guarda───     (se guarda solo)
    (resaltado) y puedes restaurar
```

- **Un link = una sesión con un cliente.** Dentro de esa sesión pueden vivir
  varios guiones a lo largo del tiempo (el del reel de hoy, el del mes que viene…).
- El link lleva un código largo imposible de adivinar. Quien no lo tenga no
  ve nada. Si un link se filtra, lo desactivas y generas otro.
- El cliente **no** necesita cuenta ni contraseña. Tú sí (para el panel).

## La decisión importante: dónde se guardan los guiones

GitHub (con GitHub Pages) puede tener la app **siempre en línea y gratis**,
pero solo muestra páginas: **no puede guardar lo que el cliente edita**. Para eso
hace falta una pequeña base de datos en internet.

Además, tu repositorio de GitHub es **público**: los guiones de tus clientes
nunca deben ir dentro del código. Van en la base de datos.

**Recomendación: Cloudflare (gratis) para la base de datos.**

| | Cloudflare D1 (recomendado) | Firebase | Supabase |
|---|---|---|---|
| ¿Se duerme si no se usa? | **No** | No | **Sí** (plan gratis se pausa) |
| Tipo de base de datos | SQLite (la misma de FacturaPro) | Propia de Google | PostgreSQL |
| Límite gratis | 5 GB — miles de guiones | 1 GB | 500 MB |
| Tarjeta de crédito | No hace falta | No hace falta | No hace falta |

Así queda el reparto:
- **GitHub** → guarda el código y publica la app (GitHub Pages).
- **Cloudflare** → guarda los guiones y las ediciones de los clientes.

---

## Fases

Cada fase termina con algo que puedes **abrir y probar**. No se pasa a la
siguiente hasta que tú la apruebes.

### Fase 0 — Preparación (lo que necesito de ti: ~10 minutos)
- [x] Cuenta gratis en Cloudflare creada y conectada.
- [x] Repositorio propio para la app (`aifotos/guiones-creator`) en vez de
      usar el de toda tu carpeta personal, para que solo se publique la app.
- [x] Marca aifotos: logo y colores tomados de FacturaPro (`assets/`).

**Resultado:** todo listo para empezar a construir.

### Fase 1 — El editor (funciona en tu Mac)
- [x] Pantalla para **escribir o pegar** un guión.
- [x] Formato de guión para video: escenas/tomas, texto en cámara, voz en off,
      notas de dirección, duración estimada.
- [x] Conteo de palabras y tiempo aproximado de lectura.
- [x] Vista limpia de "lectura" (como lo verá el cliente).

**Resultado:** puedes redactar guiones cómodamente, aunque todavía solo en tu Mac.

**Mejoras tras tu prueba:**
- [x] Tres formatos: **Sencillo** (solo texto, para cualquier cliente), **Video / redes** y **Cinematográfico** (screenplay). Se puede cambiar en cualquier momento.
- [x] Personajes: nombre, acotación y lista de personajes con contador de diálogos.
- [x] Sugerencias de escena: `int`/`ext` → INT./EXT., lugares ya usados y DÍA/NOCHE/TARDE…
- [x] Análisis inteligente al pegar, también pegando directamente dentro de un bloque.
- [x] Botón **Eliminar** arriba, junto al formato.

### Fase 2 — Clientes y links
- [x] Base de datos en Cloudflare.
- [x] Panel de administrador con tu contraseña.
- [x] Crear cliente → la app genera **su link único**.
- [x] Botones: **Copiar link** y **Enviar por WhatsApp**.
- [x] Lista de clientes con sus guiones.
- [x] Desactivar / regenerar un link.

**Resultado:** pegas un guión, obtienes el link del cliente.

### Fase 3 — La vista del cliente
- [ ] Página que abre el cliente con su link (pensada primero para celular).
- [ ] Puede leer y **editar** el guión; se guarda solo.
- [ ] Botón **"Aprobar guión"** y caja de comentarios.
- [ ] Con tu marca aifotos.

**Resultado:** flujo completo: tú escribes → cliente revisa → cliente edita/aprueba.

### Fase 4 — Control de cambios
- [ ] **Historial de versiones**: cada guardado queda registrado.
- [ ] Ver qué cambió el cliente: lo añadido en verde, lo borrado tachado en rojo.
- [ ] Restaurar cualquier versión anterior con un clic.
- [ ] Estado de cada guión: Borrador → Enviado → En revisión → Aprobado.
- [ ] Al aprobarse, el guión se bloquea para que nadie lo cambie por error.
- [ ] Aviso en tu panel cuando un cliente edita o aprueba.

**Resultado:** nunca pierdes un texto y sabes exactamente qué tocó el cliente.

### Fase 5 — Publicar en línea
- [x] Publicado en GitHub Pages: https://aifotos.github.io/guiones-creator/ (adelantado a la Fase 2 para que los links funcionen).
- [x] Publicación automática: cada mejora que se suba a GitHub queda en línea sola.
- [ ] Prueba real: abrir un link desde tu celular con la Mac apagada.
- [ ] (Opcional) Dominio propio, por ejemplo `guiones.aifotos.com`.

**Resultado:** la app funciona 24/7 sin depender de tu MacBook.

### Fase 6 — Extras (cuando lo básico esté sólido)
- [ ] Exportar guión a **PDF** con tu marca.
- [ ] Modo **teleprompter** (texto grande que avanza solo) para grabar.
- [ ] Plantillas de guión (reel, anuncio, testimonio…).
- [ ] Copia de seguridad descargable de todos los guiones.
- [ ] Caducidad de links (que dejen de funcionar tras X días).

---

## Lo que tú tendrás que hacer en todo el proceso

Muy poco: crear la cuenta de Cloudflare (Fase 0), elegir una contraseña para
tu panel, y probar cada fase cuando te avise. Lo técnico lo hago yo.

# Guiones Creator by aifotos

App para redactar guiones y compartirlos con cada cliente mediante un link propio.

- **Tu panel:** https://aifotos.github.io/guiones-creator/ (entra con tu contraseña)
- **API y base de datos:** Cloudflare Worker + D1 (carpeta `api/`)
- **Plan por fases:** [ROADMAP.md](ROADMAP.md)

## Mantenimiento

- Publicar cambios de la API: `cd api && npx wrangler deploy`
- Cambiar la contraseña del panel: `cd api && npx wrangler secret put ADMIN_PASSWORD`
- La web se actualiza sola al subir cambios a GitHub (rama `main`).
- Antes de subir cambios de la web: `herramientas/nueva-version.sh` (renueva el `?v=` de CSS y JS para que ningún navegador mezcle archivos viejos y nuevos).

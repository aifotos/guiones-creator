#!/bin/bash
# Pone un número de versión nuevo en los enlaces a CSS y JS de las páginas
# (?v=...). Así el navegador del cliente descarga siempre los archivos nuevos
# en vez de mezclar los nuevos con los que tenía guardados de antes.
# Uso: herramientas/nueva-version.sh   (antes de cada commit que cambie la web)
cd "$(dirname "$0")/.."
v=$(date +%Y%m%d%H%M)
for f in index.html cliente.html; do
  sed -i '' -E "s#((href|src)=\"(css|js|assets)/[^\"?]+\.(css|js))(\?v=[0-9]+)?\"#\1?v=$v\"#g" "$f"
done
echo "Versión $v"

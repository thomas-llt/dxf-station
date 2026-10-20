#!/usr/bin/env bash
# Assemble l'outil à partir des sources.
#   ../index.html                          -> version GitHub Pages (installable, hors ligne)
#   out/Nettoyeur_DXF_station.html         -> fichier autonome à ouvrir par double-clic sur un PC
#   out/artifact.html                      -> version pour une page publiée dans Claude
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p out
{ cat head.html; echo '<script>'; cat core.js; echo '</script>'; echo '<script>'; cat ui.js; echo '</script>'; } > out/artifact.html
ICON="$(cat icon.uri)"
{ echo '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Nettoyeur DXF Station</title><link rel="icon" type="image/svg+xml" href="'"$ICON"'"><style>body{margin:0}[hidden]{display:none!important}</style></head><body>'; cat out/artifact.html; echo '</body></html>'; } > out/Nettoyeur_DXF_station.html
{ echo '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Nettoyeur DXF Station</title><meta name="description" content="Nettoie les DXF des bureaux d'"'"'études pour la station d'"'"'implantation."><meta name="theme-color" content="#e8590c"><link rel="manifest" href="manifest.webmanifest"><link rel="icon" href="favicon.ico" sizes="any"><link rel="icon" type="image/png" href="icon-192.png"><link rel="apple-touch-icon" href="icon-192.png"><style>body{margin:0}[hidden]{display:none!important}</style></head><body>'; cat out/artifact.html; echo "<script>if('serviceWorker' in navigator && location.protocol.indexOf('http')===0){navigator.serviceWorker.register('sw.js').catch(function(){});}</script>"; echo '</body></html>'; } > ../index.html
node --check core.js && node --check ui.js
echo "OK : ../index.html, out/Nettoyeur_DXF_station.html, out/artifact.html"

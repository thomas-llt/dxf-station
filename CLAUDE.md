# Nettoyeur DXF Station — consignes pour Claude

Outil web (une seule page, sans serveur) qui nettoie les DXF des bureaux d'études pour une station d'implantation Leica. Utilisateur : Thomas, chef de chantier ; il partage l'outil avec des collègues. **Répondre en français.**

## Où travailler

- Les sources sont dans `sources/` (`head.html`, `core.js`, `ui.js`). Voir `sources/README.md`.
- `index.html` à la racine est **généré** par `bash sources/build.sh` : ne jamais le modifier directement.
- Le site est publié par GitHub Pages depuis `main` (racine) : https://thomas-llt.github.io/dxf-station/

## À chaque modification

1. Modifier les sources, puis `node --check sources/core.js sources/ui.js`.
2. Mettre à jour le numéro de version dans `sources/head.html` (`vAAAA.MM.JJ`, suffixe `.2`, `.3`… si plusieurs le même jour).
3. `bash sources/build.sh`.
4. Tester dans un navigateur headless (Playwright) : chargement d'un plan, fonction modifiée, export DXF relu avec `ezdxf` sans erreur.
5. Ne committer et pousser sur `main` **que lorsque Thomas le demande** : chaque push met en ligne la nouvelle version pour tous les utilisateurs.

## Règles

- Dépôt public : ne jamais committer de plan réel (DXF de chantier ou de client). Tests uniquement avec des plans inventés (`sources/tests/`).
- Tout doit marcher hors ligne et dans le navigateur : pas de dépendance externe hormis les polices Google (facultatives).
- Le DXF exporté reste en R12, en mètres, sans textes ni cotes, et doit rester sous 3 Mo.

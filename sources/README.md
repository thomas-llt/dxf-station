# Sources du Nettoyeur DXF Station

Le site publié (`../index.html`) est **généré** à partir de ces fichiers : on ne modifie jamais `index.html` à la main.

| Fichier | Rôle |
|---|---|
| `head.html` | Titre, styles (CSS) et structure de la page. Contient aussi le **numéro de version** affiché à côté du titre (`v2026.10.20`). |
| `core.js` | Moteur DXF : lecture du fichier, éclatement des blocs, écriture du DXF R12 nettoyé. |
| `ui.js` | Toute l'interface : aperçu du plan, calques, outils (mesurer, points, tracer, couper, sélection), historique, origine et recalage, export. |
| `icon.svg`, `icon.uri` | Icône de l'outil (le `.uri` est la même icône, encodée pour le fichier autonome). |
| `build.sh` | Assemble l'outil (voir ci-dessous). |
| `tests/plan-test-coupe.dxf` | Petit plan inventé, aux cotes connues, pour tester les outils de tracé et de coupe. |

Les fichiers à la racine du dépôt (`manifest.webmanifest`, `sw.js`, icônes PNG, `favicon.ico`) rendent le site installable et utilisable hors connexion. Ils changent rarement.

## Construire

```bash
bash sources/build.sh
```

Le script produit :

- `index.html` à la racine : la version en ligne (GitHub Pages) ;
- `sources/out/Nettoyeur_DXF_station.html` : un fichier autonome à ouvrir par double-clic (non versionné) ;
- `sources/out/artifact.html` : la version pour une page publiée dans Claude (non versionnée).

## Publier une mise à jour

1. Modifier `head.html`, `core.js` ou `ui.js`.
2. Changer le numéro de version dans `head.html` (format `vAAAA.MM.JJ`, avec un suffixe `.2`, `.3`… s'il y a plusieurs versions le même jour).
3. `bash sources/build.sh`
4. Tester, puis committer `sources/` et `index.html` sur `main`. GitHub Pages met le site à jour en quelques minutes ; les utilisateurs reçoivent la nouvelle version à leur prochaine ouverture avec internet.

## À ne jamais mettre dans ce dépôt

Le dépôt est **public** : aucun plan réel de chantier ou de client (DXF reçus des bureaux d'études). Pour tester, utiliser uniquement des plans inventés comme celui du dossier `tests/`.

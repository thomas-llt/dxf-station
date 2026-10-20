# Nettoyeur DXF Station

Outil pour préparer les plans DXF reçus des bureaux d'études avant de les charger dans une station d'implantation (Leica iCON…).

**Ouvrir l'outil :** le lien GitHub Pages de ce dépôt (Paramètres → Pages).

- Purge des blocs inutilisés, textes, cotes, hachures et traits en double
- Mise en mètres automatique, recalage (origine et axe X au choix)
- Choix, renommage, couleur et suppression des calques
- Tracé de points, lignes, rectangles, cercles, parallèles, coupe aux intersections
- Contrôle de l'origine entre étages
- Export DXF R12 léger (moins de 3 Mo) et points en CSV

Les plans sont lus sur l'ordinateur de chacun : rien n'est envoyé sur internet.
Dans Chrome ou Edge, l'icône « Installer » de la barre d'adresse installe l'outil comme une application (fonctionne hors connexion).

## Icône des fichiers .dxf sous Windows

Pour afficher l'icône de l'outil sur les fichiers .dxf : télécharger
[Icone-DXF-Windows.zip](https://thomas-llt.github.io/dxf-station/Icone-DXF-Windows.zip),
le dézipper, puis lancer `installer-icone-dxf.bat` (mode d'emploi dans `LISEZMOI.txt`).
Les scripts sont aussi lisibles dans le dossier [`windows/`](windows/).

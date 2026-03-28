# Architecture du projet

## Fichiers principaux
- `manifest.json` : configuration de l'extension (permissions, scripts, popup, etc.).
- `background.js` : logique en arrière-plan et orchestration.
- `content.js` : interactions directes avec l'interface Facebook.
- `popup.html` / `popup.js` : interface utilisateur de la popup.
- `diagnose.js` : script utilitaire de diagnostic.

## Flux général
1. L'utilisateur déclenche une action depuis la popup.
2. Le script de fond coordonne l'exécution.
3. Le content script agit sur la page Facebook.
4. Le statut est renvoyé à la popup.

## Limites connues
- Les changements d'UI Facebook peuvent casser les sélecteurs.
- Certaines publications peuvent nécessiter des confirmations supplémentaires.

## Bonnes pratiques
- Garder les sélecteurs DOM centralisés et documentés.
- Ajouter des logs ciblés pour faciliter le débogage.
- Tester après chaque changement majeur de Facebook.

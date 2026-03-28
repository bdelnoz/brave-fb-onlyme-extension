<!--
Document : README.md
Auteur : Bruno DELNOZ
Email : bruno.delnoz@protonmail.com
Version : v1.4.0
Date : 2026-03-28 10:45
-->
# Brave FB OnlyMe Extension

## But de l’extension
Le but de cette extension Brave est de **changer l’audience de tous les posts Facebook** vers **"Only Me"** ("**Moi uniquement**").

## Résumé
Cette extension automatise le passage en masse de la confidentialité de vos publications Facebook afin que **seul votre compte** puisse les voir.

## Utilisation rapide
1. Ouvrez `brave://extensions`.
2. Activez le **mode développeur**.
3. Cliquez sur **Charger l’extension non empaquetée**.
4. Sélectionnez ce dossier.
5. Ouvrez Facebook puis lancez l’extension depuis la popup.

## Deuxième extension: extracteur de 50 posts

Un second module est disponible dans `fb-post-extractor-50/`.

Objectif:
- extraire jusqu'à 50 posts Facebook,
- produire un JSON structuré (auteur, audience, contenu, engagement, etc.),
- utiliser ces données pour ajuster/valider l’extension "Only Me" principale.

Chargement:
1. Ouvrir `brave://extensions`
2. Mode développeur
3. Charger l’extension non empaquetée
4. Sélectionner le dossier `fb-post-extractor-50`

## Qualité de ciblage (v1.4.0)

- L’extension principale renforce le ciblage des publications réelles en exigeant la présence d’un lien permalink de post.
- Les conteneurs orientés commentaires/réponses sont explicitement exclus pour éviter de modifier la mauvaise cible.
- Le remplacement d’audience privilégie désormais explicitement le vrai sélecteur de confidentialité pour éviter les faux positifs sur d’autres panneaux Facebook.

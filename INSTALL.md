<!--
Document : INSTALL.md
Auteur : Bruno DELNOZ
Email : bruno.delnoz@protonmail.com
Version : v1.4.0
Date : 2026-03-28 09:45
-->
# Installation

## Main extension (`brave-fb-onlyme-extension`)

1. Open `brave://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the repository root folder.
5. Open Facebook in the active tab.
6. Use the popup to start the audience migration.

## Companion extractor (`fb-post-extractor-50`)

1. Open `brave://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select `fb-post-extractor-50/`.

### v1.4.0 extractor note

When running the extractor, keep Facebook in English or French UI and stay on feed/profile pages where post menus are available.  
The extractor now opens post menus and enters the audience dialog to collect DOM metadata needed by the main automation extension.

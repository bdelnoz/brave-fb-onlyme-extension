<!--
Document : WHY.md
Auteur : Bruno DELNOZ
Email : bruno.delnoz@protonmail.com
Version : v1.4.0
Date : 2026-03-28 09:45
-->
# Why this project exists

The main extension automates Facebook audience changes to **Only Me** at scale.

## Why permalink-based filtering matters

Facebook pages can render comment/reply containers that look similar to post cards.  
If those containers are processed, automation can click irrelevant menus and fail to update the intended post privacy.

Version `v1.3.0` requires real post permalink signals and excludes comment-style links, so the audience update flow better targets true post entries.

## Why v1.4.0 extends extractor behavior

Reliable bulk privacy automation needs real-world selector evidence from Facebook’s audience editor.  
Version `v1.4.0` upgrades the extractor to open post menus, enter Change/Edit audience, and export dialog-level metadata that can be reused in the main extension logic.

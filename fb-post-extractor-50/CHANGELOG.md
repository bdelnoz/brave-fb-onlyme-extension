<!--
Document : fb-post-extractor-50/CHANGELOG.md
Auteur : Bruno DELNOZ
Email : bruno.delnoz@protonmail.com
Version : v1.3.0
Date : 2026-03-28 09:45
-->
# Changelog

## v1.3.0 - 2026-03-28 09:45 UTC - Bruno DELNOZ

- Added per-post audience dialog inspection flow: open post "..." menu, click Change/Edit audience, then capture dialog selectors and labels.
- Added `audienceDialogInspection` payload in extracted JSON for downstream automation design.
- Added extraction counters for menu inspection attempts/success/failures and surfaced them in popup status.

## v1.2.0 - 2026-03-28 00:00 UTC - Bruno DELNOZ

- Added strict filtering to keep only post-level entries with a detected permalink.
- Ignored author links containing `comment_id=` or `/comment/` so comment threads are no longer extracted as posts.
- Kept anti-loop behavior from v1.1.0 while improving extraction quality on profile timelines.

## v1.1.0 - 2026-03-28 00:00 UTC - Bruno DELNOZ

- Added anti-loop protection to stop extraction after repeated stagnant scroll passes with no newly collected posts.
- Added stagnant scroll counters to extractor status payload.
- Added popup status display for stagnant scroll counters.

## v1.0.0 - 2026-03-28 00:00 UTC - Bruno DELNOZ

- Initial release of the 50-post Facebook extractor extension.

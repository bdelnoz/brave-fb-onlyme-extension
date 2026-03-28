<!--
Document : fb-post-extractor-50/README.md
Auteur : Bruno DELNOZ
Email : bruno.delnoz@protonmail.com
Version : v1.1.0
Date : 2026-03-28 00:00
-->
# Facebook Post Extractor (50)

This is a second extension that extracts structured data from up to **50 Facebook posts**.

## What it extracts per post

- `postKey`
- `permalink`
- `authorName`
- `authorProfileUrl`
- `timestampIso`
- `timestampLabel`
- `audience` (`only_me`, `public`, `friends`, `custom`, `unknown`)
- `message`
- `reactionsCount`
- `commentsCount`
- `sharesCount`
- `extractedAt`

## Why this helps adapt the OnlyMe extension

You can use the exported JSON to:

1. Estimate how many posts are already `only_me` before running bulk updates.
2. Validate if audience changes worked after execution.
3. Analyze post types and engagement patterns when tuning selectors or delays.

## Install

1. Open `brave://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the `fb-post-extractor-50` folder.

## Usage

1. Open Facebook in the active tab.
2. Click **Start extraction**.
3. Wait for completion (or refresh status).
4. Click **Copy JSON** or **Download JSON file**.

## Notes

- Extraction depends on Facebook DOM structure and can require selector adjustments over time.
- The extension intentionally caps collection to 50 posts.
- The extractor now stops early when several consecutive scrolls find no new post, which prevents long loop-like runs.

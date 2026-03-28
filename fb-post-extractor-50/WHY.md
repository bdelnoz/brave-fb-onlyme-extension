<!--
Document : fb-post-extractor-50/WHY.md
Auteur : Bruno DELNOZ
Email : bruno.delnoz@protonmail.com
Version : v1.1.0
Date : 2026-03-28 00:00
-->
# Why this extractor exists

This companion extension provides a structured export of Facebook post data so bulk privacy workflows can be measured and validated.

## Main goals

- Build a reliable JSON snapshot of recent posts.
- Help identify existing post audiences before bulk changes.
- Provide a practical feedback loop for selector and automation tuning.

## Why v1.1.0 changed the run loop

On some timelines, Facebook can keep loading the same visible article set while no additional valid post is discovered.  
The anti-loop safeguard introduced in v1.1.0 stops extraction after repeated stagnant passes, reducing unnecessary scrolling time and making completion more predictable.

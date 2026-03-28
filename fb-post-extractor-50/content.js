(() => {
  if (window.__FB_POST_EXTRACTOR_LOADED__) return;
  window.__FB_POST_EXTRACTOR_LOADED__ = true;

  /*
   * File: /workspace/brave-fb-onlyme-extension/fb-post-extractor-50/content.js
   * Author: Bruno DELNOZ
   * Email: bruno.delnoz@protonmail.com
   * Purpose: Extract structured data from Facebook posts and inspect audience dialog selectors.
   * Version: v1.3.0
   * Date: 2026-03-28 09:45 UTC
   * Changelog:
   * - v1.0.0 (2026-03-28 00:00 UTC): Initial extractor logic.
   * - v1.1.0 (2026-03-28 00:00 UTC): Stop extraction early when no new posts are collected across consecutive scrolls.
   * - v1.2.0 (2026-03-28 00:00 UTC): Reject comment-level entries by requiring a post permalink and filtering comment URLs in author detection.
   * - v1.3.0 (2026-03-28 09:45 UTC): Open post menu, navigate to Change/Edit audience, and extract dialog-level selectors/labels for automation mapping.
   */

  const state = {
    running: false,
    done: false,
    attemptedScrolls: 0,
    maxPosts: 50,
    scrollDelayMs: 1600,
    maxScrolls: 180,
    lastMessage: "",
    posts: [],
    seenKeys: new Set(),
    skippedLowQuality: 0,
    stagnantScrolls: 0,
    maxStagnantScrolls: 12,
    menuInspectionsAttempted: 0,
    menuInspectionsSucceeded: 0,
    menuInspectionsFailed: 0
  };

  const POST_URL_HINTS = ["/posts/", "story_fbid=", "/permalink/", "/photo/", "/videos/"];

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function norm(value) {
    return (value || "").replace(/\s+/g, " ").trim();
  }

  function normLower(value) {
    return norm(value).toLowerCase();
  }

  function isVisible(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.display !== "none" && cs.visibility !== "hidden" && cs.opacity !== "0";
  }

  function looksLikePostUrl(href) {
    return POST_URL_HINTS.some((hint) => href.includes(hint));
  }

  function getPostLinks(article) {
    const links = Array.from(article.querySelectorAll('a[href]')).filter(isVisible);
    return links.filter((a) => {
      const href = a.href || "";
      if (!href.includes("facebook.com")) return false;
      if (href.includes("comment_id=") || href.includes("/comment/")) return false;
      return looksLikePostUrl(href);
    });
  }

  function getCommentLinks(article) {
    const links = Array.from(article.querySelectorAll('a[href]')).filter(isVisible);
    return links.filter((a) => {
      const href = a.href || "";
      return href.includes("comment_id=") || href.includes("/comment/");
    });
  }

  function isArticleReady(article) {
    const loading = article.querySelector('[role="status"], [data-visualcompletion="loading-state"]');
    if (loading && isVisible(loading)) return false;

    const hasText = norm(article.innerText || "").length > 30;
    const hasPostLink = getPostLinks(article).length > 0;
    return hasText || hasPostLink;
  }

  function log(message) {
    state.lastMessage = message;
    console.log("FB-EXTRACTOR:", message);
    renderOverlay();
  }

  function jitter(ms) {
    const delta = Math.round(ms * 0.2);
    const min = Math.max(60, ms - delta);
    const max = ms + delta;
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function realClick(el) {
    if (!el) return false;
    try {
      el.scrollIntoView({ block: "center", behavior: "instant" });
    } catch (e) {
      // no-op: some elements may not support scrollIntoView in transient states
    }
    el.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, cancelable: true }));
    el.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true, cancelable: true }));
    el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
    el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));
    el.click();
    return true;
  }

  function looksLikeAudienceActionText(value) {
    const low = normLower(value);
    if (!low) return false;
    return [
      "change audience",
      "edit audience",
      "modifier l’audience",
      "modifier l'audience",
      "changer l’audience",
      "changer l'audience",
      "audience"
    ].some((token) => low.includes(token));
  }

  function looksLikePostMenuAria(value) {
    const low = normLower(value);
    if (!low) return false;
    return [
      "actions for this post",
      "options for this post",
      "more options",
      "post options",
      "actions pour cette publication",
      "options de publication",
      "plus d’options",
      "plus d'options"
    ].some((token) => low.includes(token));
  }

  async function waitForDialog(maxMs = 4500) {
    const deadline = Date.now() + maxMs;
    while (Date.now() < deadline) {
      const dialog = document.querySelector('[role="dialog"]');
      if (dialog && isVisible(dialog)) return dialog;
      await sleep(120);
    }
    return null;
  }

  async function waitForMenu(maxMs = 3000) {
    const deadline = Date.now() + maxMs;
    while (Date.now() < deadline) {
      const menu = document.querySelector('[role="menu"], [role="listbox"]');
      if (menu && isVisible(menu)) return menu;
      await sleep(100);
    }
    return null;
  }

  function describeElement(el) {
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return {
      tag: (el.tagName || "").toLowerCase(),
      role: el.getAttribute("role") || "",
      ariaLabel: norm(el.getAttribute("aria-label") || ""),
      ariaChecked: el.getAttribute("aria-checked"),
      ariaPressed: el.getAttribute("aria-pressed"),
      title: norm(el.getAttribute("title") || ""),
      text: norm(el.innerText || el.textContent || ""),
      className: norm((el.className || "").toString()).slice(0, 240),
      x: Math.round(rect.left),
      y: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height)
    };
  }

  function extractAudienceDialogData(dialog) {
    const audienceItems = Array.from(
      dialog.querySelectorAll('[role="radio"], [role="menuitemradio"], [role="option"], [aria-checked], label, [role="button"]')
    )
      .filter(isVisible)
      .map((el) => describeElement(el))
      .filter((entry) => {
        const text = normLower(entry?.text || "");
        const aria = normLower(entry?.ariaLabel || "");
        return [
          "public",
          "friends",
          "only me",
          "specific friends",
          "custom",
          "amis",
          "moi uniquement",
          "personnalis"
        ].some((token) => text.includes(token) || aria.includes(token));
      });

    const selectedCandidate = audienceItems.find((entry) => entry?.ariaChecked === "true" || entry?.ariaPressed === "true") || null;
    return {
      dialogMeta: describeElement(dialog),
      heading: norm(
        dialog.querySelector('h1, h2, h3, [role="heading"]')?.textContent || ""
      ),
      audienceItems,
      selectedCandidate
    };
  }

  function closeDialogOrMenu() {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", code: "Escape", keyCode: 27, which: 27, bubbles: true })
    );
    document.dispatchEvent(
      new KeyboardEvent("keyup", { key: "Escape", code: "Escape", keyCode: 27, which: 27, bubbles: true })
    );
  }

  function findPostMenuButton(article) {
    const candidates = Array.from(
      article.querySelectorAll('[aria-label], [role="button"], button, div[tabindex="0"], span[role="button"]')
    ).filter(isVisible);

    const direct = candidates.find((el) => looksLikePostMenuAria(el.getAttribute("aria-label") || ""));
    if (direct) return direct;

    const fallback = candidates.find((el) => {
      const txt = norm(el.innerText || el.textContent || "");
      return txt === "…" || txt === "...";
    });

    return fallback || null;
  }

  function findAudienceActionNode(root) {
    const candidates = Array.from(root.querySelectorAll('[role="menuitem"], [role="button"], button, span, div, a'))
      .filter(isVisible);
    return candidates.find((el) => {
      const txt = norm(el.innerText || el.textContent || "");
      const aria = norm(el.getAttribute("aria-label") || "");
      return looksLikeAudienceActionText(txt) || looksLikeAudienceActionText(aria);
    }) || null;
  }

  async function inspectAudienceDialog(article) {
    const result = {
      openedMenu: false,
      clickedAudienceAction: false,
      audienceDialogFound: false,
      audienceDialog: null,
      error: ""
    };

    const menuButton = findPostMenuButton(article);
    if (!menuButton) {
      result.error = "post_menu_not_found";
      return result;
    }

    realClick(menuButton);
    result.openedMenu = true;
    await sleep(jitter(360));

    const menuRoot = (await waitForMenu(3200)) || document;
    const audienceAction = findAudienceActionNode(menuRoot);
    if (!audienceAction) {
      result.error = "change_audience_action_not_found";
      closeDialogOrMenu();
      await sleep(120);
      return result;
    }

    realClick(audienceAction);
    result.clickedAudienceAction = true;
    await sleep(jitter(420));

    const dialog = await waitForDialog(5200);
    if (!dialog) {
      result.error = "audience_dialog_not_found";
      closeDialogOrMenu();
      await sleep(120);
      return result;
    }

    result.audienceDialogFound = true;
    result.audienceDialog = extractAudienceDialogData(dialog);
    closeDialogOrMenu();
    await sleep(120);
    closeDialogOrMenu();
    await sleep(120);
    return result;
  }

  function renderOverlay() {
    let box = document.getElementById("fb-post-extractor-overlay");
    if (!box) {
      box = document.createElement("div");
      box.id = "fb-post-extractor-overlay";
      box.style.cssText = [
        "position:fixed",
        "left:12px",
        "bottom:12px",
        "z-index:999999",
        "background:rgba(0,0,0,.88)",
        "color:#7dffb3",
        "border:1px solid #7dffb3",
        "padding:10px",
        "max-width:460px",
        "font:12px monospace",
        "white-space:pre-wrap",
        "pointer-events:none"
      ].join(";");
      document.body.appendChild(box);
    }

    box.textContent =
      `FB Post Extractor\n` +
      `running=${state.running} done=${state.done}\n` +
      `collected=${state.posts.length}/${state.maxPosts} scrolls=${state.attemptedScrolls}/${state.maxScrolls}\n` +
      `skippedLowQuality=${state.skippedLowQuality}\n` +
      `menuInspections=${state.menuInspectionsSucceeded}/${state.menuInspectionsAttempted} failed=${state.menuInspectionsFailed}\n\n` +
      `${state.lastMessage}`;
  }

  function getArticles() {
    return Array.from(document.querySelectorAll('[role="article"]'))
      .filter(isVisible)
      .filter(isArticleReady)
      .filter((article) => {
        const postLinks = getPostLinks(article);
        const commentLinks = getCommentLinks(article);

        if (postLinks.length === 0) return false;
        if (commentLinks.length > 0 && postLinks.length === 0) return false;
        return true;
      });
  }

  function pickPermalink(article) {
    const links = getPostLinks(article);
    if (links.length === 0) return "";
    return links[0].href || "";
  }

  function inferAudience(article) {
    const candidates = Array.from(article.querySelectorAll('[aria-label], [title]'));

    for (const el of candidates) {
      const value = normLower(el.getAttribute("aria-label") || el.getAttribute("title") || "");
      if (!value) continue;

      if (value.includes("only me") || value.includes("moi uniquement")) return "only_me";
      if (value.includes("public")) return "public";
      if (value.includes("friends") || value.includes("amis")) return "friends";
      if (value.includes("custom")) return "custom";
    }

    return "unknown";
  }

  function getAuthor(article) {
    const links = Array.from(article.querySelectorAll('a[href]')).filter(isVisible);

    for (const a of links) {
      const href = a.href || "";
      const text = norm(a.innerText || a.textContent || "");
      const low = normLower(text);

      if (!href.includes("facebook.com")) continue;
      if (href.includes("comment_id=") || href.includes("/comment/")) continue;
      if (!text || text.length < 2 || text.length > 80) continue;
      if (looksLikePostUrl(href)) continue;
      if (["like", "j'aime", "comment", "commenter", "share", "partager", "see more", "voir plus"].some((token) => low.includes(token))) continue;
      if (/^(\d+\s*[smhdwy]|\d+\s*min|\d+\s*h|today|yesterday)$/i.test(text)) continue;

      return { name: text, profileUrl: href };
    }

    const fallback = norm(article.querySelector('h2, h3, h4, strong')?.textContent || "");
    if (fallback && fallback.length <= 80) {
      return { name: fallback, profileUrl: "" };
    }

    return { name: "unknown", profileUrl: "" };
  }

  function getTimestamp(article) {
    const timeEl = article.querySelector("time");
    if (timeEl) {
      return {
        iso: timeEl.getAttribute("datetime") || "",
        label: norm(timeEl.innerText || timeEl.textContent || "")
      };
    }

    const links = Array.from(article.querySelectorAll('a[href]')).filter(isVisible);
    for (const a of links) {
      const txt = norm(a.innerText || a.textContent || "");
      if (/^(\d+\s*[smhdwy]|\d+\s*min|\d+\s*h|today|yesterday|now)$/i.test(txt)) {
        return { iso: "", label: txt };
      }
    }

    return { iso: "", label: "" };
  }

  function getBodyText(article) {
    const ignoreTokens = [
      "like",
      "comment",
      "share",
      "j'aime",
      "commenter",
      "partager",
      "see translation",
      "voir la traduction"
    ];

    const textBlocks = Array.from(
      article.querySelectorAll('[data-ad-comet-preview="message"], [data-ad-preview="message"], div[dir="auto"], span[dir="auto"]')
    );

    const cleanBlocks = textBlocks
      .map((el) => norm(el.textContent || ""))
      .filter((value) => value.length >= 8)
      .filter((value) => {
        const low = normLower(value);
        return !ignoreTokens.some((token) => low === token);
      })
      .sort((a, b) => b.length - a.length);

    if (cleanBlocks.length > 0) {
      return cleanBlocks[0].slice(0, 5000);
    }

    const fallback = norm(article.innerText || "");
    return fallback.slice(0, 5000);
  }

  function extractNumberFromText(text) {
    const clean = normLower(text);
    const match = clean.match(/(\d+[\d,.]*)/);
    if (!match) return null;

    const numeric = parseInt(match[1].replace(/[,.]/g, ""), 10);
    return Number.isFinite(numeric) ? numeric : null;
  }

  function getEngagement(article) {
    let reactions = null;
    let comments = null;
    let shares = null;

    const nodes = Array.from(article.querySelectorAll('[role="button"], a, span')).filter(isVisible);

    for (const el of nodes) {
      const txt = normLower(el.innerText || el.textContent || "");
      if (!txt) continue;

      if (comments === null && (txt.includes("comment") || txt.includes("commentaire"))) {
        comments = extractNumberFromText(txt);
      }

      if (shares === null && (txt.includes("share") || txt.includes("partage"))) {
        shares = extractNumberFromText(txt);
      }

      if (reactions === null && (txt.includes("reaction") || txt.includes("like") || txt.includes("j'aime"))) {
        reactions = extractNumberFromText(txt);
      }
    }

    return { reactions, comments, shares };
  }

  function inferPostKey(post) {
    if (post.permalink) return post.permalink;

    const key = [post.authorName, post.timestampLabel, post.message.slice(0, 80)]
      .map((part) => norm(part || ""))
      .filter(Boolean)
      .join("|");

    return key || "";
  }

  function isLowQuality(post) {
    let score = 0;

    if (!post.permalink) return true;

    if (post.permalink) score += 2;
    if (post.authorName && post.authorName !== "unknown") score += 1;
    if (post.timestampIso || post.timestampLabel) score += 1;
    if (post.audience !== "unknown") score += 1;
    if (post.message && post.message.length >= 12) score += 1;

    return score < 3;
  }

  async function extractArticle(article) {
    const permalink = pickPermalink(article);
    const author = getAuthor(article);
    const timestamp = getTimestamp(article);
    const audience = inferAudience(article);
    const message = getBodyText(article);
    const engagement = getEngagement(article);
    const audienceDialogInspection = await inspectAudienceDialog(article);

    state.menuInspectionsAttempted += 1;
    if (audienceDialogInspection.audienceDialogFound) {
      state.menuInspectionsSucceeded += 1;
    } else {
      state.menuInspectionsFailed += 1;
    }

    const post = {
      postKey: "",
      permalink,
      authorName: author.name,
      authorProfileUrl: author.profileUrl,
      timestampIso: timestamp.iso,
      timestampLabel: timestamp.label,
      audience,
      message,
      reactionsCount: engagement.reactions,
      commentsCount: engagement.comments,
      sharesCount: engagement.shares,
      audienceDialogInspection,
      extractedAt: new Date().toISOString()
    };

    post.postKey = inferPostKey(post);
    return post;
  }

  async function collectPosts() {
    state.running = true;
    state.done = false;
    state.posts = [];
    state.seenKeys = new Set();
    state.attemptedScrolls = 0;
    state.skippedLowQuality = 0;
    state.stagnantScrolls = 0;
    state.menuInspectionsAttempted = 0;
    state.menuInspectionsSucceeded = 0;
    state.menuInspectionsFailed = 0;

    renderOverlay();
    log("Starting extraction...");

    while (state.posts.length < state.maxPosts && state.attemptedScrolls < state.maxScrolls) {
      const postCountBeforeScan = state.posts.length;
      const articles = getArticles();

      for (const article of articles) {
        if (state.posts.length >= state.maxPosts) break;

        const post = await extractArticle(article);
        if (!post.postKey) {
          state.skippedLowQuality += 1;
          continue;
        }

        if (!post.permalink) {
          state.skippedLowQuality += 1;
          continue;
        }

        if (state.seenKeys.has(post.postKey)) {
          continue;
        }

        if (isLowQuality(post)) {
          state.skippedLowQuality += 1;
          continue;
        }

        state.seenKeys.add(post.postKey);
        state.posts.push(post);
        log(`Collected ${state.posts.length}/${state.maxPosts} (skipped ${state.skippedLowQuality})`);
      }

      if (state.posts.length > postCountBeforeScan) {
        state.stagnantScrolls = 0;
      } else {
        state.stagnantScrolls += 1;
        log(
          `No new post found on this pass (${state.stagnantScrolls}/${state.maxStagnantScrolls}).`
        );
      }

      if (state.posts.length >= state.maxPosts) {
        break;
      }

      if (state.stagnantScrolls >= state.maxStagnantScrolls) {
        log("Stopping early to avoid loop: no new posts detected for too many scrolls.");
        break;
      }

      state.attemptedScrolls += 1;
      window.scrollBy({ top: Math.round(window.innerHeight * 0.95), behavior: "smooth" });
      await sleep(state.scrollDelayMs);
    }

    state.running = false;
    state.done = true;
    log(`Extraction finished: ${state.posts.length} posts collected, ${state.skippedLowQuality} low-quality skipped.`);
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg?.type === "START_FB_POST_EXTRACTION") {
      const requestedMax = Number(msg?.config?.maxPosts || 50);
      const requestedDelay = Number(msg?.config?.scrollDelayMs || 1600);
      const requestedScrolls = Number(msg?.config?.maxScrolls || 180);

      state.maxPosts = Math.min(50, Math.max(1, requestedMax));
      state.scrollDelayMs = Math.min(10000, Math.max(300, requestedDelay));
      state.maxScrolls = Math.min(1000, Math.max(5, requestedScrolls));

      collectPosts()
        .then(() => sendResponse({ ok: true, state: getSerializableState() }))
        .catch((e) => sendResponse({ ok: false, error: String(e) }));

      return true;
    }

    if (msg?.type === "GET_FB_POST_EXTRACTION_STATUS") {
      sendResponse({ ok: true, state: getSerializableState() });
      return;
    }

    if (msg?.type === "GET_EXTRACTED_POSTS") {
      sendResponse({ ok: true, data: state.posts });
      return;
    }
  });

  function getSerializableState() {
    return {
      running: state.running,
      done: state.done,
      attemptedScrolls: state.attemptedScrolls,
      maxPosts: state.maxPosts,
      scrollDelayMs: state.scrollDelayMs,
      maxScrolls: state.maxScrolls,
      count: state.posts.length,
      skippedLowQuality: state.skippedLowQuality,
      stagnantScrolls: state.stagnantScrolls,
      maxStagnantScrolls: state.maxStagnantScrolls,
      menuInspectionsAttempted: state.menuInspectionsAttempted,
      menuInspectionsSucceeded: state.menuInspectionsSucceeded,
      menuInspectionsFailed: state.menuInspectionsFailed,
      lastMessage: state.lastMessage
    };
  }
})();

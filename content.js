(() => {
  if (window.__FB_ONLYME_EXTENSION_LOADED__) return;
  window.__FB_ONLYME_EXTENSION_LOADED__ = true;

  const state = {
    running: false,
    stopRequested: false,
    processedKeys: new Set(),
    attempted: 0,
    changed: 0,
    failedMenus: 0,
    failedEditAudience: 0,
    failedOnlyMe: 0,
    failedDone: 0,
    skippedAlreadyOnlyMe: 0,
    lastMessage: "",
    config: {
      maxPosts: 10,
      actionDelayMs: 1800,
      scrollDelayMs: 2200
    }
  };

  const LOG_PREFIX = "FBOM:";

  function log(...args) {
    state.lastMessage = args.map(x => String(x)).join(" ");
    console.log(LOG_PREFIX, ...args);
    updateOverlay();
  }

  function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  function jitter(ms) {
    const d = Math.round(ms * 0.25);
    const min = Math.max(120, ms - d);
    const max = ms + d;
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function norm(s) {
    return (s || "").replace(/\s+/g, " ").trim().toLowerCase();
  }

  function isVisible(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 &&
      cs.display !== "none" &&
      cs.visibility !== "hidden" &&
      cs.opacity !== "0";
  }

  function isInViewport(el) {
    const r = el.getBoundingClientRect();
    return r.bottom >= 0 && r.top <= window.innerHeight && r.right >= 0 && r.left <= window.innerWidth;
  }

  function realClick(el) {
    if (!el) return false;
    el.scrollIntoView({ block: "center", behavior: "instant" });
    el.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, cancelable: true }));
    el.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true, cancelable: true }));
    el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
    el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));
    el.click();
    return true;
  }

  // An article is "ready" when it has actual loaded content:
  // - has interactive buttons, OR
  // - has links (post timestamp/permalink), OR
  // - has non-trivial text
  // Excludes skeleton/loading placeholders
  function isArticleReady(article) {
    // If it still has a loading spinner, skip
    const loading = article.querySelector('[role="status"], [data-visualcompletion="loading-state"]');
    if (loading && isVisible(loading)) return false;

    // Must have at least one button or link, or meaningful text
    const hasButtons = article.querySelector('[role="button"], button') !== null;
    const hasLinks   = article.querySelector('a[href]') !== null;
    const hasText    = norm(article.innerText || "").length > 10;

    return hasButtons || hasLinks || hasText;
  }

  function getArticles() {
    return Array.from(document.querySelectorAll('[role="article"]'))
      .filter(isVisible)
      .filter(isArticleReady);
  }

  // Scroll to article and wait up to `maxMs` for it to finish loading
  async function waitForArticleReady(article, maxMs = 5000) {
    article.scrollIntoView({ block: "center", behavior: "smooth" });
    await sleep(600);

    const deadline = Date.now() + maxMs;
    while (Date.now() < deadline) {
      if (isArticleReady(article)) return true;
      log("waiting for article to load...");
      await sleep(400);
    }
    return false;
  }

  function getPostKey(article) {
    const links = Array.from(article.querySelectorAll('a[href]'));
    for (const a of links) {
      const href = a.href || "";
      if (
        href.includes("/posts/") ||
        href.includes("story_fbid=") ||
        href.includes("/permalink/") ||
        href.includes("/photo/")
      ) return href;
    }
    return norm(article.innerText || "").slice(0, 220) || ("post-" + Math.random().toString(36).slice(2));
  }

  // FIX: Check the privacy button/icon specifically, not raw innerText
  // The privacy indicator near the post timestamp usually has aria-label containing "only me"
  function articleAlreadyOnlyMe(article) {
    // Check aria-labels of small buttons near the top of the post (privacy indicators)
    const privacyIndicators = Array.from(article.querySelectorAll(
      '[aria-label], [data-testid]'
    )).filter(el => {
      const r = el.getBoundingClientRect();
      const articleRect = article.getBoundingClientRect();
      // Must be in the header zone of the article
      return r.top < articleRect.top + 100 && r.height < 60;
    });

    for (const el of privacyIndicators) {
      const aria = norm(el.getAttribute("aria-label") || "");
      if (aria.includes("only me")) return true;
    }

    // Fallback: check for SVG/icon with title "Only me"
    const svgTitles = Array.from(article.querySelectorAll("title, desc"));
    for (const el of svgTitles) {
      if (norm(el.textContent || "").includes("only me")) return true;
    }

    return false;
  }

  function updateOverlay() {
    let box = document.getElementById("fb-onlyme-overlay");
    if (!box) {
      box = document.createElement("div");
      box.id = "fb-onlyme-overlay";
      box.style.cssText = `
        position: fixed; right: 12px; bottom: 12px; z-index: 999999;
        background: rgba(0,0,0,0.88); color: #00ff66; padding: 10px;
        font: 12px monospace; border: 1px solid #00ff66;
        max-width: 520px; white-space: pre-wrap; pointer-events: none;
      `;
      document.body.appendChild(box);
    }

    box.textContent =
      `FB Only Me
running=${state.running}  stopRequested=${state.stopRequested}
attempted=${state.attempted}/${state.config.maxPosts}  changed=${state.changed}
skipped=${state.skippedAlreadyOnlyMe}  failMenus=${state.failedMenus}
failEdit=${state.failedEditAudience}  failOnlyMe=${state.failedOnlyMe}  failDone=${state.failedDone}

${state.lastMessage || ""}`;
  }

  function getVisibleCandidates(root) {
    return Array.from(root.querySelectorAll(
      '[role="button"], button, a, div[tabindex="0"], [aria-label], label, span[role="button"]'
    )).filter(isVisible);
  }

  function describeEl(el) {
    if (!el) return "null";
    const r = el.getBoundingClientRect();
    return JSON.stringify({
      tag: el.tagName?.toLowerCase() || "",
      role: el.getAttribute("role") || "",
      aria: (el.getAttribute("aria-label") || "").slice(0, 120),
      text: (norm(el.innerText || el.textContent || "")).slice(0, 120),
      x: Math.round(r.left), y: Math.round(r.top),
      w: Math.round(r.width), h: Math.round(r.height)
    });
  }

  // FIX: Try direct aria-label match first before falling back to scoring
  function findPostMenuButton(article) {
    const articleRect = article.getBoundingClientRect();

    // --- Pass 1: direct aria-label match (most reliable) ---
    const directMatches = Array.from(article.querySelectorAll('[aria-label]'))
      .filter(isVisible)
      .filter(isInViewport)
      .filter(el => {
        const aria = norm(el.getAttribute("aria-label") || "");
        return (
          aria.includes("actions for this post") ||
          aria.includes("more options") ||
          aria.includes("post options") ||
          aria.includes("options for this post")
        );
      });

    if (directMatches.length > 0) {
      log("menu found via direct aria-label match", describeEl(directMatches[0]));
      return directMatches[0];
    }

    // --- Pass 2: scoring fallback ---
    let candidates = getVisibleCandidates(article).filter(el => {
      const r = el.getBoundingClientRect();
      if (!isInViewport(el)) return false;
      if (r.top < articleRect.top - 20) return false;
      if (r.top > articleRect.top + 220) return false;
      if (r.width < 8 || r.height < 8) return false;
      if (r.width > articleRect.width * 0.8) return false;
      if (r.height > 120) return false;
      if (norm(el.getAttribute("role") || "") === "status") return false;
      return true;
    });

    const scored = candidates.map(el => {
      const r = el.getBoundingClientRect();
      const txt = norm(el.innerText || el.textContent || "");
      const aria = norm(el.getAttribute("aria-label") || "");
      const combo = `${txt} ${aria}`;
      let score = 0;

      score += r.right * 2;
      score -= Math.max(0, (r.top - articleRect.top) * 8);

      if (r.right > articleRect.right - 180) score += 1200;
      if (r.right > articleRect.right - 120) score += 1500;
      if (r.right > articleRect.right - 70)  score += 2000;
      if (r.top < articleRect.top + 120)     score += 1200;

      const area = r.width * r.height;
      if (area < 3000)  score += 1000;
      if (area < 1200)  score += 900;
      if (area > 12000) score -= 2000;

      if (combo.includes("actions for this post")) score += 22000;
      if (combo.includes("more"))    score += 9000;
      if (combo.includes("menu"))    score += 7000;
      if (combo.includes("options")) score += 7000;

      if (/like|comment|share|send|react|follow|message|translate|reel|watch|privacy · terms|advertising|cookies/.test(combo))
        score -= 40000;

      if (!txt && aria)  score += 600;
      if (!txt && !aria) score += 200;

      return { el, score };
    }).sort((a, b) => b.score - a.score);

    log("menu top candidates (scoring fallback)");
    scored.slice(0, 5).forEach((x, i) => log(`#${i+1} score=${Math.round(x.score)} ${describeEl(x.el)}`));

    return scored[0]?.el || null;
  }

  function getOpenMenuOrDialog() {
    return Array.from(document.querySelectorAll('[role="menu"], [role="dialog"], [role="listbox"]'))
      .filter(isVisible)
      .filter(isInViewport);
  }

  // FIX: verify a menu actually opened after clicking; return false if not
  async function clickPostMenu(article) {
    // Close any stray open menus before starting
    await dismissStrayUI();

    const btn = findPostMenuButton(article);
    if (!btn) {
      state.failedMenus++;
      log("menu button introuvable");
      return false;
    }

    log("click menu btn", describeEl(btn));
    realClick(btn);
    await sleep(jitter(1400));

    const blocks = getOpenMenuOrDialog();
    log("open menus/dialogs after click =", blocks.length);
    blocks.slice(0, 3).forEach((b, i) => {
      log(`block#${i+1}`, JSON.stringify({
        role: b.getAttribute("role") || "",
        aria: b.getAttribute("aria-label") || "",
        text: norm(b.innerText || "").slice(0, 200)
      }));
    });

    // FIX: actually verify something opened
    if (blocks.length === 0) {
      state.failedMenus++;
      log("aucun menu/dialog ouvert après click");
      return false;
    }

    return true;
  }

  // FIX: search INSIDE the open menu/dialog first, not near the article
  async function clickEditAudience(article) {
    const openBlocks = getOpenMenuOrDialog();

    // Search in open menus first
    for (const block of openBlocks) {
      const candidates = Array.from(block.querySelectorAll(
        '[role="button"], button, [role="menuitem"], li, div[tabindex], span[role="button"]'
      ))
        .filter(isVisible)
        .filter(el => {
          const txt  = norm(el.innerText || el.textContent || "");
          const aria = norm(el.getAttribute("aria-label") || "");
          const combo = `${txt} ${aria}`;
          return (
            combo.includes("edit audience") ||
            combo.includes("edit privacy") ||
            combo.includes("audience") ||
            // French/localized variants
            combo.includes("modifier l'audience") ||
            combo.includes("confidentialité") ||
            combo.includes("privacy")
          ) && !combo.includes("privacy · terms") && !combo.includes("advertising");
        });

      if (candidates.length > 0) {
        // Prefer "edit audience" / "edit privacy" over generic "privacy"
        candidates.sort((a, b) => {
          const aText = norm(a.innerText || a.textContent || "") + norm(a.getAttribute("aria-label") || "");
          const bText = norm(b.innerText || b.textContent || "") + norm(b.getAttribute("aria-label") || "");
          const score = t =>
            (t.includes("edit audience") ? 4 : 0) +
            (t.includes("edit privacy")  ? 3 : 0) +
            (t.includes("audience")      ? 2 : 0) +
            (t.includes("privacy")       ? 1 : 0);
          return score(bText) - score(aText);
        });

        log("click edit audience (in open menu)", describeEl(candidates[0]));
        realClick(candidates[0]);
        await sleep(jitter(1400));
        return true;
      }
    }

    // Fallback: search globally near the article (original logic, kept as safety net)
    const articleRect = article.getBoundingClientRect();
    const globalCandidates = Array.from(document.querySelectorAll(
      '[role="button"], button, span[role="button"], div[role="button"], [role="menuitem"]'
    ))
      .filter(isVisible)
      .filter(isInViewport)
      .map(el => {
        const r = el.getBoundingClientRect();
        const txt  = norm(el.innerText || el.textContent || "");
        const aria = norm(el.getAttribute("aria-label") || "");
        const combo = `${txt} ${aria}`;
        let score = 0;

        if (combo.includes("edit audience"))       score += 30000;
        if (combo.includes("edit privacy"))        score += 28000;
        if (combo.includes("audience"))            score += 8000;
        if (combo.includes("privacy"))             score += 6000;

        const dx = Math.abs(r.left - articleRect.left) + Math.abs(r.top - articleRect.top);
        score -= dx;

        if (/privacy · terms|advertising|cookies|footer/.test(combo)) score -= 50000;

        return { el, score };
      })
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score);

    log("edit audience global fallback candidates =", globalCandidates.length);
    globalCandidates.slice(0, 5).forEach((x, i) => log(`edit#${i+1} score=${Math.round(x.score)} ${describeEl(x.el)}`));

    if (!globalCandidates[0]?.el) {
      state.failedEditAudience++;
      log("edit audience introuvable partout");
      return false;
    }

    log("click edit audience (global fallback)", describeEl(globalCandidates[0].el));
    realClick(globalCandidates[0].el);
    await sleep(jitter(1400));
    return true;
  }

  // FIX: much more permissive dialog detection
  function getAudienceDialog() {
    const dialogs = Array.from(document.querySelectorAll('div[role="dialog"]'))
      .filter(isVisible)
      .filter(isInViewport);

    // Priority 1: aria-label explicitly about audience/privacy
    const byAria = dialogs.find(d => {
      const aria = norm(d.getAttribute("aria-label") || "");
      return (
        aria.includes("select audience") ||
        aria.includes("audience") ||
        aria.includes("privacy") ||
        aria.includes("who can see") ||
        // French
        aria.includes("sélectionner une audience") ||
        aria.includes("confidentialité")
      );
    });
    if (byAria) return byAria;

    // Priority 2: dialog whose text mentions "only me" (the option we want)
    const byContent = dialogs.find(d => {
      const txt = norm(d.innerText || "");
      return (
        txt.includes("only me") ||
        txt.includes("who can see your post") ||
        txt.includes("who should see this") ||
        // French
        txt.includes("moi uniquement") ||
        txt.includes("qui peut voir")
      );
    });
    if (byContent) return byContent;

    // Priority 3: any dialog that appeared and has radio-like options (last resort)
    const byRadio = dialogs.find(d => {
      return d.querySelectorAll('[role="radio"], input[type="radio"], label').length >= 2;
    });
    return byRadio || null;
  }

  // FIX: search all element types for "Only Me", not just <label>
  async function clickOnlyMeAndDone() {
    const dialog = getAudienceDialog();
    if (!dialog) {
      state.failedOnlyMe++;
      log("dialog audience introuvable");
      return false;
    }

    log("audience dialog found", describeEl(dialog));

    // Search all visible interactive elements inside the dialog
    const allCandidates = Array.from(dialog.querySelectorAll(
      'label, [role="radio"], [role="option"], [role="button"], div[tabindex], li, span'
    )).filter(isVisible);

    log("audience option candidates =", allCandidates.length);

    const onlyMeEl = allCandidates.find(el => {
      const txt = norm(el.innerText || el.textContent || "");
      const aria = norm(el.getAttribute("aria-label") || "");
      return txt.includes("only me") || aria.includes("only me") ||
             // French
             txt.includes("moi uniquement") || aria.includes("moi uniquement");
    });

    if (!onlyMeEl) {
      state.failedOnlyMe++;
      log("option only me introuvable dans le dialog");
      allCandidates.slice(0, 8).forEach((el, i) =>
        log(`opt#${i+1}`, JSON.stringify({ text: norm(el.innerText || "").slice(0, 100) }))
      );
      return false;
    }

    log("click only me", describeEl(onlyMeEl));
    realClick(onlyMeEl);
    await sleep(jitter(1000));

    // Find and click Done/Save button
    const doneCandidates = getVisibleCandidates(dialog).filter(el => {
      const txt  = norm(el.innerText || el.textContent || "");
      const aria = norm(el.getAttribute("aria-label") || "");
      const combo = `${txt} ${aria}`;
      return (
        combo.includes("done") ||
        combo.includes("save") ||
        combo.includes("apply") ||
        // French
        combo.includes("enregistrer") ||
        combo.includes("terminé")
      );
    });

    log("done candidates =", doneCandidates.length);
    doneCandidates.slice(0, 3).forEach((el, i) => log(`done#${i+1} ${describeEl(el)}`));

    const done = doneCandidates[0];
    if (!done) {
      state.failedDone++;
      log("bouton done/save introuvable");
      return false;
    }

    log("click done", describeEl(done));
    realClick(done);
    await sleep(jitter(1400));
    return true;
  }

  // FIX: dismiss stray open menus/dialogs between posts to avoid interference
  async function dismissStrayUI() {
    const open = getOpenMenuOrDialog();
    if (open.length === 0) return;

    log("dismissing stray UI:", open.length, "block(s)");
    // Press Escape to close
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    document.dispatchEvent(new KeyboardEvent("keyup",   { key: "Escape", bubbles: true, cancelable: true }));
    await sleep(jitter(600));

    // If still open, click somewhere neutral
    if (getOpenMenuOrDialog().length > 0) {
      document.body.click();
      await sleep(jitter(500));
    }
  }

  async function processArticle(article) {
    // FIX: use a DOM attribute to mark processed articles — never rely on random keys
    if (article.dataset.fbomDone) return false;
    article.dataset.fbomDone = "1";

    // Scroll into view and wait for lazy-loaded content to appear
    const ready = await waitForArticleReady(article);
    if (!ready) {
      log("article not ready after timeout, skip");
      return false;
    }

    // Also dedupe by URL key when available (belt & suspenders)
    const key = getPostKey(article);
    if (state.processedKeys.has(key)) return false;
    state.processedKeys.add(key);

    state.attempted++;
    updateOverlay();
    log("process post", key.slice(0, 180));

    if (articleAlreadyOnlyMe(article)) {
      state.skippedAlreadyOnlyMe++;
      log("skip already only me");
      return false;
    }

    const okMenu = await clickPostMenu(article);
    if (!okMenu) return false;

    const okEdit = await clickEditAudience(article);
    if (!okEdit) {
      await dismissStrayUI();
      return false;
    }

    const okOnly = await clickOnlyMeAndDone();
    if (!okOnly) {
      await dismissStrayUI();
      return false;
    }

    state.changed++;
    log(`changed ${state.changed}/${state.attempted}`);
    await sleep(jitter(state.config.actionDelayMs));
    return true;
  }

  async function scrollMore() {
    window.scrollBy({ top: Math.floor(window.innerHeight * 0.9), behavior: "smooth" });
    await sleep(jitter(state.config.scrollDelayMs));
  }

  async function runLoop() {
    state.running = true;
    state.stopRequested = false;
    updateOverlay();
    log("start");

    while (state.running && !state.stopRequested) {
      if (state.attempted >= state.config.maxPosts) {
        log("stop maxPosts");
        break;
      }

      const articles = getArticles();
      log("visible articles =", articles.length);

      for (const article of articles) {
        if (!state.running || state.stopRequested) break;
        if (state.attempted >= state.config.maxPosts) break;

        try {
          await processArticle(article);
        } catch (e) {
          log("article error", e?.message || String(e));
          await dismissStrayUI();
        }
      }

      if (state.attempted >= state.config.maxPosts) break;
      await scrollMore();
    }

    state.running = false;
    updateOverlay();
    log("end");
  }

  function resetState(config = {}) {
    state.running = false;
    state.stopRequested = false;
    state.processedKeys = new Set();
    state.attempted = 0;
    state.changed = 0;
    state.failedMenus = 0;
    state.failedEditAudience = 0;
    state.failedOnlyMe = 0;
    state.failedDone = 0;
    state.skippedAlreadyOnlyMe = 0;
    state.lastMessage = "";
    state.config = { ...state.config, ...config };
    // Clear DOM markers so articles can be re-processed on a fresh run
    document.querySelectorAll('[data-fbom-done]').forEach(el => delete el.dataset.fbomDone);
    updateOverlay();
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg?.type === "START_ONLYME_BULK") {
      resetState(msg.config || {});
      runLoop();
      sendResponse({ ok: true });
      return true;
    }

    if (msg?.type === "STOP_ONLYME_BULK") {
      state.stopRequested = true;
      state.running = false;
      updateOverlay();
      sendResponse({ ok: true });
      return true;
    }

    if (msg?.type === "GET_ONLYME_STATUS") {
      sendResponse({
        ok: true,
        state: {
          running: state.running,
          stopRequested: state.stopRequested,
          attempted: state.attempted,
          changed: state.changed,
          skippedAlreadyOnlyMe: state.skippedAlreadyOnlyMe,
          failedMenus: state.failedMenus,
          failedEditAudience: state.failedEditAudience,
          failedOnlyMe: state.failedOnlyMe,
          failedDone: state.failedDone,
          lastMessage: state.lastMessage
        }
      });
      return true;
    }
  });

  updateOverlay();
  log("content loaded");
})();

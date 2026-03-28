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

  function getArticles() {
    return Array.from(document.querySelectorAll('[role="article"]')).filter(isVisible);
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

  function articleAlreadyOnlyMe(article) {
    const txt = norm(article.innerText || "");
    return txt.includes("only me");
  }

  function updateOverlay() {
    let box = document.getElementById("fb-onlyme-overlay");
    if (!box) {
      box = document.createElement("div");
      box.id = "fb-onlyme-overlay";
      box.style.position = "fixed";
      box.style.right = "12px";
      box.style.bottom = "12px";
      box.style.zIndex = "999999";
      box.style.background = "rgba(0,0,0,0.88)";
      box.style.color = "#00ff66";
      box.style.padding = "10px";
      box.style.font = "12px monospace";
      box.style.border = "1px solid #00ff66";
      box.style.maxWidth = "520px";
      box.style.whiteSpace = "pre-wrap";
      box.style.pointerEvents = "none";
      document.body.appendChild(box);
    }

    box.textContent =
    `FB Only Me
    running=${state.running}
    stopRequested=${state.stopRequested}
    attempted=${state.attempted}/${state.config.maxPosts}
    changed=${state.changed}
    skippedAlreadyOnlyMe=${state.skippedAlreadyOnlyMe}
    failedMenus=${state.failedMenus}
    failedEditAudience=${state.failedEditAudience}
    failedOnlyMe=${state.failedOnlyMe}
    failedDone=${state.failedDone}

    ${state.lastMessage || ""}`;
  }

  function getVisibleCandidates(root) {
    return Array.from(root.querySelectorAll(`
    [role="button"],
    button,
    a,
    div[tabindex="0"],
    [aria-label],
    label,
    span[role="button"]
    `)).filter(isVisible);
  }

  function describeEl(el) {
    if (!el) return "null";
    const r = el.getBoundingClientRect();
    return JSON.stringify({
      tag: el.tagName?.toLowerCase() || "",
                          role: el.getAttribute("role") || "",
                          aria: (el.getAttribute("aria-label") || "").slice(0, 120),
                          text: (norm(el.innerText || el.textContent || "")).slice(0, 120),
                          x: Math.round(r.left),
                          y: Math.round(r.top),
                          w: Math.round(r.width),
                          h: Math.round(r.height)
    });
  }

  function findPostMenuButton(article) {
    const articleRect = article.getBoundingClientRect();
    let candidates = getVisibleCandidates(article);

    candidates = candidates.filter(el => {
      const r = el.getBoundingClientRect();
      if (!isInViewport(el)) return false;
      if (r.top < articleRect.top - 20) return false;
      if (r.top > articleRect.top + 220) return false;
      if (r.width < 8 || r.height < 8) return false;
      if (r.width > articleRect.width * 0.8) return false;
      if (r.height > 120) return false;
      const role = norm(el.getAttribute("role") || "");
      if (role === "status") return false;
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
      if (r.right > articleRect.right - 70) score += 2000;
      if (r.top < articleRect.top + 120) score += 1200;

      const area = r.width * r.height;
      if (area < 3000) score += 1000;
      if (area < 1200) score += 900;
      if (area > 12000) score -= 2000;

      if (combo.includes("edit audience")) score += 30000;
      if (combo.includes("privacy:")) score += 25000;
      if (combo.includes("actions for this post")) score += 22000;
      if (combo.includes("more")) score += 9000;
      if (combo.includes("menu")) score += 7000;
      if (combo.includes("options")) score += 7000;

      if (/like|comment|share|send|react|follow|message|translate|reel|watch|privacy · terms|advertising|cookies/.test(combo)) score -= 40000;
      if (!txt && aria) score += 600;
      if (!txt && !aria) score += 200;

      return { el, score };
    }).sort((a, b) => b.score - a.score);

    log("menu top candidates");
    scored.slice(0, 8).forEach((x, i) => log(`#${i + 1} score=${Math.round(x.score)} ${describeEl(x.el)}`));

    return scored[0]?.el || null;
  }

  function getOpenMenuOrDialog() {
    return Array.from(document.querySelectorAll('[role="menu"], [role="dialog"]'))
    .filter(isVisible)
    .filter(isInViewport);
  }

  async function clickPostMenu(article) {
    const btn = findPostMenuButton(article);
    if (!btn) {
      state.failedMenus++;
      log("menu introuvable");
      return false;
    }

    log("click menu", describeEl(btn));
    realClick(btn);
    await sleep(jitter(1200));

    const blocks = getOpenMenuOrDialog();
    log("open blocks after menu click =", blocks.length);
    blocks.slice(0, 5).forEach((b, i) => {
      log(`block#${i + 1}`, JSON.stringify({
        role: b.getAttribute("role") || "",
                                           aria: b.getAttribute("aria-label") || "",
                                           text: norm(b.innerText || "").slice(0, 300)
      }));
    });

    return true;
  }

  function findEditAudienceCandidatesNearArticle(article) {
    const articleRect = article.getBoundingClientRect();

    const all = Array.from(document.querySelectorAll('[role="button"], button, span[role="button"], div[role="button"]'))
    .filter(isVisible)
    .filter(isInViewport)
    .map(el => {
      const r = el.getBoundingClientRect();
      const txt = norm(el.innerText || el.textContent || "");
      const aria = norm(el.getAttribute("aria-label") || "");
      const combo = `${txt} ${aria}`;
      let score = 0;

      if (combo.includes("edit audience")) score += 30000;
      if (combo.includes("privacy:")) score += 25000;
      if (combo.includes("audience")) score += 8000;
      if (combo.includes("privacy")) score += 6000;

      const dx = Math.abs(r.left - articleRect.left) + Math.abs(r.top - articleRect.top);
      score -= dx;

      if (r.top >= articleRect.top - 50 && r.bottom <= articleRect.bottom + 50) score += 3000;
      if (r.left >= articleRect.left - 50 && r.right <= articleRect.right + 50) score += 2500;

      if (/privacy · terms|advertising|cookies|footer|facebook/.test(combo)) score -= 50000;

      return { el, score };
    })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score);

    return all;
  }

  async function clickEditAudience(article) {
    const found = findEditAudienceCandidatesNearArticle(article);
    log("edit audience candidates =", found.length);
    found.slice(0, 10).forEach((x, i) => log(`edit#${i + 1} score=${Math.round(x.score)} ${describeEl(x.el)}`));

    const candidate = found[0]?.el;

    if (!candidate) {
      state.failedEditAudience++;
      log("edit audience introuvable");
      return false;
    }

    log("click edit audience", describeEl(candidate));
    realClick(candidate);
    await sleep(jitter(1200));
    return true;
  }

  function getAudienceDialog() {
    return Array.from(document.querySelectorAll('div[role="dialog"]'))
    .filter(isVisible)
    .filter(isInViewport)
    .find(d => {
      const aria = norm(d.getAttribute("aria-label") || "");
      const txt = norm(d.innerText || "");
      return aria.includes("select audience") || txt.includes("who can see your post");
    }) || null;
  }

  async function clickOnlyMeAndDone() {
    const dialog = getAudienceDialog();
    if (!dialog) {
      state.failedOnlyMe++;
      log("dialog audience introuvable");
      return false;
    }

    const labels = Array.from(dialog.querySelectorAll("label")).filter(isVisible);
    log("audience labels =", labels.length);
    labels.forEach((el, i) => log(`label#${i + 1}`, JSON.stringify({ text: norm(el.innerText || "").slice(0, 200) })));

    const onlyMe = labels.find(el => norm(el.innerText || "").includes("only me"));
    if (!onlyMe) {
      state.failedOnlyMe++;
      log("option only me introuvable");
      return false;
    }

    log("click only me", describeEl(onlyMe));
    realClick(onlyMe);
    await sleep(jitter(900));

    const doneCandidates = getVisibleCandidates(dialog).filter(el => {
      const txt = norm(el.innerText || el.textContent || "");
      const aria = norm(el.getAttribute("aria-label") || "");
      return txt.includes("done") || aria.includes("done");
    });

    log("done candidates =", doneCandidates.length);
    doneCandidates.forEach((el, i) => log(`done#${i + 1} ${describeEl(el)}`));

    const done = doneCandidates[0];
    if (!done) {
      state.failedDone++;
      log("bouton done introuvable");
      return false;
    }

    log("click done", describeEl(done));
    realClick(done);
    await sleep(jitter(1200));
    return true;
  }

  async function processArticle(article) {
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
    if (!okEdit) return false;

    const okOnly = await clickOnlyMeAndDone();
    if (!okOnly) return false;

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

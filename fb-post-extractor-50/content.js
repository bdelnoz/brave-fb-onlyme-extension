(() => {
  if (window.__FB_POST_EXTRACTOR_LOADED__) return;
  window.__FB_POST_EXTRACTOR_LOADED__ = true;

  const state = {
    running: false,
    done: false,
    attemptedScrolls: 0,
    maxPosts: 50,
    scrollDelayMs: 1600,
    maxScrolls: 180,
    lastMessage: "",
    posts: [],
    seenKeys: new Set()
  };

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

  function log(message) {
    state.lastMessage = message;
    console.log("FB-EXTRACTOR:", message);
    renderOverlay();
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
        "max-width:420px",
        "font:12px monospace",
        "white-space:pre-wrap",
        "pointer-events:none"
      ].join(";");
      document.body.appendChild(box);
    }

    box.textContent =
      `FB Post Extractor\n` +
      `running=${state.running} done=${state.done}\n` +
      `collected=${state.posts.length}/${state.maxPosts} scrolls=${state.attemptedScrolls}/${state.maxScrolls}\n\n` +
      `${state.lastMessage}`;
  }

  function getArticles() {
    return Array.from(document.querySelectorAll('[role="article"]')).filter(isVisible);
  }

  function pickPermalink(article) {
    const links = Array.from(article.querySelectorAll('a[href]'));

    for (const a of links) {
      const href = a.href || "";
      if (
        href.includes("/posts/") ||
        href.includes("story_fbid=") ||
        href.includes("/permalink/") ||
        href.includes("/photo/") ||
        href.includes("/videos/")
      ) {
        return href;
      }
    }

    return "";
  }

  function inferPostKey(article, permalink) {
    if (permalink) return permalink;

    const txt = norm(article.innerText || "").slice(0, 240);
    if (txt) return txt;

    return `post-${Math.random().toString(36).slice(2)}`;
  }

  function inferAudience(article) {
    const candidates = Array.from(article.querySelectorAll('[aria-label], [title]'));

    for (const el of candidates) {
      const value = normLower(el.getAttribute("aria-label") || el.getAttribute("title") || "");
      if (!value) continue;

      if (value.includes("only me") || value.includes("moi uniquement")) return "only_me";
      if (value.includes("public")) return "public";
      if (value.includes("friends")) return "friends";
      if (value.includes("amis")) return "friends";
      if (value.includes("custom")) return "custom";
    }

    return "unknown";
  }

  function getAuthor(article) {
    const links = Array.from(article.querySelectorAll('a[href]')).filter(isVisible);

    for (const a of links) {
      const href = a.href || "";
      const text = norm(a.innerText || a.textContent || "");
      if (!text) continue;

      if (href.includes("/user/") || /^https:\/\/www\.facebook\.com\/[A-Za-z0-9._-]+\/?$/i.test(href)) {
        return { name: text, profileUrl: href };
      }
    }

    const fallback = norm(article.querySelector('h2, h3, strong')?.textContent || "");
    return { name: fallback || "unknown", profileUrl: "" };
  }

  function getTimestamp(article) {
    const timeEl = article.querySelector("time");
    if (timeEl) {
      return {
        iso: timeEl.getAttribute("datetime") || "",
        label: norm(timeEl.innerText || timeEl.textContent || "")
      };
    }

    const links = Array.from(article.querySelectorAll('a[href]'));
    for (const a of links) {
      const txt = norm(a.innerText || a.textContent || "");
      if (/^(\d+\s*[smhdwy]|\d+\s*min|\d+\s*h|yesterday|today)$/i.test(txt)) {
        return { iso: "", label: txt };
      }
    }

    return { iso: "", label: "" };
  }

  function getBodyText(article) {
    const textBlocks = Array.from(article.querySelectorAll('[data-ad-comet-preview="message"], div[dir="auto"], span[dir="auto"]'));
    const merged = textBlocks
      .map((el) => norm(el.textContent || ""))
      .filter((value) => value.length > 0)
      .join("\n");

    if (merged.length > 0) return merged.slice(0, 5000);
    return norm(article.innerText || "").slice(0, 5000);
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

    const buttons = Array.from(article.querySelectorAll('[role="button"], a, span')).filter(isVisible);

    for (const el of buttons) {
      const txt = normLower(el.innerText || el.textContent || "");
      if (!txt) continue;

      if (comments === null && (txt.includes("comment") || txt.includes("commentaire"))) {
        comments = extractNumberFromText(txt);
      }

      if (shares === null && (txt.includes("share") || txt.includes("partage"))) {
        shares = extractNumberFromText(txt);
      }

      if (reactions === null && (txt.includes("like") || txt.includes("j'aime") || txt.includes("reaction"))) {
        reactions = extractNumberFromText(txt);
      }
    }

    return {
      reactions,
      comments,
      shares
    };
  }

  function extractArticle(article) {
    const permalink = pickPermalink(article);
    const postKey = inferPostKey(article, permalink);
    const author = getAuthor(article);
    const timestamp = getTimestamp(article);
    const audience = inferAudience(article);
    const message = getBodyText(article);
    const engagement = getEngagement(article);

    return {
      postKey,
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
      extractedAt: new Date().toISOString()
    };
  }

  async function collectPosts() {
    state.running = true;
    state.done = false;
    state.posts = [];
    state.seenKeys = new Set();
    state.attemptedScrolls = 0;

    renderOverlay();
    log("Starting extraction...");

    while (state.posts.length < state.maxPosts && state.attemptedScrolls < state.maxScrolls) {
      const articles = getArticles();

      for (const article of articles) {
        if (state.posts.length >= state.maxPosts) break;

        const post = extractArticle(article);
        if (!post.postKey || state.seenKeys.has(post.postKey)) {
          continue;
        }

        state.seenKeys.add(post.postKey);
        state.posts.push(post);
        log(`Collected ${state.posts.length}/${state.maxPosts}`);
      }

      if (state.posts.length >= state.maxPosts) {
        break;
      }

      state.attemptedScrolls += 1;
      window.scrollBy({ top: Math.round(window.innerHeight * 0.9), behavior: "smooth" });
      await sleep(state.scrollDelayMs);
    }

    state.running = false;
    state.done = true;
    log(`Extraction finished: ${state.posts.length} posts collected.`);
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
      lastMessage: state.lastMessage
    };
  }
})();

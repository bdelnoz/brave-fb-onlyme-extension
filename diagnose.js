// ============================================================
// FB OnlyMe - Script de diagnostic
// Colle ce code dans la console DevTools sur ta page Facebook
// ============================================================

(() => {
  function norm(s) {
    return (s || "").replace(/\s+/g, " ").trim().toLowerCase();
  }

  function isVisible(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 &&
      cs.display !== "none" && cs.visibility !== "hidden" && cs.opacity !== "0";
  }

  function describeEl(el) {
    const r = el.getBoundingClientRect();
    return {
      tag:      el.tagName?.toLowerCase(),
      role:     el.getAttribute("role") || "",
      ariaLabel:(el.getAttribute("aria-label") || "").slice(0, 150),
      text:     norm(el.innerText || el.textContent || "").slice(0, 150),
      x: Math.round(r.left),   y: Math.round(r.top),
      w: Math.round(r.width),  h: Math.round(r.height),
      right: Math.round(r.right)
    };
  }

  // ── 1. Articles trouvés ─────────────────────────────────────
  const articles = Array.from(document.querySelectorAll('[role="article"]')).filter(isVisible);
  console.group(`%c[DIAG] Articles trouvés: ${articles.length}`, "color:cyan;font-weight:bold");
  articles.forEach((a, i) => {
    const r = a.getBoundingClientRect();
    console.log(`article#${i}`, {
      x: Math.round(r.left), y: Math.round(r.top),
      w: Math.round(r.width), h: Math.round(r.height),
      textPreview: norm(a.innerText || "").slice(0, 80)
    });
  });
  console.groupEnd();

  if (articles.length === 0) {
    console.warn("[DIAG] Aucun article trouvé ! Vérifie que tu es bien sur ton profil/timeline.");
    return;
  }

  // Prend le premier article visible
  const article = articles[0];
  const articleRect = article.getBoundingClientRect();
  console.log(`%c[DIAG] Analyse de article#0 (top=${Math.round(articleRect.top)})`, "color:yellow;font-weight:bold");

  // ── 2. Tous les éléments avec aria-label dans l'article ────
  const ariaEls = Array.from(article.querySelectorAll('[aria-label]')).filter(isVisible);
  console.group(`%c[DIAG] Éléments avec aria-label dans l'article: ${ariaEls.length}`, "color:lightgreen;font-weight:bold");
  ariaEls.forEach((el, i) => console.log(`aria#${i}`, describeEl(el)));
  console.groupEnd();

  // ── 3. Boutons / role=button dans l'article ─────────────────
  const btns = Array.from(article.querySelectorAll(
    '[role="button"], button, div[tabindex="0"], span[role="button"]'
  )).filter(isVisible);
  console.group(`%c[DIAG] Boutons dans l'article: ${btns.length}`, "color:orange;font-weight:bold");
  btns.forEach((el, i) => console.log(`btn#${i}`, describeEl(el)));
  console.groupEnd();

  // ── 4. Éléments dans le coin TOP-RIGHT de l'article ─────────
  const topRight = Array.from(article.querySelectorAll('*')).filter(el => {
    if (!isVisible(el)) return false;
    const r = el.getBoundingClientRect();
    return (
      r.right > articleRect.right - 150 &&
      r.top   < articleRect.top   + 150 &&
      r.width > 4 && r.height > 4 &&
      r.width < 200 && r.height < 100
    );
  });
  console.group(`%c[DIAG] Zone TOP-RIGHT de l'article (${topRight.length} éléments)`, "color:magenta;font-weight:bold");
  topRight.forEach((el, i) => console.log(`tr#${i}`, describeEl(el)));
  console.groupEnd();

  // ── 5. Menus/dialogs actuellement ouverts ───────────────────
  const openUI = Array.from(document.querySelectorAll('[role="menu"], [role="dialog"], [role="listbox"]'))
    .filter(isVisible);
  console.group(`%c[DIAG] Menus/dialogs ouverts: ${openUI.length}`, "color:red;font-weight:bold");
  openUI.forEach((el, i) => console.log(`open#${i}`, {
    role: el.getAttribute("role"),
    aria: el.getAttribute("aria-label"),
    text: norm(el.innerText || "").slice(0, 300)
  }));
  console.groupEnd();

  // ── 6. Highlight visuel : encadre les éléments top-right ────
  topRight.slice(0, 15).forEach((el, i) => {
    const orig = el.style.outline;
    el.style.outline = "3px solid red";
    el.title = `[DIAG topRight#${i}] ${(el.getAttribute("aria-label") || el.textContent || "").slice(0, 60)}`;
    setTimeout(() => { el.style.outline = orig; }, 8000);
  });

  // ── 7. Highlight les boutons détectés ───────────────────────
  btns.slice(0, 20).forEach((el, i) => {
    el.style.outline = "2px dashed blue";
    setTimeout(() => { el.style.outline = ""; }, 8000);
  });

  console.log(`%c[DIAG] Rouge = zone top-right | Bleu = boutons | Les outlines disparaissent dans 8s`, "color:white;background:#333;padding:4px");
  console.log(`%c[DIAG] COPIE TOUT CE QUI EST AU-DESSUS ET ENVOIE-LE`, "color:white;background:darkred;font-size:14px;padding:6px");
})();

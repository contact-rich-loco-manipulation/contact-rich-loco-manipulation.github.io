/* Workshop Moments deck: places the cards around the chosen photo, and moves only when asked
   (arrows, dots, a click on a side card, arrow keys or a swipe). The middle photo opens full size. */
(() => {
  "use strict";
  const section = document.getElementById("moments");
  if (!section) return;
  const deck = section.querySelector(".moments-cards");
  const cards = Array.from(section.querySelectorAll(".moment-card"));
  const dots = section.querySelector(".moments-dots");
  const label = section.querySelector(".moments-label");
  const viewer = section.querySelector(".moment-viewer");
  if (!deck || !cards.length) return;
  const n = cards.length;
  let index = 0;

  cards.forEach((card, k) => {
    const dot = document.createElement("button");
    dot.type = "button";
    dot.className = "moments-dot";
    dot.setAttribute("aria-label", `Show photo ${k + 1}: ${card.dataset.caption}`);
    dot.addEventListener("click", () => { show(k); schedule(); });
    dots.append(dot);
  });

  const SLOTS = { 0: "center", 1: "right", [n - 1]: "left", 2: "far-right", [n - 2]: "far-left" };

  function show(k) {
    index = (k + n) % n;
    cards.forEach((card, j) => {
      const pos = SLOTS[(j - index + n) % n];
      if (pos) card.dataset.pos = pos;
      else delete card.dataset.pos;
      card.tabIndex = pos === "center" ? 0 : -1;
      if (pos === "center") card.setAttribute("aria-current", "true");
      else card.removeAttribute("aria-current");
    });
    Array.from(dots.children).forEach((d, j) => {
      if (j === index) d.setAttribute("aria-current", "true");
      else d.removeAttribute("aria-current");
    });
    label.textContent = cards[index].dataset.caption;
  }

  // moves on by itself every 7 s while the deck is on screen (paused under the pointer or keyboard
  // focus, and never for visitors who prefer reduced motion); any click restarts the wait
  const STEP = 7000;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let timer = 0, visible = false, held = false;
  function schedule() {
    clearTimeout(timer);
    if (reduceMotion || !visible || held) return;
    timer = setTimeout(() => { show(index + 1); schedule(); }, STEP);
  }
  const deckEl = section.querySelector(".moments-deck");
  deckEl.addEventListener("pointerenter", () => { held = true; schedule(); });
  deckEl.addEventListener("pointerleave", () => { held = false; schedule(); });
  deckEl.addEventListener("focusin", () => { held = true; schedule(); });
  deckEl.addEventListener("focusout", () => { held = false; schedule(); });
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(entries => { visible = entries[0].isIntersecting; schedule(); }, { threshold: 0.4 }).observe(deckEl);
  }

  section.querySelector(".moments-prev").addEventListener("click", () => { show(index - 1); schedule(); });
  section.querySelector(".moments-next").addEventListener("click", () => { show(index + 1); schedule(); });

  deck.addEventListener("click", event => {
    const card = event.target.closest(".moment-card");
    if (!card || !card.dataset.pos) return;
    const k = Number(card.dataset.i);
    if (k !== index) { show(k); return; }
    open(card);
  });

  deck.addEventListener("keydown", event => {
    if (event.key === "ArrowRight") { event.preventDefault(); show(index + 1); cards[index].focus(); }
    if (event.key === "ArrowLeft") { event.preventDefault(); show(index - 1); cards[index].focus(); }
  });

  // a sideways swipe on touch screens
  let x0 = null;
  deck.addEventListener("pointerdown", e => { if (e.pointerType !== "mouse") x0 = e.clientX; });
  deck.addEventListener("pointerup", e => {
    if (x0 === null) return;
    const dx = e.clientX - x0;
    x0 = null;
    if (Math.abs(dx) > 40) show(index + (dx < 0 ? 1 : -1));
  });

  function open(card) {
    if (!viewer || typeof viewer.showModal !== "function") return;
    viewer.querySelector("img").src = card.dataset.src;
    viewer.querySelector("img").alt = card.querySelector("img").alt;
    viewer.querySelector(".moment-viewer-caption").textContent = card.dataset.caption || "";
    viewer.showModal();
  }
  if (viewer) {
    viewer.querySelector(".moment-viewer-close").addEventListener("click", () => viewer.close());
    viewer.addEventListener("click", event => { if (event.target === viewer) viewer.close(); });
    viewer.addEventListener("close", () => cards[index].focus());
  }

  show(Math.floor(n / 2));
  // no animation on page load: transitions start after the first layout
  requestAnimationFrame(() => requestAnimationFrame(() => deck.classList.add("is-ready")));
})();

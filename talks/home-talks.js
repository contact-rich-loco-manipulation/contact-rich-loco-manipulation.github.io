/* Talks on the home page (invited talks and student talks): YouTube playback with
   our own controls, whole-sentence captions below the video, and a "river" beside
   it where the talk's moments and the papers it mentions drift up as the talk plays.
   Every element with a data-talks file gets its own player. With the picker deck
   markup it shows a deck of talks; without it, one talk with a cover (.talk-cover).
     data-talks   JSON list of talks (chapters, resources, optional youtube id)
     data-only    show just this talk id (one player per talk, no deck)
     data-media   optional JSON of YouTube ids by talk id
     data-kind    label on the picker cards, e.g. "Student talk"
     data-shuffle "false" keeps the file's order instead of a fresh order per visit */
(() => {
  "use strict";

  /* ---------------------------------------------------------------- youtube (shared) */
  let apiLoad = null;
  function loadAPI() {
    if (window.YT && window.YT.Player) return Promise.resolve();
    if (apiLoad) return apiLoad;
    apiLoad = new Promise((resolve, reject) => {
      const previous = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { if (previous) previous(); resolve(); };
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.onerror = () => { apiLoad = null; reject(new Error("YouTube could not be reached. Try again.")); };
      document.head.append(script);
    });
    return apiLoad;
  }

  document.querySelectorAll("[data-talks]").forEach(mount);

  function mount(root) {
  const BASE = "talks/";
  const KIND = root.dataset.kind || "Student talk";
  const PPS = 7.5;       // river speed: pixels per second of talk
  const GAP = 22;        // minimum space between river items
  const ANCHOR = 0.28;   // the "now" line, as a share of the river height (keep in step with --anchor in the CSS)
  const DOT_Y = 10;      // where an item's dot sits, from the item's top

  const $ = selector => root.querySelector(selector);
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const fmt = seconds => {
    const s = Math.max(0, Math.floor(seconds || 0));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const ui = {
    picks: $(".talk-picks"), view: $(".talk-view"), meta: $(".talk-meta"), name: $(".talk-name"), speaker: $(".talk-speaker"),
    subtitle: $(".talk-subtitle"), links: $(".talk-links"), main: $(".talk-main"), frame: $(".talk-frame"),
    poster: $(".talk-poster"), yt: $(".talk-yt"), big: $(".talk-play-big"), toggle: $(".talk-toggle"),
    time: $(".talk-time"), bar: $(".talk-bar"), ticks: $(".talk-bar-ticks"), tip: $(".talk-bar-tip"),
    cc: $(".talk-cc"), mute: $(".talk-mute"), full: $(".talk-full"), caption: $(".talk-caption"),
    status: $(".talk-status"), riverView: $(".river-view"), reel: $(".river-reel"), clock: $(".river-clock"),
    stage: $(".talk-stage"), riverToggle: $(".talk-river-toggle"),
    dots: $(".talk-dots"), deckLabel: $(".talk-deck-label"), heading: $(".talk-heading"), cover: $(".talk-cover")
  };

  let talks = [], media = {}, current = null, moments = [], items = [], sentences = [];
  let player = null, ready = false, starting = false, playing = false, timer = 0, raf = 0, seq = 0;
  let position = 0, duration = 1, polledT = 0, polledAt = 0, rate = 1;
  let captionsOn = true, muted = false, dragging = false;
  let reelY = null, jumpTimer = 0, sentenceIndex = -1, saidCount = -1, shownSecond = -1;
  let capSaid = null, capNext = null;
  let lastIndex = -1;
  let mentions = [];
  ui.mentions = $(".talk-mentions") || (() => {
    const box = el("div", "talk-mentions");
    box.setAttribute("aria-live", "polite");
    ui.links.before(box);
    return box;
  })();
  // An opened invited talk shows a large see-through × at the top right when the pointer moves over the top of the video;
  // it closes the talk back to the cover. Esc does the same.
  if (ui.cover) {
    const x = el("button", "talk-x");
    x.type = "button";
    x.setAttribute("aria-label", "Close the talk and go back");
    x.title = "Close";
    const icon = el("i", "fa-solid fa-xmark");
    icon.setAttribute("aria-hidden", "true");
    x.append(icon);
    x.addEventListener("click", event => { event.stopPropagation(); closeTalk(); });
    // The × lives in an invisible corner zone and only shows while the pointer is in that corner.
    const zone = el("div", "talk-x-zone");
    zone.append(x);
    ui.frame.append(zone);
    root.addEventListener("keydown", event => {
      if (event.key === "Escape" && root.classList.contains("is-open") && !document.fullscreenElement) closeTalk();
    });
  }

  /* ---------------------------------------------------------------- data */
  function parseVTT(text) {
    const stamp = value => value.split(":").reduce((total, part) => total * 60 + Number(part), 0);
    const decoder = document.createElement("textarea");
    return text.replace(/\r/g, "").split(/\n\s*\n/).flatMap(block => {
      const lines = block.trim().split("\n");
      if (/^(WEBVTT|NOTE|STYLE|REGION)/.test(lines[0])) return [];
      const at = lines.findIndex(line => line.includes("-->"));
      if (at < 0) return [];
      const [start, end] = lines[at].split(/\s+-->\s+/);
      decoder.innerHTML = lines.slice(at + 1).join(" ").replace(/<[^>]*>/g, "");
      return [{ start: stamp(start), end: stamp(end.split(/\s/)[0]), text: decoder.value }];
    });
  }

  // Caption cues are short fragments; join them into whole sentences, keeping a time for every character.
  function buildSentences(cues) {
    const out = [];
    let text = "", times = [];
    const flush = () => {
      const lead = text.length - text.trimStart().length;
      const body = text.trim();
      if (body) out.push({ text: body, times: times.slice(lead, lead + body.length), start: times[lead] });
      text = "";
      times = [];
    };
    // A caption is a sentence, but never more than about two lines: unpunctuated speech
    // also breaks at a pause between cues, at a cue boundary once it is long, or mid-cue if it runs on.
    let lastEnd = -Infinity;
    cues.forEach(cue => {
      if (text.trim() && (cue.start - lastEnd > 0.8 || text.length > 140)) flush();
      lastEnd = cue.end;
      const piece = `${cue.text.replace(/\s+/g, " ").trim()} `;
      const span = Math.max(0.05, cue.end - cue.start);
      for (let k = 0; k < piece.length; k += 1) {
        const ch = piece[k];
        text += ch;
        times.push(cue.start + span * (k / piece.length));
        const atEnd = k + 1 >= piece.length || piece[k + 1] === " ";
        if (atEnd && ch !== " " && (/[.!?]/.test(ch) || (text.length > 120 && /[,;:]/.test(ch)) || text.length > 190)) flush();
      }
    });
    flush();
    return out;
  }

  function buildMoments(talk) {
    const chapters = talk.chapters.map(chapter => ({ ...chapter }));
    // The first few seconds are the title card that introduces the speaker.
    chapters[0].start = 0;
    if (/^introduction$/i.test(chapters[0].title)) chapters[0].title = `Introducing ${talk.speaker}`;
    return chapters.map((chapter, i) => ({ ...chapter, end: i + 1 < chapters.length ? chapters[i + 1].start : talk.duration }));
  }

  /* ---------------------------------------------------------------- youtube */
  const videoOf = talk => (media[talk.id] && media[talk.id].youtube) || talk.youtube || "";
  // Invited talks give an affiliation; student talks name the presenter.
  const bylineOf = talk => talk.affiliation || talk.speaker;
  // Only one talk on the page plays at a time.
  document.addEventListener("talks:play", event => {
    if (event.detail !== root && ready && playing) player.pauseVideo();
  });

  function teardown() {
    clearInterval(timer);
    timer = 0;
    if (player) { try { player.destroy(); } catch (error) { /* already gone */ } }
    player = null;
    ready = starting = false;
    ui.yt.replaceChildren();
    ui.frame.classList.remove("is-live", "is-loading");
    setPlaying(false);
    ui.status.textContent = "";
  }

  function poll() {
    if (!ready || dragging) return;
    polledT = player.getCurrentTime() || 0;
    polledAt = performance.now();
    rate = player.getPlaybackRate ? player.getPlaybackRate() || 1 : 1;
    if (!playing) paint(polledT);
  }

  // A small tip pointing at the river button, shown the first time a talk is opened on a visit.
  let hint = null, hintTimer = 0;
  function showRiverHint() {
    if (window.__talksRiverHintShown || !ui.riverToggle) return;
    window.__talksRiverHintShown = true;
    const controls = ui.riverToggle.parentElement;
    hint = el("button", "talk-river-hint");
    hint.type = "button";
    hint.setAttribute("aria-label", "Dismiss tip");
    hint.append(el("span", "talk-river-hint-text", "“In this talk” bothering you? Turn it off with this button."));
    hint.addEventListener("click", hideRiverHint);
    controls.append(hint);
    const place = () => {
      if (!hint) return;
      const b = ui.riverToggle.getBoundingClientRect(), c = controls.getBoundingClientRect();
      hint.style.setProperty("--x", `${b.left - c.left + b.width / 2}px`);
    };
    setTimeout(() => { place(); if (hint) hint.classList.add("is-shown"); }, 1100);
    window.addEventListener("resize", place);
    hintTimer = setTimeout(hideRiverHint, 11000);
  }
  function hideRiverHint() {
    clearTimeout(hintTimer);
    if (!hint) return;
    const node = hint;
    hint = null;
    node.classList.remove("is-shown");
    setTimeout(() => node.remove(), 400);
  }

  // Back to the cover: stop the video but keep the place, so playing again picks up where it was.
  function closeTalk() {
    const full = document.fullscreenElement || document.webkitFullscreenElement;
    if (full === ui.stage) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    seq += 1;
    teardown();
    root.classList.remove("is-open");
    // a closed cover keeps the full width; the river comes back when the talk is opened again
    if (root.dataset.river === "off") setRiver(false);
    hideRiverHint();
    paint(position);
    requestAnimationFrame(() => root.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "nearest" }));
  }

  async function start(at) {
    position = clamp(at);
    paint(position);
    const videoId = videoOf(current);
    if (!videoId) { ui.status.textContent = "This recording is coming soon."; return; }
    // A compact player (an invited talk shown as a banner) opens into the full player on first play.
    if (ui.cover && !root.classList.contains("is-open")) {
      root.classList.add("is-open");
      // opened, the talk shows "In this talk" beside the video, with a one-time tip on how to hide it
      if (root.dataset.river === "off") { setRiver(true); showRiverHint(); }
      requestAnimationFrame(() => root.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" }));
      if (items.length) requestAnimationFrame(layoutRiver);
    }
    if (ready) { player.seekTo(position, true); player.playVideo(); return; }
    if (starting) return;
    starting = true;
    const mine = seq;
    ui.frame.classList.add("is-loading");
    try {
      await loadAPI();
    } catch (error) {
      if (mine === seq) { starting = false; ui.frame.classList.remove("is-loading"); ui.status.textContent = error.message; }
      return;
    }
    if (mine !== seq) return;
    const mount = el("div");
    ui.yt.replaceChildren(mount);
    player = new window.YT.Player(mount, {
      host: "https://www.youtube-nocookie.com",
      videoId,
      width: "100%",
      height: "100%",
      playerVars: {
        autoplay: 1, controls: 0, disablekb: 1, fs: 0, rel: 0, iv_load_policy: 3, cc_load_policy: 0,
        playsinline: 1, start: Math.floor(position), origin: window.location.origin
      },
      events: {
        onReady: event => {
          if (mine !== seq) return;
          ready = true;
          starting = false;
          event.target.getIframe().title = `${current.name === current.speaker ? current.title : current.name}, presented by ${current.speaker}`;
          if (muted) event.target.mute();
          event.target.seekTo(position, true);
          event.target.playVideo();
          timer = setInterval(poll, 250);
          // If the browser blocks autoplay, reveal the player so a click on the video starts it.
          setTimeout(() => { if (mine === seq) { ui.frame.classList.add("is-live"); ui.frame.classList.remove("is-loading"); } }, 1800);
        },
        onStateChange: event => {
          if (mine !== seq) return;
          const state = window.YT.PlayerState;
          if (event.data === state.PLAYING) {
            document.dispatchEvent(new CustomEvent("talks:play", { detail: root }));
            ui.frame.classList.add("is-live");
            ui.frame.classList.remove("is-loading");
            // Captions are shown on the page, not inside the video.
            try { event.target.unloadModule("captions"); } catch (error) { /* module not loaded */ }
          }
          poll();
          setPlaying(event.data === state.PLAYING);
          if (event.data === state.ENDED) paint(duration);
        },
        onError: () => {
          if (mine !== seq) return;
          starting = false;
          ui.frame.classList.remove("is-loading");
          ui.status.textContent = "This talk could not play here. Use the YouTube link above.";
        }
      }
    });
  }

  function seek(at) {
    position = clamp(at);
    polledT = position;
    polledAt = performance.now();
    if (ready) { player.seekTo(position, true); player.playVideo(); paint(position); }
    else start(position);
  }

  function pause() {
    if (ready && player.getPlayerState() === window.YT.PlayerState.PLAYING) player.pauseVideo();
  }

  function togglePlay() {
    if (!ready) { start(position); return; }
    if (player.getPlayerState() === window.YT.PlayerState.PLAYING) player.pauseVideo();
    else player.playVideo();
  }

  const clamp = t => Math.max(0, Math.min(Number.isFinite(t) ? t : 0, duration - 0.5));

  /* ---------------------------------------------------------------- animation */
  function setPlaying(on) {
    playing = on;
    ui.toggle.firstElementChild.className = on ? "fa-solid fa-pause" : "fa-solid fa-play";
    ui.toggle.setAttribute("aria-label", on ? "Pause" : "Play");
    if (on && !raf) raf = requestAnimationFrame(loop);
    if (!on && raf) { cancelAnimationFrame(raf); raf = 0; }
  }

  function loop() {
    raf = requestAnimationFrame(loop);
    if (!ready || dragging || !playing) return;
    paint(Math.min(duration, polledT + ((performance.now() - polledAt) / 1000) * rate));
  }

  function riverOffset(t) {
    if (!items.length) return t * PPS;
    let prev = { t: 0, y: 0 };
    for (const item of items) {
      if (t < item.t) {
        const span = item.t - prev.t;
        return span > 0 ? prev.y + ((item.y - prev.y) * (t - prev.t)) / span : item.y;
      }
      prev = item;
    }
    return prev.y + (t - prev.t) * PPS;
  }

  // The inverse of riverOffset: which moment of the talk sits on the "now" line for a reel position.
  function timeAtOffset(offset) {
    let prev = { t: 0, y: 0 };
    for (const item of items) {
      if (offset < item.y) {
        const span = item.y - prev.y;
        return span > 0 ? prev.t + ((item.t - prev.t) * (offset - prev.y)) / span : item.t;
      }
      prev = item;
    }
    return prev.t + (offset - prev.y) / PPS;
  }

  function paint(t) {
    position = t;
    const share = Math.min(1, Math.max(0, t / duration));
    ui.bar.style.setProperty("--p", `${(share * 100).toFixed(3)}%`);
    const second = Math.floor(t);
    if (second !== shownSecond) {
      shownSecond = second;
      ui.time.textContent = `${fmt(t)} / ${fmt(duration)}`;
      ui.bar.setAttribute("aria-valuenow", String(second));
      ui.bar.setAttribute("aria-valuetext", `${fmt(t)} of ${fmt(duration)}`);
    }

    const y = ui.riverView.clientHeight * ANCHOR - DOT_Y - riverOffset(t);
    if (reelY !== null && Math.abs(y - reelY) > 80 && !reduceMotion && !scrub) {
      ui.reel.classList.add("is-jumping");
      clearTimeout(jumpTimer);
      jumpTimer = setTimeout(() => ui.reel.classList.remove("is-jumping"), 700);
    }
    reelY = y;
    ui.reel.style.transform = `translate3d(0, ${y.toFixed(1)}px, 0)`;

    let currentMoment = null;
    items.forEach(item => {
      const past = t >= item.t;
      if (item.past !== past) { item.past = past; item.node.classList.toggle("is-past", past); }
      if (item.kind === "moment" && past) currentMoment = item;
      if (item.kind === "paper") {
        const live = t >= item.t && t < item.end;
        if (item.live !== live) { item.live = live; item.node.classList.toggle("is-live", live); }
      }
    });
    items.forEach(item => {
      if (item.kind !== "moment") return;
      const on = item === currentMoment;
      if (item.current !== on) { item.current = on; item.node.classList.toggle("is-current", on); }
    });
    mentions.forEach(m => {
      const live = t >= m.start && t < m.end;
      if (m.live !== live) { m.live = live; m.node.classList.toggle("is-live", live); }
    });
    showCaption(t);
  }

  /* ---------------------------------------------------------------- captions */
  function setCaptionText(text, idle) {
    ui.caption.classList.toggle("is-idle", idle);
    ui.caption.replaceChildren(document.createTextNode(text));
    capSaid = capNext = null;
  }

  function showCaption(t) {
    if (!captionsOn) return;
    if (!ready && !starting && t < 0.5) {
      if (sentenceIndex !== -2) { sentenceIndex = -2; setCaptionText(current.summary || "", true); }
      return;
    }
    let lo = 0, hi = sentences.length - 1, found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (sentences[mid].start <= t) { found = mid; lo = mid + 1; } else hi = mid - 1;
    }
    if (found < 0) {
      if (sentenceIndex !== -1) { sentenceIndex = -1; setCaptionText("", false); }
      return;
    }
    const sentence = sentences[found];
    if (found !== sentenceIndex) {
      sentenceIndex = found;
      saidCount = -1;
      ui.caption.classList.remove("is-idle");
      capSaid = el("span", "cap-said");
      capNext = el("span", "cap-next");
      const line = el("span", "cap-line");
      line.append(capSaid, capNext);
      ui.caption.replaceChildren(line);
      if (!reduceMotion) {
        ui.caption.classList.remove("is-new");
        void ui.caption.offsetWidth;
        ui.caption.classList.add("is-new");
      }
    }
    // Reveal whole words: once a word starts, show all of it.
    let said = 0;
    while (said < sentence.times.length && sentence.times[said] <= t) said += 1;
    if (said > 0 && said < sentence.text.length) {
      const space = sentence.text.indexOf(" ", said);
      said = space < 0 ? sentence.text.length : space;
    }
    if (said !== saidCount && capSaid) {
      saidCount = said;
      capSaid.textContent = sentence.text.slice(0, said);
      capNext.textContent = sentence.text.slice(said);
    }
  }

  /* ---------------------------------------------------------------- river */
  function outLink(text, href, icon) {
    const link = el("a", "talk-link");
    link.href = href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    const glyph = el("i", icon);
    glyph.setAttribute("aria-hidden", "true");
    link.append(glyph, document.createTextNode(text));
    return link;
  }

  function paperLink(className, text, href) {
    const a = el("a", className, text);
    a.href = href;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.title = "Opens in a new tab and pauses the talk";
    a.addEventListener("click", pause);
    return a;
  }

  function momentNode(m) {
    const node = el("div", "river-item river-moment");
    const dot = el("span", "river-dot");
    dot.setAttribute("aria-hidden", "true");
    const button = el("button", "river-moment-btn");
    button.type = "button";
    button.append(el("time", "", fmt(m.start)), el("span", "river-moment-title", m.title));
    button.addEventListener("click", () => seek(m.start));
    node.append(dot, button);
    return node;
  }

  function paperNode(r) {
    const node = el("div", "river-item river-paper");
    const dot = el("span", "river-dot");
    dot.setAttribute("aria-hidden", "true");
    const card = el("div", "river-card");
    card.append(el("span", "river-venue", r.venue || "Paper"));
    if (r.links && r.links.length) {
      card.append(el("span", "river-card-title", r.title));
      if (r.label) card.append(el("p", "river-card-text", r.label));
      const list = el("div", "river-card-links");
      r.links.forEach(link => list.append(paperLink("", `${link.title} ↗`, link.url)));
      card.append(list);
    } else {
      card.append(paperLink("river-card-title", `${r.title} ↗`, r.url));
      if (r.label) card.append(el("p", "river-card-text", r.label));
    }
    node.append(dot, card);
    return node;
  }

  function layoutRiver() {
    let bottom = -Infinity;
    items.forEach(item => {
      item.y = Math.max(item.t * PPS, bottom + GAP);
      item.node.style.top = `${item.y}px`;
      bottom = item.y + item.node.offsetHeight;
    });
    reelY = null;
    paint(position);
  }

  /* ---------------------------------------------------------------- select a talk */
  function select(id, at = 0) {
    seq += 1;
    teardown();
    current = talks.find(talk => talk.id === id) || talks[0];
    duration = current.duration;
    position = polledT = 0;
    sentenceIndex = saidCount = shownSecond = -1;
    sentences = [];
    moments = buildMoments(current);

    if (ui.picks) showInDeck();
    if (ui.meta) ui.meta.textContent = `Now showing · ${fmt(current.duration)}`;
    if (ui.speaker) ui.speaker.textContent = bylineOf(current);
    if (ui.name) ui.name.textContent = current.name;
    if (ui.subtitle) ui.subtitle.textContent = current.title;
    if (ui.cover && !videoOf(current)) {
      ui.cover.classList.add("is-soon");
      const label = ui.cover.querySelector(".talk-cover-play-label");
      if (label) label.textContent = "Video coming soon";
    }
    ui.poster.src = `${BASE}posters/${current.id}.jpg`;
    ui.poster.alt = `${current.name} title slide`;
    ui.big.setAttribute("aria-label", `Play ${current.name}`);
    ui.bar.setAttribute("aria-valuemax", String(Math.floor(duration)));
    selectRest(at);
  }

  function showInDeck() {
    // The selected talk sits in the middle of the deck; its neighbours sit either side, the last peeks from behind.
    const idx = talks.indexOf(current), n = talks.length;
    const slot = { 0: "center", 1: "right", [n - 1]: "left" };
    ui.picks.querySelectorAll(".talk-pick").forEach(pick => {
      const i = talks.findIndex(t => t.id === pick.dataset.talk);
      const d = (i - idx + n) % n;
      pick.dataset.pos = slot[d] || "far";
      const on = d === 0;
      pick.setAttribute("aria-selected", String(on));
      pick.tabIndex = on ? 0 : -1;
    });
    ui.dots.querySelectorAll(".talk-dot").forEach((dot, i) => {
      if (i === idx) dot.setAttribute("aria-current", "true");
      else dot.removeAttribute("aria-current");
    });
    ui.deckLabel.textContent = `${current.name} · ${idx + 1} / ${n}`;
    // The heading below slides in from the side the deck moved, so both parts move together.
    if (lastIndex >= 0 && lastIndex !== idx && !reduceMotion) {
      const forward = (idx - lastIndex + n) % n <= n / 2;
      [ui.heading, ui.frame].forEach(node => {
        node.classList.remove("slide-next", "slide-prev");
        void node.offsetWidth;
        node.classList.add(forward ? "slide-next" : "slide-prev");
      });
    }
    lastIndex = idx;
  }

  function selectRest(at) {
    const resources = current.resources || [];
    const main = resources.filter(r => r.end - r.start >= current.duration * 0.5);
    const mentioned = resources.filter(r => !main.includes(r));
    const links = main.map(r => r.kind === "speaker"
      ? outLink("Speaker", r.url, "fa-solid fa-user")
      : /paper/i.test(r.label)
      ? outLink("Paper", r.url, "fa-regular fa-file-lines")
      : outLink("Project", r.url, "fa-solid fa-arrow-up-right-from-square"));
    ui.links.replaceChildren(...links);

    // With the river hidden, a lab or paper the speaker brings up appears under the video while they talk about it.
    mentions = mentioned.map(r => {
      const chip = paperLink("talk-mention", "", r.url);
      chip.append(el("span", "talk-mention-kind", r.venue || "Paper"), el("span", "talk-mention-title", `${r.title} ↗`));
      return { start: r.start, end: r.end, node: chip, live: false };
    });
    ui.mentions.replaceChildren(...mentions.map(m => m.node));

    ui.ticks.replaceChildren(...moments.slice(1).map(m => {
      const tick = el("span", "talk-bar-tick");
      tick.style.left = `${(m.start / duration) * 100}%`;
      return tick;
    }));

    items = [
      ...moments.map(m => ({ kind: "moment", t: m.start, end: m.end, node: momentNode(m) })),
      ...mentioned.map(r => ({ kind: "paper", t: r.start, end: r.end, node: paperNode(r) }))
    ].sort((a, b) => a.t - b.t || (a.kind === "moment" ? -1 : 1));
    ui.reel.replaceChildren(...items.map(item => item.node));

    ui.view.hidden = false;
    position = polledT = clamp(at);
    layoutRiver();

    const mine = seq;
    fetch(`${BASE}captions/${current.id}.vtt`)
      .then(response => (response.ok ? response.text() : ""))
      .then(text => {
        if (mine !== seq || !text) return;
        sentences = buildSentences(parseVTT(text));
        sentenceIndex = -1;
        showCaption(position);
      })
      .catch(() => {});
  }

  /* ---------------------------------------------------------------- events */
  ui.big.addEventListener("click", () => start(position));
  ui.poster.addEventListener("click", () => start(position));
  // The cover's own links (the speaker's page, their lab) open normally; anywhere else starts the talk.
  if (ui.cover) ui.cover.addEventListener("click", event => { if (!event.target.closest("a")) start(position); });
  ui.toggle.addEventListener("click", togglePlay);

  // Viewer preferences (captions, the river) are remembered on this device when storage is available.
  const PREFS_KEY = "corl-talks-view";
  const loadPrefs = () => { try { return JSON.parse(localStorage.getItem(PREFS_KEY)) || {}; } catch (error) { return {}; } };
  const savePrefs = () => {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify({ captions: captionsOn })); } catch (error) { /* private mode */ }
  };
  let riverOn = true;

  function setCaptions(on) {
    captionsOn = on;
    ui.cc.setAttribute("aria-pressed", String(on));
    ui.caption.classList.toggle("is-off", !on);
    sentenceIndex = -1;
    if (on && current) showCaption(position);
  }

  function setRiver(on) {
    riverOn = on;
    ui.riverToggle.setAttribute("aria-pressed", String(on));
    ui.stage.classList.toggle("is-river-off", !on);
    if (on && items.length) requestAnimationFrame(layoutRiver);
  }

  ui.cc.addEventListener("click", () => { setCaptions(!captionsOn); savePrefs(); });
  ui.riverToggle.addEventListener("click", () => { setRiver(!riverOn); savePrefs(); hideRiverHint(); });
  {
    const prefs = loadPrefs();
    if (prefs.captions === false) setCaptions(false);
    // The river always starts on; only the captions choice is remembered.
    // A player can ask to start with captions on and the river hidden (data-captions="on", data-river="off").
    if (root.dataset.captions === "on") setCaptions(true);
    if (root.dataset.river === "off") setRiver(false);
  }

  ui.mute.addEventListener("click", () => {
    muted = !muted;
    if (ready) { if (muted) player.mute(); else player.unMute(); }
    ui.mute.firstElementChild.className = muted ? "fa-solid fa-volume-xmark" : "fa-solid fa-volume-high";
    ui.mute.setAttribute("aria-label", muted ? "Unmute" : "Mute");
  });

  // Full screen takes the whole player: video, controls, captions and the river.
  const fullElement = () => document.fullscreenElement || document.webkitFullscreenElement || null;
  ui.full.addEventListener("click", () => {
    if (fullElement()) {
      (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      return;
    }
    const enter = ui.stage.requestFullscreen || ui.stage.webkitRequestFullscreen;
    if (enter) Promise.resolve(enter.call(ui.stage)).catch(() => {});
  });
  const onFullscreen = () => {
    const on = fullElement() === ui.stage;
    ui.stage.classList.toggle("is-fullscreen", on);
    ui.full.firstElementChild.className = on ? "fa-solid fa-compress" : "fa-solid fa-expand";
    ui.full.setAttribute("aria-label", on ? "Exit full screen" : "Full screen");
    if (items.length) requestAnimationFrame(layoutRiver);
  };
  document.addEventListener("fullscreenchange", onFullscreen);
  document.addEventListener("webkitfullscreenchange", onFullscreen);

  const ratioAt = event => {
    const box = ui.bar.getBoundingClientRect();
    return Math.min(1, Math.max(0, (event.clientX - box.left) / box.width));
  };
  function showTip(event, t) {
    const m = moments.find(x => t >= x.start && t < x.end) || moments[moments.length - 1];
    ui.tip.replaceChildren(el("time", "", fmt(t)), document.createTextNode(m ? m.title : ""));
    ui.tip.hidden = false;
    const width = ui.bar.clientWidth, half = ui.tip.offsetWidth / 2;
    ui.tip.style.left = `${Math.min(width - half, Math.max(half, ratioAt(event) * width))}px`;
  }
  ui.bar.addEventListener("pointerdown", event => {
    if (event.button) return;
    dragging = true;
    ui.bar.setPointerCapture(event.pointerId);
    paint(ratioAt(event) * duration);
  });
  ui.bar.addEventListener("pointermove", event => {
    const t = ratioAt(event) * duration;
    if (event.pointerType === "mouse" || dragging) showTip(event, t);
    if (dragging) paint(t);
  });
  ui.bar.addEventListener("pointerup", event => {
    if (!dragging) return;
    dragging = false;
    if (event.pointerType !== "mouse") ui.tip.hidden = true;
    seek(ratioAt(event) * duration);
  });
  ui.bar.addEventListener("pointercancel", () => { dragging = false; ui.tip.hidden = true; });
  ui.bar.addEventListener("pointerleave", () => { if (!dragging) ui.tip.hidden = true; });
  ui.bar.addEventListener("keydown", event => {
    const step = { ArrowRight: 5, ArrowUp: 5, ArrowLeft: -5, ArrowDown: -5 }[event.key];
    if (step) { event.preventDefault(); seek(position + step); }
    else if (event.key === "Home") { event.preventDefault(); seek(0); }
    else if (event.key === " " || event.key === "k") { event.preventDefault(); togglePlay(); }
  });

  // Drag the river up or down to move through the talk, like the timeline bar.
  let scrub = null;
  ui.riverView.addEventListener("pointerdown", event => {
    if (event.button || !items.length) return;
    scrub = { id: event.pointerId, y0: event.clientY, t0: position, moved: false, type: event.pointerType };
  });
  ui.riverView.addEventListener("pointermove", event => {
    if (!scrub || event.pointerId !== scrub.id) return;
    const dy = event.clientY - scrub.y0;
    if (!scrub.moved) {
      if (Math.abs(dy) < 6) return;
      scrub.moved = true;
      dragging = true;
      ui.riverView.setPointerCapture(event.pointerId);
      ui.riverView.classList.add("is-scrubbing");
    }
    const t = Math.max(0, Math.min(duration - 0.5, timeAtOffset(riverOffset(scrub.t0) - dy)));
    ui.clock.textContent = fmt(t);
    paint(t);
  });
  const endScrub = event => {
    if (!scrub || event.pointerId !== scrub.id) return;
    const moved = scrub.moved;
    scrub = null;
    if (!moved) return;
    dragging = false;
    ui.riverView.classList.remove("is-scrubbing");
    ui.riverView.dataset.justScrubbed = "1";
    setTimeout(() => { delete ui.riverView.dataset.justScrubbed; }, 0);
    const t = position;
    polledT = t;
    polledAt = performance.now();
    if (ready) player.seekTo(t, true);   // keep playing or paused, as it was
    paint(t);
  };
  ui.riverView.addEventListener("pointerup", endScrub);
  ui.riverView.addEventListener("pointercancel", endScrub);
  // A drag is not a click: don't open a paper or jump to a moment at the end of one.
  ui.riverView.addEventListener("click", event => {
    if (ui.riverView.dataset.justScrubbed) { event.preventDefault(); event.stopPropagation(); }
  }, true);
  ui.riverView.addEventListener("dragstart", event => event.preventDefault());

  // « » step through the talks and wrap around.
  const stepTalk = delta => {
    const at = talks.findIndex(talk => talk === current);
    select(talks[(at + delta + talks.length) % talks.length].id);
  };
  if (ui.picks) {
  $(".talk-prev").addEventListener("click", () => stepTalk(-1));
  $(".talk-next").addEventListener("click", () => stepTalk(1));

  ui.picks.addEventListener("keydown", event => {
    const picks = Array.from(ui.picks.querySelectorAll(".talk-pick"));
    const at = picks.indexOf(document.activeElement);
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (at < 0 || !step) return;
    event.preventDefault();
    const next = picks[(at + step + picks.length) % picks.length];
    next.focus();
    select(next.dataset.talk);
  });
  }

  if (window.ResizeObserver) {
    let size = "";
    new ResizeObserver(entries => {
      const box = entries[0].contentRect;
      const key = `${Math.round(box.width)}x${Math.round(box.height)}`;
      if (key !== size) { size = key; if (items.length) layoutRiver(); }
    }).observe(ui.riverView);
  }

  /* ---------------------------------------------------------------- init */
  async function init() {
    try {
      const [talkResponse, mediaResponse] = await Promise.all([
        fetch(root.dataset.talks),
        root.dataset.media ? fetch(root.dataset.media) : Promise.resolve(null)
      ]);
      if (!talkResponse.ok) throw new Error("talks unavailable");
      talks = await talkResponse.json();
      media = mediaResponse && mediaResponse.ok ? await mediaResponse.json() : {};
      if (root.dataset.only) talks = talks.filter(talk => talk.id === root.dataset.only);
      if (!talks.length) throw new Error("talk missing");
    } catch (error) {
      ui.status.textContent = "The talks could not be loaded. Please refresh the page.";
      ui.view.hidden = false;
      return;
    }
    // A fresh order on every visit, so no talk is always the one people meet first.
    if (root.dataset.shuffle !== "false") for (let i = talks.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [talks[i], talks[j]] = [talks[j], talks[i]];
    }
    if (ui.picks) buildDeck();
    const params = new URLSearchParams(window.location.search);
    // ?talk=<id>&t=<seconds> opens a talk at a moment; only the player that has that talk follows it.
    const linked = talks.some(talk => talk.id === params.get("talk"));
    if (linked) select(params.get("talk"), Number(params.get("t")) || 0);
    else select(talks[0].id);
    if (linked && ui.cover) {
      root.classList.add("is-open");
      if (root.dataset.river === "off") setRiver(true);
      root.scrollIntoView({ block: "start" });
    }
  }

  function buildDeck() {
    talks.forEach((talk, index) => {
      const pick = el("button", "talk-pick");
      pick.type = "button";
      pick.dataset.talk = talk.id;
      pick.setAttribute("role", "tab");
      pick.setAttribute("aria-controls", ui.view.id);
      // Each band is a slice of one shared gradient, so the four cards read as one ribbon.
      const band = el("span", "talk-pick-band");
      band.style.setProperty("--i", String(index * 3 / Math.max(1, talks.length - 1)));
      band.append(
        el("span", "talk-pick-kicker", `${KIND} · ${fmt(talk.duration)}`),
        el("span", "talk-pick-name", talk.name)
      );
      const thumb = el("span", "talk-pick-thumb");
      const image = el("img");
      image.src = `${BASE}posters/${talk.id}.jpg`;
      image.alt = "";
      image.loading = "lazy";
      image.width = 960;
      image.height = 540;
      const play = el("span", "talk-pick-play");
      play.append(el("i", "fa-solid fa-play"));
      play.setAttribute("aria-hidden", "true");
      thumb.append(image, play, el("span", "talk-pick-now", "Now showing"));
      const body = el("span", "talk-pick-body");
      body.append(el("span", "talk-pick-speaker", bylineOf(talk)), el("span", "talk-pick-title", talk.title));
      pick.append(band, thumb, body);
      pick.addEventListener("click", () => { if (!current || current.id !== talk.id) select(talk.id); });
      ui.picks.append(pick);
    });
    talks.forEach(talk => {
      const dot = el("button", "talk-dot");
      dot.type = "button";
      dot.setAttribute("aria-label", `Show ${talk.name}`);
      dot.addEventListener("click", () => { if (current.id !== talk.id) select(talk.id); });
      ui.dots.append(dot);
    });
    const sizeDeck = () => {
      const tallest = Math.max(...Array.from(ui.picks.children, pick => pick.offsetHeight));
      ui.picks.style.height = `${tallest}px`;
    };
    if (window.ResizeObserver) new ResizeObserver(sizeDeck).observe(ui.picks.firstElementChild);
    window.addEventListener("resize", sizeDeck);
    if (document.fonts) document.fonts.ready.then(sizeDeck).catch(() => {});
    requestAnimationFrame(sizeDeck);
  }
  init();
  }
})();

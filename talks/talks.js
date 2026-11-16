(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const video = $("talk-video");
  const timeLabel = seconds => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
  const el = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  let talks, media, current, engine, hls, youtube, poll;
  let revision = 0, starting = false, pendingTime = 0, lastTime = 0, cues = [];
  let captionsEnabled = false, transcriptRequest;
  const scriptLoads = new Map();

  function loadScript(url, ready) {
    if (ready()) return Promise.resolve();
    if (scriptLoads.has(url)) return scriptLoads.get(url);
    const promise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = url;
      const timer = setTimeout(() => reject(new Error("The video service took too long to respond. Try again.")), 20000);
      script.onload = () => { clearTimeout(timer); resolve(); };
      script.onerror = () => { clearTimeout(timer); reject(new Error("The video service could not be reached. Try again.")); };
      document.head.append(script);
    }).catch(error => { scriptLoads.delete(url); throw error; });
    scriptLoads.set(url, promise);
    return promise;
  }

  function momentURL(id, seconds = 0) {
    const url = new URL(window.location.href);
    url.search = "";
    url.searchParams.set("talk", id);
    if (seconds > 0) url.searchParams.set("t", String(Math.floor(seconds)));
    url.hash = "watch";
    return url;
  }

  function clampTime(time) {
    return Math.max(0, Math.min(Number.isFinite(time) ? time : 0, current.duration - .1));
  }

  function setCurrent(node, active) {
    if (active) node.setAttribute("aria-current", "true");
    else node.removeAttribute("aria-current");
  }

  function updatePosition(seconds) {
    lastTime = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
    $("current-position").textContent = `${timeLabel(lastTime)} / ${timeLabel(current.duration)}`;
    $("share-link").href = momentURL(current.id, lastTime);
    current.chapters.forEach((chapter, index) => {
      const end = current.chapters[index + 1]?.start ?? current.duration;
      const active = lastTime >= chapter.start && (lastTime < end || index === current.chapters.length - 1);
      const segment = $("chapter-timeline").children[index];
      segment.style.setProperty("--progress", `${Math.max(0, Math.min(100, (lastTime - chapter.start) / (end - chapter.start) * 100))}%`);
      setCurrent(segment, active);
      setCurrent($("chapters").children[index].firstChild, active);
      if (active) $("current-chapter").textContent = chapter.title;
    });
    current.resources.forEach((resource, index) => {
      const active = lastTime >= resource.start && lastTime < resource.end;
      const link = $("resources").children[index];
      link.classList.toggle("is-current", active);
      link.querySelector(".resource-now").hidden = !active;
    });
    $("transcript").querySelectorAll("button").forEach(button => {
      setCurrent(button, lastTime >= Number(button.dataset.start) && lastTime < Number(button.dataset.end));
    });
  }

  function parseVTT(text) {
    const timestamp = value => value.split(":").reduce((total, part) => total * 60 + Number(part), 0);
    return text.replace(/\r/g, "").split(/\n\s*\n/).flatMap(block => {
      const lines = block.trim().split("\n");
      if (/^(WEBVTT|NOTE|STYLE|REGION)/.test(lines[0])) return [];
      const index = lines.findIndex(line => line.includes("-->"));
      if (index < 0) return [];
      const [start, end] = lines[index].split(/\s+-->\s+/);
      const decoder = document.createElement("textarea");
      decoder.innerHTML = lines.slice(index + 1).join(" ").replace(/<[^>]*>/g, "");
      return [{ start: timestamp(start), end: timestamp(end.split(/\s/)[0]), text: decoder.value }];
    });
  }

  function renderTranscript() {
    const query = $("transcript-search").value.trim().toLocaleLowerCase();
    const matches = cues.filter(cue => cue.text.toLocaleLowerCase().includes(query));
    const fragment = document.createDocumentFragment();
    matches.forEach(cue => {
      const button = el("button");
      button.type = "button";
      button.dataset.start = cue.start;
      button.dataset.end = cue.end;
      button.append(el("time", timeLabel(cue.start)), el("span", cue.text));
      button.addEventListener("click", () => playAt(cue.start));
      fragment.append(button);
    });
    $("transcript").replaceChildren(fragment);
    $("transcript-status").textContent = query ? `${matches.length} matching lines` : "Select any line to play from that moment.";
    updatePosition(lastTime);
  }

  function stopPlayer() {
    revision += 1;
    starting = false;
    clearInterval(poll);
    if (hls) hls.destroy();
    if (youtube) youtube.destroy();
    hls = youtube = engine = null;
    video.pause();
    video.removeAttribute("src");
    video.replaceChildren();
    video.load();
    video.hidden = false;
    $("youtube-stage").replaceChildren();
    $("youtube-stage").hidden = true;
    $("quality-control").hidden = true;
    $("quality-select").replaceChildren(new Option("Auto", "-1"));
  }

  async function chooseTalk(id, start = 0) {
    transcriptRequest?.abort();
    stopPlayer();
    const selectedRevision = revision;
    current = talks.find(talk => talk.id === id) || talks[0];
    const source = media[current.id] || {};
    pendingTime = clampTime(start);
    cues = [];
    $("watch").hidden = false;
    $("talk-speaker").textContent = `${current.speaker} · ${timeLabel(current.duration)}`;
    $("talk-name").textContent = current.name;
    $("talk-title").textContent = current.title;
    document.title = `${current.name} — ${current.speaker} | Student Talks`;
    video.poster = `posters/${current.id}.jpg`;
    video.setAttribute("aria-label", `${current.name}, presented by ${current.speaker}`);
    const track = el("track");
    track.kind = "captions";
    track.src = `captions/${current.id}.vtt`;
    track.srclang = "en";
    track.label = "English";
    video.append(track);
    track.track.mode = captionsEnabled ? "showing" : "disabled";
    $("captions-toggle").hidden = Boolean(source.youtube);
    $("youtube-caption-hint").hidden = !source.youtube;
    $("mux-credit").hidden = !source.hls?.includes("stream.mux.com");
    $("start-video").hidden = false;
    $("start-video").disabled = !(source.youtube || source.hls || source.mp4);
    $("start-video").lastChild.textContent = $("start-video").disabled ? "Recording coming soon" : "Watch talk";
    $("playback-status").textContent = $("start-video").disabled ? "The recording is not available yet. Explore the transcript and research links below." : "Choose a chapter or press play to begin.";
    $("transcript-download").href = `transcripts/${current.id}.txt`;
    $("captions-download").href = `captions/${current.id}.vtt`;
    $("transcript-search").value = "";
    $("transcript").replaceChildren();
    $("transcript-status").textContent = "Loading transcript…";
    document.querySelectorAll(".talk-card").forEach(card => setCurrent(card, card.dataset.talk === current.id));
    $("chapters").replaceChildren();
    $("chapter-timeline").replaceChildren();
    current.chapters.forEach((chapter, index) => {
      const button = el("button");
      button.type = "button";
      button.append(el("time", timeLabel(chapter.start)), el("span", chapter.title));
      button.addEventListener("click", () => playAt(chapter.start));
      const item = el("li");
      item.append(button);
      $("chapters").append(item);
      const segment = el("button", undefined, "chapter-segment");
      segment.type = "button";
      segment.style.flexGrow = (current.chapters[index + 1]?.start ?? current.duration) - chapter.start;
      segment.style.flexBasis = "0";
      segment.title = `${timeLabel(chapter.start)} · ${chapter.title}`;
      segment.setAttribute("aria-label", segment.title);
      segment.addEventListener("click", () => playAt(chapter.start));
      $("chapter-timeline").append(segment);
    });
    $("resources").replaceChildren();
    current.resources.forEach(resource => {
      const link = el("a", undefined, "resource-link");
      link.href = resource.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.append(el("strong", `${resource.title} ↗`), el("small", resource.label), el("small", "At this moment", "resource-now"));
      $("resources").append(link);
    });
    updatePosition(pendingTime);
    transcriptRequest = new AbortController();
    try {
      const response = await fetch(`captions/${current.id}.vtt`, { signal: transcriptRequest.signal });
      if (!response.ok) throw new Error("Transcript unavailable");
      const body = await response.text();
      if (selectedRevision !== revision) return;
      cues = parseVTT(body);
      renderTranscript();
    } catch (error) {
      if (selectedRevision === revision && error.name !== "AbortError") $("transcript-status").textContent = "The transcript could not be loaded. Try the download link above.";
    }
  }

  async function youtubeEngine(source, selectedRevision) {
    await loadScript("https://www.youtube.com/iframe_api", () => Boolean(window.YT?.Player));
    // The API script may load its widget script after the initial onload.
    await new Promise((resolve, reject) => {
      const deadline = Date.now() + 15000;
      const check = () => {
        if (window.YT?.Player) resolve();
        else if (Date.now() > deadline) reject(new Error("YouTube could not be loaded. Try again."));
        else setTimeout(check, 50);
      };
      check();
    });
    if (selectedRevision !== revision) return null;
    video.hidden = true;
    $("youtube-stage").hidden = false;
    const mount = el("div");
    $("youtube-stage").append(mount);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("YouTube took too long to respond. Try again.")), 20000);
      youtube = new window.YT.Player(mount, {
        host: "https://www.youtube-nocookie.com",
        videoId: source.youtube,
        playerVars: { controls: 1, playsinline: 1, rel: 0, origin: window.location.origin, cc_lang_pref: "en" },
        events: {
          onReady: event => {
            clearTimeout(timer);
            if (selectedRevision !== revision) return;
            event.target.getIframe().title = `${current.name} — ${current.speaker}`;
            const player = event.target;
            resolve({ seek: time => player.seekTo(time, true), play: () => player.playVideo() });
            poll = setInterval(() => {
              if (selectedRevision === revision) updatePosition(player.getCurrentTime());
            }, 250);
          },
          onError: () => {
            clearTimeout(timer);
            const message = "YouTube cannot play this recording. Check that it is available and allows embedding.";
            if (selectedRevision === revision) $("playback-status").textContent = message;
            reject(new Error(message));
          }
        }
      });
    });
  }

  async function nativeEngine(source, selectedRevision) {
    if (source.hls && !video.canPlayType("application/vnd.apple.mpegurl")) {
      await loadScript("https://cdn.jsdelivr.net/npm/hls.js@1.7.4/dist/hls.min.js", () => Boolean(window.Hls));
      if (selectedRevision !== revision) return null;
      if (!window.Hls.isSupported()) {
        if (!source.mp4) throw new Error("This browser does not support this stream.");
        video.src = source.mp4;
      } else {
        hls = new window.Hls({ maxBufferLength: 20, maxMaxBufferLength: 30 });
        hls.on(window.Hls.Events.ERROR, (_, data) => {
          if (data.fatal && selectedRevision === revision) $("playback-status").textContent = "The stream was interrupted. Select the talk again to retry.";
        });
        hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
          if (selectedRevision !== revision) return;
          hls.levels.forEach((level, index) => $("quality-select").add(new Option(`${level.height}p`, String(index))));
          $("quality-control").hidden = hls.levels.length < 2;
        });
        hls.loadSource(source.hls);
        hls.attachMedia(video);
      }
    } else video.src = source.hls || source.mp4;
    video.preload = "metadata";
    return {
      seek: time => {
        pendingTime = time;
        if (video.readyState >= 1) video.currentTime = time;
      },
      play: () => video.play().catch(error => {
        if (selectedRevision === revision && error.name !== "AbortError") $("playback-status").textContent = "Press play in the video player to continue.";
      })
    };
  }

  async function playAt(seconds) {
    pendingTime = clampTime(seconds);
    const source = media[current.id] || {};
    if (!(source.youtube || source.hls || source.mp4)) return;
    updatePosition(pendingTime);
    if (engine) { engine.seek(pendingTime); engine.play(); return; }
    if (starting) return;
    const selectedRevision = revision;
    starting = true;
    $("start-video").disabled = true;
    $("playback-status").textContent = "Loading recording…";
    try {
      const loaded = source.youtube ? await youtubeEngine(source, selectedRevision) : await nativeEngine(source, selectedRevision);
      if (selectedRevision !== revision || !loaded) return;
      engine = loaded;
      engine.seek(pendingTime);
      engine.play();
      $("start-video").hidden = true;
      $("playback-status").textContent = "";
    } catch (error) {
      if (selectedRevision !== revision) return;
      if (youtube) youtube.destroy();
      if (hls) hls.destroy();
      clearInterval(poll);
      youtube = hls = engine = null;
      $("youtube-stage").replaceChildren();
      $("playback-status").textContent = error.message;
      $("start-video").hidden = false;
    } finally {
      if (selectedRevision === revision) { starting = false; $("start-video").disabled = false; }
    }
  }

  video.addEventListener("loadedmetadata", () => { if (engine && !youtube) video.currentTime = pendingTime; });
  video.addEventListener("timeupdate", () => { if (current && engine && !youtube) updatePosition(video.currentTime); });
  video.addEventListener("error", () => { if (current && video.getAttribute("src")) $("playback-status").textContent = "The recording could not be loaded. Select the talk again to retry."; });
  video.textTracks.addEventListener("change", () => {
    captionsEnabled = Array.from(video.textTracks).some(track => track.kind === "captions" && track.mode === "showing");
    $("captions-toggle").setAttribute("aria-pressed", String(captionsEnabled));
    $("captions-toggle").textContent = captionsEnabled ? "CC · On" : "CC · Off";
  });
  $("captions-toggle").addEventListener("click", () => {
    captionsEnabled = !captionsEnabled;
    if (video.textTracks[0]) video.textTracks[0].mode = captionsEnabled ? "showing" : "disabled";
  });
  $("start-video").addEventListener("click", () => playAt(lastTime));
  $("quality-select").addEventListener("change", event => { if (hls) hls.currentLevel = Number(event.target.value); });
  $("transcript-search").addEventListener("input", renderTranscript);
  $("share-link").addEventListener("click", async event => {
    if (!navigator.clipboard || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    try { await navigator.clipboard.writeText($("share-link").href); $("playback-status").textContent = "Link to this moment copied."; }
    catch { $("playback-status").textContent = "Copy the link using your browser’s link menu."; }
  });
  const fromURL = () => {
    const params = new URLSearchParams(window.location.search);
    chooseTalk(params.get("talk"), Number(params.get("t")));
  };
  window.addEventListener("popstate", fromURL);

  async function init() {
    try {
      const responses = await Promise.all([fetch("talks.json"), fetch("media.json")]);
      if (!responses[0].ok) throw new Error("Talks unavailable");
      talks = await responses[0].json();
      media = responses[1].ok ? await responses[1].json() : {};
      talks.forEach(talk => {
        const link = el("a", undefined, "talk-card");
        link.href = momentURL(talk.id);
        link.dataset.talk = talk.id;
        const image = el("img");
        image.src = `posters/${talk.id}.jpg`;
        image.alt = `${talk.name} presentation title slide`;
        image.width = 960;
        image.height = 540;
        const copy = el("span", undefined, "talk-card-copy");
        const top = el("span", undefined, "talk-card-top");
        top.append(el("strong", talk.name), el("time", timeLabel(talk.duration)));
        copy.append(top, el("span", talk.speaker, "talk-card-speaker"));
        link.append(image, copy);
        link.addEventListener("click", event => {
          if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
          event.preventDefault();
          history.pushState(null, "", momentURL(talk.id));
          chooseTalk(talk.id);
        });
        $("talk-list").append(link);
      });
      $("page-status").hidden = true;
      fromURL();
    } catch {
      $("page-status").textContent = "Student talks could not be loaded. Please refresh to try again.";
    }
  }
  init();
})();

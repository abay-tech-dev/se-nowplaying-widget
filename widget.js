/* ─────────────────────────────────────────────────────────
   StreamElements - Last.fm Now Playing Widget
   Polling toutes les 10s de l'API Last.fm publique
───────────────────────────────────────────────────────── */

// ── Constantes ──────────────────────────────────────────
const POLL_INTERVAL = 10000; // 10 secondes
const LASTFM_API    = "https://ws.audioscrobbler.com/2.0/";

// ── fieldData (peuplé par les événements SE) ─────────────
let fieldData = {};

// ── État interne ─────────────────────────────────────────
let currentTitle   = null;
let timerInterval  = null;
let startedAt      = null;
let durationMs     = 0;
let progressInterval = null;

// ── Éléments DOM ─────────────────────────────────────────
const $widget   = document.getElementById("widget");
const $bg       = document.getElementById("bg");
const $cover    = document.getElementById("cover");
const $title    = document.getElementById("title");
const $artist   = document.getElementById("artist");
const $album    = document.getElementById("album");
const $bar      = document.getElementById("progress-bar");
const $timer    = document.getElementById("timer");
const $bars     = document.getElementById("audiobars");
const $emote    = document.getElementById("emote");

// ── Helpers ───────────────────────────────────────────────
function formatTime(ms) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// Applique le défilement si le texte dépasse le container
function applyScroll(spanEl) {
  spanEl.classList.remove("scrolling");
  spanEl.style.removeProperty("--marquee-offset");
  spanEl.style.removeProperty("--marquee-duration");

  // Laisser le temps au DOM de recalculer
  setTimeout(() => {
    const container = spanEl.parentElement;
    if (!container) return;
    const overflow = spanEl.offsetWidth - container.clientWidth;
    if (overflow > 2) {
      spanEl.style.setProperty("--marquee-offset", `-${overflow}px`);
      spanEl.style.setProperty("--marquee-duration", `${Math.max(overflow / 50, 3) + 4}s`);
      spanEl.classList.add("scrolling");
    }
  }, 80);
}

// Met à jour le fond flouté (avec transition)
function updateBg(url) {
  if (!url) return;
  const img = new Image();
  img.onload = () => {
    $bg.style.backgroundImage = `url(${url})`;
  };
  img.src = url;
}

// Met à jour la pochette
function updateCover(url) {
  if (!url) {
    $cover.src = "";
    return;
  }
  $cover.style.opacity = 0;
  setTimeout(() => {
    $cover.src = url;
    $cover.onload = () => { $cover.style.opacity = 1; };
  }, 200);
}

// Lance le compteur local de temps écoulé
function startTimer() {
  clearInterval(timerInterval);
  clearInterval(progressInterval);
  startedAt = Date.now();

  timerInterval = setInterval(() => {
    const elapsed = Date.now() - startedAt;
    $timer.textContent = durationMs > 0
      ? `${formatTime(elapsed)} / ${formatTime(durationMs)}`
      : formatTime(elapsed);

    if (durationMs > 0) {
      const pct = Math.min((elapsed / durationMs) * 100, 100);
      $bar.style.width = `${pct}%`;
    }
  }, 500);
}

// Arrête les timers
function stopTimer() {
  clearInterval(timerInterval);
  clearInterval(progressInterval);
  $timer.textContent = "0:00";
  $bar.style.width   = "0%";
}

// ── Affichage d'une piste ─────────────────────────────────
function showTrack(track) {
  const title  = track.name || "";
  const artist = track.artist?.["#text"] || "";
  const album  = track.album?.["#text"]  || "";
  const imgUrl = track.image?.[3]?.["#text"] || track.image?.[2]?.["#text"] || "";
  const dur    = parseInt(track.duration || 0, 10) * 1000; // Last.fm donne en secondes

  // Nouveau morceau ?
  if (title !== currentTitle) {
    currentTitle = title;
    durationMs   = dur;

    $title.textContent  = title;
    $artist.textContent = artist;
    $album.textContent  = album;

    applyScroll($title);
    applyScroll($artist);
    applyScroll($album);

    updateBg(imgUrl);
    updateCover(imgUrl);
    startTimer();
  }

  // Afficher le widget + barres
  $widget.classList.remove("hidden");
  $widget.classList.add("visible");
  $bars.style.display = "flex";
}

// ── Masquage du widget ────────────────────────────────────
function hideWidget() {
  currentTitle = null;
  $widget.classList.remove("visible");
  $widget.classList.add("hidden");
  stopTimer();
}

// ── Appel API Last.fm ─────────────────────────────────────
async function fetchNowPlaying() {
  // fieldData est injecté par StreamElements
  const username = fieldData.username || "";
  const apiKey   = fieldData.apiKey   || "";

  console.log("[NowPlaying] username:", username, "| apiKey:", apiKey ? apiKey.slice(0,6) + "…" : "(vide)");

  if (!username || !apiKey) {
    console.warn("[NowPlaying] Champs manquants — widget en attente.");
    return;
  }

  try {
    const url = `${LASTFM_API}?method=user.getrecenttracks`
      + `&user=${encodeURIComponent(username)}`
      + `&api_key=${encodeURIComponent(apiKey)}`
      + `&format=json&limit=1`;

    const res  = await fetch(url);
    const data = await res.json();

    const tracks = data?.recenttracks?.track;
    console.log("[NowPlaying] Réponse API :", JSON.stringify(data).slice(0, 300));
    if (!tracks) { hideWidget(); return; }

    const latest = Array.isArray(tracks) ? tracks[0] : tracks;
    const isPlaying = latest?.["@attr"]?.nowplaying === "true";
    console.log("[NowPlaying] isPlaying:", isPlaying, "| track:", latest?.name);

    if (isPlaying) {
      showTrack(latest);
    } else {
      hideWidget();
    }

  } catch (err) {
    console.error("[NowPlaying] Erreur API Last.fm :", err);
  }
}

// ── Initialisation StreamElements ────────────────────────
window.addEventListener("onWidgetLoad", (obj) => {
  fieldData = obj.detail.fieldData;
  applyFieldData();
  fetchNowPlaying();
  setInterval(fetchNowPlaying, POLL_INTERVAL);
});

// Quand l'utilisateur change un champ dans l'éditeur SE
window.addEventListener("onSessionUpdate", (obj) => {
  fieldData = obj.detail.fieldData;
  applyFieldData();
});

// ── Application des champs configurables ─────────────────
function applyFieldData() {
  // Couleur accent
  const accent = fieldData.accentColor || "#1db954";
  document.documentElement.style.setProperty("--accent", accent);

  // Taille du widget
  const scale = parseFloat(fieldData.scale || 1);
  $widget.style.transform = `scale(${scale})`;
  $widget.style.transformOrigin = "top left";

  // Emote
  const emoteUrl = fieldData.emoteUrl || "";
  if (emoteUrl) {
    $emote.src = emoteUrl;
    $emote.classList.add("active");
  } else {
    $emote.src = "";
    $emote.classList.remove("active");
  }

  // Afficher / masquer l'album
  $album.parentElement.style.display =
    fieldData.showAlbum !== false ? "block" : "none";

  // Afficher / masquer la barre de progression + timer
  const $progressRow = $bar.closest(".widget__progress-row");
  if ($progressRow) {
    $progressRow.style.display =
      (fieldData.showProgress !== false || fieldData.showTimer !== false)
        ? "flex" : "none";
  }

  // Afficher / masquer uniquement la barre (garder le timer visible si coché)
  $bar.parentElement.style.display =
    fieldData.showProgress !== false ? "block" : "none";

  // Afficher / masquer le timer
  $timer.style.display =
    fieldData.showTimer !== false ? "inline" : "none";
}

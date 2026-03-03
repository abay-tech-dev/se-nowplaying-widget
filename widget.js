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
const $widget      = document.getElementById("widget");
const $bg          = document.getElementById("bg");
const $cover       = document.getElementById("cover");
const $title       = document.getElementById("title");
const $artist      = document.getElementById("artist");
const $album       = document.getElementById("album");
const $bar         = document.getElementById("progress-bar");
const $timer       = document.getElementById("timer");
const $timerTotal  = document.getElementById("timer-total");
const $bars        = document.getElementById("audiobars");
const $emote       = document.getElementById("emote");

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

// Lance le compteur basé sur l'heure réelle de début du morceau
// trackStartedAt : timestamp Unix (ms) du début estimé via date.uts Last.fm
function startTimer(trackStartedAt) {
  clearInterval(timerInterval);
  clearInterval(progressInterval);
  // Utilise le timestamp de début récupéré de Last.fm ; sinon Date.now()
  startedAt = (trackStartedAt > 0) ? trackStartedAt : Date.now();
  $bar.style.transition = "none";
  $bar.style.width      = "0%";
  requestAnimationFrame(() => { $bar.style.transition = ""; });

  timerInterval = setInterval(() => {
    const elapsed   = Math.max(Date.now() - startedAt, 0);
    const remaining = durationMs > 0 ? Math.max(durationMs - elapsed, 0) : 0;

    $timer.textContent      = formatTime(elapsed);
    $timerTotal.textContent = durationMs > 0 ? `-${formatTime(remaining)}` : "--:--";

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
  $timer.textContent      = "0:00";
  $timerTotal.textContent = "";
  $bar.style.width        = "0%";
}

// ── Affichage d'une piste ─────────────────────────────────
// trackStartedAt : timestamp (ms) du début réel estimé via date.uts du morceau précédent
function showTrack(track, trackStartedAt) {
  const title  = track.name || "";
  const artist = track.artist?.["#text"] || "";
  const album  = track.album?.["#text"]  || "";
  const imgUrl = track.image?.[3]?.["#text"] || track.image?.[2]?.["#text"] || "";
  const dur    = parseInt(track.duration || 0, 10) * 1000;

  // Nouveau morceau ?
  if (title !== currentTitle) {
    currentTitle = title;
    durationMs   = dur;

    $title.textContent = title;
    applyScroll($title);

    const displayMode = fieldData.displayMode || "default";
    if (displayMode === "minimal") {
      $artist.textContent = album ? `${artist}  •  ${album}` : artist;
      applyScroll($artist);
    } else {
      $artist.textContent = artist;
      $album.textContent  = album;
      applyScroll($artist);
      applyScroll($album);
    }

    updateBg(imgUrl);
    updateCover(imgUrl);
    // Démarrer le timer avec le timestamp réel de début (issu de date.uts Last.fm)
    startTimer(trackStartedAt);
  }

  // Récupérer la durée à chaque poll tant qu'elle est inconnue
  if (durationMs === 0 && artist && title) {
    fetchTrackInfo(artist, title);
  }

  // Afficher le widget + barres (pas en mode minimaliste)
  $widget.classList.remove("hidden");
  $widget.classList.add("visible");
  if ((fieldData.displayMode || "default") !== "minimal") {
    $bars.style.display = "flex";
  }
}

// ── Masquage du widget ────────────────────────────────────
function hideWidget() {
  currentTitle = null;
  $widget.classList.remove("visible");
  $widget.classList.add("hidden");
  stopTimer();
}

// ── Récupération de la durée via track.getInfo ────────────
async function fetchTrackInfo(artist, title) {
  const apiKey = fieldData.apiKey || "";
  if (!apiKey) return;
  try {
    const url = `${LASTFM_API}?method=track.getInfo`
      + `&artist=${encodeURIComponent(artist)}`
      + `&track=${encodeURIComponent(title)}`
      + `&autocorrect=1`
      + `&api_key=${encodeURIComponent(apiKey)}`
      + `&format=json`;
    const res  = await fetch(url);
    const data = await res.json();
    console.log("[NowPlaying] track.getInfo :", JSON.stringify(data).slice(0, 200));
    const ms = parseInt(data?.track?.duration || 0, 10);
    if (ms > 0) {
      durationMs = ms;
      // Snap immédiat de la barre à la position correcte
      const elapsed = Math.max(Date.now() - startedAt, 0);
      const pct = Math.min((elapsed / durationMs) * 100, 100);
      $bar.style.transition = "none";
      $bar.style.width      = `${pct}%`;
      requestAnimationFrame(() => { $bar.style.transition = ""; });
      console.log("[NowPlaying] Durée :", ms, "ms | Élapsé estimé :", Math.round(elapsed / 1000), "s");
    }
  } catch (err) {
    console.error("[NowPlaying] Erreur track.getInfo :", err);
  }
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
    // limit=2 : morceau en cours + précédent (son date.uts donne l'heure de début du morceau actuel)
    const url = `${LASTFM_API}?method=user.getrecenttracks`
      + `&user=${encodeURIComponent(username)}`
      + `&api_key=${encodeURIComponent(apiKey)}`
      + `&format=json&limit=2`;

    const res  = await fetch(url);
    const data = await res.json();

    const tracks = data?.recenttracks?.track;
    console.log("[NowPlaying] Réponse API :", JSON.stringify(data).slice(0, 300));
    if (!tracks) { hideWidget(); return; }

    const tracksArr = Array.isArray(tracks) ? tracks : [tracks];
    const latest    = tracksArr[0];
    const isPlaying = latest?.["@attr"]?.nowplaying === "true";
    console.log("[NowPlaying] isPlaying:", isPlaying, "| track:", latest?.name);

    if (isPlaying) {
      // Le morceau précédent (tracksArr[1]) a été scrobblé à sa FIN,
      // donc son date.uts ≈ heure de début du morceau actuel
      const prevUts       = parseInt(tracksArr[1]?.date?.uts || 0, 10);
      const trackStartedAt = prevUts > 0 ? prevUts * 1000 : 0;
      if (trackStartedAt > 0) {
        console.log("[NowPlaying] Début estimé du morceau :", new Date(trackStartedAt).toLocaleTimeString());
      }
      showTrack(latest, trackStartedAt);
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
  const displayMode = fieldData.displayMode || "default";
  $widget.classList.toggle("widget--minimal", displayMode === "minimal");

  // Couleur accent (s'applique aux deux modes)
  const accent = fieldData.accentColor || "#1db954";
  document.documentElement.style.setProperty("--accent", accent);

  // Taille (s'applique aux deux modes)
  const scale = parseFloat(fieldData.scale || 1);
  $widget.style.transform      = `scale(${scale})`;
  $widget.style.transformOrigin = "top left";

  if (displayMode === "minimal") {
    // Mode minimaliste — configuration fixe
    $bars.style.display = "none";
    $album.parentElement.style.display = "none";
    $timer.style.display      = "inline";
    $timerTotal.style.display = "inline";
    const $progressRow = $bar.closest(".widget__progress-row");
    if ($progressRow) $progressRow.style.display = "flex";
    $bar.parentElement.style.display = "block";
    return;
  }

  // ── Mode complet — configuration selon les champs ──────

  // Réactiver les barres (effacer l'éventuel style inline du mode minimal)
  $bars.style.display = "";

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

  // Afficher / masquer le timer (mode complet seulement)
  const showTimer = fieldData.showTimer !== false;
  $timer.style.display      = showTimer ? "inline" : "none";
  $timerTotal.style.display = showTimer ? "inline" : "none";
}

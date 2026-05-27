import { api, events } from "./api.js";
import { acceptEvent } from "./state.js";

const app = document.querySelector("#app");
let state = null;
let connected = false;
let closeEvents = null;

init();
window.setInterval(() => {
  if (state) render();
}, 1000);

async function init() {
  try {
    if (await load()) connectRealtime();
  } catch {
    renderLogin();
  }
}

function connectRealtime() {
  if (closeEvents) closeEvents();
  closeEvents = events(async (event) => {
    if (acceptEvent(event)) await load(false);
  }, (status) => {
    connected = status === "connected";
    if (state) render();
  });
}

async function load(showLogin = true) {
  try {
    state = await api("/api/screen/state");
    normalizeState();
    render();
    return true;
  } catch (err) {
    const unauthorized = err?.status === 401 || err?.code === "unauthorized";
    if (unauthorized) {
      if (showLogin) renderLogin(err.message);
      return false;
    }
    if (!state && showLogin) renderLogin(err.message);
    return false;
  }
}

function normalizeState() {
  state.settings = state.settings || { values: {} };
  state.settings.values = state.settings.values || {};
  state.delegations = state.delegations || [];
  state.resolution = state.resolution || { points: [], html: "" };
  state.resolution.points = state.resolution.points || [];
  state.voting = state.voting || { votes: [], counts: {} };
  state.voting.votes = state.voting.votes || [];
  state.voting.counts = state.voting.counts || {};
  state.speakers = state.speakers || { queue: [], reactions: [], state: {} };
  state.speakers.queue = state.speakers.queue || [];
  state.speakers.reactions = state.speakers.reactions || [];
  state.speakers.state = state.speakers.state || {};
  state.debate = state.debate || {};
}

function renderLogin(message = "") {
  app.innerHTML = `
    <main class="login">
      <form id="login">
        <h1>Projekce</h1>
        <p>Přihlášení prezentační obrazovky.</p>
        <input name="pin" type="password" inputmode="numeric" placeholder="Screen PIN" autocomplete="current-password" autofocus>
        <button>Přihlásit</button>
        <p id="login-error" class="error" role="alert">${esc(message)}</p>
      </form>
    </main>`;
  app.querySelector("#login").onsubmit = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector("button");
    const error = form.querySelector("#login-error");
    error.textContent = "";
    button.disabled = true;
    button.textContent = "Přihlašuji...";
    try {
      await api("/api/auth/screen/login", { method: "POST", body: { pin: form.pin.value } });
      await load();
      connectRealtime();
    } catch (err) {
      error.textContent = err.message || "Přihlášení selhalo.";
      button.disabled = false;
      button.textContent = "Přihlásit";
    }
  };
}

function render() {
  if (!state) return;
  app.innerHTML = `
    <div class="screen">
      <div class="panel left">
        <div class="clock">${new Date().toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit", hour12: false })}</div>
        <div class="connection ${connected ? "online" : "offline"}">${connected ? "online" : "offline"}</div>
        <div class="section-title">Rozložení států</div>
        <div id="miniStage" class="mini-stage">${renderSeatMap("attendance", false)}</div>
      </div>
      <div class="panel center">
        <div class="resolution-title">${esc(state.settings.values.committee_name || "Aktuální znění rezoluce")}</div>
        <div id="resolution" class="resolution">${state.resolution.html || renderResolutionPoints()}</div>
      </div>
      <div class="panel right">
        <div class="section-title">Aktuální řečník</div>
        ${renderCurrentSpeaker()}
        <div class="section-title">Reakce</div>
        <div class="reaction-area">${renderReactionBoxes()}</div>
        <div class="queue-title">Pořadník řečníků</div>
        <ol class="speaker-queue">${renderSpeakerQueue()}</ol>
      </div>
    </div>
    ${renderDebateOverlay()}
    ${renderVotingOverlay()}
    ${renderBreakOverlay()}
    <button class="admin-button" data-open-admin>Řízení schůze</button>`;
  const adminButton = app.querySelector("[data-open-admin]");
  if (adminButton) adminButton.onclick = () => window.open("/admin", "_blank");
}

function renderCurrentSpeaker() {
  const current = state.speakers.currentSpeaker;
  if (!current) {
    return `
      <div class="speaker-current no-speaker">
        <div class="speaker-current-flag">–</div>
        <div class="speaker-current-name">Žádný řečník</div>
        <div class="speaker-time">00:00</div>
      </div>`;
  }
  return `
    <div class="speaker-current">
      <div class="speaker-current-flag">${esc(current.flag || "")}</div>
      <div class="speaker-current-name">${esc(current.name || "")}</div>
      <div class="speaker-time">${currentSpeakerTime()}</div>
    </div>`;
}

function renderReactions() {
  const rows = [];
  const activeRecord = state.speakers.reactions.find((reaction) => reaction.status === "active");
  if (activeRecord) {
    rows.push({ delegation: activeRecord.delegation, status: "active", startedAt: activeRecord.startedAt });
  } else if (state.speakers.activeReaction) {
    rows.push({ delegation: state.speakers.activeReaction, status: "active" });
  }
  state.speakers.reactions
    .filter((reaction) => reaction.status !== "active")
    .forEach((reaction) => rows.push({ delegation: reaction.delegation, status: reaction.status, startedAt: reaction.startedAt }));
  return [0, 1].map((index) => {
    const row = rows[index];
    if (!row) return `<div class="reaction-box empty"><div class="reaction-waiting">Volná reakce</div></div>`;
    const active = row.status === "active";
    return `
      <div class="reaction-box ${active ? "active" : "waiting"}">
        <div class="reaction-line">
          <span class="reaction-flag">${esc(row.delegation.flag || "")}</span>
          <span class="reaction-code">${esc(row.delegation.code || "")}</span>
          ${active ? `<span class="reaction-time">${formatRunningTime(row.startedAt)}</span>` : ""}
        </div>
        <div class="reaction-waiting">${active ? "probíhá reakce" : "čeká na reakci"}</div>
      </div>`;
  }).join("");
}

function renderReactionBoxes() {
  const rows = state.speakers.reactions.length
    ? state.speakers.reactions.map((reaction) => ({ delegation: reaction.delegation, status: reaction.status, startedAt: reaction.startedAt }))
    : (state.speakers.activeReaction ? [{ delegation: state.speakers.activeReaction, status: "active" }] : []);
  return [0, 1].map((index) => {
    const row = rows[index];
    if (!row) return `<div class="reaction-box empty"><div class="reaction-waiting">Volná reakce</div></div>`;
    const active = row.status === "active";
    const finished = row.status === "finished";
    return `
      <div class="reaction-box ${active ? "active" : finished ? "finished" : "waiting"}">
        <div class="reaction-line">
          <span class="reaction-flag">${esc(row.delegation.flag || "")}</span>
          <span class="reaction-code">${esc(row.delegation.code || "")}</span>
          ${active ? `<span class="reaction-time">${formatRunningTime(row.startedAt)}</span>` : ""}
        </div>
        <div class="reaction-waiting">${active ? "probíhá reakce" : finished ? "reakce dokončena" : "čeká na reakci"}</div>
      </div>`;
  }).join("");
}

function renderSpeakerQueue() {
  if (!state.speakers.queue.length) return `<li>Pořadník je prázdný.</li>`;
  return state.speakers.queue.map((item) => `<li>${esc(item.delegation.flag || "")} ${esc(item.delegation.code || "")} ${esc(item.delegation.name || "")}</li>`).join("");
}

function renderDebateOverlay() {
  const debate = state.debate || {};
  const session = debate.session;
  if (!session) return "";
  return `
    <div class="debate-overlay visible">
      <div class="debate-header">
        <div class="debate-title">Hlasování o PN ${debate.amendment?.number || ""}</div>
        <div class="debate-subtitle">${esc(shorten(debate.amendment?.text || "", 220))}</div>
      </div>
      <div class="debate-phase">${debatePhaseLabel(session.phase)}</div>
      <div class="debate-columns">
        ${renderDebatePerson("Předkladatel", debate.submitter, session.phase === "submitter_reading", debate.amendment?.submitterName || "Předkladatel", session.phaseStartedAt)}
        ${renderDebatePerson("Podporovatel", debate.supporter, session.phase === "supporter_speaking", "Čeká na výběr", session.phaseStartedAt)}
        ${renderDebatePerson("Odpůrce", debate.opponent, session.phase === "opponent_speaking", "Čeká na výběr", session.phaseStartedAt)}
      </div>
    </div>`;
}

function renderDebatePerson(role, delegation, active, fallback, startedAt) {
  return `
    <div class="debate-person ${active ? "active" : ""}">
      <div class="debate-role">${esc(role)}</div>
      <div class="debate-flag">${esc(delegation?.flag || "–")}</div>
      <div class="debate-code">${esc(delegation?.code || "")}</div>
      <div class="debate-name">${esc(delegation?.name || fallback)}</div>
      ${active ? `<div class="debate-time">${formatRunningTime(startedAt)}</div>` : ""}
    </div>`;
}

function renderVotingOverlay() {
  const voting = state.voting || {};
  const session = voting.session;
  if (!session || state.debate?.session) return "";
  const amendment = voting.amendment;
  const counts = voting.counts || {};
  const isResult = session.status === "saved" || session.status === "closed";
  const secretMode = (state.settings.values.voting_mode || "public") === "secret";
  return `
    <div id="voteOverlay" class="overlay voting-overlay ${isResult ? "result-state" : "active-state"} visible">
      <div class="overlay-header">
        <div>
          <div class="vote-status-pill ${session.status === "open" ? "open" : "closed"}">${voteStatusLabel(session)}</div>
          <div class="overlay-title">${isResult ? "Výsledek hlasování" : "Hlasování"}${amendment ? ` o PN ${esc(amendment.number || "")}` : ""}</div>
          <div class="overlay-subtitle">${amendment ? esc(shorten(amendment.text || "", 220)) : "Procedurální hlasování"}</div>
        </div>
        <div class="overlay-counts">
          ${session.status === "open" ? `<strong>ZBÝVÁ: ${formatSeconds(remainingSeconds(session))}</strong><br>` : `<strong>HLASOVÁNÍ UKONČENO</strong><br>`}
          PRO: ${counts.for || 0}<br>
          PROTI: ${counts.against || 0}<br>
          ZDRŽUJE SE: ${counts.abstain || 0}
        </div>
      </div>
      ${secretMode
        ? `<div class="secret-vote-board voting-secret-board">
            <div class="secret-count for"><span>PRO</span><strong>${counts.for || 0}</strong></div>
            <div class="secret-count against"><span>PROTI</span><strong>${counts.against || 0}</strong></div>
            <div class="secret-count abstain"><span>ZDRŽUJE SE</span><strong>${counts.abstain || 0}</strong></div>
          </div>`
        : `<div class="overlay-stage vote-stage">${renderSeatMap("vote", true)}</div>`}
    </div>`;
}

function voteStatusLabel(session) {
  if (session.status === "open") return "hlasování probíhá";
  if (session.status === "saved") return "výsledek uložen";
  return "hlasování ukončeno";
}

function renderBreakOverlay() {
  const item = state.break;
  if (!item || !item.endsAt) return "";
  const left = breakSecondsLeft(item);
  if (left <= 0) return "";
  const coffee = item.type === "coffee_break";
  return `
    <div id="breakOverlay" class="break-overlay visible">
      <div class="break-box">
        <div class="break-kind ${coffee ? "coffee" : "caucus"}">${esc(item.title || (coffee ? "Přestávka na kávu" : "Kuloární jednání"))}</div>
        <div class="break-countdown">${formatSeconds(left)}</div>
        <div class="break-note">${coffee ? "Přestávka na kávu" : "Čas na kuloární jednání"}</div>
      </div>
    </div>`;
}

function renderSeatMap(mode, large) {
  const votes = new Map((state.voting.votes || []).map((vote) => [vote.delegationId, vote.choice]));
  return renderChairMarker() + visibleSeatDelegations().map((delegation, index) => {
    const seat = projectionSeat(delegation.seat || defaultSeat(index), large);
    const classes = ["seat"];
    if (mode === "vote") {
      const vote = votes.get(delegation.id);
      if (vote) classes.push(`vote-${vote}`);
      else if (!delegation.present) classes.push("vote-absent");
    } else {
      classes.push(delegation.present ? "present" : "absent");
    }
    return `<div class="${classes.join(" ")}" style="left:${seat.x}%;top:${seat.y}%;width:${seat.w}%;height:${seat.h}%;transform:rotate(${seat.rotation || 0}deg);" title="${esc(delegation.name)}"><div class="seat-flag-map">${esc(delegation.flag || delegation.code || "")}</div></div>`;
  }).join("");
}

function visibleSeatDelegations() {
  const delegations = state.delegations || [];
  const hidden = hiddenSeatIds();
  return delegations.filter((delegation) => !hidden.has(String(delegation.id)));
}

function hiddenSeatIds() {
  const raw = state?.settings?.values?.hidden_seat_ids || "[]";
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return new Set(parsed.map((id) => String(id)));
  } catch {}
  return new Set(String(raw).split(",").map((id) => id.trim()).filter(Boolean));
}

function renderChairMarker() {
  const chair = projectionChairSeat(chairSeat());
  return `<div class="chair-marker" style="left:${chair.x}%;top:${chair.y}%;width:${chair.w}%;min-height:${chair.h}%;transform:rotate(${chair.rotation}deg);"><div class="chair-label">PŘEDSEDNICTVO</div><div class="chair-desk">CHAIR</div></div>`;
}

function chairSeat() {
  const values = state?.settings?.values || {};
  return {
    x: numberSetting(values.chair_x, 38),
    y: numberSetting(values.chair_y, 2.2),
    w: numberSetting(values.chair_w, 24),
    h: numberSetting(values.chair_h, 7),
    rotation: numberSetting(values.chair_rotation, 0)
  };
}

function projectionChairSeat(seat) {
  const w = Number(seat.w || 24);
  const h = Number(seat.h || 7);
  return {
    x: clamp(Number(seat.x || 0), 0, 100 - w),
    y: clamp(Number(seat.y || 0), 0, 100 - h),
    w,
    h,
    rotation: Number(seat.rotation || 0)
  };
}

function numberSetting(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function projectionSeat(seat, large) {
  const baseW = Number(seat.w || 10);
  const baseH = Number(seat.h || 10);
  return {
    x: clamp(Number(seat.x || 0), 0, 100 - baseW),
    y: clamp(Number(seat.y || 0), 0, 100 - baseH),
    w: baseW,
    h: baseH,
    rotation: Number(seat.rotation || 0)
  };
}

function renderResolutionPoints() {
  if (!state.resolution.points?.length) return "<p>Rezoluce zatím nemá body.</p>";
  return `<ol>${state.resolution.points.map((point) => `<li>${esc(point.text)}</li>`).join("")}</ol>`;
}

function defaultSeat(index) {
  const columns = 5;
  return { x: 5 + (index % columns) * 18, y: 7 + Math.floor(index / columns) * 14, w: 15, h: 9, rotation: 0 };
}

function remainingSeconds(session) {
  if (!session || session.status !== "open") return 0;
  if (session.startedAt && session.timeLimitSec) {
    const elapsed = Math.floor((Date.now() - new Date(session.startedAt).getTime()) / 1000);
    return Math.max(0, Number(session.timeLimitSec) - elapsed);
  }
  return Math.max(0, Number(session.secondsLeft || 0));
}

function breakSecondsLeft(item) {
  return Math.max(0, Math.ceil((new Date(item.endsAt).getTime() - Date.now()) / 1000));
}

function formatRunningTime(startTime) {
  if (!startTime) return "00:00";
  return formatSeconds(Math.max(0, Math.floor((Date.now() - new Date(startTime).getTime()) / 1000)));
}

function currentSpeakerTime() {
  const speakerState = state.speakers.state || {};
  const reactionActive = !!state.speakers.activeReaction || (state.speakers.reactions || []).some((reaction) => reaction.status === "active");
  if (reactionActive) {
    return formatSeconds(Math.floor(Number(speakerState.currentPausedMs || 0) / 1000));
  }
  return formatRunningTime(speakerState.currentStartedAt);
}

function formatSeconds(total) {
  total = Math.max(0, Number(total || 0));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function debatePhaseLabel(value) {
  return ({
    submitter_reading: "Prostor předkladateli k přečtení návrhu",
    select_supporter: "Předsedající vybírá podporovatele",
    select_opponent: "Předsedající vybírá odpůrce",
    supporter_speaking: "Mluví podporovatel návrhu",
    opponent_speaking: "Mluví odpůrce návrhu",
    ready_to_vote: "Úvodní fáze hotová, připravuje se hlasování"
  })[value] || value || "";
}

function shorten(text, max) {
  text = String(text || "");
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

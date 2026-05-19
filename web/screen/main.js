import { api, events } from "./api.js";
import { acceptEvent } from "./state.js";

const app = document.querySelector("#app");
let state = null;
let connected = false;
setInterval(() => render(), 1000);
init();

async function init() {
  try {
    const me = await api("/api/auth/me");
    if (me.role !== "screen") throw new Error("login");
    await load();
    events(async (event) => { if (acceptEvent(event)) await load(false); }, (s) => { connected = s === "connected"; render(); });
  } catch { renderLogin(); }
}

async function load(showLogin = true) {
  try { state = await api("/api/screen/state"); render(); }
  catch { if (showLogin) renderLogin(); }
}

function renderLogin() {
  app.innerHTML = `<main class="login"><form id="login"><h1>Projekce</h1><input name="pin" type="password" inputmode="numeric" placeholder="Screen PIN" autofocus><button>Přihlásit</button><p id="login-error" class="error" role="alert"></p></form></main>`;
  app.querySelector("#login").onsubmit = async (e) => {
    e.preventDefault();
    const form = e.target;
    const button = form.querySelector("button");
    const error = form.querySelector("#login-error");
    error.textContent = "";
    button.disabled = true;
    button.textContent = "Přihlašuji...";
    try {
      await api("/api/auth/screen/login", { method: "POST", body: { pin: form.pin.value } });
      await load();
      events(async (event) => { if (acceptEvent(event)) await load(false); }, (s) => { connected = s === "connected"; render(); });
    } catch (err) {
      error.textContent = err.message || "Přihlášení selhalo.";
      button.disabled = false;
      button.textContent = "Přihlásit";
    }
  };
}

function render() {
  if (!state) return;
  const voting = state.voting.session;
  const activeBreak = state.break;
  app.innerHTML = `<main class="screen">
    <section class="left"><div class="clock">${new Date().toLocaleTimeString("cs-CZ",{hour:"2-digit",minute:"2-digit"})}</div><div class="${connected ? "online" : "offline"}">${connected ? "online" : "offline"}</div><div class="seatmap">${state.delegations.map(d => `<div class="seat ${d.present ? "present" : ""}" style="left:${d.seat?.x || 0}%;top:${d.seat?.y || 0}%;width:${d.seat?.w || 10}%;height:${d.seat?.h || 10}%;">${d.flag}</div>`).join("")}</div></section>
    <section class="center"><h1>${esc(state.settings.values.committee_name || "Jednání")}</h1><div class="resolution">${state.resolution.html || "<p>Rezoluce zatím nemá body.</p>"}</div></section>
    <section class="right"><h2>Řečník</h2><div class="speaker">${state.speakers.currentSpeaker ? flagName(state.speakers.currentSpeaker) : "Nikdo"}</div><h3>Reakce</h3>${state.speakers.reactions.map(r => `<div class="queue ${r.status}">${flagName(r.delegation)}</div>`).join("")}<h3>Pořadník</h3>${state.speakers.queue.map(q => `<div class="queue">${flagName(q.delegation)}</div>`).join("")}</section>
    ${voting ? `<div class="overlay"><div><h2>${voting.status === "open" ? "Probíhá hlasování" : voting.status === "closed" ? "Hlasování ukončeno" : "Výsledek hlasování"}</h2>${state.voting.amendment ? `<p>PN ${state.voting.amendment.number}: ${esc(state.voting.amendment.text)}</p>` : ""}<div class="timer">${voting.status === "open" ? voting.secondsLeft + " s" : ""}</div><div class="results"><span>PRO ${state.voting.counts.for}</span><span>PROTI ${state.voting.counts.against}</span><span>ZDRŽEL ${state.voting.counts.abstain}</span></div></div></div>` : ""}
    ${activeBreak ? `<div class="overlay break"><div><h2>${esc(activeBreak.title)}</h2><div class="timer">${breakLeft(activeBreak)}</div></div></div>` : ""}
  </main>`;
}

function breakLeft(item) {
  if (!item.endsAt) return "";
  const left = Math.max(0, Math.floor((new Date(item.endsAt) - new Date()) / 1000));
  return `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
}

function flagName(d) { return `${d.flag} ${esc(d.name)}`; }
function esc(s) { return String(s ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

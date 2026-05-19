import { api, events } from "./api.js";
import { acceptEvent } from "./state.js";

const app = document.querySelector("#app");
let state = null;
let connected = false;
let closeEvents = null;
let lastRenderKey = "";

init();
window.setInterval(updateMobileVoteCountdown, 500);

async function init() {
  try {
    await load(false);
    connectRealtime();
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
    updateConnection();
  });
}

async function load(showLogin = true) {
  try {
    state = await api("/api/vote/state");
    normalizeState();
    renderApp();
  } catch (err) {
    if (showLogin) renderLogin(err.message);
    throw err;
  }
}

function normalizeState() {
  state.delegation = state.delegation || {};
  state.voting = state.voting || { counts: {}, votes: [] };
  state.voting.counts = state.voting.counts || {};
  state.voting.votes = state.voting.votes || [];
  state.resolution = state.resolution || { points: [], html: "" };
  state.resolution.points = state.resolution.points || [];
}

function renderLogin(message = "") {
  lastRenderKey = "";
  app.innerHTML = `
    <div class="app-shell">
      <div class="topbar">
        <div class="topbar-inner">
          <div class="brand">
            <h1>MUN hlasování</h1>
            <p class="subtitle">Pouze pro odevzdání hlasu</p>
          </div>
          <span id="connectionPill" class="pill warn">čekám</span>
        </div>
      </div>
      <form id="loginCard" class="card login-card">
        <h2>Přihlášení</h2>
        <p>Zadej 4místný kód od předsedajícího.</p>
        <label for="loginCode">4místný kód</label>
        <input id="loginCode" name="code" class="code-input" inputmode="numeric" maxlength="4" autocomplete="one-time-code" placeholder="••••" autofocus>
        <div class="button-row"><button>Přihlásit</button></div>
        <div id="loginStatus" class="status error">${esc(message)}</div>
      </form>
    </div>
    <div id="toast" class="toast"></div>`;
  const form = app.querySelector("#loginCard");
  const input = app.querySelector("#loginCode");
  form.onsubmit = submitLogin;
  input.oninput = () => {
    input.value = input.value.replace(/\D/g, "").slice(0, 4);
    if (input.value.length === 4) form.requestSubmit();
  };
}

async function submitLogin(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const code = form.code.value.trim();
  const status = form.querySelector("#loginStatus");
  const button = form.querySelector("button");
  if (!/^\d{4}$/.test(code)) {
    status.textContent = "Zadej čtyřmístný kód.";
    return;
  }
  status.textContent = "Přihlašuji...";
  button.disabled = true;
  try {
    await api("/api/vote/login", { method: "POST", body: { code } });
    localStorage.setItem("munVotingCode", code);
    await load(false);
    connectRealtime();
    showToast("Přihlášeno.");
  } catch (err) {
    status.textContent = err.message || "Přihlášení se nezdařilo.";
    button.disabled = false;
    form.code.value = "";
    form.code.focus();
  }
}

function renderApp() {
  if (!state) return;
  const voting = state.voting || {};
  const session = voting.session;
  const delegation = state.delegation || {};
  const renderKey = JSON.stringify({
    id: delegation.id,
    session: session?.id || "",
    status: session?.status || "",
      secondsLeft: remainingSeconds(session),
    vote: voting.currentVote || "",
    amendment: voting.amendment?.id || "",
    revision: voting.revision || ""
  });
  if (renderKey === lastRenderKey) {
    updateMobileVoteCountdown();
    return;
  }
  lastRenderKey = renderKey;
  app.innerHTML = `
    <div class="app-shell">
      <div class="topbar">
        <div class="topbar-inner">
          <div class="brand">
            <h1>MUN hlasování</h1>
            <p class="subtitle">Pouze pro odevzdání hlasu</p>
          </div>
          <span id="connectionPill" class="pill ${connected ? "good" : "warn"}">${connected ? "připojeno" : "čekám"}</span>
        </div>
      </div>
      <div id="appCard">
        <div class="delegation-card">
          <div class="flag">${esc(delegation.flag || "🏳️")}</div>
          <div>
            <div class="delegation-title">${esc(delegation.name || "Delegace")}</div>
            <div class="delegation-subtitle">Hlasuj pouze za svou delegaci.</div>
          </div>
        </div>
        <div id="voteCard" class="card vote-card ${session ? "active" : ""}">
          <div class="pn-header">
            <h2>Aktuální hlasování</h2>
            <div class="vote-sync-line"><span id="voteSync" class="pill ${session?.status === "closed" ? "warn" : "good"}">${session ? statusLabel(session.status) : "čeká se"}</span></div>
          </div>
          <div id="voteContent">${renderVotingContent(voting)}</div>
          <div id="voteStatus" class="status"></div>
        </div>
        ${renderAmendmentForm()}
        <div class="foot-actions">
          <button class="secondary" data-refresh>Obnovit</button>
          <button class="secondary" data-logout>Změnit kód</button>
        </div>
      </div>
    </div>
    <div id="toast" class="toast"></div>`;
  app.querySelectorAll("[data-choice]").forEach((button) => button.onclick = () => cast(button.dataset.choice));
  app.querySelector("[data-refresh]").onclick = async () => {
    await load(false);
    showToast("Stav byl obnoven.");
  };
  app.querySelector("[data-logout]").onclick = logout;
  const amendmentForm = app.querySelector("[data-form=amendment]");
  if (amendmentForm) amendmentForm.onsubmit = submitAmendment;
}

function renderVotingContent(voting) {
  const session = voting.session;
  const currentVote = voting.currentVote || "";
  if (!session || !voting.amendment) {
    return `
      <div class="empty-state">
        <div class="empty-icon">…</div>
        <p>Čeká se na zahájení hlasování.</p>
      </div>`;
  }
  const open = session.status === "open";
  return `
    <div class="pn-number">PN ${esc(voting.amendment.number || "")}</div>
    <div class="pn-text">${esc(shorten(voting.amendment.text || "", 620))}</div>
    ${open
      ? `<div class="current-vote"><span>Stav</span><strong id="mobileVoteCountdown">${remainingSeconds(session) ? `Zbývá ${formatSeconds(remainingSeconds(session))}` : "Probíhá hlasování"}</strong></div>`
      : `<div class="current-vote against-vote"><span>Stav</span><strong>Hlasování ukončeno</strong></div>`}
    <div class="current-vote ${currentVoteClass(currentVote)}">
      <span>Tvůj hlas</span>
      <strong>${voteLabel(currentVote)}</strong>
    </div>
    ${open
      ? `<div class="vote-actions">
          <button class="vote-button for" data-choice="for">PRO</button>
          <button class="vote-button against" data-choice="against">PROTI</button>
          <button class="vote-button abstain" data-choice="abstain">ZDRŽUJI SE</button>
        </div>`
      : `<div class="empty-state"><p>Hlasování bylo ukončeno. Čeká se na potvrzení výsledku předsednictvem.</p></div>`}`;
}

function renderAmendmentForm() {
  const points = state.resolution.points || [];
  return `
    <form class="card amendment-card" data-form="amendment">
      <h2>Podat PN</h2>
      <p>Pozměňovací návrh odešli předsednictvu. O zařazení rozhoduje chair.</p>
      <label>Typ návrhu</label>
      <select name="type">
        <option value="add">Přidat bod</option>
        <option value="update">Upravit bod</option>
        <option value="remove">Odstranit bod</option>
      </select>
      <label>Cílový bod</label>
      <select name="targetPointId">
        <option value="">Bez cíle</option>
        ${points.map((point) => `<option value="${point.id}">${point.number}. ${esc(shorten(point.text, 90))}</option>`).join("")}
      </select>
      <label>Garanti</label>
      <input name="guarantorsText" placeholder="Garanti návrhu">
      <label>Text PN</label>
      <textarea name="text" placeholder="Text pozměňovacího návrhu"></textarea>
      <button>Odeslat PN</button>
      <div id="amendmentStatus" class="status"></div>
    </form>`;
}

async function submitAmendment(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const status = form.querySelector("#amendmentStatus");
  status.textContent = "Odesílám PN...";
  status.className = "status";
  try {
    await api("/api/vote/amendments", {
      method: "POST",
      body: {
        type: form.type.value,
        targetPointId: form.targetPointId.value ? Number(form.targetPointId.value) : null,
        guarantorsText: form.guarantorsText.value,
        text: form.text.value
      }
    });
    form.reset();
    status.textContent = "PN byl odeslán předsednictvu.";
    status.className = "status success";
  } catch (err) {
    status.textContent = err.message || "PN se nepodařilo odeslat.";
    status.className = "status error";
  }
}

async function cast(choice) {
  if (!state?.voting?.session || state.voting.session.status !== "open") {
    showToast("Hlasování teď není aktivní.");
    return;
  }
  const previous = state.voting.currentVote;
  state.voting.currentVote = choice;
  lastRenderKey = "";
  renderApp();
  setVoteButtonsDisabled(true);
  setStatus("Odesílám hlas...", "");
  try {
    state.voting = await api("/api/vote/cast", { method: "POST", body: { choice } });
    lastRenderKey = "";
    renderApp();
    setStatus("Hlas uložen.", "success");
    showToast(`Hlas uložen: ${voteLabel(choice)}`);
  } catch (err) {
    state.voting.currentVote = previous;
    lastRenderKey = "";
    renderApp();
    setStatus(err.message || "Hlas se nepodařilo uložit.", "error");
  }
}

function logout() {
  localStorage.removeItem("munVotingCode");
  api("/api/auth/logout", { method: "POST" }).catch(() => {});
  state = null;
  renderLogin();
}

function updateMobileVoteCountdown() {
  const element = document.querySelector("#mobileVoteCountdown");
  if (!element || !state?.voting?.session || state.voting.session.status !== "open") return;
  const left = remainingSeconds(state.voting.session);
  element.textContent = left ? `Zbývá ${formatSeconds(left)}` : "Probíhá hlasování";
}

function updateConnection() {
  const pill = document.querySelector("#connectionPill");
  if (!pill) return;
  pill.textContent = connected ? "připojeno" : "výpadek spojení";
  pill.className = `pill ${connected ? "good" : "error"}`;
}

function setVoteButtonsDisabled(disabled) {
  document.querySelectorAll("[data-choice]").forEach((button) => { button.disabled = disabled; });
}

function setStatus(text, type) {
  const element = document.querySelector("#voteStatus");
  if (!element) return;
  element.textContent = text || "";
  element.className = `status ${type || ""}`;
}

function showToast(text) {
  const toast = document.querySelector("#toast");
  if (!toast) return;
  toast.textContent = text;
  toast.classList.add("visible");
  window.setTimeout(() => toast.classList.remove("visible"), 2100);
}

function statusLabel(value) {
  if (value === "open") return "připojeno";
  if (value === "closed") return "ukončeno";
  return value || "čekám";
}

function voteLabel(value) {
  if (value === "for") return "PRO";
  if (value === "against") return "PROTI";
  if (value === "abstain") return "ZDRŽUJI SE";
  return "zatím nehlasováno";
}

function currentVoteClass(value) {
  if (value === "for") return "for-vote";
  if (value === "against") return "against-vote";
  if (value === "abstain") return "abstain-vote";
  return "";
}

function formatSeconds(seconds) {
  const total = Math.max(0, Number(seconds || 0));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

function remainingSeconds(session) {
  if (!session || session.status !== "open") return 0;
  if (session.startedAt && session.timeLimitSec) {
    const elapsed = Math.floor((Date.now() - new Date(session.startedAt).getTime()) / 1000);
    return Math.max(0, Number(session.timeLimitSec) - elapsed);
  }
  return Math.max(0, Number(session.secondsLeft || 0));
}

function shorten(text, max) {
  text = String(text || "");
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
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

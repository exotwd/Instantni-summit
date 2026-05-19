import { api, events } from "./api.ts";
import { acceptEvent } from "./state.ts";

const app = document.querySelector("#app");
let state = null;
let connected = false;
setInterval(() => render(), 1000);
init();

async function init() {
  try {
    await load();
    events(async (event) => { if (acceptEvent(event)) await load(false); }, (s) => { connected = s === "connected"; render(); });
  } catch { renderLogin(); }
}

async function load(showLogin = true) {
  try { state = await api("/api/vote/state"); render(); }
  catch { if (showLogin) renderLogin(); }
}

function renderLogin() {
  app.innerHTML = `<main class="login"><h1>Hlasování</h1><p>Zadejte čtyřmístný kód delegace</p><input id="code" inputmode="numeric" maxlength="4" pattern="[0-9]*" autofocus><div id="msg"></div></main>`;
  const input = app.querySelector("#code");
  input.oninput = async () => {
    input.value = input.value.replace(/\D/g, "").slice(0, 4);
    if (input.value.length === 4) {
      try { await api("/api/vote/login", { method: "POST", body: { code: input.value } }); await init(); }
      catch (err) { app.querySelector("#msg").textContent = err.message; input.value = ""; }
    }
  };
}

function render() {
  if (!state) return;
  const session = state.voting.session;
  app.innerHTML = `<main class="vote"><header><div><strong>${state.delegation.flag} ${esc(state.delegation.name)}</strong><small class="${connected ? "ok" : "bad"}">${connected ? "online" : "offline"}</small></div></header>
    <section class="status">${session ? `<h1>${session.status === "open" ? "Hlasování otevřeno" : "Hlasování bylo ukončeno"}</h1><div class="timer">${session.status === "open" ? session.secondsLeft + " s" : ""}</div>${state.voting.amendment ? `<p>PN ${state.voting.amendment.number}: ${esc(state.voting.amendment.text)}</p>` : ""}` : `<h1>Nyní neprobíhá hlasování</h1>`}</section>
    ${session ? `<section class="buttons"><button class="${state.voting.currentVote === "for" ? "selected" : ""}" data-choice="for" ${session.status !== "open" ? "disabled" : ""}>PRO</button><button class="${state.voting.currentVote === "against" ? "selected" : ""}" data-choice="against" ${session.status !== "open" ? "disabled" : ""}>PROTI</button><button class="${state.voting.currentVote === "abstain" ? "selected" : ""}" data-choice="abstain" ${session.status !== "open" ? "disabled" : ""}>ZDRŽUJI SE</button></section>` : ""}
    <section class="resolution"><h2>Rezoluce</h2>${state.resolution.html || "<p>Rezoluce zatím nemá body.</p>"}</section>
    <form id="amendment"><h2>Podat PN</h2><select name="type"><option value="add">Přidat bod</option><option value="update">Změnit bod</option><option value="remove">Odstranit bod</option></select><select name="targetPointId"><option value="">Cílový bod</option>${state.resolution.points.map(p => `<option value="${p.id}">${p.number}. ${esc(p.text)}</option>`).join("")}</select><input name="guarantorsText" placeholder="Garanti"><textarea name="text" placeholder="Text PN"></textarea><button>Odeslat PN</button><p id="sent"></p></form>
  </main>`;
  app.querySelectorAll("[data-choice]").forEach(b => b.onclick = () => cast(b.dataset.choice));
  app.querySelector("#amendment").onsubmit = submitAmendment;
}

async function cast(choice) {
  const previous = state.voting.currentVote;
  state.voting.currentVote = choice;
  render();
  try { state.voting = await api("/api/vote/cast", { method: "POST", body: { choice } }); await load(false); }
  catch (err) { state.voting.currentVote = previous; render(); alert(err.message); }
}

async function submitAmendment(e) {
  e.preventDefault();
  const f = e.target;
  try {
    await api("/api/vote/amendments", { method: "POST", body: { type: f.type.value, targetPointId: f.targetPointId.value ? Number(f.targetPointId.value) : null, guarantorsText: f.guarantorsText.value, text: f.text.value } });
    f.reset(); app.querySelector("#sent").textContent = "PN byl odeslán.";
  } catch (err) { app.querySelector("#sent").textContent = err.message; }
}

function esc(s) { return String(s ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

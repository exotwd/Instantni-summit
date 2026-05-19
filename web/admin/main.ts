import { api, events } from "./api.ts";
import { acceptEvent } from "./state.ts";

const app = document.querySelector("#app");
let state = null;
let tab = "dashboard";
let status = "odpojeno";

const tabs = [
  ["dashboard", "Přehled"], ["amendments", "PN"], ["voting", "Hlasování"],
  ["speakers", "Řečníci"], ["attendance", "Prezence"], ["layout", "Rozložení"],
  ["breaks", "Přestávky"], ["agenda", "Agenda"], ["settings", "Nastavení"]
];

init();

async function init() {
  try {
    const me = await api("/api/auth/me");
    if (me.role !== "admin") throw new Error("not admin");
    await load();
    events("admin", async (event) => {
      if (acceptEvent(event)) await load(false);
    }, (s) => { status = s === "connected" ? "připojeno" : "odpojeno"; render(); });
  } catch {
    renderLogin();
  }
}

async function load(showErrors = true) {
  try {
    state = await api("/api/admin/state");
    render();
  } catch (err) {
    if (showErrors) toast(err.message);
    renderLogin();
  }
}

function renderLogin() {
  app.innerHTML = `<main class="login"><form id="login"><h1>MUN Chair System</h1><label>Admin PIN<input name="pin" type="password" inputmode="numeric" autofocus></label><button>Přihlásit</button></form></main>`;
  app.querySelector("#login").onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api("/api/auth/admin/login", { method: "POST", body: { pin: e.target.pin.value } });
      await init();
    } catch (err) { toast(err.message); }
  };
}

function render() {
  if (!state) return;
  app.innerHTML = `
    <header><strong>MUN Chair System</strong><span>${esc(state.settings.values.conference_name || "")} / ${esc(state.settings.values.committee_name || "")}</span><span class="${status === "připojeno" ? "ok" : "bad"}">SSE ${status}</span><button data-action="logout">Odhlásit</button></header>
    ${state.settings.defaultsWarning ? `<div class="warning">Výchozí PINy jsou stále aktivní. Změňte je v nastavení.</div>` : ""}
    <nav>${tabs.map(([id, label]) => `<button class="${tab === id ? "active" : ""}" data-tab="${id}">${label}</button>`).join("")}</nav>
    <section>${renderTab()}</section>
    <div id="toast"></div>`;
  app.querySelectorAll("[data-tab]").forEach((b) => b.onclick = () => { tab = b.dataset.tab; render(); });
  app.querySelector("[data-action=logout]").onclick = async () => { await api("/api/auth/logout", { method: "POST" }); renderLogin(); };
  bindActions();
}

function renderTab() {
  return ({
    dashboard: renderDashboard,
    amendments: renderAmendments,
    voting: renderVoting,
    speakers: renderSpeakers,
    attendance: renderAttendance,
    layout: renderLayout,
    breaks: renderBreaks,
    agenda: renderAgenda,
    settings: renderSettings
  }[tab] || renderDashboard)();
}

function renderDashboard() {
  const v = state.voting.session;
  return `<div class="grid"><article><h2>Hlasování</h2><p>${v ? `${v.status} (${v.secondsLeft}s)` : "Nyní neprobíhá hlasování"}</p></article><article><h2>Prezence</h2><p>${state.attendance.delegations.filter(d => d.present).length}/${state.attendance.delegations.length} přítomno</p></article><article><h2>Řečník</h2><p>${state.speakers.currentSpeaker ? flagName(state.speakers.currentSpeaker) : "Nikdo nemluví"}</p></article></div>`;
}

function renderVoting() {
  const s = state.voting.session;
  const rows = state.voting.votes.map(v => {
    const d = state.delegations.find(x => x.id === v.delegationId);
    return `<tr><td>${d ? flagName(d) : v.delegationId}</td><td>${voteLabel(v.choice)}</td></tr>`;
  }).join("");
  return `<div class="split"><article><h2>Aktuální hlasování</h2>${s ? `<p>Stav: <b>${s.status}</b>, čas: ${s.secondsLeft}s</p><p>Pro ${state.voting.counts.for} / Proti ${state.voting.counts.against} / Zdržel ${state.voting.counts.abstain}</p><div class="row"><button data-vote-action="close" ${s.status !== "open" ? "disabled" : ""}>Ukončit hlasování</button><button data-vote-action="reopen" ${s.status !== "closed" ? "disabled" : ""}>Znovu otevřít</button><button data-vote-action="save" ${s.status !== "closed" ? "disabled" : ""}>Uložit výsledek</button><button data-vote-action="cancel">Zrušit</button></div>` : "<p>Není otevřeno žádné hlasování.</p>"}<button data-action="force">Obnovit projekci</button><table>${rows}</table></article><article><h2>Spustit hlasování o PN</h2>${state.amendments.map(a => `<div class="item"><b>PN ${a.number}</b> ${esc(a.type)} ${esc(a.status)}<p>${esc(a.text)}</p><button data-start-voting="${a.id}">Hlasovat</button></div>`).join("")}</article></div>`;
}

function renderAmendments() {
  const options = state.resolution.points.map(p => `<option value="${p.id}">${p.number}. ${esc(p.text)}</option>`).join("");
  return `<form class="panel" data-form="amendment"><h2>Nový PN</h2><div class="row"><select name="type"><option value="add">Přidat bod</option><option value="update">Změnit bod</option><option value="remove">Odstranit bod</option></select><select name="targetPointId"><option value="">Bez cíle</option>${options}</select></div><textarea name="text" placeholder="Text návrhu"></textarea><input name="guarantorsText" placeholder="Garanti"><button>Uložit PN</button></form>${state.amendments.map(a => `<article class="item"><h3>PN ${a.number} - ${esc(a.status)}</h3><p>${esc(a.text)}</p><div class="row"><button data-introduce="${a.id}">Představit</button><button data-reject="${a.id}">Zamítnout</button><button data-debate="${a.id}">Jednat</button><button data-start-voting="${a.id}">Hlasovat</button></div></article>`).join("")}`;
}

function renderSpeakers() {
  return `<div class="split"><article><h2>Delegace</h2><div class="chips">${state.delegations.map(d => `<button data-speaker="${d.id}" title="Klik přidá řečníka">${d.flag} ${esc(d.name)}</button><button data-reaction="${d.id}" title="Přidat reakci">↯</button>`).join("")}</div></article><article><h2>Aktuální</h2><p>${state.speakers.currentSpeaker ? flagName(state.speakers.currentSpeaker) : "Nikdo"}</p><button data-action="next-speaker">Další</button><button data-action="clear-speakers">Vyčistit</button><h3>Pořadník</h3>${state.speakers.queue.map(q => `<div class="item">${flagName(q.delegation)} <button data-remove-speaker="${q.id}">Odebrat</button></div>`).join("")}<h3>Reakce</h3>${state.speakers.reactions.map(r => `<div class="item">${flagName(r.delegation)} ${esc(r.status)} <button data-remove-reaction="${r.id}">Odebrat</button></div>`).join("")}</article></div>`;
}

function renderAttendance() {
  return `<table><thead><tr><th>Delegace</th><th>Stav</th><th>Kód</th><th>Účastník</th><th>Akce</th></tr></thead><tbody>${state.attendance.delegations.map(d => `<tr><td>${flagName(d)}</td><td>${d.present ? "přítomna" : "nepřítomna"}</td><td>${esc(d.accessCode || "")}</td><td>${esc(d.participant?.name || "")}</td><td><button data-edit-delegation="${d.id}">Upravit</button><button data-code="${d.id}">Kód</button><button data-checkin="${d.id}">Check-in</button><button data-checkout="${d.id}">Check-out</button></td></tr>`).join("")}</tbody></table>`;
}

function renderLayout() {
  return `<div class="seatmap">${state.delegations.map(d => `<button class="seat" style="left:${d.seat?.x || 0}%;top:${d.seat?.y || 0}%;width:${d.seat?.w || 10}%;height:${d.seat?.h || 10}%;" data-seat="${d.id}">${d.flag}</button>`).join("")}</div><p class="muted">Klik na vlajku posune delegaci v jednoduché mřížce.</p>`;
}

function renderBreaks() {
  return `<form data-form="break" class="panel"><h2>Přestávka / caucus</h2><select name="type"><option value="caucus">Caucus</option><option value="coffee_break">Coffee break</option><option value="custom_break">Vlastní</option></select><input name="title" placeholder="Název"><input name="durationMinutes" type="number" value="10"><button>Spustit</button></form>${state.break ? `<article class="item">${esc(state.break.title)} <button data-action="end-break">Ukončit</button></article>` : "<p>Není aktivní přestávka.</p>"}`;
}

function renderAgenda() {
  return `<form data-form="agenda" class="panel"><h2>Bod programu</h2><input name="title" placeholder="Název"><select name="type"><option value="session">Jednání</option><option value="break">Přestávka</option><option value="caucus">Caucus</option><option value="voting">Hlasování</option><option value="organizational">Organizační</option><option value="other">Jiné</option></select><textarea name="note" placeholder="Poznámka"></textarea><button>Přidat</button></form>${state.agenda.map(a => `<div class="item"><b>${esc(a.title)}</b> ${esc(a.type)} <button data-delete-agenda="${a.id}">Smazat</button></div>`).join("")}`;
}

function renderSettings() {
  return `<form data-form="settings" class="panel"><h2>Nastavení</h2><input name="conference_name" value="${esc(state.settings.values.conference_name || "")}"><input name="committee_name" value="${esc(state.settings.values.committee_name || "")}"><input name="default_voting_time_sec" type="number" value="${esc(state.settings.values.default_voting_time_sec || "60")}"><button>Uložit</button></form><form data-form="pin" data-pin="admin" class="panel"><input name="pin" placeholder="Nový admin PIN"><button>Změnit admin PIN</button></form><form data-form="pin" data-pin="screen" class="panel"><input name="pin" placeholder="Nový screen PIN"><button>Změnit screen PIN</button></form><div class="row"><button data-action="reset-live">Reset live</button><button data-action="reset-all">Reset vše</button></div>`;
}

function bindActions() {
  app.querySelectorAll("[data-start-voting]").forEach(b => b.onclick = () => post("/api/admin/voting/start", { amendmentId: Number(b.dataset.startVoting) }));
  app.querySelectorAll("[data-vote-action]").forEach(b => b.onclick = () => post(`/api/admin/voting/${b.dataset.voteAction === "force" ? "force-projection" : b.dataset.voteAction}`, { sessionId: state.voting.session?.id }));
  const force = app.querySelector("[data-action=force]"); if (force) force.onclick = () => post("/api/admin/voting/force-projection", {});
  app.querySelectorAll("[data-speaker]").forEach(b => b.onclick = () => post("/api/speakers/add", { delegationId: Number(b.dataset.speaker) }));
  app.querySelectorAll("[data-reaction]").forEach(b => b.onclick = () => post("/api/speakers/reaction", { delegationId: Number(b.dataset.reaction) }));
  app.querySelectorAll("[data-remove-speaker]").forEach(b => b.onclick = () => post("/api/speakers/remove", { id: Number(b.dataset.removeSpeaker) }));
  app.querySelectorAll("[data-remove-reaction]").forEach(b => b.onclick = () => post("/api/speakers/reaction/remove", { id: Number(b.dataset.removeReaction) }));
  click("next-speaker", () => post("/api/speakers/next", {})); click("clear-speakers", () => post("/api/speakers/clear", {}));
  app.querySelectorAll("[data-code]").forEach(b => b.onclick = () => post("/api/attendance/generate-code", { delegationId: Number(b.dataset.code) }));
  app.querySelectorAll("[data-checkin]").forEach(b => b.onclick = () => checkIn(Number(b.dataset.checkin)));
  app.querySelectorAll("[data-checkout]").forEach(b => b.onclick = () => post("/api/attendance/check-out", { delegationId: Number(b.dataset.checkout) }));
  app.querySelectorAll("[data-edit-delegation]").forEach(b => b.onclick = () => editDelegation(Number(b.dataset.editDelegation)));
  app.querySelectorAll("[data-introduce]").forEach(b => b.onclick = () => post(`/api/amendments/${b.dataset.introduce}/introduce`, {}));
  app.querySelectorAll("[data-reject]").forEach(b => b.onclick = () => post(`/api/amendments/${b.dataset.reject}/reject`, {}));
  app.querySelectorAll("[data-debate]").forEach(b => b.onclick = () => post(`/api/amendments/${b.dataset.debate}/debate`, {}));
  app.querySelectorAll("[data-delete-agenda]").forEach(b => b.onclick = () => request(`/api/agenda/${b.dataset.deleteAgenda}`, { method: "DELETE" }));
  app.querySelectorAll("[data-seat]").forEach(b => b.onclick = () => moveSeat(Number(b.dataset.seat)));
  const amendment = app.querySelector("[data-form=amendment]"); if (amendment) amendment.onsubmit = submitAmendment;
  const breakForm = app.querySelector("[data-form=break]"); if (breakForm) breakForm.onsubmit = (e) => submitForm(e, "/api/breaks/start", ["type","title","durationMinutes"]);
  const agendaForm = app.querySelector("[data-form=agenda]"); if (agendaForm) agendaForm.onsubmit = (e) => submitForm(e, "/api/agenda", ["title","type","note"]);
  const settingsForm = app.querySelector("[data-form=settings]"); if (settingsForm) settingsForm.onsubmit = (e) => submitForm(e, "/api/settings", ["conference_name","committee_name","default_voting_time_sec"]);
  app.querySelectorAll("[data-form=pin]").forEach(f => f.onsubmit = (e) => { e.preventDefault(); post(`/api/settings/${f.dataset.pin}-pin`, { pin: f.pin.value }); });
  click("end-break", () => post("/api/breaks/end", {})); click("reset-live", () => confirm("Resetovat live stav?") && post("/api/settings/reset-live", {})); click("reset-all", () => { const c = prompt("Napište RESET ALL"); if (c) post("/api/settings/reset-all", { confirm: c }); });
}

async function submitAmendment(e) {
  e.preventDefault();
  const f = e.target;
  await post("/api/amendments", { type: f.type.value, targetPointId: f.targetPointId.value ? Number(f.targetPointId.value) : null, text: f.text.value, guarantorsText: f.guarantorsText.value });
}

async function submitForm(e, path, fields) {
  e.preventDefault();
  const body = {};
  fields.forEach(k => body[k] = e.target[k].type === "number" ? Number(e.target[k].value) : e.target[k].value);
  await post(path, body);
}

async function post(path, body) { await request(path, { method: "POST", body }); }
async function request(path, opts) { try { await api(path, opts); await load(false); toast("Uloženo."); } catch (err) { toast(err.message); } }
function click(action, fn) { const el = app.querySelector(`[data-action=${action}]`); if (el) el.onclick = fn; }
async function moveSeat(id) { const d = state.delegations.find(x => x.id === id); const x = ((d.seat?.x || 0) + 8) % 88; await post("/api/layout/seat", { delegationId: id, x, y: d.seat?.y || 10, w: 10, h: 10, rotation: 0 }); }
async function editDelegation(id) { const d = state.delegations.find(x => x.id === id); const name = prompt("Název delegace", d.name); if (!name) return; const code = prompt("Zkratka", d.code) || d.code; const flag = prompt("Vlajka", d.flag) || d.flag; await request(`/api/delegations/${id}`, { method: "PUT", body: { ...d, name, code, flag } }); }
async function checkIn(id) { const d = state.delegations.find(x => x.id === id); const name = prompt("Jméno účastníka", d.participant?.name || "") || ""; const email = prompt("E-mail účastníka", d.participant?.email || "") || ""; const coDelegateName = prompt("Jméno spoludelegáta", d.participant?.coDelegateName || "") || ""; const coDelegateEmail = prompt("E-mail spoludelegáta", d.participant?.coDelegateEmail || "") || ""; const note = prompt("Poznámka", d.participant?.note || "") || ""; await post("/api/attendance/check-in", { delegationId: id, note, participant: { delegationId: id, name, email, coDelegateName, coDelegateEmail, note } }); }
function flagName(d) { return `${d.flag} ${esc(d.name)}`; }
function voteLabel(v) { return ({for:"pro", against:"proti", abstain:"zdržel se"}[v] || v); }
function esc(s) { return String(s ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function toast(message) { const t = document.querySelector("#toast"); if (t) { t.textContent = message; t.classList.add("show"); setTimeout(() => t.classList.remove("show"), 2500); } }

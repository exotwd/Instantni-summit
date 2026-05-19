import { api, events } from "./api.js";
import { acceptEvent } from "./state.js";

const app = document.querySelector("#app");
let state = null;
let panel = "amendments";
let realtimeStatus = "odpojeno";
let closeEvents = null;
let speakerClickTimer = null;

const panels = [
  ["amendments", "Pozměňovací návrhy"],
  ["layout", "Rozložení a prezence"],
  ["voting", "Hlasování"],
  ["agenda", "Agenda"],
  ["settings", "Nastavení"]
];

init();

async function init() {
  try {
    const me = await api("/api/auth/me");
    if (me.role !== "admin") throw new Error("not_admin");
    await load();
    connectRealtime();
  } catch {
    renderLogin();
  }
}

function connectRealtime() {
  if (closeEvents) closeEvents();
  closeEvents = events("admin", async (event) => {
    if (acceptEvent(event)) await load(false);
  }, (status) => {
    realtimeStatus = status === "connected" ? "připojeno" : "odpojeno";
    updateStatusLine();
  });
}

async function load(showErrors = true) {
  try {
    state = await api("/api/admin/state");
    normalizeState();
    render();
  } catch (err) {
    if (showErrors) showToast(err.message);
    renderLogin(err.message);
  }
}

function normalizeState() {
  state.settings = state.settings || { values: {} };
  state.settings.values = state.settings.values || {};
  state.attendance = state.attendance || { delegations: [] };
  state.attendance.delegations = state.attendance.delegations || [];
  state.delegations = state.delegations || state.attendance.delegations || [];
  state.resolution = state.resolution || { points: [], html: "" };
  state.resolution.points = state.resolution.points || [];
  state.amendments = state.amendments || [];
  state.voting = state.voting || { votes: [], counts: {} };
  state.voting.votes = state.voting.votes || [];
  state.voting.counts = state.voting.counts || {};
  state.speakers = state.speakers || { queue: [], reactions: [], state: {} };
  state.speakers.queue = state.speakers.queue || [];
  state.speakers.reactions = state.speakers.reactions || [];
  state.speakers.state = state.speakers.state || {};
  state.agenda = state.agenda || [];
}

function renderLogin(message = "") {
  app.innerHTML = `
    <main class="login">
      <form id="login" class="login-card">
        <h1>MUN řízení schůze</h1>
        <p>Administrace předsednictva.</p>
        <label>Admin PIN</label>
        <input name="pin" type="password" inputmode="numeric" autocomplete="current-password" autofocus>
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
      await api("/api/auth/admin/login", { method: "POST", body: { pin: form.pin.value } });
      const me = await api("/api/auth/me");
      if (me.role !== "admin") {
        throw new Error("Přihlášení proběhlo, ale prohlížeč neuložil session cookie. Pokud jedeš přes HTTP, nastav COOKIE_SECURE=false.");
      }
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
    <div class="top">
      <h1>MUN řízení schůze</h1>
      <p>PN se nejdřív zařadí do jednání, poté představí a teprve potom se zpřístupní hlasování.</p>
    </div>
    <div class="wrap">
      <div class="status-line">
        <button class="reload" data-reload>Načíst znovu</button>
        ${panels.map(([id, label]) => `<button class="reload ${panel === id ? "active" : ""}" data-panel="${id}">${label}</button>`).join("")}
        <button class="reload" data-open-screen>Otevřít obrazovku</button>
        <button class="save" data-action="logout">Odhlásit</button>
        <span id="status">${statusText()}</span>
      </div>
      ${state.settings.defaultsWarning ? `<div class="warning">Výchozí PINy jsou stále aktivní. Změň je v nastavení.</div>` : ""}
      ${renderPanel()}
    </div>
    <div id="toast"></div>`;
  bindActions();
}

function renderPanel() {
  if (panel === "layout") return renderLayoutPanel();
  if (panel === "voting") return renderVotingPanel();
  if (panel === "agenda") return renderAgendaPanel();
  if (panel === "settings") return renderSettingsPanel();
  return renderAmendmentsPanel();
}

function renderAmendmentsPanel() {
  return `
    ${renderSpeakerPanel()}
    ${renderBreakPanel()}
    <form class="card" data-form="amendment">
      <h2>Nový pozměňovací návrh</h2>
      <div class="meta compact">
        <div><strong>Typ návrhu</strong><select name="type">${option("add", "Přidat bod")}${option("update", "Upravit bod")}${option("remove", "Odstranit bod")}</select></div>
        <div><strong>Cílový bod</strong><select name="targetPointId"><option value="">Bez cíle</option>${resolutionOptions()}</select></div>
        <div><strong>Navrhovatel</strong><input name="submitterName" placeholder="Delegace nebo jméno"></div>
        <div><strong>Garanti</strong><input name="guarantorsText" placeholder="Garanti, oddělené čárkou"></div>
      </div>
      <span class="label">Text návrhu</span>
      <textarea name="text" required></textarea>
      <div class="actions"><button class="approve">Uložit PN</button></div>
    </form>
    <div id="items">${renderAmendmentItems()}</div>`;
}

function renderSpeakerPanel() {
  const current = state.speakers.currentSpeaker;
  return `
    <div class="card speaker-panel">
      <h2>Pořadník řečníků</h2>
      <p>Kliknutím na stát ho přidáš do pořadníku. Dvojklikem ho přidáš jako reakci na aktuální projev.</p>
      <div class="speaker-grid">
        <div class="speaker-box">
          <div class="label">Aktuální řečník</div>
          <div class="current-speaker">${current ? flagName(current) : "Žádný aktuální řečník"}</div>
          <div class="label">Reakce na aktuální projev</div>
          <div class="reaction-slots">${renderReactions()}</div>
          <div class="actions">
            <button class="vote-button" data-action="next-speaker">Další řečník</button>
            <button class="save" data-action="clear-speakers">Vymazat pořadník</button>
          </div>
        </div>
        <div class="speaker-box">
          <div class="label">Pořadník</div>
          <ol class="queue-list">${state.speakers.queue.length ? state.speakers.queue.map((item) => `<li data-remove-speaker="${item.id}">${flagName(item.delegation)}</li>`).join("") : "<li>Pořadník je prázdný.</li>"}</ol>
        </div>
      </div>
      <div class="stage-wrap"><div class="stage speaker-stage">${renderSeats("speaker")}</div></div>
    </div>`;
}

function renderReactions() {
  const rows = [];
  const activeRecord = state.speakers.reactions.find((item) => item.status === "active");
  if (activeRecord) {
    rows.push({ item: activeRecord, active: true });
  } else if (state.speakers.activeReaction) {
    rows.push({ item: { delegation: state.speakers.activeReaction, id: 0, status: "active" }, active: true });
  }
  state.speakers.reactions.filter((item) => item.status !== "active").forEach((item) => rows.push({ item, active: false }));
  return [0, 1].map((index) => {
    const row = rows[index];
    if (!row) return `<div class="reaction-slot">Volná reakce</div>`;
    return `<div class="reaction-slot ${row.active ? "active" : ""}" data-remove-reaction="${row.item.id}">${row.active ? "Probíhá: " : ""}${flagName(row.item.delegation)}</div>`;
  }).join("");
}

function renderBreakPanel() {
  const active = state.break;
  return `
    <div class="card break-panel">
      <h2>Přestávka / kuloární jednání</h2>
      <p>Zvol délku v minutách a vyvolej kuloární jednání nebo přestávku na kávu. Na projekci se zobrazí velká obrazovka s odpočtem.</p>
      <div class="break-controls">
        <div>
          <span class="label">Čas v minutách</span>
          <input id="breakMinutes" type="number" min="1" max="180" value="5">
        </div>
        <div class="break-buttons">
          <button class="caucus-button" data-break-start="caucus">Vyvolat kuloární jednání</button>
          <button class="coffee-button" data-break-start="coffee_break">Přestávka na kávu</button>
          <button class="save" data-action="end-break">Ukončit</button>
        </div>
      </div>
      <div class="break-status ${active ? "" : "inactive"}">${active ? `${esc(active.title)} běží, končí ${timeLabel(active.endsAt)}.` : "Žádná přestávka ani kuloární jednání právě neběží."}</div>
    </div>`;
}

function renderAmendmentItems() {
  const active = state.amendments.filter((item) => item.status !== "passed" && item.status !== "failed");
  if (!active.length) {
    return `<div class="empty">V aktivním seznamu teď nejsou žádné PN. Odhlasované PN zůstávají uložené v databázi.</div>`;
  }
  return active.map((item) => {
    const ready = item.status === "introduced" || item.status === "accepted";
    return `
      <div class="card ${amendmentClass(item)}" id="card-${item.id}">
        <div class="meta">
          <div><strong>Stav</strong><br><span class="badge">${statusLabel(item.status)}</span></div>
          <div><strong>PN</strong><br>${item.number || ""}</div>
          <div><strong>Navrhovatel</strong><br>${esc(item.submitterName || "")}</div>
          <div><strong>Garanti</strong><br>${esc(item.guarantorsText || "")}</div>
          <div><strong>Typ návrhu</strong><br>${typeLabel(item.type)}</div>
        </div>
        <span class="label">Text návrhu</span>
        <div class="original">${esc(item.text)}</div>
        <div class="actions">
          <button class="present" data-introduce="${item.id}">Označit jako představený</button>
          <button class="reject" data-reject="${item.id}">Vyřadit</button>
          <button class="save" data-debate="${item.id}">Zahájit jednání</button>
          <button class="vote-button" data-start-voting="${item.id}" ${ready ? "" : "disabled"}>Hlasovat o PN</button>
        </div>
      </div>`;
  }).join("");
}

function renderLayoutPanel() {
  const present = state.delegations.filter((item) => item.present).length;
  const absent = state.delegations.length - present;
  return `
    <div class="card">
      <h2>Rozložení stolů a prezenční listina</h2>
      <p>Kliknutím na stůl ho posuneš v jednoduché mřížce. Prezenci a kódy spravuje tabulka pod schématem.</p>
      <div class="actions">
        <button class="save" data-arrange="circle">Rozložit do kruhu</button>
        <button class="save" data-arrange="u">Rozložit do obráceného U</button>
      </div>
      <div class="vote-summary"><strong>Prezenční listina</strong><br>Přítomno: ${present}<br>Nepřítomno: ${absent}</div>
    </div>
    <div class="stage-wrap"><div class="stage">${renderSeats("layout")}</div></div>
    <div class="card">
      <h2>Prezenční listina a přístupové kódy</h2>
      ${renderAttendanceTable()}
    </div>`;
}

function renderVotingPanel() {
  const session = state.voting.session;
  return `
    <div class="card voting-current">
      <h2>Hlasování o PN</h2>
      ${session ? renderSessionInfo(session) : `<div class="empty">Není spuštěné žádné hlasování.</div>`}
      <div class="vote-summary">${renderVoteSummary()}</div>
      <div class="actions">
        <button class="approve" data-vote-action="close" ${session?.status === "open" ? "" : "disabled"}>Ukončit hlasování</button>
        <button class="save" data-vote-action="reopen" ${session?.status === "closed" ? "" : "disabled"}>Obnovit hlasování</button>
        <button class="approve" data-vote-action="save" ${session?.status === "closed" ? "" : "disabled"}>Uložit výsledek</button>
        <button class="reject" data-vote-action="cancel" ${session ? "" : "disabled"}>Zrušit hlasování</button>
        <button class="save" data-action="force-projection">Vynutit aktualizaci projekce</button>
      </div>
    </div>
    <div class="stage-wrap"><div class="stage">${renderSeats("voting")}</div></div>
    <div class="card">
      <h2>Spustit hlasování o PN</h2>
      ${state.amendments.length ? state.amendments.map((item) => `<div class="item"><b>PN ${item.number}</b> <span class="badge">${statusLabel(item.status)}</span><p>${esc(item.text)}</p><button class="vote-button" data-start-voting="${item.id}">Hlasovat</button></div>`).join("") : `<div class="empty">Zatím nejsou žádné PN.</div>`}
    </div>`;
}

function renderSessionInfo(session) {
  const amendment = state.voting.amendment;
  return `
    <div class="meta">
      <div><strong>Stav</strong><br>${statusLabel(session.status)}</div>
      <div><strong>Čas</strong><br>${session.status === "open" ? `${session.secondsLeft || 0} s` : "-"}</div>
      <div><strong>PN</strong><br>${amendment ? `PN ${amendment.number}` : "bez PN"}</div>
      <div><strong>Text</strong><br>${amendment ? esc(shorten(amendment.text, 160)) : ""}</div>
    </div>`;
}

function renderVoteSummary() {
  const counts = state.voting.counts || {};
  const passed = (counts.for || 0) > (counts.against || 0);
  return `<strong>Souhrn hlasování</strong><br>Pro: ${counts.for || 0}<br>Proti: ${counts.against || 0}<br>Zdržuje se: ${counts.abstain || 0}<br><strong>${passed ? "PŘIJATO" : "NEPŘIJATO"}</strong>`;
}

function renderAgendaPanel() {
  return `
    <form class="card" data-form="agenda">
      <h2>Agenda</h2>
      <input name="title" placeholder="Název bodu" required>
      <select name="type">${option("session", "Jednání")}${option("break", "Přestávka")}${option("caucus", "Caucus")}${option("voting", "Hlasování")}${option("organizational", "Organizační")}${option("other", "Jiné")}</select>
      <textarea name="note" placeholder="Poznámka"></textarea>
      <button class="approve">Přidat bod</button>
    </form>
    <div class="card">
      <h2>Bodový program</h2>
      ${state.agenda.length ? state.agenda.map((item) => `<div class="item"><b>${esc(item.title)}</b> ${esc(item.type)} <button class="reject" data-delete-agenda="${item.id}">Smazat</button></div>`).join("") : `<div class="empty">Agenda je prázdná.</div>`}
    </div>`;
}

function renderSettingsPanel() {
  const values = state.settings.values || {};
  return `
    <form class="card" data-form="settings">
      <h2>Nastavení administrátora</h2>
      <div class="meta compact">
        <div><strong>Název summitu</strong><input name="conference_name" value="${esc(values.conference_name || "")}"></div>
        <div><strong>Výbor</strong><input name="committee_name" value="${esc(values.committee_name || "")}"></div>
        <div><strong>Čas hlasování v sekundách</strong><input name="default_voting_time_sec" type="number" min="1" value="${esc(values.default_voting_time_sec || "60")}"></div>
      </div>
      <div class="actions"><button class="approve">Uložit nastavení</button></div>
    </form>
    <div class="settings-grid">
      <form class="card" data-form="pin" data-pin="admin">
        <h2>Admin PIN</h2>
        <input name="pin" type="password" placeholder="Nový admin PIN">
        <button class="save">Změnit admin PIN</button>
      </form>
      <form class="card" data-form="pin" data-pin="screen">
        <h2>Screen PIN</h2>
        <input name="pin" type="password" placeholder="Nový screen PIN">
        <button class="save">Změnit screen PIN</button>
      </form>
    </div>
    <div class="card danger-zone">
      <h2>Reset dat</h2>
      <p>Reset živých dat smaže pořadník, hlasování a přestávky. Reset všeho navíc vytvoří zálohu databáze a vrátí výchozí delegace.</p>
      <div class="actions">
        <button class="reject" data-action="reset-live">Resetovat živá data</button>
        <button class="reject" data-action="reset-all">Resetovat vše</button>
      </div>
    </div>`;
}

function renderAttendanceTable() {
  return `
    <div class="attendance-table-wrap">
      <table class="attendance-table">
        <thead><tr><th>Stát</th><th>Kód</th><th>Přítomen</th><th>Účastník</th><th>Akce</th></tr></thead>
        <tbody>${state.attendance.delegations.map((d) => `
          <tr>
            <td><strong>${flagName(d)}</strong><br><span class="muted">${esc(d.code)}</span></td>
            <td><span class="attendance-code">${esc(d.accessCode || "—")}</span></td>
            <td>${d.present ? "Ano" : "Ne"}</td>
            <td>${esc(d.participant?.name || "")}</td>
            <td>
              <button class="save" data-edit-delegation="${d.id}">Upravit</button>
              <button class="save" data-code="${d.id}">Kód</button>
              <button class="present" data-checkin="${d.id}">Přítomen</button>
              <button class="reject" data-checkout="${d.id}">Nepřítomen</button>
            </td>
          </tr>`).join("")}</tbody>
      </table>
    </div>`;
}

function renderSeats(mode) {
  return state.delegations.map((d, index) => {
    const seat = d.seat || defaultSeat(index);
    const vote = voteForDelegation(d.id);
    const classes = ["seat"];
    let label = "";
    let data = "";
    if (mode === "speaker") {
      classes.push("speaker-seat");
      data = `data-speaker-seat="${d.id}"`;
    } else if (mode === "voting") {
      if (vote) classes.push(`vote-${vote}`);
      data = `data-vote-seat="${d.id}"`;
      label = `<div class="seat-vote">${voteLabel(vote)}</div>`;
    } else {
      classes.push(d.present ? "attendance-present" : "attendance-absent");
      data = `data-layout-seat="${d.id}"`;
      label = `<div class="seat-attendance">${d.present ? "PŘÍTOMEN" : "NEPŘÍTOMEN"}</div>`;
    }
    return `
      <div class="${classes.join(" ")}" ${data} style="left:${seat.x}%;top:${seat.y}%;width:${seat.w}%;height:${seat.h}%;transform:rotate(${seat.rotation || 0}deg);">
        <div class="seat-inner" style="transform:rotate(${-(seat.rotation || 0)}deg);">
          <div class="seat-flag">${esc(d.flag || "")}</div>
          <div class="seat-code">${esc(d.code || "")}</div>
          <div class="seat-name">${esc(d.name || "")}</div>
          ${label}
        </div>
      </div>`;
  }).join("");
}

function bindActions() {
  app.querySelectorAll("[data-panel]").forEach((button) => {
    button.onclick = () => { panel = button.dataset.panel; render(); };
  });
  const reload = app.querySelector("[data-reload]");
  if (reload) reload.onclick = () => load();
  const screen = app.querySelector("[data-open-screen]");
  if (screen) screen.onclick = () => window.open("/screen", "_blank");
  click("logout", async () => { await api("/api/auth/logout", { method: "POST" }); state = null; renderLogin(); });

  app.querySelectorAll("[data-speaker-seat]").forEach((seat) => {
    seat.onclick = () => {
      if (speakerClickTimer) return;
      speakerClickTimer = setTimeout(async () => {
        speakerClickTimer = null;
        await post("/api/speakers/add", { delegationId: Number(seat.dataset.speakerSeat) });
      }, 220);
    };
    seat.ondblclick = async () => {
      clearTimeout(speakerClickTimer);
      speakerClickTimer = null;
      await post("/api/speakers/reaction", { delegationId: Number(seat.dataset.speakerSeat) });
    };
  });
  app.querySelectorAll("[data-remove-speaker]").forEach((button) => button.onclick = () => post("/api/speakers/remove", { id: Number(button.dataset.removeSpeaker) }));
  app.querySelectorAll("[data-remove-reaction]").forEach((button) => {
    const id = Number(button.dataset.removeReaction);
    if (id) button.onclick = () => post("/api/speakers/reaction/remove", { id });
  });
  click("next-speaker", () => post("/api/speakers/next", {}));
  click("clear-speakers", () => post("/api/speakers/clear", {}));

  app.querySelectorAll("[data-break-start]").forEach((button) => {
    button.onclick = () => {
      const minutes = Number(app.querySelector("#breakMinutes")?.value || 5);
      const type = button.dataset.breakStart;
      const title = type === "coffee_break" ? "Přestávka na kávu" : "Kuloární jednání";
      post("/api/breaks/start", { type, title, durationMinutes: minutes });
    };
  });
  click("end-break", () => post("/api/breaks/end", {}));

  app.querySelectorAll("[data-introduce]").forEach((button) => button.onclick = () => post(`/api/amendments/${button.dataset.introduce}/introduce`, {}));
  app.querySelectorAll("[data-reject]").forEach((button) => button.onclick = () => post(`/api/amendments/${button.dataset.reject}/reject`, {}));
  app.querySelectorAll("[data-debate]").forEach((button) => button.onclick = () => post(`/api/amendments/${button.dataset.debate}/debate`, {}));
  app.querySelectorAll("[data-start-voting]").forEach((button) => button.onclick = () => post("/api/admin/voting/start", { amendmentId: Number(button.dataset.startVoting) }, "Hlasování spuštěno."));

  app.querySelectorAll("[data-vote-action]").forEach((button) => {
    button.onclick = () => post(`/api/admin/voting/${button.dataset.voteAction}`, { sessionId: state.voting.session?.id });
  });
  app.querySelectorAll("[data-vote-seat]").forEach((seat) => {
    seat.onclick = () => {
      if (state.voting.session?.status !== "open") return showToast("Hlasování není otevřené.");
      const id = Number(seat.dataset.voteSeat);
      const next = nextVote(voteForDelegation(id));
      post("/api/admin/voting/cast", { delegationId: id, choice: next }, "Hlas uložen.");
    };
  });
  click("force-projection", () => post("/api/admin/voting/force-projection", {}));

  app.querySelectorAll("[data-layout-seat]").forEach((seat) => seat.onclick = () => moveSeat(Number(seat.dataset.layoutSeat)));
  app.querySelectorAll("[data-arrange]").forEach((button) => button.onclick = () => arrangeSeats(button.dataset.arrange));
  app.querySelectorAll("[data-code]").forEach((button) => button.onclick = () => post("/api/attendance/generate-code", { delegationId: Number(button.dataset.code) }));
  app.querySelectorAll("[data-checkin]").forEach((button) => button.onclick = () => checkIn(Number(button.dataset.checkin)));
  app.querySelectorAll("[data-checkout]").forEach((button) => button.onclick = () => post("/api/attendance/check-out", { delegationId: Number(button.dataset.checkout) }));
  app.querySelectorAll("[data-edit-delegation]").forEach((button) => button.onclick = () => editDelegation(Number(button.dataset.editDelegation)));

  const amendmentForm = app.querySelector("[data-form=amendment]");
  if (amendmentForm) amendmentForm.onsubmit = submitAmendment;
  const agendaForm = app.querySelector("[data-form=agenda]");
  if (agendaForm) agendaForm.onsubmit = submitAgenda;
  const settingsForm = app.querySelector("[data-form=settings]");
  if (settingsForm) settingsForm.onsubmit = submitSettings;
  app.querySelectorAll("[data-form=pin]").forEach((form) => form.onsubmit = submitPin);
  app.querySelectorAll("[data-delete-agenda]").forEach((button) => button.onclick = () => request(`/api/agenda/${button.dataset.deleteAgenda}`, { method: "DELETE" }));
  click("reset-live", () => confirm("Opravdu resetovat živá data?") && post("/api/settings/reset-live", {}));
  click("reset-all", () => {
    const text = prompt("Pro reset všeho napiš RESET ALL");
    if (text) post("/api/settings/reset-all", { confirm: text });
  });
}

async function submitAmendment(event) {
  event.preventDefault();
  const form = event.currentTarget;
  await post("/api/amendments", {
    type: form.type.value,
    targetPointId: form.targetPointId.value ? Number(form.targetPointId.value) : null,
    submitterName: form.submitterName.value,
    guarantorsText: form.guarantorsText.value,
    text: form.text.value
  });
}

async function submitAgenda(event) {
  event.preventDefault();
  const form = event.currentTarget;
  await post("/api/agenda", { title: form.title.value, type: form.type.value, note: form.note.value });
}

async function submitSettings(event) {
  event.preventDefault();
  const form = event.currentTarget;
  await post("/api/settings", {
    conference_name: form.conference_name.value,
    committee_name: form.committee_name.value,
    default_voting_time_sec: String(form.default_voting_time_sec.value || "60")
  });
}

async function submitPin(event) {
  event.preventDefault();
  const form = event.currentTarget;
  await post(`/api/settings/${form.dataset.pin}-pin`, { pin: form.pin.value });
  form.reset();
}

async function moveSeat(id) {
  const d = state.delegations.find((item) => item.id === id);
  if (!d) return;
  const seat = d.seat || defaultSeat(state.delegations.indexOf(d));
  const x = (Number(seat.x || 0) + 8) % 86;
  await post("/api/layout/seat", { delegationId: id, x, y: seat.y, w: seat.w, h: seat.h, rotation: seat.rotation || 0 });
}

async function arrangeSeats(kind) {
  const count = state.delegations.length;
  const updates = state.delegations.map((d, index) => {
    let seat;
    if (kind === "circle") {
      const angle = (2 * Math.PI * index / count) - Math.PI / 2;
      seat = { x: 50 + Math.cos(angle) * 38 - 5.5, y: 48 + Math.sin(angle) * 35 - 4.5, w: 11, h: 9, rotation: Math.round(angle * 180 / Math.PI + 90) };
    } else if (kind === "u") {
      const leftCount = Math.ceil(count * .34);
      const rightCount = Math.ceil(count * .34);
      const topCount = Math.max(0, count - leftCount - rightCount);
      if (index < leftCount) {
        const ratio = leftCount === 1 ? 0 : index / (leftCount - 1);
        seat = { x: 7, y: 18 + ratio * 66, w: 11, h: 8, rotation: 90 };
      } else if (index < leftCount + topCount) {
        const topIndex = index - leftCount;
        const ratio = topCount <= 1 ? .5 : topIndex / (topCount - 1);
        seat = { x: 17 + ratio * 66, y: 7, w: 11, h: 8, rotation: 0 };
      } else {
        const rightIndex = index - leftCount - topCount;
        const ratio = rightCount === 1 ? 0 : rightIndex / (rightCount - 1);
        seat = { x: 82, y: 18 + ratio * 66, w: 11, h: 8, rotation: -90 };
      }
    } else {
      seat = defaultSeat(index);
    }
    return api("/api/layout/seat", { method: "POST", body: { delegationId: d.id, ...seat } });
  });
  try {
    await Promise.all(updates);
    await load(false);
    showToast("Rozložení uloženo.");
  } catch (err) {
    showToast(err.message);
  }
}

async function editDelegation(id) {
  const d = state.delegations.find((item) => item.id === id);
  if (!d) return;
  const name = prompt("Název delegace", d.name);
  if (!name) return;
  const code = prompt("Zkratka", d.code) || d.code;
  const flag = prompt("Vlajka", d.flag) || d.flag;
  await request(`/api/delegations/${id}`, { method: "PUT", body: { ...d, name, code, flag } });
}

async function checkIn(id) {
  const d = state.delegations.find((item) => item.id === id);
  const name = prompt("Jméno účastníka", d?.participant?.name || "") || "";
  const email = prompt("E-mail účastníka", d?.participant?.email || "") || "";
  const coDelegateName = prompt("Jméno spoludelegáta", d?.participant?.coDelegateName || "") || "";
  const coDelegateEmail = prompt("E-mail spoludelegáta", d?.participant?.coDelegateEmail || "") || "";
  await post("/api/attendance/check-in", {
    delegationId: id,
    note: "",
    participant: { delegationId: id, name, email, coDelegateName, coDelegateEmail, note: "" }
  });
}

async function post(path, body, message = "Uloženo.") {
  await request(path, { method: "POST", body }, message);
}

async function request(path, options, message = "Uloženo.") {
  try {
    await api(path, options);
    await load(false);
    showToast(message);
  } catch (err) {
    showToast(err.message);
  }
}

function click(action, fn) {
  const element = app.querySelector(`[data-action="${action}"]`);
  if (element) element.onclick = fn;
}

function updateStatusLine() {
  const element = document.querySelector("#status");
  if (element) element.textContent = statusText();
}

function statusText() {
  return `SSE ${realtimeStatus} · ${new Date().toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`;
}

function defaultSeat(index) {
  const columns = 5;
  return { x: 5 + (index % columns) * 18, y: 7 + Math.floor(index / columns) * 14, w: 15, h: 9, rotation: 0 };
}

function resolutionOptions() {
  return (state.resolution.points || []).map((point) => `<option value="${point.id}">${point.number}. ${esc(shorten(point.text, 90))}</option>`).join("");
}

function option(value, label) {
  return `<option value="${value}">${label}</option>`;
}

function voteForDelegation(id) {
  return (state.voting.votes || []).find((vote) => vote.delegationId === id)?.choice || "";
}

function nextVote(current) {
  if (current === "for") return "against";
  if (current === "against") return "abstain";
  return "for";
}

function voteLabel(value) {
  if (value === "for") return "PRO";
  if (value === "against") return "PROTI";
  if (value === "abstain") return "ZDRŽUJE SE";
  return "NEHLASOVAL";
}

function statusLabel(value) {
  return ({
    submitted: "Nový",
    accepted: "Zařazený k projednání",
    introduced: "Představený",
    rejected: "Vyřazený",
    passed: "Přijatý",
    failed: "Nepřijatý",
    open: "Otevřeno",
    closed: "Ukončeno",
    saved: "Uloženo",
    cancelled: "Zrušeno"
  })[value] || value || "";
}

function typeLabel(value) {
  return ({ add: "Přidat bod", update: "Upravit bod", remove: "Odstranit bod" })[value] || value || "";
}

function amendmentClass(item) {
  if (item.status === "introduced") return "introduced";
  if (item.status === "accepted") return "approved";
  if (item.status === "rejected") return "rejected";
  return "new";
}

function flagName(d) {
  return `${esc(d?.flag || "")} ${esc(d?.code || "")} ${esc(d?.name || "")}`.trim();
}

function timeLabel(value) {
  if (!value) return "";
  return new Date(value).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" });
}

function shorten(text, max) {
  text = String(text || "");
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function showToast(message) {
  const toast = document.querySelector("#toast");
  if (!toast) return;
  toast.textContent = message || "";
  toast.classList.add("show");
  window.setTimeout(() => toast.classList.remove("show"), 2600);
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

import { api, events } from "./api.js";
import { acceptEvent } from "./state.js";

const app = document.querySelector("#app");
let state = null;
let panel = "dashboard";
let realtimeStatus = "odpojeno";
let closeEvents = null;
let speakerClickTimer = null;
let editingDelegationId = null;
let editingAgendaId = null;
let draggingLayout = null;
let manualVoteCursor = 0;

const panels = [
  ["dashboard", "Přehled"],
  ["amendments", "Pozměňovací návrhy"],
  ["layout", "Rozložení a prezence"],
  ["voting", "Hlasování"],
  ["agenda", "Agenda"],
  ["settings", "Nastavení"]
];

init();
window.addEventListener("pointermove", onLayoutDragMove);
window.addEventListener("pointerup", onLayoutDragEnd);
window.addEventListener("pointercancel", onLayoutDragEnd);
window.addEventListener("keydown", onVotingHotkey);

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
  state.debate = state.debate || {};
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
    ${renderDelegateEditor()}
    <div id="toast"></div>`;
  bindActions();
}

function renderPanel() {
  if (panel === "dashboard") return renderDashboardPanel();
  if (panel === "layout") return renderLayoutPanel();
  if (panel === "voting") return renderVotingPanel();
  if (panel === "agenda") return renderAgendaPanelV2();
  if (panel === "settings") return renderSettingsPanel();
  return renderAmendmentsPanel();
}

function renderDashboardPanel() {
  const present = state.delegations.filter((item) => item.present).length;
  const session = state.voting.session;
  return `
    <div class="dashboard-grid">
      <div class="card">
        <h2>Přehled jednání</h2>
        <div class="meta">
          <div><strong>Prezence</strong><br>${present}/${state.delegations.length} přítomno</div>
          <div><strong>Aktuální řečník</strong><br>${state.speakers.currentSpeaker ? flagName(state.speakers.currentSpeaker) : "Nikdo nemluví"}</div>
          <div><strong>Hlasování</strong><br>${session ? statusLabel(session.status) : "neprobíhá"}</div>
        </div>
      </div>
      ${renderAgendaOverview()}
    </div>
    ${renderSpeakerPanel()}
    ${renderBreakPanel()}
    ${renderDebatePanel()}
    <div class="card">
      <h2>Aktivní PN</h2>
      <div id="items">${renderAmendmentItems()}</div>
    </div>`;
}

function renderAgendaOverview() {
  return `
    <div class="card agenda-overview">
      <h2>Agenda</h2>
      ${state.agenda.length ? state.agenda.map((item) => `
        <div class="agenda-row">
          <div><strong>${esc(item.title)}</strong><br><span class="muted">${agendaTypeLabel(item.type)}${agendaTimeLabel(item) ? " · " + agendaTimeLabel(item) : ""}</span></div>
          <button class="save" data-panel="agenda">Upravit</button>
        </div>`).join("") : `<div class="empty">Agenda je zatím prázdná.</div>`}
    </div>`;
}

function renderAmendmentsPanel() {
  return `
    ${renderAgendaOverview()}
    ${renderSpeakerPanel()}
    ${renderBreakPanel()}
    ${renderDebatePanel()}
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
          <div class="reaction-slots">${renderReactionSlots()}</div>
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
      <div class="stage-wrap"><div class="stage speaker-stage">${renderChairMarker()}${renderSeats("speaker")}</div></div>
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

function renderReactionSlots() {
  const rows = state.speakers.reactions.length
    ? state.speakers.reactions
    : (state.speakers.activeReaction ? [{ delegation: state.speakers.activeReaction, id: 0, status: "active" }] : []);
  return [0, 1].map((index) => {
    const item = rows[index];
    if (!item) return `<div class="reaction-slot">Volná reakce</div>`;
    const active = item.status === "active";
    const finished = item.status === "finished";
    const label = active ? "Probíhá: " : finished ? "Dokončeno: " : "";
    const removeAttr = item.status === "waiting" ? ` data-remove-reaction="${item.id}"` : "";
    return `<div class="reaction-slot ${active ? "active" : ""} ${finished ? "finished" : ""}"${removeAttr}>${label}${flagName(item.delegation)}</div>`;
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

function renderDebatePanel() {
  const debate = state.debate || {};
  const session = debate.session;
  if (!session) return "";
  return `
    <div class="card debate-panel">
      <h2>Jednání o PN ${debate.amendment?.number || ""}</h2>
      <div class="meta">
        <div><strong>Fáze</strong><br>${debatePhaseLabel(session.phase)}</div>
        <div><strong>Předkladatel</strong><br>${debate.submitter ? flagName(debate.submitter) : (debate.amendment?.submitterName || "Předkladatel")}</div>
        <div><strong>Podporovatel</strong><br>${debate.supporter ? flagName(debate.supporter) : "nevybrán"}</div>
        <div><strong>Odpůrce</strong><br>${debate.opponent ? flagName(debate.opponent) : "nevybrán"}</div>
      </div>
      <p>${esc(debate.amendment?.text || "")}</p>
      ${(session.phase === "select_supporter" || session.phase === "select_opponent") ? `
        <div class="debate-select-grid">
          ${state.delegations.filter((item) => item.present).map((delegation) => `<button class="save" data-debate-select="${delegation.id}">${flagName(delegation)}</button>`).join("")}
        </div>` : ""}
      <div class="actions">
        <button class="save" data-action="debate-next">Další krok</button>
        ${session.phase === "ready_to_vote" && debate.amendment ? `<button class="vote-button" data-start-voting="${debate.amendment.id}">Spustit hlasování</button>` : ""}
        <button class="reject" data-action="debate-cancel">Zrušit jednání</button>
      </div>
    </div>`;
}

function renderAmendmentItems() {
  const active = state.amendments.filter((item) => item.status !== "passed" && item.status !== "failed");
  if (!active.length) {
    return `<div class="empty">V aktivním seznamu teď nejsou žádné PN. Odhlasované PN zůstávají uložené v databázi.</div>`;
  }
  return active.map((item) => {
    const ready = item.status === "introduced";
    const canVote = canStartVotingFor(item);
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
          ${item.status === "submitted" ? `<button class="approve" data-accept="${item.id}">Zapracovat do dokumentu</button>` : ""}
          ${item.status === "accepted" || item.status === "introduced" ? `<button class="present" data-introduce="${item.id}">Označit jako představený</button>` : ""}
          <button class="reject" data-reject="${item.id}">Vyřadit</button>
          <button class="save" data-debate="${item.id}" ${ready ? "" : "disabled"}>Zahájit jednání</button>
          <button class="vote-button" data-start-voting="${item.id}" ${canVote ? "" : "disabled"}>Hlasovat o PN</button>
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
      <p>Stoly přesuneš tažením přímo ve schématu. Prezenci, kódy a osobní údaje spravuje tabulka pod rozložením.</p>
      <div class="actions">
        <button class="save" data-arrange="circle">Rozložit do kruhu</button>
        <button class="save" data-arrange="u">Rozložit do obráceného U</button>
      </div>
      <div class="vote-summary"><strong>Prezenční listina</strong><br>Přítomno: ${present}<br>Nepřítomno: ${absent}</div>
    </div>
    <div class="stage-wrap"><div class="stage">${renderChairMarker()}${renderSeats("layout")}</div></div>
    <div class="card">
      <h2>Prezenční listina a přístupové kódy</h2>
      ${renderAttendanceTable()}
    </div>`;
}

function renderVotingPanel() {
  const session = state.voting.session;
  const secretMode = isSecretVotingMode();
  return `
    <div class="card voting-current">
      <h2>Hlasování o PN</h2>
      ${session ? renderSessionInfo(session) : `<div class="empty">Není spuštěné žádné hlasování.</div>`}
      <div class="voting-status"><strong>Režim:</strong> ${secretMode ? "jednoduché / tajné hlasování" : "veřejné hlasování se schématem"}<br>Klávesy předsedajícího: Q = pro, P = proti, mezerník = zdržuje se. Hlas se zapíše další přítomné delegaci v pořadí.</div>
      <div class="vote-summary">${renderVoteSummary()}</div>
      <div class="actions">
        <button class="approve" data-vote-action="close" ${session?.status === "open" ? "" : "disabled"}>Ukončit hlasování</button>
        <button class="save" data-vote-action="reopen" ${session?.status === "closed" ? "" : "disabled"}>Obnovit hlasování</button>
        <button class="approve" data-vote-action="save" ${session?.status === "closed" ? "" : "disabled"}>Uložit výsledek</button>
        <button class="present" data-optical="for" ${session ? "" : "disabled"}>Optická většina PRO</button>
        <button class="reject" data-optical="against" ${session ? "" : "disabled"}>Optická většina PROTI</button>
        <button class="reject" data-vote-action="cancel" ${session ? "" : "disabled"}>Zrušit hlasování</button>
        <button class="save" data-action="force-projection">Vynutit aktualizaci projekce</button>
      </div>
    </div>
    <div class="stage-wrap"><div class="stage">${renderChairMarker()}${renderSeats("voting")}</div></div>
    <div class="card">
      <h2>Spustit hlasování o PN</h2>
      ${state.amendments.length ? state.amendments.map((item) => `<div class="item"><b>PN ${item.number}</b> <span class="badge">${statusLabel(item.status)}</span><p>${esc(item.text)}</p><button class="vote-button" data-start-voting="${item.id}" ${canStartVotingFor(item) ? "" : "disabled"}>Hlasovat</button></div>`).join("") : `<div class="empty">Zatím nejsou žádné PN.</div>`}
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

function renderAgendaPanelV2() {
  const item = editingAgendaId ? state.agenda.find((row) => row.id === editingAgendaId) : null;
  return `
    <form class="card" data-form="agenda">
      <h2>${item ? "Upravit bod agendy" : "Nový bod agendy"}</h2>
      <div class="meta compact">
        <div><strong>Název</strong><input name="title" value="${esc(item?.title || "")}" placeholder="Název bodu" required></div>
        <div><strong>Typ</strong><select name="type">${agendaTypeOptions(item?.type || "session")}</select></div>
        <div><strong>Začátek</strong><input name="startsAt" type="datetime-local" value="${dateTimeLocalValue(item?.startsAt)}"></div>
        <div><strong>Konec</strong><input name="endsAt" type="datetime-local" value="${dateTimeLocalValue(item?.endsAt)}"></div>
        <div><strong>Délka v minutách</strong><input name="durationMinutes" type="number" min="1" value="${esc(item?.durationMinutes || "")}" placeholder="např. 20"></div>
        <div><strong>Pořadí</strong><input name="displayOrder" type="number" min="0" value="${esc(item?.displayOrder || "")}"></div>
      </div>
      <textarea name="note" placeholder="Poznámka">${esc(item?.note || "")}</textarea>
      <div class="actions">
        <button class="approve">${item ? "Uložit změny" : "Přidat bod"}</button>
        ${item ? `<button type="button" class="save" data-cancel-agenda-edit>Zrušit úpravy</button>` : ""}
      </div>
    </form>
    <div class="card">
      <h2>Bodový program</h2>
      ${state.agenda.length ? state.agenda.map((row) => `
        <div class="item agenda-item">
          <div>
            <b>${esc(row.title)}</b><br>
            <span class="muted">${agendaTypeLabel(row.type)}${agendaTimeLabel(row) ? " · " + agendaTimeLabel(row) : ""}</span>
            ${row.note ? `<p>${esc(row.note)}</p>` : ""}
          </div>
          <div class="actions">
            <button class="save" data-edit-agenda="${row.id}">Upravit</button>
            <button class="reject" data-delete-agenda="${row.id}">Smazat</button>
          </div>
        </div>`).join("") : `<div class="empty">Agenda je prázdná.</div>`}
    </div>`;
}

function renderSettingsPanel() {
  const values = state.settings.values || {};
  const votingMode = values.voting_mode || "public";
  return `
    <form class="card" data-form="settings">
      <h2>Nastavení administrátora</h2>
      <div class="meta compact">
        <div><strong>Název summitu</strong><input name="conference_name" value="${esc(values.conference_name || "")}"></div>
        <div><strong>Výbor</strong><input name="committee_name" value="${esc(values.committee_name || "")}"></div>
        <div><strong>Čas hlasování v sekundách</strong><input name="default_voting_time_sec" type="number" min="1" value="${esc(values.default_voting_time_sec || "60")}"></div>
        <div><strong>Režim hlasování</strong><select name="voting_mode">${option("public", "Veřejné se schématem", votingMode)}${option("secret", "Jednoduché / tajné bez schématu", votingMode)}</select></div>
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

function renderDelegateEditor() {
  if (!editingDelegationId) return "";
  const delegation = state.attendance.delegations.find((item) => item.id === editingDelegationId) || state.delegations.find((item) => item.id === editingDelegationId);
  if (!delegation) return "";
  const participant = delegation.participant || {};
  return `
    <div class="modal-backdrop" role="dialog" aria-modal="true">
      <form class="modal-card delegate-editor" data-form="delegate-details">
        <div class="modal-head">
          <div>
            <h2>${esc(delegation.flag || "")} ${esc(delegation.name || "")}</h2>
            <p>Osobní údaje delegace, kódy a prezence.</p>
          </div>
          <button type="button" class="save icon-button" data-close-delegate-editor>×</button>
        </div>
        <div class="details-grid">
          <label>Název delegace<input name="name" value="${esc(delegation.name || "")}"></label>
          <label>Zkratka<input name="code" value="${esc(delegation.code || "")}"></label>
          <label>Vlajka<input name="flag" value="${esc(delegation.flag || "")}"></label>
          <label>4místný kód<input name="accessCode" value="${esc(delegation.accessCode || "")}" readonly></label>
          <label>Jméno účastníka<input name="participantName" value="${esc(participant.name || "")}"></label>
          <label>E-mail účastníka<input name="participantEmail" value="${esc(participant.email || "")}"></label>
          <label>Jméno spoludelegáta<input name="coDelegateName" value="${esc(participant.coDelegateName || "")}"></label>
          <label>E-mail spoludelegáta<input name="coDelegateEmail" value="${esc(participant.coDelegateEmail || "")}"></label>
        </div>
        <label class="full-label">Poznámka<textarea name="note">${esc(participant.note || "")}</textarea></label>
        <div class="actions">
          <button class="approve">Uložit údaje</button>
          <button type="button" class="present" data-editor-checkin="${delegation.id}">Označit přítomno</button>
          <button type="button" class="reject" data-editor-checkout="${delegation.id}">Označit nepřítomno</button>
          <button type="button" class="save" data-editor-code="${delegation.id}">Vygenerovat kód</button>
        </div>
      </form>
    </div>`;
}

function renderSeats(mode) {
  return state.delegations.map((d, index) => {
    const seat = d.seat || defaultSeat(index);
    const vote = voteForDelegation(d.id);
    const classes = ["seat"];
    let label = "";
    let data = "";
    let tools = "";
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
      tools = `
        <div class="seat-tools">
          <button type="button" class="seat-tool" title="Upravit delegaci" data-seat-tool data-edit-delegation="${d.id}">✎</button>
          <button type="button" class="seat-tool" title="Otočit doleva" data-seat-tool data-seat-rotate="${d.id}" data-delta="-15">↺</button>
          <button type="button" class="seat-tool" title="Otočit doprava" data-seat-tool data-seat-rotate="${d.id}" data-delta="15">↻</button>
          <button type="button" class="seat-tool" title="Zmenšit" data-seat-tool data-seat-resize="${d.id}" data-delta="-1">−</button>
          <button type="button" class="seat-tool" title="Zvětšit" data-seat-tool data-seat-resize="${d.id}" data-delta="1">+</button>
        </div>`;
    }
    return `
      <div class="${classes.join(" ")}" ${data} style="left:${seat.x}%;top:${seat.y}%;width:${seat.w}%;height:${seat.h}%;transform:rotate(${seat.rotation || 0}deg);">
        ${tools}
        <div class="seat-inner" style="transform:rotate(${-(seat.rotation || 0)}deg);">
          <div class="seat-flag">${esc(d.flag || "")}</div>
          <div class="seat-code">${esc(d.code || "")}</div>
          <div class="seat-name">${esc(d.name || "")}</div>
          ${label}
        </div>
      </div>`;
  }).join("");
}

function renderChairMarker() {
  return `
    <div class="chair-marker" aria-label="Předsedající">
      <div class="chair-label">PŘEDSEDNICTVO</div>
      <div class="chair-desk">CHAIR</div>
    </div>`;
}

function isSecretVotingMode() {
  return (state?.settings?.values?.voting_mode || "public") === "secret";
}

function canStartVotingFor(item) {
  return item?.status === "introduced" &&
    state?.debate?.session?.phase === "ready_to_vote" &&
    Number(state?.debate?.amendment?.id || 0) === Number(item.id || 0);
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

  app.querySelectorAll("[data-accept]").forEach((button) => button.onclick = () => post(`/api/amendments/${button.dataset.accept}/accept`, {}, "PN zapracován do dokumentu."));
  app.querySelectorAll("[data-introduce]").forEach((button) => button.onclick = () => post(`/api/amendments/${button.dataset.introduce}/introduce`, {}));
  app.querySelectorAll("[data-reject]").forEach((button) => button.onclick = () => post(`/api/amendments/${button.dataset.reject}/reject`, {}));
  app.querySelectorAll("[data-debate]").forEach((button) => button.onclick = () => post(`/api/amendments/${button.dataset.debate}/debate`, {}));
  app.querySelectorAll("[data-start-voting]").forEach((button) => button.onclick = () => post("/api/admin/voting/start", { amendmentId: Number(button.dataset.startVoting) }, "Hlasování spuštěno."));
  app.querySelectorAll("[data-debate-select]").forEach((button) => button.onclick = () => post("/api/debate/select", { delegationId: Number(button.dataset.debateSelect) }, "Výběr uložen."));
  click("debate-next", () => post("/api/debate/next", {}, "Jednání posunuto."));
  click("debate-cancel", () => post("/api/debate/cancel", {}, "Jednání zrušeno."));

  app.querySelectorAll("[data-vote-action]").forEach((button) => {
    button.onclick = () => post(`/api/admin/voting/${button.dataset.voteAction}`, { sessionId: state.voting.session?.id });
  });
  app.querySelectorAll("[data-optical]").forEach((button) => {
    button.onclick = () => post("/api/admin/voting/optical", { sessionId: state.voting.session?.id, result: button.dataset.optical }, "Optická většina uložena.");
  });
  app.querySelectorAll("[data-vote-seat]").forEach((seat) => {
    seat.onclick = () => {
      if (!["open", "closed"].includes(state.voting.session?.status)) return showToast("Hlasování není aktivní.");
      const id = Number(seat.dataset.voteSeat);
      const next = nextVote(voteForDelegation(id));
      post("/api/admin/voting/cast", { delegationId: id, choice: next }, "Hlas uložen.");
    };
  });
  click("force-projection", () => post("/api/admin/voting/force-projection", {}));

  app.querySelectorAll("[data-layout-seat]").forEach((seat) => {
    seat.onpointerdown = startLayoutDrag;
  });
  app.querySelectorAll("[data-seat-tool]").forEach((button) => {
    button.onpointerdown = (event) => event.stopPropagation();
  });
  app.querySelectorAll("[data-seat-rotate]").forEach((button) => {
    button.onclick = (event) => {
      event.stopPropagation();
      rotateLayoutSeat(Number(button.dataset.seatRotate), Number(button.dataset.delta || 0));
    };
  });
  app.querySelectorAll("[data-seat-resize]").forEach((button) => {
    button.onclick = (event) => {
      event.stopPropagation();
      resizeLayoutSeat(Number(button.dataset.seatResize), Number(button.dataset.delta || 0));
    };
  });
  app.querySelectorAll("[data-arrange]").forEach((button) => button.onclick = () => arrangeSeats(button.dataset.arrange));
  app.querySelectorAll("[data-code]").forEach((button) => button.onclick = () => post("/api/attendance/generate-code", { delegationId: Number(button.dataset.code) }));
  app.querySelectorAll("[data-checkin]").forEach((button) => button.onclick = () => checkIn(Number(button.dataset.checkin)));
  app.querySelectorAll("[data-checkout]").forEach((button) => button.onclick = () => post("/api/attendance/check-out", { delegationId: Number(button.dataset.checkout) }));
  app.querySelectorAll("[data-edit-delegation]").forEach((button) => button.onclick = () => { editingDelegationId = Number(button.dataset.editDelegation); render(); });
  const closeDelegate = app.querySelector("[data-close-delegate-editor]");
  if (closeDelegate) closeDelegate.onclick = () => { editingDelegationId = null; render(); };
  const delegateForm = app.querySelector("[data-form=delegate-details]");
  if (delegateForm) delegateForm.onsubmit = submitDelegateDetails;
  app.querySelectorAll("[data-editor-code]").forEach((button) => button.onclick = () => post("/api/attendance/generate-code", { delegationId: Number(button.dataset.editorCode) }));
  app.querySelectorAll("[data-editor-checkin]").forEach((button) => button.onclick = () => saveDelegateDetails(true));
  app.querySelectorAll("[data-editor-checkout]").forEach((button) => button.onclick = () => post("/api/attendance/check-out", { delegationId: Number(button.dataset.editorCheckout) }));

  const amendmentForm = app.querySelector("[data-form=amendment]");
  if (amendmentForm) amendmentForm.onsubmit = submitAmendment;
  const agendaForm = app.querySelector("[data-form=agenda]");
  if (agendaForm) agendaForm.onsubmit = submitAgenda;
  const cancelAgendaEdit = app.querySelector("[data-cancel-agenda-edit]");
  if (cancelAgendaEdit) cancelAgendaEdit.onclick = () => { editingAgendaId = null; render(); };
  const settingsForm = app.querySelector("[data-form=settings]");
  if (settingsForm) settingsForm.onsubmit = submitSettings;
  app.querySelectorAll("[data-form=pin]").forEach((form) => form.onsubmit = submitPin);
  app.querySelectorAll("[data-delete-agenda]").forEach((button) => button.onclick = () => request(`/api/agenda/${button.dataset.deleteAgenda}`, { method: "DELETE" }));
  app.querySelectorAll("[data-edit-agenda]").forEach((button) => button.onclick = () => { editingAgendaId = Number(button.dataset.editAgenda); panel = "agenda"; render(); });
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
  const body = agendaFormBody(form);
  if (editingAgendaId) {
    const id = editingAgendaId;
    body.id = id;
    editingAgendaId = null;
    await request(`/api/agenda/${id}`, { method: "PUT", body }, "Agenda uložena.");
    return;
  }
  await post("/api/agenda", body, "Agenda uložena.");
}

async function submitSettings(event) {
  event.preventDefault();
  const form = event.currentTarget;
  await post("/api/settings", {
    conference_name: form.conference_name.value,
    committee_name: form.committee_name.value,
    default_voting_time_sec: String(form.default_voting_time_sec.value || "60"),
    voting_mode: form.voting_mode.value
  });
}

async function submitPin(event) {
  event.preventDefault();
  const form = event.currentTarget;
  await post(`/api/settings/${form.dataset.pin}-pin`, { pin: form.pin.value });
  form.reset();
}

async function submitDelegateDetails(event) {
  event.preventDefault();
  await saveDelegateDetails(false);
}

async function saveDelegateDetails(markPresent) {
  const form = app.querySelector("[data-form=delegate-details]");
  if (!form || !editingDelegationId) return;
  const existing = state.attendance.delegations.find((item) => item.id === editingDelegationId) || state.delegations.find((item) => item.id === editingDelegationId);
  const delegation = { ...existing, name: form.name.value.trim(), code: form.code.value.trim(), flag: form.flag.value.trim() };
  const participant = {
    delegationId: editingDelegationId,
    name: form.participantName.value.trim(),
    email: form.participantEmail.value.trim(),
    coDelegateName: form.coDelegateName.value.trim(),
    coDelegateEmail: form.coDelegateEmail.value.trim(),
    note: form.note.value.trim()
  };
  try {
    await api(`/api/delegations/${editingDelegationId}`, { method: "PUT", body: delegation });
    if (markPresent) {
      await api("/api/attendance/check-in", { method: "POST", body: { delegationId: editingDelegationId, participant, note: participant.note } });
    } else {
      await api("/api/attendance/participant", { method: "POST", body: participant });
    }
    await load(false);
    showToast(markPresent ? "Údaje uloženy a delegace je přítomná." : "Údaje delegace uloženy.");
  } catch (err) {
    showToast(err.message);
  }
}

function agendaFormBody(form) {
  const startsAt = localDateTimeToISO(form.startsAt.value);
  const endsAt = localDateTimeToISO(form.endsAt.value);
  const durationMinutes = form.durationMinutes.value ? Number(form.durationMinutes.value) : null;
  return {
    title: form.title.value,
    type: form.type.value,
    startsAt,
    endsAt,
    durationMinutes,
    note: form.note.value,
    displayOrder: form.displayOrder.value ? Number(form.displayOrder.value) : 0
  };
}

function localDateTimeToISO(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function moveSeat(id) {
  const d = state.delegations.find((item) => item.id === id);
  if (!d) return;
  const seat = d.seat || defaultSeat(state.delegations.indexOf(d));
  const x = (Number(seat.x || 0) + 8) % 86;
  await post("/api/layout/seat", { delegationId: id, x, y: seat.y, w: seat.w, h: seat.h, rotation: seat.rotation || 0 });
}

function startLayoutDrag(event) {
  if (panel !== "layout") return;
  if (event.target.closest("[data-seat-tool]")) return;
  const id = Number(event.currentTarget.dataset.layoutSeat);
  const delegation = state.delegations.find((item) => item.id === id);
  if (!delegation) return;
  event.preventDefault();
  const stage = event.currentTarget.closest(".stage");
  const rect = stage.getBoundingClientRect();
  const seat = ensureLayoutSeat(delegation);
  draggingLayout = {
    id,
    element: event.currentTarget,
    rect,
    offsetX: event.clientX - (rect.left + rect.width * seat.x / 100),
    offsetY: event.clientY - (rect.top + rect.height * seat.y / 100),
    moved: false
  };
  event.currentTarget.setPointerCapture?.(event.pointerId);
}

function onLayoutDragMove(event) {
  if (!draggingLayout) return;
  const delegation = state.delegations.find((item) => item.id === draggingLayout.id);
  if (!delegation || !delegation.seat) return;
  const seat = delegation.seat;
  const x = ((event.clientX - draggingLayout.offsetX - draggingLayout.rect.left) / draggingLayout.rect.width) * 100;
  const y = ((event.clientY - draggingLayout.offsetY - draggingLayout.rect.top) / draggingLayout.rect.height) * 100;
  seat.x = clamp(x, 0, 100 - Number(seat.w || 10));
  seat.y = clamp(y, 0, 100 - Number(seat.h || 10));
  draggingLayout.element.style.left = `${seat.x}%`;
  draggingLayout.element.style.top = `${seat.y}%`;
  draggingLayout.moved = true;
}

function onLayoutDragEnd() {
  if (!draggingLayout) return;
  const id = draggingLayout.id;
  const moved = draggingLayout.moved;
  draggingLayout = null;
  if (moved) saveLayoutSeat(id);
}

async function saveLayoutSeat(id) {
  const delegation = state.delegations.find((item) => item.id === id);
  if (!delegation || !delegation.seat) return;
  const seat = delegation.seat;
  await post("/api/layout/seat", {
    delegationId: id,
    x: seat.x,
    y: seat.y,
    w: seat.w,
    h: seat.h,
    rotation: seat.rotation || 0
  }, "Rozložení uloženo.");
}

function ensureLayoutSeat(delegation) {
  if (!delegation.seat) {
    delegation.seat = { ...defaultSeat(state.delegations.indexOf(delegation)) };
  } else {
    delegation.seat = { ...delegation.seat };
  }
  return delegation.seat;
}

async function rotateLayoutSeat(id, delta) {
  const delegation = state.delegations.find((item) => item.id === id);
  if (!delegation) return;
  const seat = ensureLayoutSeat(delegation);
  seat.rotation = ((Number(seat.rotation || 0) + delta + 180) % 360) - 180;
  await saveLayoutSeat(id);
}

async function resizeLayoutSeat(id, delta) {
  const delegation = state.delegations.find((item) => item.id === id);
  if (!delegation) return;
  const seat = ensureLayoutSeat(delegation);
  seat.w = clamp(Number(seat.w || 15) + delta, 7, 28);
  seat.h = clamp(Number(seat.h || 9) + delta * 0.55, 4, 18);
  seat.x = clamp(Number(seat.x || 0), 0, 100 - seat.w);
  seat.y = clamp(Number(seat.y || 0), 0, 100 - seat.h);
  await saveLayoutSeat(id);
}

async function arrangeSeats(kind) {
  const count = state.delegations.length;
  const updates = state.delegations.map((d, index) => {
    let seat;
    if (kind === "circle") {
      const angle = (2 * Math.PI * index / count) - Math.PI / 2;
      const seatW = clamp(230 / Math.max(count, 1), 7, 10.4);
      const seatH = clamp(seatW * 0.64, 4.6, 6.8);
      seat = { x: 50 + Math.cos(angle) * 39 - seatW / 2, y: 51 + Math.sin(angle) * 35 - seatH / 2, w: seatW, h: seatH, rotation: Math.round(angle * 180 / Math.PI + 90) };
    } else if (kind === "u") {
      const leftCount = Math.ceil(count * 0.34);
      const rightCount = Math.ceil(count * 0.34);
      const topCount = Math.max(0, count - leftCount - rightCount);
      const topStep = 68 / Math.max(topCount - 1, 1);
      const sideStep = 66 / Math.max(Math.max(leftCount, rightCount) - 1, 1);
      const seatW = clamp(Math.min(topStep * 0.72, sideStep * 1.1), 7, 10);
      const seatH = clamp(Math.min(sideStep * 0.72, seatW * 0.64), 4.6, 6.8);
      if (index < leftCount) {
        const ratio = leftCount === 1 ? 0 : index / (leftCount - 1);
        seat = { x: 7, y: 20 + ratio * 66, w: seatW, h: seatH, rotation: 90 };
      } else if (index < leftCount + topCount) {
        const topIndex = index - leftCount;
        const ratio = topCount <= 1 ? .5 : topIndex / (topCount - 1);
        seat = { x: 16 + ratio * 68, y: 9, w: seatW, h: seatH, rotation: 0 };
      } else {
        const rightIndex = index - leftCount - topCount;
        const ratio = rightCount === 1 ? 0 : rightIndex / (rightCount - 1);
        seat = { x: 93 - seatW, y: 20 + ratio * 66, w: seatW, h: seatH, rotation: -90 };
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

function option(value, label, selected) {
  return `<option value="${value}" ${selected === value ? "selected" : ""}>${label}</option>`;
}

function agendaTypeOptions(selected) {
  return [
    ["session", "Jednání"],
    ["break", "Přestávka"],
    ["caucus", "Caucus"],
    ["voting", "Hlasování"],
    ["organizational", "Organizační"],
    ["other", "Jiné"]
  ].map(([value, label]) => `<option value="${value}" ${selected === value ? "selected" : ""}>${label}</option>`).join("");
}

function agendaTypeLabel(value) {
  return ({
    session: "Jednání",
    break: "Přestávka",
    caucus: "Caucus",
    voting: "Hlasování",
    organizational: "Organizační",
    other: "Jiné"
  })[value] || value || "";
}

function agendaTimeLabel(item) {
  const parts = [];
  if (item.startsAt) parts.push(dateTimeLabel(item.startsAt));
  if (item.endsAt) parts.push(`do ${dateTimeLabel(item.endsAt)}`);
  if (item.durationMinutes) parts.push(`${item.durationMinutes} min`);
  return parts.join(" ");
}

function dateTimeLabel(value) {
  if (!value) return "";
  return new Date(value).toLocaleString("cs-CZ", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function dateTimeLocalValue(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function voteForDelegation(id) {
  return (state.voting.votes || []).find((vote) => vote.delegationId === id)?.choice || "";
}

function nextVote(current) {
  if (current === "for") return "against";
  if (current === "against") return "abstain";
  return "for";
}

function onVotingHotkey(event) {
  if (panel !== "voting" || !state?.voting?.session) return;
  if (!["open", "closed"].includes(state.voting.session.status)) return;
  if (event.target && ["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName)) return;

  let choice = "";
  if (event.key.toLowerCase() === "q") choice = "for";
  if (event.key.toLowerCase() === "p") choice = "against";
  if (event.code === "Space") choice = "abstain";
  if (!choice) return;

  const presentDelegations = state.delegations.filter((delegation) => delegation.present);
  if (!presentDelegations.length) return;
  event.preventDefault();
  const delegation = presentDelegations[manualVoteCursor % presentDelegations.length];
  manualVoteCursor++;
  post("/api/admin/voting/cast", { delegationId: delegation.id, choice }, `${flagName(delegation)}: ${voteLabel(choice)}`);
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

function debatePhaseLabel(value) {
  return ({
    submitter_reading: "Předkladatel čte návrh",
    select_supporter: "Výběr podporovatele",
    select_opponent: "Výběr odpůrce",
    supporter_speaking: "Mluví podporovatel",
    opponent_speaking: "Mluví odpůrce",
    ready_to_vote: "Připraveno k hlasování"
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

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
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

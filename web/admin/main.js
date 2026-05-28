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
let editingAmendmentId = null;
let draggingLayout = null;
let draggingChair = null;
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
    if (await load()) connectRealtime();
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
    return true;
  } catch (err) {
    if (isUnauthorizedError(err)) {
      if (showErrors) showToast(err.message);
      state = null;
      renderLogin(err.message);
      return false;
    }
    if (showErrors || state) showToast(err.message);
    if (!state) renderLogin(err.message);
    return false;
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
        <input name="pin" type="password" autocomplete="current-password" placeholder="např. summit-admin-2026" autofocus>
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
      if (await load()) connectRealtime();
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
      <p>PN se nejdřív zapracuje a představí. Tlačítko Zahájit hlasování potom provede čtení návrhu, podporovatele, odpůrce a samotné hlasování.</p>
    </div>
    <div class="wrap">
      <div class="status-line">
        <button class="reload" data-reload>Načíst znovu</button>
        ${panels.map(([id, label]) => `<button class="reload ${panel === id ? "active" : ""}" data-panel="${id}">${label}</button>`).join("")}
        <button class="reload" data-open-screen>Otevřít obrazovku</button>
        <button class="save" data-action="logout">Odhlásit</button>
        ${renderTopBreakControls()}
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

function renderTopBreakControls() {
  const active = state.break;
  return `
    <div class="top-break-controls" aria-label="Ovládání přestávky">
      <span>Přestávka</span>
      <input id="breakMinutes" type="number" min="1" max="180" value="5" title="Minuty">
      <button class="caucus-button" data-break-start="caucus">Kuloár</button>
      <button class="coffee-button" data-break-start="coffee_break">Káva</button>
      <button class="save" data-action="end-break">Stop</button>
      <strong class="top-break-status ${active ? "active" : ""}">${active ? `${esc(active.title)} běží, končí ${timeLabel(active.endsAt)}.` : "neběží"}</strong>
    </div>`;
}

function renderDashboardPanel() {
  const present = state.delegations.filter((item) => item.present).length;
  const session = state.voting.session;
  const breakStatus = state.break
    ? `${state.break.title} běží, končí ${timeLabel(state.break.endsAt)}.`
    : "Žádná přestávka ani kuloární jednání právě neběží.";
  return `
    <div class="dashboard-strip">
      <div><strong>Prezence</strong><span>${present}/${state.delegations.length}</span></div>
      <div><strong>Řečník</strong><span>${state.speakers.currentSpeaker ? flagName(state.speakers.currentSpeaker) : "Nikdo"}</span></div>
      <div><strong>Hlasování</strong><span>${session ? statusLabel(session.status) : "neprobíhá"}</span></div>
      <div><strong>Přestávka / kuloární jednání</strong><span>${esc(breakStatus)}</span></div>
    </div>
    <div class="dashboard-grid compact-dashboard">
      ${renderSpeakerPanel("compact")}
      ${renderAgendaOverview()}
      ${renderDebatePanel()}
    </div>
    <div class="card compact-card">
      <h2>Aktivní PN</h2>
      <div id="items">${renderAmendmentItems()}</div>
    </div>`;
}

function renderAgendaOverview() {
  const totalMinutes = state.agenda.reduce((sum, item) => sum + Number(item.durationMinutes || agendaDurationFromTimes(item) || 0), 0);
  return `
    <div class="card agenda-overview">
      <div class="section-head">
        <h2>Agenda</h2>
        <button class="save" data-panel="agenda">Upravit</button>
      </div>
      ${state.agenda.length ? `
        <div class="agenda-summary"><strong>${state.agenda.length}</strong> bodů · <strong>${totalMinutes || "?"}</strong> min</div>
        <div class="agenda-timeline">
          ${state.agenda.map((item) => renderAgendaTimelineItem(item)).join("")}
        </div>` : `<div class="empty">Agenda je zatím prázdná.</div>`}
    </div>`;
}

function renderAgendaTimelineItem(item) {
  const duration = Number(item.durationMinutes || agendaDurationFromTimes(item) || 0);
  return `
    <div class="agenda-timeline-item agenda-${esc(item.type || "other")}">
      <div class="agenda-dot" aria-hidden="true"></div>
      <div class="agenda-time">${agendaStartLabel(item) || "bez času"}</div>
      <div class="agenda-copy">
        <strong>${esc(item.title)}</strong>
        <small>${agendaTypeLabel(item.type)}${duration ? ` · ${duration} min` : ""}</small>
      </div>
    </div>`;
}

function renderAmendmentsPanel() {
  return `
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

function renderSpeakerPanel(mode = "full") {
  const current = state.speakers.currentSpeaker;
  const compact = mode === "compact";
  return `
    <div class="card speaker-panel ${compact ? "compact-card" : ""}">
      <h2>Pořadník řečníků</h2>
      ${compact ? "" : "<p>Kliknutím na stát ho přidáš do pořadníku. Dvojklikem ho přidáš jako reakci na aktuální projev.</p>"}
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
      <div class="stage-wrap"><div class="stage speaker-stage ${compact ? "compact-stage" : ""}">${renderChairMarker()}${renderSeats("speaker")}</div></div>
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

function renderBreakPanel(mode = "full") {
  const active = state.break;
  const compact = mode === "compact";
  return `
    <div class="card break-panel ${compact ? "compact-card" : ""}">
      <h2>Přestávka / kuloární jednání</h2>
      ${compact ? "" : "<p>Ovládání přestávky je v horní liště. Na projekci se zobrazí velká obrazovka s odpočtem.</p>"}
      <div class="break-status ${active ? "" : "inactive"}">${active ? `${esc(active.title)} běží, končí ${timeLabel(active.endsAt)}.` : "Žádná přestávka ani kuloární jednání právě neběží."}</div>
    </div>`;
}

function renderDebatePanel(options = {}) {
  const debate = state.debate || {};
  const session = debate.session;
  const includeStage = options.includeStage !== false;
  if (!session) return "";
  return `
    <div class="card debate-panel">
      <h2>Hlasování o PN ${debate.amendment?.number || ""}</h2>
      <div class="meta">
        <div><strong>Fáze</strong><br>${debatePhaseLabel(session.phase)}</div>
        <div><strong>Předkladatel</strong><br>${debate.submitter ? flagName(debate.submitter) : (debate.amendment?.submitterName || "Předkladatel")}</div>
        <div><strong>Podporovatel</strong><br>${debate.supporter ? flagName(debate.supporter) : "nevybrán"}</div>
        <div><strong>Odpůrce</strong><br>${debate.opponent ? flagName(debate.opponent) : "nevybrán"}</div>
      </div>
      <p>${esc(debate.amendment?.text || "")}</p>
      <div class="voting-status">${debateInstruction(session.phase)}</div>
      ${includeStage ? `<div class="stage-wrap"><div class="stage debate-stage compact-stage">${renderChairMarker()}${renderSeats("debate")}</div></div>` : ""}
      <div class="actions">
        <button class="save" data-action="debate-next">Další krok</button>
        ${session.phase === "ready_to_vote" && debate.amendment ? `<button class="vote-button" data-start-voting="${debate.amendment.id}">Spustit hlasování</button>` : ""}
        <button class="reject" data-action="debate-cancel">Zrušit hlasování</button>
      </div>
    </div>`;
}

function renderAmendmentItems() {
  const active = state.amendments.filter((item) => item.status !== "passed" && item.status !== "failed");
  if (!active.length) {
    return `<div class="empty">V aktivním seznamu teď nejsou žádné PN. Odhlasované PN zůstávají uložené v databázi.</div>`;
  }
  return active.map((item) => {
    if (Number(editingAmendmentId || 0) === Number(item.id)) return renderAmendmentEditForm(item);
    const ready = item.status === "introduced";
    const canStartProcess = canStartVotingProcessFor(item);
    const processLabel = canStartVotingFor(item) ? "Spustit hlasování" : "Zahájit hlasování";
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
          <button class="save" data-edit-amendment="${item.id}">Upravit PN</button>
          ${item.status === "submitted" ? `<button class="approve" data-accept="${item.id}">Zapracovat do dokumentu</button>` : ""}
          ${item.status === "accepted" || item.status === "introduced" ? `<button class="present" data-introduce="${item.id}">Označit jako představený</button>` : ""}
          <button class="reject" data-reject="${item.id}">Vyřadit</button>
          <button class="vote-button" data-start-voting-process="${item.id}" ${canStartProcess ? "" : "disabled"}>${processLabel}</button>
        </div>
      </div>`;
  }).join("");
}

function renderAmendmentEditForm(item) {
  return `
    <form class="card ${amendmentClass(item)}" id="card-${item.id}" data-form="edit-amendment" data-amendment-id="${item.id}">
      <div class="meta compact">
        <div><strong>Stav</strong><br><span class="badge">${statusLabel(item.status)}</span></div>
        <div><strong>PN</strong><br>${item.number || ""}</div>
        <div><strong>Typ návrhu</strong><select name="type">${amendmentTypeOptions(item.type)}</select></div>
        <div><strong>Cílový bod</strong><select name="targetPointId"><option value="">Bez cíle</option>${resolutionOptionsWithSelected(item.targetPointId)}</select></div>
        <div><strong>Navrhovatel</strong><input name="submitterName" value="${esc(item.submitterName || "")}"></div>
        <div><strong>Garanti</strong><input name="guarantorsText" value="${esc(item.guarantorsText || "")}"></div>
      </div>
      <span class="label">Text návrhu</span>
      <textarea name="text" required>${esc(item.text || "")}</textarea>
      <div class="actions">
        <button class="approve" type="submit">Uložit úpravy</button>
        <button class="save" type="button" data-cancel-amendment-edit>Zrušit</button>
      </div>
    </form>`;
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
        <button class="present" data-mark-all="present">Všichni přítomni</button>
        <button class="reject" data-mark-all="absent">Všichni nepřítomni</button>
        <button class="save" data-generate-links>Vygenerovat hlasovací odkazy</button>
        <button class="save" data-export-attendance>Export XLSX</button>
        <button class="save" data-export-qr>QR PDF</button>
        <button class="save" data-import-attendance>Import XLSX</button>
        <button class="save" data-import-preferences>Import preferencí XLSX</button>
        <button class="save" data-import-layout>Import rozložení</button>
      </div>
      <div class="vote-summary"><strong>Prezenční listina</strong><br>Přítomno: ${present}<br>Nepřítomno: ${absent}</div>
      <input id="attendanceImportFile" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden>
      <input id="preferenceImportFile" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden>
      <input id="layoutImportFile" type="file" accept=".xlsx,.csv,.tsv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,text/tab-separated-values" hidden>
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
  const showDebateSchema = !session && !!state.debate?.session;
  const showSchema = showDebateSchema || !secretMode;
  const schemaMode = showDebateSchema ? "debate" : "voting";
  const schemaTitle = "Schéma hlasování";
  const amendment = state.voting.amendment;
  return `
    <div class="voting-admin-layout ${showSchema ? "" : "no-schema"}">
      <div class="card voting-current voting-command">
        <div class="voting-command-head">
          <div>
            <span class="voting-state-pill ${session?.status === "open" ? "open" : session ? "closed" : ""}">${session ? statusLabel(session.status) : "neprobíhá"}</span>
            <h2>${amendment ? `Hlasování o PN ${esc(amendment.number || "")}` : "Hlasování"}</h2>
            <p>${amendment ? esc(shorten(amendment.text, 210)) : "Vyber PN níže a zahaj hlasování."}</p>
          </div>
          <div class="voting-mode-box">
            <strong>${secretMode ? "Tajné" : "Veřejné"}</strong>
            <span>${secretMode ? "bez schématu na projekci" : "schéma a živé hlasy"}</span>
          </div>
        </div>
        ${session ? renderSessionInfo(session) : `<div class="empty">Není spuštěné žádné hlasování.</div>`}
        ${renderVoteSummary()}
        <div class="voting-status voting-hotkeys"><strong>Klávesy předsedajícího:</strong> Q = pro, P = proti, mezerník = zdržuje se. Hlas se zapíše další přítomné delegaci v pořadí.</div>
        <div class="actions voting-actions">
          <button class="approve" data-vote-action="close" ${session?.status === "open" ? "" : "disabled"}>Ukončit hlasování</button>
          <button class="save" data-vote-action="reopen" ${session?.status === "closed" ? "" : "disabled"}>Obnovit hlasování</button>
          <button class="approve" data-vote-action="save" ${session?.status === "closed" ? "" : "disabled"}>Uložit výsledek</button>
          <button class="present" data-optical="for" ${session ? "" : "disabled"}>Optická většina PRO</button>
          <button class="reject" data-optical="against" ${session ? "" : "disabled"}>Optická většina PROTI</button>
          <button class="reject" data-vote-action="cancel" ${session ? "" : "disabled"}>Zrušit hlasování</button>
          <button class="save" data-action="force-projection">Vynutit projekci</button>
        </div>
      </div>
      ${showSchema ? `<div class="card voting-stage-card">
        <div class="section-head tight">
          <div>
            <h2>${schemaTitle}</h2>
            <p>${showDebateSchema ? "Právě se vybírá podporovatel nebo odpůrce." : "Kliknutím na stůl upravíš hlas."}</p>
          </div>
        </div>
        <div class="stage-wrap unified-voting-stage">
          <div class="stage">${renderChairMarker()}${renderSeats(schemaMode)}</div>
        </div>
      </div>` : ""}
    </div>
    ${state.debate?.session ? renderDebatePanel({ includeStage: false }) : ""}
    <div class="card">
      <h2>Spustit hlasování o PN</h2>
      ${state.amendments.length ? state.amendments.map((item) => `<div class="item"><b>PN ${item.number}</b> <span class="badge">${statusLabel(item.status)}</span><p>${esc(item.text)}</p><button class="vote-button" data-start-voting-process="${item.id}" ${canStartVotingProcessFor(item) ? "" : "disabled"}>${canStartVotingFor(item) ? "Spustit hlasování" : "Zahájit hlasování"}</button></div>`).join("") : `<div class="empty">Zatím nejsou žádné PN.</div>`}
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
  return `
    <div class="admin-vote-counts">
      <div class="admin-vote-count for"><span>PRO</span><strong>${counts.for || 0}</strong></div>
      <div class="admin-vote-count against"><span>PROTI</span><strong>${counts.against || 0}</strong></div>
      <div class="admin-vote-count abstain"><span>ZDRŽUJE SE</span><strong>${counts.abstain || 0}</strong></div>
      <div class="admin-vote-result ${passed ? "passed" : "failed"}"><span>Výsledek</span><strong>${passed ? "PŘIJATO" : "NEPŘIJATO"}</strong></div>
    </div>`;
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
  return `
    <form class="card agenda-quick-add" data-form="agenda">
      <div class="section-head">
        <h2>Přidat bod agendy</h2>
        <button class="approve">Přidat</button>
        <button type="button" class="save" data-import-agenda>Import agendy</button>
      </div>
      <input id="agendaImportFile" type="file" accept=".xlsx,.csv,.tsv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,text/tab-separated-values" hidden>
      <div class="agenda-add-grid">
        <input name="title" placeholder="Název bodu" required>
        <select name="type">${agendaTypeOptions("session")}</select>
        <input name="startsAt" type="time" aria-label="Začátek">
        <input name="durationMinutes" type="number" min="1" placeholder="min">
        <input name="displayOrder" type="number" min="0" placeholder="pořadí">
        <input name="note" placeholder="Poznámka">
      </div>
    </form>
    <div class="card agenda-editor-card">
      <div class="section-head">
        <div>
          <h2>Upravit agendu</h2>
          <p>Piš rovnou do řádků. Všechny změny uloží jedno tlačítko.</p>
        </div>
        <button class="approve" data-save-data-agenda>Uložit změny</button>
      </div>
      ${renderAgendaInlineTable()}
    </div>`;
}

function renderAgendaInlineTable() {
  return `
    <div class="agenda-inline-wrap">
      <table class="agenda-inline-table">
        <thead><tr><th></th><th>Čas</th><th>Trvání</th><th>Název</th><th>Typ</th><th>Poznámka</th><th>Pořadí</th><th></th></tr></thead>
        <tbody>${state.agenda.length ? state.agenda.map((row) => `
          <tr data-data-agenda-row="${row.id}" draggable="true">
            <td><button type="button" class="drag-handle" data-agenda-drag-handle title="Přetáhnout">↕</button></td>
            <td><input name="startsAt" type="time" value="${esc(timeInputValue(row.startsAt))}"></td>
            <td><input name="durationMinutes" type="number" min="0" value="${esc(row.durationMinutes || "")}"></td>
            <td><input name="title" value="${esc(row.title || "")}"></td>
            <td><select name="type">${agendaTypeOptions(row.type)}</select></td>
            <td><textarea name="note" placeholder="Poznámka, **tučně**, *kurzíva*">${esc(row.note || "")}</textarea></td>
            <td><input name="displayOrder" type="number" value="${esc(row.displayOrder || 0)}"></td>
            <td><button class="reject compact-button" data-delete-agenda="${row.id}">Smazat</button></td>
          </tr>`).join("") : `<tr><td colspan="8" class="muted">Agenda je prázdná.</td></tr>`}</tbody>
      </table>
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
        <input name="pin" type="password" placeholder="Nové admin heslo, min. 8 znaků">
        <button class="save">Změnit admin PIN</button>
      </form>
      <form class="card" data-form="pin" data-pin="screen">
        <h2>Screen PIN</h2>
        <input name="pin" type="password" placeholder="Nový screen PIN">
        <button class="save">Změnit screen PIN</button>
      </form>
    </div>
    ${renderDataManagementPanel()}
    <div class="card danger-zone">
      <h2>Reset dat</h2>
      <p>Reset živých dat smaže pořadník, hlasování a přestávky. Reset všeho navíc vytvoří zálohu databáze a vrátí výchozí delegace.</p>
      <div class="actions">
        <button class="reject" data-action="reset-live">Resetovat živá data</button>
        <button class="reject" data-action="reset-all">Resetovat vše</button>
      </div>
    </div>`;
}

function renderDataManagementPanel() {
  return `
    <div class="card data-management">
      <div class="section-head">
        <div>
          <h2>Správa uložených dat</h2>
          <p>Hromadně upravuj data přímo v tabulkách. Mazání po kategoriích je níže a vždy vyžaduje potvrzení.</p>
        </div>
      </div>
      ${renderDataDeletePanel()}
      ${renderDataDelegationsTable()}
      ${renderDataAgendaTable()}
      ${renderDataAmendmentsTable()}
      ${renderDataRuntimeTable()}
    </div>`;
}

function renderDataDeletePanel() {
  const scopes = [
    ["attendance", "Smazat prezenci a účastníky", "Vymaže účastníky, přítomnost, hlasovací kódy a unikátní odkazy. Delegace a rozložení zůstanou."],
    ["agenda", "Smazat agendu", "Vymaže všechny body agendy."],
    ["amendments", "Smazat PN", "Vymaže pozměňovací návrhy, jejich debaty a uložená hlasování. Body rezoluce zůstanou."],
    ["resolution", "Smazat rezoluci", "Vymaže všechny body rezoluce a odpojí cíle PN."],
    ["voting", "Smazat hlasování", "Vymaže hlasovací relace, hlasy a rozpracované předhlasovací kroky."],
    ["speakers", "Smazat pořadník", "Vymaže aktuálního řečníka, frontu i reakce."],
    ["breaks", "Smazat přestávky", "Vymaže historii a aktivní přestávky / kuloární jednání."],
    ["work-data", "Smazat pracovní data", "Vymaže prezenci, agendu, PN, rezoluci, hlasování, řečníky a přestávky. Nastavení, PINy, delegace a rozložení zůstanou."]
  ];
  return `
    <section class="data-section data-delete-section">
      <div class="section-head tight">
        <div>
          <h3>Mazání dat</h3>
          <p>Každé mazání proběhne okamžitě po potvrzení textem SMAZAT.</p>
        </div>
      </div>
      <div class="data-delete-grid">
        ${scopes.map(([scope, title, description]) => `
          <button class="data-delete-card" data-delete-data-scope="${scope}">
            <strong>${esc(title)}</strong>
            <span>${esc(description)}</span>
          </button>`).join("")}
      </div>
    </section>`;
}

function renderDataDelegationsTable() {
  const rows = state.attendance.delegations || [];
  return `
    <section class="data-section">
      <div class="section-head tight">
        <div>
          <h3>Delegace, prezence a účastníci</h3>
          <p>Název, kódy, přítomnost a osobní údaje delegátů.</p>
        </div>
        <button class="approve" data-save-data-delegations>Uložit delegace</button>
      </div>
      <div class="data-table-wrap">
        <table class="data-table">
          <thead>
            <tr><th>Delegace</th><th>Kód</th><th>Vlajka</th><th>Přítomen</th><th>Kód povolen</th><th>Účastník</th><th>E-mail</th><th>Poznámka</th></tr>
          </thead>
          <tbody>${rows.map((d) => {
            const participant = d.participant || {};
            return `
              <tr data-data-delegation-row="${d.id}">
                <td><input name="name" value="${esc(d.name || "")}"></td>
                <td><input name="code" value="${esc(d.code || "")}"></td>
                <td><input name="flag" value="${esc(d.flag || "")}"></td>
                <td class="check-cell"><input name="present" type="checkbox" ${d.present ? "checked" : ""}></td>
                <td class="check-cell"><input name="accessCodeEnabled" type="checkbox" ${d.accessCodeEnabled ? "checked" : ""}></td>
                <td><input name="participantName" value="${esc(participant.name || "")}"></td>
                <td><input name="participantEmail" value="${esc(participant.email || "")}"></td>
                <td><input name="note" value="${esc(participant.note || "")}"></td>
              </tr>`;
          }).join("")}</tbody>
        </table>
      </div>
    </section>`;
}

function renderDataAgendaTable() {
  const rows = state.agenda || [];
  return `
    <section class="data-section">
      <div class="section-head tight">
        <div>
          <h3>Agenda</h3>
          <p>Časy jsou ve 24h formátu. Bod bez konce může mít jen délku v minutách.</p>
        </div>
        <button class="approve" data-save-data-agenda>Uložit agendu</button>
      </div>
      <div class="data-table-wrap">
        <table class="data-table">
          <thead>
            <tr><th>Pořadí</th><th>Název</th><th>Typ</th><th>Začátek</th><th>Min</th><th>Poznámka</th><th>Akce</th></tr>
          </thead>
          <tbody>${rows.length ? rows.map((row) => `
            <tr data-data-agenda-row="${row.id}">
              <td><input name="displayOrder" type="number" value="${esc(row.displayOrder || 0)}"></td>
              <td><input name="title" value="${esc(row.title || "")}"></td>
              <td><select name="type">${agendaTypeOptions(row.type)}</select></td>
              <td><input name="startsAt" type="time" value="${esc(timeInputValue(row.startsAt))}"></td>
              <td><input name="durationMinutes" type="number" min="0" value="${esc(row.durationMinutes || "")}"></td>
              <td><input name="note" value="${esc(row.note || "")}"></td>
              <td><button class="reject compact-button" data-delete-agenda="${row.id}">Smazat</button></td>
            </tr>`).join("") : `<tr><td colspan="7" class="muted">Agenda je prázdná.</td></tr>`}</tbody>
        </table>
      </div>
    </section>`;
}

function renderDataAmendmentsTable() {
  const rows = state.amendments || [];
  return `
    <section class="data-section">
      <div class="section-head tight">
        <div>
          <h3>Pozměňovací návrhy</h3>
          <p>Vyřazení PN ho přesune mimo aktivní workflow. Schválené a odhlasované PN nemaž natvrdo.</p>
        </div>
        <button class="approve" data-save-data-amendments>Uložit PN</button>
      </div>
      <div class="data-table-wrap">
        <table class="data-table amendments-data-table">
          <thead>
            <tr><th>PN</th><th>Stav</th><th>Typ</th><th>Cíl</th><th>Předkladatel</th><th>Garanti</th><th>Text</th><th>Akce</th></tr>
          </thead>
          <tbody>${rows.length ? rows.map((item) => `
            <tr data-data-amendment-row="${item.id}">
              <td><strong>PN ${esc(item.number || "")}</strong></td>
              <td><span class="badge">${esc(statusLabel(item.status))}</span></td>
              <td><select name="type">${amendmentTypeOptions(item.type)}</select></td>
              <td><select name="targetPointId"><option value="">Bez cíle</option>${resolutionOptionsWithSelected(item.targetPointId)}</select></td>
              <td><input name="submitterName" value="${esc(item.submitterName || "")}"></td>
              <td><input name="guarantorsText" value="${esc(item.guarantorsText || "")}"></td>
              <td><textarea name="text">${esc(item.text || "")}</textarea></td>
              <td><button class="reject compact-button" data-reject="${item.id}">Vyřadit</button></td>
            </tr>`).join("") : `<tr><td colspan="8" class="muted">Žádné PN nejsou uložené.</td></tr>`}</tbody>
        </table>
      </div>
    </section>`;
}

function renderDataRuntimeTable() {
  const vote = state.voting.session;
  const debate = state.debate.session;
  const speakerCount = (state.speakers.queue || []).length + (state.speakers.currentSpeaker ? 1 : 0) + (state.speakers.reactions || []).length;
  return `
    <section class="data-section">
      <div class="section-head tight">
        <div>
          <h3>Živá data aplikace</h3>
          <p>Rychlá kontrola stavů, které se mažou resetem živých dat.</p>
        </div>
        <button class="reject" data-action="reset-live">Resetovat živá data</button>
      </div>
      <div class="runtime-grid">
        <div><strong>Hlasování</strong><span>${vote ? `PN ${esc(vote.amendmentId)} · ${esc(vote.status)}` : "neprobíhá"}</span></div>
        <div><strong>Hlasování PN</strong><span>${debate ? debatePhaseLabel(debate.phase || "") : "neprobíhá"}</span></div>
        <div><strong>Pořadník</strong><span>${speakerCount} položek</span></div>
        <div><strong>Přestávka</strong><span>${state.break?.active ? esc(state.break.title || "běží") : "neprobíhá"}</span></div>
      </div>
    </section>`;
}

function renderAttendanceTable() {
  return `
    <div class="attendance-table-wrap">
      <table class="attendance-table">
        <thead><tr><th>Stát</th><th>Hlasovací odkaz</th><th>4místný kód</th><th>Přítomen</th><th>Účastník</th><th>Akce</th></tr></thead>
        <tbody>${state.attendance.delegations.map((d) => `
          <tr>
            <td><strong>${flagName(d)}</strong><br><span class="muted">${esc(d.code)}</span></td>
            <td>${d.voteLinkToken
              ? `<button class="save compact-button" data-copy-vote-link="${esc(d.voteLinkToken)}">Kopírovat odkaz</button><br><span class="muted link-token">${esc(d.voteLinkToken)}</span>`
              : `<span class="muted">Nevygenerován</span>`}</td>
            <td><span class="attendance-code">${esc(d.accessCode || "—")}</span><br><span class="muted">${d.accessCodeEnabled ? "aktivní" : "vypnutý"}</span></td>
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
  const link = voteLinkUrl(delegation.voteLinkToken);
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
          <label class="toggle-line"><input name="accessCodeEnabled" type="checkbox" ${delegation.accessCodeEnabled ? "checked" : ""}> Povolit přihlášení 4místným kódem</label>
          <label>Unikátní odkaz<input value="${esc(link || "Zatím není vygenerovaný")}" readonly></label>
          <label>Jméno účastníka<input name="participantName" value="${esc(participant.name || "")}"></label>
          <label>E-mail účastníka<input name="participantEmail" value="${esc(participant.email || "")}"></label>
        </div>
        <label class="full-label">Poznámka<textarea name="note">${esc(participant.note || "")}</textarea></label>
        <div class="actions">
          <button class="approve">Uložit údaje</button>
          <button type="button" class="present" data-editor-checkin="${delegation.id}">Označit přítomno</button>
          <button type="button" class="reject" data-editor-checkout="${delegation.id}">Označit nepřítomno</button>
          <button type="button" class="save" data-editor-code="${delegation.id}">Vygenerovat kód</button>
          ${link ? `<button type="button" class="save" data-copy-vote-link="${esc(delegation.voteLinkToken)}">Kopírovat odkaz</button>` : ""}
        </div>
      </form>
    </div>`;
}

function renderSeats(mode) {
  return visibleSeatDelegations(mode).map((d, index) => {
    const seat = d.seat || defaultSeat(index);
    const vote = voteForDelegation(d.id);
    const classes = ["seat"];
    const hidden = isSeatHidden(d.id);
    if (mode !== "layout") classes.push("overview-seat");
    if (hidden && mode === "layout") classes.push("seat-hidden-manual");
    let label = "";
    let data = "";
    let tools = "";
    if (mode === "speaker") {
      classes.push("speaker-seat");
      data = `data-speaker-seat="${d.id}"`;
    } else if (mode === "debate") {
      const debate = state.debate || {};
      const phase = debate.session?.phase || "";
      const supporterId = Number(debate.supporter?.id || debate.session?.supporterDelegationId || 0);
      const opponentId = Number(debate.opponent?.id || debate.session?.opponentDelegationId || 0);
      const selectingSupporter = phase === "select_supporter";
      const selectingOpponent = phase === "select_opponent";
      const canSelect = d.present && (selectingSupporter || (selectingOpponent && Number(d.id) !== supporterId));
      classes.push("debate-seat");
      if (!d.present) classes.push("attendance-absent");
      if (supporterId && Number(d.id) === supporterId) {
        classes.push("debate-supporter");
        label = `<div class="seat-vote">PODPOROVATEL</div>`;
      } else if (opponentId && Number(d.id) === opponentId) {
        classes.push("debate-opponent");
        label = `<div class="seat-vote">ODPŮRCE</div>`;
      } else if (canSelect) {
        classes.push("debate-selectable");
        data = `data-debate-select="${d.id}"`;
        label = `<div class="seat-vote">${selectingSupporter ? "VYBRAT PRO" : "VYBRAT PROTI"}</div>`;
      } else if (selectingOpponent && Number(d.id) === supporterId) {
        label = `<div class="seat-vote">UŽ VYBRÁN</div>`;
      } else if (selectingSupporter || selectingOpponent) {
        label = `<div class="seat-vote">${d.present ? "NEVYBRATELNÉ" : "NEPŘÍTOMEN"}</div>`;
      }
    } else if (mode === "voting") {
      if (vote) classes.push(`vote-${vote}`);
      data = `data-vote-seat="${d.id}"`;
      label = `<div class="seat-vote">${voteLabel(vote)}</div>`;
    } else {
      classes.push(d.present ? "attendance-present" : "attendance-absent");
      data = `data-layout-seat="${d.id}"`;
      label = `<div class="seat-attendance">${hidden ? "SKRYTO" : (d.present ? "PŘÍTOMEN" : "NEPŘÍTOMEN")}</div>`;
      tools = `
        <div class="seat-tools">
          <button type="button" class="seat-tool" title="Upravit delegaci" data-seat-tool data-edit-delegation="${d.id}">✎</button>
          <button type="button" class="seat-tool" title="${hidden ? "Zobrazit stůl ve schématech" : "Skrýt stůl ze schémat"}" data-seat-tool data-seat-visibility="${d.id}">${hidden ? "O" : "×"}</button>
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
  const chair = chairSeat();
  const draggable = panel === "layout" ? ` data-chair-seat` : "";
  return `
    <div class="chair-marker"${draggable} aria-label="Předsedající" style="left:${chair.x}%;top:${chair.y}%;width:${chair.w}%;min-height:${chair.h}%;transform:rotate(${chair.rotation}deg);">
      <div class="chair-label">PŘEDSEDNICTVO</div>
      <div class="chair-desk">CHAIR</div>
    </div>`;
}

function isSecretVotingMode() {
  return (state?.settings?.values?.voting_mode || "public") === "secret";
}

function chairSeat() {
  const values = state?.settings?.values || {};
  if (panel !== "layout") {
    return { x: 40, y: 79, w: 20, h: 8, rotation: 0 };
  }
  return {
    x: numberSetting(values.chair_x, 38),
    y: numberSetting(values.chair_y, 2.2),
    w: numberSetting(values.chair_w, 24),
    h: numberSetting(values.chair_h, 7),
    rotation: numberSetting(values.chair_rotation, 0)
  };
}

function numberSetting(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function visibleSeatDelegations(mode) {
  const delegations = state.delegations || [];
  if (mode === "layout") return delegations;
  return delegations.filter((delegation) => !isSeatHidden(delegation.id));
}

function hiddenSeatIds() {
  const raw = state?.settings?.values?.hidden_seat_ids || "[]";
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return new Set(parsed.map((id) => String(id)));
  } catch {}
  return new Set(String(raw).split(",").map((id) => id.trim()).filter(Boolean));
}

function isSeatHidden(id) {
  return hiddenSeatIds().has(String(id));
}

function canStartVotingFor(item) {
  return item?.status === "introduced" &&
    state?.debate?.session?.phase === "ready_to_vote" &&
    Number(state?.debate?.amendment?.id || 0) === Number(item.id || 0);
}

function canStartVotingProcessFor(item) {
  if (item?.status !== "introduced") return false;
  const debate = state?.debate;
  if (!debate?.session) return true;
  return Number(debate.amendment?.id || 0) === Number(item.id || 0);
}

function debateInstruction(phase) {
  if (phase === "submitter_reading") return "Předkladatel čte návrh. Po přečtení pokračuj tlačítkem Další krok.";
  if (phase === "select_supporter") return "Vyber podporovatele kliknutím na jeho stůl ve schématu.";
  if (phase === "select_opponent") return "Vyber odpůrce kliknutím na jeho stůl ve schématu.";
  if (phase === "supporter_speaking") return "Běží prostor podporovatele. Další krok spustí odpůrce nebo ukončí projevy.";
  if (phase === "opponent_speaking") return "Běží prostor odpůrce. Další krok dokončí úvodní fázi hlasování.";
  if (phase === "ready_to_vote") return "Úvodní fáze je hotová. Teď lze spustit hlasování.";
  return "";
}

function bindActions() {
  app.querySelectorAll("[data-panel]").forEach((button) => {
    button.onclick = () => { panel = button.dataset.panel; render(); };
  });
  const reload = app.querySelector("[data-reload]");
  if (reload) reload.onclick = () => load();
  const screen = app.querySelector("[data-open-screen]");
  if (screen) screen.onclick = () => window.open("/screen", "_blank");
  click("logout", async () => { await api("/api/auth/logout?role=admin", { method: "POST" }); state = null; renderLogin(); });

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
  app.querySelectorAll("[data-start-voting-process]").forEach((button) => button.onclick = () => startVotingProcess(Number(button.dataset.startVotingProcess)));
  app.querySelectorAll("[data-start-voting]").forEach((button) => button.onclick = () => post("/api/admin/voting/start", { amendmentId: Number(button.dataset.startVoting) }, "Hlasování spuštěno."));
  app.querySelectorAll("[data-debate-select]").forEach((button) => button.onclick = () => post("/api/debate/select", { delegationId: Number(button.dataset.debateSelect) }, "Výběr uložen."));
  click("debate-next", () => post("/api/debate/next", {}, "Fáze hlasování posunuta."));
  click("debate-cancel", () => post("/api/debate/cancel", {}, "Hlasování zrušeno."));

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
  app.querySelectorAll("[data-chair-seat]").forEach((chair) => {
    chair.onpointerdown = startChairDrag;
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
  app.querySelectorAll("[data-seat-visibility]").forEach((button) => {
    button.onclick = (event) => {
      event.stopPropagation();
      toggleSeatVisibility(Number(button.dataset.seatVisibility));
    };
  });
  app.querySelectorAll("[data-arrange]").forEach((button) => button.onclick = () => arrangeSeats(button.dataset.arrange));
  const importButton = app.querySelector("[data-import-attendance]");
  const importFile = app.querySelector("#attendanceImportFile");
  if (importButton && importFile) {
    importButton.onclick = () => importFile.click();
    importFile.onchange = () => importAttendanceFile(importFile.files?.[0]);
  }
  const preferenceImportButton = app.querySelector("[data-import-preferences]");
  const preferenceImportFile = app.querySelector("#preferenceImportFile");
  if (preferenceImportButton && preferenceImportFile) {
    preferenceImportButton.onclick = () => preferenceImportFile.click();
    preferenceImportFile.onchange = () => importPreferenceFile(preferenceImportFile.files?.[0]);
  }
  const layoutImportButton = app.querySelector("[data-import-layout]");
  const layoutImportFile = app.querySelector("#layoutImportFile");
  if (layoutImportButton && layoutImportFile) {
    layoutImportButton.onclick = () => layoutImportFile.click();
    layoutImportFile.onchange = () => importLayoutFile(layoutImportFile.files?.[0]);
  }
  const agendaImportButton = app.querySelector("[data-import-agenda]");
  const agendaImportFile = app.querySelector("#agendaImportFile");
  if (agendaImportButton && agendaImportFile) {
    agendaImportButton.onclick = () => agendaImportFile.click();
    agendaImportFile.onchange = () => importAgendaFile(agendaImportFile.files?.[0]);
  }
  const exportButton = app.querySelector("[data-export-attendance]");
  if (exportButton) exportButton.onclick = exportAttendanceXlsx;
  const exportQRButton = app.querySelector("[data-export-qr]");
  if (exportQRButton) exportQRButton.onclick = exportQRCodesPdf;
  const generateLinksButton = app.querySelector("[data-generate-links]");
  if (generateLinksButton) generateLinksButton.onclick = generateVoteLinks;
  app.querySelectorAll("[data-mark-all]").forEach((button) => button.onclick = () => markAllPresence(button.dataset.markAll === "present"));
  app.querySelectorAll("[data-copy-vote-link]").forEach((button) => button.onclick = () => copyVoteLink(button.dataset.copyVoteLink));
  app.querySelectorAll("[data-code]").forEach((button) => button.onclick = () => post("/api/attendance/generate-code", { delegationId: Number(button.dataset.code) }));
  app.querySelectorAll("[data-checkin]").forEach((button) => button.onclick = () => setPresence(Number(button.dataset.checkin), true));
  app.querySelectorAll("[data-checkout]").forEach((button) => button.onclick = () => setPresence(Number(button.dataset.checkout), false));
  app.querySelectorAll("[data-edit-delegation]").forEach((button) => button.onclick = () => { editingDelegationId = Number(button.dataset.editDelegation); render(); });
  const closeDelegate = app.querySelector("[data-close-delegate-editor]");
  if (closeDelegate) closeDelegate.onclick = () => { editingDelegationId = null; render(); };
  const delegateForm = app.querySelector("[data-form=delegate-details]");
  if (delegateForm) delegateForm.onsubmit = submitDelegateDetails;
  app.querySelectorAll("[data-editor-code]").forEach((button) => button.onclick = () => post("/api/attendance/generate-code", { delegationId: Number(button.dataset.editorCode) }));
  app.querySelectorAll("[data-editor-checkin]").forEach((button) => button.onclick = () => setPresence(Number(button.dataset.editorCheckin), true));
  app.querySelectorAll("[data-editor-checkout]").forEach((button) => button.onclick = () => setPresence(Number(button.dataset.editorCheckout), false));

  const amendmentForm = app.querySelector("[data-form=amendment]");
  if (amendmentForm) amendmentForm.onsubmit = submitAmendment;
  app.querySelectorAll("[data-edit-amendment]").forEach((button) => button.onclick = () => { editingAmendmentId = Number(button.dataset.editAmendment); render(); });
  app.querySelectorAll("[data-cancel-amendment-edit]").forEach((button) => button.onclick = () => { editingAmendmentId = null; render(); });
  app.querySelectorAll("[data-form=edit-amendment]").forEach((form) => form.onsubmit = submitAmendmentEdit);
  const agendaForm = app.querySelector("[data-form=agenda]");
  if (agendaForm) agendaForm.onsubmit = submitAgenda;
  const cancelAgendaEdit = app.querySelector("[data-cancel-agenda-edit]");
  if (cancelAgendaEdit) cancelAgendaEdit.onclick = () => { editingAgendaId = null; render(); };
  const settingsForm = app.querySelector("[data-form=settings]");
  if (settingsForm) settingsForm.onsubmit = submitSettings;
  app.querySelectorAll("[data-form=pin]").forEach((form) => form.onsubmit = submitPin);
  const saveDataDelegations = app.querySelector("[data-save-data-delegations]");
  if (saveDataDelegations) saveDataDelegations.onclick = saveDataDelegationsTable;
  const saveDataAgenda = app.querySelector("[data-save-data-agenda]");
  if (saveDataAgenda) saveDataAgenda.onclick = saveDataAgendaTable;
  bindAgendaDrag();
  const saveDataAmendments = app.querySelector("[data-save-data-amendments]");
  if (saveDataAmendments) saveDataAmendments.onclick = saveDataAmendmentsTable;
  app.querySelectorAll("[data-delete-agenda]").forEach((button) => button.onclick = () => request(`/api/agenda/${button.dataset.deleteAgenda}`, { method: "DELETE" }));
  app.querySelectorAll("[data-delete-data-scope]").forEach((button) => {
    button.onclick = () => deleteStoredData(button.dataset.deleteDataScope);
  });
  app.querySelectorAll("[data-edit-agenda]").forEach((button) => button.onclick = () => { editingAgendaId = Number(button.dataset.editAgenda); panel = "agenda"; render(); });
  app.querySelectorAll('[data-action="reset-live"]').forEach((button) => {
    button.onclick = () => confirm("Opravdu resetovat živá data?") && post("/api/settings/reset-live", {});
  });
  app.querySelectorAll('[data-action="reset-all"]').forEach((button) => {
    button.onclick = () => {
    const text = prompt("Pro reset všeho napiš RESET ALL");
    if (text) post("/api/settings/reset-all", { confirm: text });
    };
  });
}

async function deleteStoredData(scope) {
  const text = prompt("Pro smazání zvolených dat napiš SMAZAT");
  if (text !== "SMAZAT") return;
  try {
    await api("/api/settings/delete-data", { method: "POST", body: { scope, confirm: text } });
    await load(false);
    showToast("Data byla smazána.");
  } catch (err) {
    showToast(err.message);
  }
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

async function submitAmendmentEdit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const id = Number(form.dataset.amendmentId);
  const existing = state.amendments.find((item) => Number(item.id) === id) || {};
  try {
    await api(`/api/amendments/${id}`, {
      method: "PUT",
      body: {
        ...existing,
        id,
        type: form.type.value,
        targetPointId: form.targetPointId.value ? Number(form.targetPointId.value) : null,
        submitterName: form.submitterName.value,
        guarantorsText: form.guarantorsText.value,
        text: form.text.value,
        status: existing.status || "submitted"
      }
    });
    editingAmendmentId = null;
    await load(false);
    showToast("PN upraven.");
  } catch (err) {
    showToast(err.message);
  }
}

async function startVotingProcess(id) {
  const item = state.amendments.find((amendment) => Number(amendment.id) === Number(id));
  if (!item) return showToast("PN se nepodařilo najít.");
  if (canStartVotingFor(item)) {
    await post("/api/admin/voting/start", { amendmentId: Number(id) }, "Hlasování spuštěno.");
    return;
  }
  if (item.status !== "introduced") {
    showToast("PN musí být nejdřív zapracovaný a představený.");
    return;
  }
  const debate = state.debate || {};
  if (debate.session && Number(debate.amendment?.id || 0) !== Number(id)) {
    showToast("Nejdřív dokonči nebo zruš aktuální hlasování o jiném PN.");
    return;
  }
  if (debate.session) {
    showToast("Dokonči čtení návrhu, podporovatele a odpůrce.");
    panel = "voting";
    render();
    return;
  }
  panel = "voting";
  await post(`/api/amendments/${id}/debate`, {}, "Hlasování zahájeno.");
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

async function toggleSeatVisibility(id) {
  const ids = hiddenSeatIds();
  const key = String(id);
  const willHide = !ids.has(key);
  if (willHide) ids.add(key);
  else ids.delete(key);
  await post("/api/settings", { hidden_seat_ids: JSON.stringify(Array.from(ids)) }, willHide ? "Stůl skryt ze schémat." : "Stůl zobrazen ve schématech.");
}

async function submitPin(event) {
  event.preventDefault();
  const form = event.currentTarget;
  await post(`/api/settings/${form.dataset.pin}-pin`, { pin: form.pin.value });
  form.reset();
}

async function submitDelegateDetails(event) {
  event.preventDefault();
  await saveDelegateDetails();
}

async function saveDelegateDetails() {
  const form = app.querySelector("[data-form=delegate-details]");
  if (!form || !editingDelegationId) return;
  const existing = state.attendance.delegations.find((item) => item.id === editingDelegationId) || state.delegations.find((item) => item.id === editingDelegationId);
  const delegation = { ...existing, name: form.name.value.trim(), code: form.code.value.trim(), flag: form.flag.value.trim(), accessCodeEnabled: form.accessCodeEnabled.checked };
  const participant = {
    delegationId: editingDelegationId,
    name: form.participantName.value.trim(),
    email: form.participantEmail.value.trim(),
    note: form.note.value.trim()
  };
  try {
    await api(`/api/delegations/${editingDelegationId}`, { method: "PUT", body: delegation });
    await api("/api/attendance/participant", { method: "POST", body: participant });
    await load(false);
    showToast("Údaje delegace uloženy.");
  } catch (err) {
    showToast(err.message);
  }
}

async function saveDataDelegationsTable(event) {
  event.preventDefault();
  const rows = Array.from(app.querySelectorAll("[data-data-delegation-row]"));
  try {
    for (const row of rows) {
      const id = Number(row.dataset.dataDelegationRow);
      const existing = state.attendance.delegations.find((item) => item.id === id) || state.delegations.find((item) => item.id === id) || {};
      const delegation = {
        ...existing,
        id,
        name: dataValue(row, "name"),
        code: dataValue(row, "code"),
        flag: dataValue(row, "flag"),
        accessCodeEnabled: dataChecked(row, "accessCodeEnabled"),
        displayOrder: Number(existing.displayOrder || 0)
      };
      const participant = {
        delegationId: id,
        name: dataValue(row, "participantName"),
        email: dataValue(row, "participantEmail"),
        note: dataValue(row, "note")
      };
      await api(`/api/delegations/${id}`, { method: "PUT", body: delegation });
      await api("/api/attendance/participant", { method: "POST", body: participant });
      await api("/api/attendance/access-code-enabled", { method: "POST", body: { delegationId: id, enabled: delegation.accessCodeEnabled } });
      if (dataChecked(row, "present") !== !!existing.present) {
        await api(dataChecked(row, "present") ? "/api/attendance/check-in" : "/api/attendance/check-out", { method: "POST", body: { delegationId: id } });
      }
    }
    await load(false);
    showToast("Delegace, prezence a účastníci uloženi.");
  } catch (err) {
    showToast(err.message);
  }
}

async function saveDataAgendaTable(event) {
  event.preventDefault();
  const rows = Array.from(app.querySelectorAll("[data-data-agenda-row]"));
  try {
    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      const id = Number(row.dataset.dataAgendaRow);
      const body = agendaRowBody(row);
      body.displayOrder = index + 1;
      await api(`/api/agenda/${id}`, { method: "PUT", body });
    }
    await load(false);
    showToast("Agenda uložena.");
  } catch (err) {
    showToast(err.message);
  }
}

async function reorderAgendaFromDom() {
  const ids = Array.from(app.querySelectorAll("[data-data-agenda-row]")).map((row) => Number(row.dataset.dataAgendaRow)).filter(Boolean);
  if (!ids.length) return;
  try {
    await api("/api/agenda/reorder", { method: "POST", body: { ids } });
    await load(false);
    showToast("Pořadí agendy uloženo.");
  } catch (err) {
    showToast(err.message);
  }
}

function bindAgendaDrag() {
  let draggedRow = null;
  app.querySelectorAll("[data-data-agenda-row]").forEach((row) => {
    row.ondragstart = (event) => {
      if (!event.target.closest("[data-agenda-drag-handle]")) {
        event.preventDefault();
        return;
      }
      draggedRow = row;
      row.classList.add("dragging");
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", row.dataset.dataAgendaRow || "");
    };
    row.ondragover = (event) => {
      if (!draggedRow || draggedRow === row) return;
      event.preventDefault();
      const rect = row.getBoundingClientRect();
      const after = event.clientY > rect.top + rect.height / 2;
      row.parentNode.insertBefore(draggedRow, after ? row.nextSibling : row);
    };
    row.ondragend = async () => {
      if (draggedRow) draggedRow.classList.remove("dragging");
      draggedRow = null;
      await reorderAgendaFromDom();
    };
  });
}

async function saveDataAmendmentsTable(event) {
  event.preventDefault();
  const rows = Array.from(app.querySelectorAll("[data-data-amendment-row]"));
  try {
    for (const row of rows) {
      const id = Number(row.dataset.dataAmendmentRow);
      const existing = state.amendments.find((item) => item.id === id) || {};
      await api(`/api/amendments/${id}`, {
        method: "PUT",
        body: {
          ...existing,
          id,
          type: dataValue(row, "type"),
          targetPointId: dataValue(row, "targetPointId") ? Number(dataValue(row, "targetPointId")) : null,
          submitterName: dataValue(row, "submitterName"),
          guarantorsText: dataValue(row, "guarantorsText"),
          text: dataValue(row, "text"),
          status: existing.status || "submitted"
        }
      });
    }
    await load(false);
    showToast("Pozměňovací návrhy uloženy.");
  } catch (err) {
    showToast(err.message);
  }
}

function agendaRowBody(row) {
  return {
    title: dataValue(row, "title"),
    type: dataValue(row, "type"),
    startsAt: agendaTimeToISO(dataValue(row, "startsAt")),
    endsAt: null,
    durationMinutes: dataValue(row, "durationMinutes") ? Number(dataValue(row, "durationMinutes")) : null,
    note: dataValue(row, "note"),
    displayOrder: dataValue(row, "displayOrder") ? Number(dataValue(row, "displayOrder")) : 0
  };
}

function dataValue(row, name) {
  return row.querySelector(`[name="${name}"]`)?.value?.trim() || "";
}

function dataChecked(row, name) {
  return !!row.querySelector(`[name="${name}"]`)?.checked;
}

function agendaFormBody(form) {
  const startsAt = agendaTimeToISO(form.startsAt.value);
  const durationMinutes = form.durationMinutes.value ? Number(form.durationMinutes.value) : null;
  return {
    title: form.title.value,
    type: form.type.value,
    startsAt,
    endsAt: null,
    durationMinutes,
    note: form.note.value,
    displayOrder: form.displayOrder.value ? Number(form.displayOrder.value) : 0
  };
}

function agendaTimeToISO(value) {
  if (!value) return null;
  const date = new Date(`2000-01-01T${value}:00`);
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

function startChairDrag(event) {
  if (panel !== "layout") return;
  event.preventDefault();
  const stage = event.currentTarget.closest(".stage");
  const rect = stage.getBoundingClientRect();
  const seat = chairSeat();
  draggingChair = {
    element: event.currentTarget,
    rect,
    seat,
    offsetX: event.clientX - (rect.left + rect.width * seat.x / 100),
    offsetY: event.clientY - (rect.top + rect.height * seat.y / 100),
    moved: false
  };
  event.currentTarget.setPointerCapture?.(event.pointerId);
}

function onLayoutDragMove(event) {
  if (draggingChair) {
    const seat = draggingChair.seat;
    const x = ((event.clientX - draggingChair.offsetX - draggingChair.rect.left) / draggingChair.rect.width) * 100;
    const y = ((event.clientY - draggingChair.offsetY - draggingChair.rect.top) / draggingChair.rect.height) * 100;
    seat.x = clamp(x, 0, 100 - Number(seat.w || 24));
    seat.y = clamp(y, 0, 100 - Number(seat.h || 7));
    draggingChair.element.style.left = `${seat.x}%`;
    draggingChair.element.style.top = `${seat.y}%`;
    draggingChair.moved = true;
    return;
  }
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
  if (draggingChair) {
    const chair = draggingChair;
    draggingChair = null;
    if (chair.moved) saveChairSeat(chair.seat);
    return;
  }
  if (!draggingLayout) return;
  const id = draggingLayout.id;
  const moved = draggingLayout.moved;
  draggingLayout = null;
  if (moved) saveLayoutSeat(id);
}

async function saveChairSeat(seat) {
  await post("/api/settings", {
    chair_x: String(roundSeat(seat.x)),
    chair_y: String(roundSeat(seat.y)),
    chair_w: String(roundSeat(seat.w)),
    chair_h: String(roundSeat(seat.h)),
    chair_rotation: String(roundSeat(seat.rotation || 0))
  }, "Stůl předsednictva uložen.");
}

function roundSeat(value) {
  return Math.round(Number(value || 0) * 100) / 100;
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

async function setPresence(id, present) {
  const path = present ? "/api/attendance/check-in" : "/api/attendance/check-out";
  await post(path, { delegationId: id }, present ? "Delegace označena jako přítomná." : "Delegace označena jako nepřítomná.");
}

async function generateVoteLinks() {
  if (!confirm("Vygenerovat nové unikátní hlasovací odkazy pro všechny delegace? Stávající odkazy se tím nahradí.")) return;
  await request("/api/attendance/generate-links", { method: "POST", body: {} }, "Hlasovací odkazy byly vygenerovány.");
}

async function exportAttendanceXlsx() {
  try {
    const res = await fetch("/api/attendance/export", { method: "POST" });
    if (!res.ok) throw new Error(`Export selhal (${res.status}).`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "prezence.xlsx";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast("Export XLSX připraven.");
  } catch (err) {
    showToast(err.message);
  }
}

async function exportQRCodesPdf() {
  try {
    const res = await fetch("/api/attendance/qr-codes", { method: "POST" });
    const type = res.headers.get("Content-Type") || "";
    if (!res.ok) {
      const data = type.includes("application/json") ? await res.json().catch(() => null) : null;
      throw new Error(data?.error?.message || `Export QR PDF selhal (${res.status}).`);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "hlasovaci-qr-kody.pdf";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    await load(false);
    showToast("QR PDF připraveno.");
  } catch (err) {
    showToast(err.message);
  }
}

async function importAttendanceFile(file) {
  if (!file) return;
  const form = new FormData();
  form.append("file", file);
  try {
    const res = await fetch("/api/attendance/import", { method: "POST", body: form });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error?.message || `Import selhal (${res.status}).`);
    await load(false);
    showToast(`Importováno řádků: ${data?.imported ?? 0}`);
  } catch (err) {
    showToast(err.message);
  }
}

async function importPreferenceFile(file) {
  if (!file) return;
  if (!confirm("Import rozřadí účastníky k delegacím podle preferencí a přepíše současné osobní údaje u dotčených států. Pokračovat?")) return;
  const form = new FormData();
  form.append("file", file);
  try {
    const res = await fetch("/api/attendance/import-preferences", { method: "POST", body: form });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error?.message || `Import preferencí selhal (${res.status}).`);
    await load(false);
    showToast(`Rozřazeno účastníků: ${data?.imported ?? 0}${data?.skipped ? `, nepřiřazeno: ${data.skipped}` : ""}`);
  } catch (err) {
    showToast(err.message);
  }
}

async function importLayoutFile(file) {
  if (!file) return;
  const form = new FormData();
  form.append("file", file);
  try {
    const res = await fetch("/api/layout/import", { method: "POST", body: form });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error?.message || `Import rozložení selhal (${res.status}).`);
    await load(false);
    showToast(`Importováno stolů: ${data?.imported ?? 0}${data?.skipped ? `, přeskočeno: ${data.skipped}` : ""}`);
  } catch (err) {
    showToast(err.message);
  }
}

async function importAgendaFile(file) {
  if (!file) return;
  if (!confirm("Import agendy nahradí současnou agendu obsahem souboru. Pokračovat?")) return;
  const form = new FormData();
  form.append("file", file);
  try {
    const res = await fetch("/api/agenda/import", { method: "POST", body: form });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error?.message || `Import agendy selhal (${res.status}).`);
    await load(false);
    showToast(`Importováno bodů agendy: ${data?.imported ?? 0}${data?.skipped ? `, přeskočeno: ${data.skipped}` : ""}`);
  } catch (err) {
    showToast(err.message);
  }
}

async function markAllPresence(present) {
  const delegations = state.attendance.delegations || state.delegations || [];
  try {
    await Promise.all(delegations.map((delegation) => api(present ? "/api/attendance/check-in" : "/api/attendance/check-out", {
      method: "POST",
      body: { delegationId: delegation.id }
    })));
    await load(false);
    showToast(present ? "Všichni označeni jako přítomní." : "Všichni označeni jako nepřítomní.");
  } catch (err) {
    showToast(err.message);
  }
}

async function copyVoteLink(token) {
  const link = voteLinkUrl(token);
  if (!link) {
    showToast("Odkaz není dostupný.");
    return;
  }

  let copied = false;

  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(link);
      copied = true;
    } catch {
      copied = false;
    }
  }

  if (!copied) {
    copied = copyTextFallback(link);
  }

  if (copied) {
    showToast("Hlasovací odkaz zkopírován.");
  } else {
    showToast(`Odkaz se nepodařilo zkopírovat. Zkopíruj ho ručně: ${link}`);
  }
}

function copyTextFallback(value) {
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "-1000px";
  textarea.style.left = "-1000px";
  textarea.style.opacity = "0";

  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    textarea.remove();
  }
}

function voteLinkUrl(token) {
  if (!token) return "";
  return `${window.location.origin}/vote?token=${encodeURIComponent(token)}`;
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
    if (isUnauthorizedError(err)) {
      state = null;
      renderLogin(err.message);
      return;
    }
    showToast(err.message);
  }
}

function isUnauthorizedError(err) {
  return err?.status === 401 || err?.code === "unauthorized";
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
  return `SSE ${realtimeStatus} · ${new Date().toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}`;
}

function defaultSeat(index) {
  const columns = 5;
  return { x: 5 + (index % columns) * 18, y: 7 + Math.floor(index / columns) * 14, w: 15, h: 9, rotation: 0 };
}

function resolutionOptions() {
  return mutableResolutionPoints().map((point) => `<option value="${point.id}">${point.number}. ${esc(shorten(point.text, 90))}</option>`).join("");
}

function resolutionOptionsWithSelected(selected) {
  return mutableResolutionPoints().map((point) => `<option value="${point.id}" ${Number(selected || 0) === Number(point.id) ? "selected" : ""}>${point.number}. ${esc(shorten(point.text, 90))}</option>`).join("");
}

function mutableResolutionPoints() {
  return (state.resolution.points || []).filter((point) => !point.template && point.sourceAmendmentId);
}

function amendmentTypeOptions(selected) {
  return [
    ["add", "Přidat bod"],
    ["update", "Upravit bod"],
    ["remove", "Odstranit bod"]
  ].map(([value, label]) => `<option value="${value}" ${selected === value ? "selected" : ""}>${label}</option>`).join("");
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

function agendaStartLabel(item) {
  return item.startsAt ? dateTimeLabel(item.startsAt) : "";
}

function agendaDurationFromTimes(item) {
  if (!item.startsAt || !item.endsAt) return 0;
  const start = new Date(item.startsAt).getTime();
  const end = new Date(item.endsAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return Math.round((end - start) / 60000);
}

function dateTimeLabel(value) {
  if (!value) return "";
  return new Date(value).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function timeInputValue(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
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

function formatRichText(value) {
  let html = esc(value);
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  html = html.replace(/\n/g, "<br>");
  return html;
}

function statusLabel(value) {
  return ({
    submitted: "Nový",
    accepted: "Zapracovaný",
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
  return new Date(value).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit", hour12: false });
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

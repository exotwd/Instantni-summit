(function () {
  function supportsFlagEmoji() {
    var canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 32;
    var ctx = canvas.getContext("2d");
    if (!ctx) return false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = "28px sans-serif";
    ctx.textBaseline = "top";
    ctx.fillText("🇺🇸", 0, 0);
    var pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    for (var i = 0; i < pixels.length; i += 4) {
      if (pixels[i + 3] === 0) continue;
      if (pixels[i] !== pixels[i + 1] || pixels[i] !== pixels[i + 2]) return true;
    }
    return false;
  }

  if (!supportsFlagEmoji()) {
    document.documentElement.classList.add("flag-emoji-polyfill");
  }
})();

(function () {
  var patchTimer = null;
  var speakerClickTimer = null;

  installAntiFlickerStyle();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startAdminPatch);
  } else {
    startAdminPatch();
  }

  function installAntiFlickerStyle() {
    if (document.getElementById("dashboard-speaker-schema-style")) return;
    var style = document.createElement("style");
    style.id = "dashboard-speaker-schema-style";
    style.textContent = [
      ".dashboard-grid.compact-dashboard > .speaker-panel:not([data-schema-patched=\"1\"]) { display: none !important; }",
      "[data-debate] { display: none !important; }",
      ".debate-flow-card .debate-select-grid { margin-top: 12px; }",
      ".debate-flow-card .selected { outline: 3px solid #1d4ed8; }",
      ".debate-flow-note { color: #64748b; margin-top: 8px; }"
    ].join("\n");
    document.head.appendChild(style);
  }

  function startAdminPatch() {
    var observer = new MutationObserver(schedulePatch);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    schedulePatch();
  }

  function schedulePatch() {
    clearTimeout(patchTimer);
    patchTimer = setTimeout(patchAdmin, 0);
  }

  async function patchAdmin() {
    patchScreenLabels();
    var adminRoot = document.querySelector(".wrap");
    if (!adminRoot) return;
    var adminState;
    try {
      adminState = await fetchJson("/api/admin/state");
    } catch {
      return;
    }
    patchDashboardSpeakerSchema(adminState);
    patchAmendmentButtons(adminState);
    patchVotingDebateControls(adminState);
  }

  function patchDashboardSpeakerSchema(adminState) {
    var grid = document.querySelector(".dashboard-grid.compact-dashboard");
    var speakerPanel = grid && grid.querySelector(".speaker-panel");
    if (!grid || !speakerPanel || speakerPanel.dataset.schemaPatched === "1") return;

    speakerPanel.dataset.schemaPatched = "1";
    speakerPanel.classList.remove("compact-card");
    grid.parentNode.insertBefore(speakerPanel, grid);

    var h2 = speakerPanel.querySelector("h2");
    if (h2 && !speakerPanel.querySelector(".speaker-help")) {
      h2.insertAdjacentHTML("afterend", "<p class=\"speaker-help\">Kliknutím na stát ho přidáš do pořadníku. Dvojklikem ho přidáš jako reakci na aktuální projev.</p>");
    }

    var stageWrap = document.createElement("div");
    stageWrap.className = "stage-wrap";
    stageWrap.innerHTML = "<div class=\"stage speaker-stage\">" + renderChairMarker(adminState) + renderSpeakerSeats(adminState) + "</div>";

    var compactList = speakerPanel.querySelector(".delegation-chip-grid");
    if (compactList) {
      compactList.replaceWith(stageWrap);
    } else if (!speakerPanel.querySelector(".speaker-stage")) {
      speakerPanel.appendChild(stageWrap);
    }

    bindSpeakerSeats(stageWrap);
  }

  function patchAmendmentButtons(adminState) {
    document.querySelectorAll("[data-debate]").forEach(function (button) {
      button.remove();
    });
    document.querySelectorAll("[data-start-voting]").forEach(function (button) {
      var amendmentId = Number(button.dataset.startVoting);
      var amendment = (adminState.amendments || []).find(function (item) { return Number(item.id) === amendmentId; });
      if (!amendment || amendment.status !== "introduced") return;
      button.disabled = false;
      button.textContent = activeDebateFor(adminState, amendmentId) ? "Pokračovat k hlasování" : "Zahájit hlasování";
      button.onclick = async function (event) {
        event.preventDefault();
        event.stopPropagation();
        await startVotingFlow(amendmentId);
      };
    });
  }

  function patchVotingDebateControls(adminState) {
    var votingPanel = document.querySelector(".voting-current");
    if (!votingPanel || votingPanel.dataset.debateFlowPatched === "1") return;
    var debate = adminState.debate || {};
    var session = debate.session;
    if (!session) return;
    votingPanel.dataset.debateFlowPatched = "1";
    votingPanel.insertAdjacentHTML("afterend", renderDebateFlowCard(adminState));
    bindDebateFlowControls();
  }

  function renderDebateFlowCard(adminState) {
    var debate = adminState.debate || {};
    var session = debate.session || {};
    var phase = session.phase || "";
    var amendment = debate.amendment || {};
    var selection = (phase === "select_supporter" || phase === "select_opponent");
    return "<div class=\"card debate-flow-card\">" +
      "<h2>Průběh před hlasováním" + (amendment.number ? " o PN " + esc(amendment.number) : "") + "</h2>" +
      "<div class=\"meta\">" +
      "<div><strong>Fáze</strong><br>" + debatePhaseLabel(phase) + "</div>" +
      "<div><strong>Předkladatel</strong><br>" + personLabel(debate.submitter, amendment.submitterName || "Předkladatel") + "</div>" +
      "<div><strong>Podporovatel</strong><br>" + personLabel(debate.supporter, "nevybrán") + "</div>" +
      "<div><strong>Odpůrce</strong><br>" + personLabel(debate.opponent, "nevybrán") + "</div>" +
      "</div>" +
      (amendment.text ? "<p>" + esc(shorten(amendment.text, 220)) + "</p>" : "") +
      (selection ? renderDebateSelection(adminState, phase, debate) : "") +
      "<div class=\"actions\">" +
      "<button class=\"vote-button\" data-debate-flow-next>" + nextDebateButtonLabel(phase) + "</button>" +
      "<button class=\"reject\" data-debate-flow-cancel>Zrušit jednání</button>" +
      "</div>" +
      "<div class=\"debate-flow-note\">Mezi jednotlivými projevy se kliká dvakrát: první klik ukončí předchozí krok, druhý spustí další projev nebo hlasování.</div>" +
      "</div>";
  }

  function renderDebateSelection(adminState, phase, debate) {
    var delegations = (adminState.delegations || []).filter(function (item) { return item.present; });
    var label = phase === "select_supporter" ? "Vyber podporovatele" : "Vyber odpůrce";
    var selectedId = phase === "select_supporter" ? debate.session.supporterDelegationId : debate.session.opponentDelegationId;
    return "<div><strong>" + label + "</strong><div class=\"debate-select-grid\">" +
      delegations.map(function (delegation) {
        var selected = Number(selectedId || 0) === Number(delegation.id);
        return "<button class=\"save " + (selected ? "selected" : "") + "\" data-debate-flow-select=\"" + Number(delegation.id) + "\">" + flagName(delegation) + "</button>";
      }).join("") +
      "</div></div>";
  }

  function bindDebateFlowControls() {
    document.querySelectorAll("[data-debate-flow-select]").forEach(function (button) {
      button.onclick = async function () {
        await requestJson("/api/debate/select", { delegationId: Number(button.dataset.debateFlowSelect) });
        clickPanel("voting");
        reloadAdminState();
      };
    });
    var next = document.querySelector("[data-debate-flow-next]");
    if (next) {
      next.onclick = async function () {
        var state = await fetchJson("/api/admin/state");
        var debate = state.debate || {};
        var phase = debate.session && debate.session.phase;
        if (phase === "ready_to_vote" && debate.amendment && debate.amendment.id) {
          await requestJson("/api/admin/voting/start", { amendmentId: Number(debate.amendment.id) });
        } else {
          await requestJson("/api/debate/next", {});
        }
        clickPanel("voting");
        reloadAdminState();
      };
    }
    var cancel = document.querySelector("[data-debate-flow-cancel]");
    if (cancel) {
      cancel.onclick = async function () {
        await requestJson("/api/debate/cancel", {});
        reloadAdminState();
      };
    }
  }

  async function startVotingFlow(amendmentId) {
    var state = await fetchJson("/api/admin/state");
    var debate = activeDebateFor(state, amendmentId);
    if (debate && debate.session && debate.session.phase === "ready_to_vote") {
      await requestJson("/api/admin/voting/start", { amendmentId: amendmentId });
    } else if (!debate) {
      await requestJson("/api/amendments/" + amendmentId + "/debate", {});
    }
    clickPanel("voting");
    reloadAdminState();
  }

  function activeDebateFor(adminState, amendmentId) {
    var debate = adminState.debate || {};
    if (!debate.session || !debate.amendment) return null;
    return Number(debate.amendment.id) === Number(amendmentId) ? debate : null;
  }

  async function fetchJson(path) {
    var response = await fetch(path, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error("Request failed: " + response.status);
    return response.json();
  }

  async function requestJson(path, body) {
    var response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body || {})
    });
    if (!response.ok) {
      var data = await response.json().catch(function () { return null; });
      throw new Error((data && data.error && data.error.message) || "Request failed: " + response.status);
    }
    return response.json().catch(function () { return null; });
  }

  function renderSpeakerSeats(adminState) {
    var delegations = adminState.delegations || (adminState.attendance && adminState.attendance.delegations) || [];
    return delegations.map(function (delegation, index) {
      var seat = delegation.seat || defaultSeat(index);
      var rotation = Number(seat.rotation || 0);
      return "<div class=\"seat speaker-seat\" data-dashboard-speaker-seat=\"" + Number(delegation.id) + "\" style=\"left:" + number(seat.x) + "%;top:" + number(seat.y) + "%;width:" + number(seat.w) + "%;height:" + number(seat.h) + "%;transform:rotate(" + rotation + "deg);\"><div class=\"seat-inner\" style=\"transform:rotate(" + (-rotation) + "deg);\"><div class=\"seat-flag\">" + esc(delegation.flag || "") + "</div><div class=\"seat-code\">" + esc(delegation.code || "") + "</div><div class=\"seat-name\">" + esc(delegation.name || "") + "</div></div></div>";
    }).join("");
  }

  function renderChairMarker(adminState) {
    var chair = chairSeat(adminState);
    return "<div class=\"chair-marker\" aria-label=\"Předsedající\" style=\"left:" + chair.x + "%;top:" + chair.y + "%;width:" + chair.w + "%;min-height:" + chair.h + "%;transform:rotate(" + chair.rotation + "deg);\"><div class=\"chair-label\">PŘEDSEDNICTVO</div><div class=\"chair-desk\">CHAIR</div></div>";
  }

  function chairSeat(adminState) {
    var values = (adminState.settings && adminState.settings.values) || {};
    return {
      x: numberSetting(values.chair_x, 38),
      y: numberSetting(values.chair_y, 2.2),
      w: numberSetting(values.chair_w, 24),
      h: numberSetting(values.chair_h, 7),
      rotation: numberSetting(values.chair_rotation, 0)
    };
  }

  function bindSpeakerSeats(root) {
    root.querySelectorAll("[data-dashboard-speaker-seat]").forEach(function (seat) {
      seat.onclick = function () {
        if (speakerClickTimer) return;
        var delegationId = Number(seat.dataset.dashboardSpeakerSeat);
        speakerClickTimer = setTimeout(async function () {
          speakerClickTimer = null;
          await requestJson("/api/speakers/add", { delegationId: delegationId });
          reloadAdminState();
        }, 220);
      };
      seat.ondblclick = async function () {
        clearTimeout(speakerClickTimer);
        speakerClickTimer = null;
        await requestJson("/api/speakers/reaction", { delegationId: Number(seat.dataset.dashboardSpeakerSeat) });
        reloadAdminState();
      };
    });
  }

  function reloadAdminState() {
    var reloadButton = document.querySelector("[data-reload]");
    if (reloadButton) reloadButton.click();
  }

  function clickPanel(id) {
    var button = document.querySelector("[data-panel=\"" + id + "\"]");
    if (button) button.click();
  }

  function patchScreenLabels() {
    document.querySelectorAll(".debate-phase").forEach(function (node) {
      if (node.textContent === "opponent_ready") node.textContent = "Prostor odpůrci je připraven";
    });
  }

  function defaultSeat(index) {
    var columns = 5;
    return { x: 5 + (index % columns) * 18, y: 7 + Math.floor(index / columns) * 14, w: 15, h: 9, rotation: 0 };
  }

  function numberSetting(value, fallback) {
    var parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function number(value) {
    var parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function personLabel(delegation, fallback) {
    return delegation ? flagName(delegation) : esc(fallback || "");
  }

  function flagName(delegation) {
    return (esc(delegation.flag || "") + " " + esc(delegation.code || "") + " " + esc(delegation.name || "")).trim();
  }

  function debatePhaseLabel(value) {
    return ({
      submitter_reading: "Mluví předkladatel",
      select_supporter: "Vyber podporovatele a potom odpůrce",
      select_opponent: "Vyber odpůrce, potom klikni znovu pro spuštění dalšího projevu",
      supporter_speaking: "Mluví podporovatel",
      opponent_ready: "Prostor odpůrci je připraven",
      opponent_speaking: "Mluví odpůrce",
      ready_to_vote: "Připraveno ke spuštění hlasování"
    })[value] || value || "";
  }

  function nextDebateButtonLabel(phase) {
    return ({
      submitter_reading: "Ukončit předkladatele a vybrat podporovatele/odpůrce",
      select_supporter: "Pokračovat k výběru odpůrce",
      select_opponent: "Spustit projev podporovatele",
      supporter_speaking: "Ukončit podporovatele",
      opponent_ready: "Spustit projev odpůrce",
      opponent_speaking: "Ukončit odpůrce",
      ready_to_vote: "Spustit hlasování"
    })[phase] || "Další krok";
  }

  function shorten(text, max) {
    text = String(text || "");
    return text.length <= max ? text : text.slice(0, max - 1) + "…";
  }

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[char];
    });
  }
})();

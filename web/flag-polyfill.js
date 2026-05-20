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
    document.addEventListener("DOMContentLoaded", startDashboardSpeakerPatch);
  } else {
    startDashboardSpeakerPatch();
  }

  function installAntiFlickerStyle() {
    if (document.getElementById("dashboard-speaker-schema-style")) return;
    var style = document.createElement("style");
    style.id = "dashboard-speaker-schema-style";
    style.textContent = ".dashboard-grid.compact-dashboard > .speaker-panel:not([data-schema-patched=\"1\"]) { display: none !important; }";
    document.head.appendChild(style);
  }

  function startDashboardSpeakerPatch() {
    var observer = new MutationObserver(schedulePatch);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    schedulePatch();
  }

  function schedulePatch() {
    clearTimeout(patchTimer);
    patchTimer = setTimeout(patchDashboardSpeakerSchema, 0);
  }

  async function patchDashboardSpeakerSchema() {
    var grid = document.querySelector(".dashboard-grid.compact-dashboard");
    var speakerPanel = grid && grid.querySelector(".speaker-panel");
    if (!grid || !speakerPanel || speakerPanel.dataset.schemaPatched === "1") return;

    var adminState;
    try {
      adminState = await fetchJson("/api/admin/state");
    } catch {
      return;
    }

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

  async function fetchJson(path) {
    var response = await fetch(path, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error("Request failed: " + response.status);
    return response.json();
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
          await postJson("/api/speakers/add", { delegationId: delegationId });
          reloadAdminState();
        }, 220);
      };
      seat.ondblclick = async function () {
        clearTimeout(speakerClickTimer);
        speakerClickTimer = null;
        await postJson("/api/speakers/reaction", { delegationId: Number(seat.dataset.dashboardSpeakerSeat) });
        reloadAdminState();
      };
    });
  }

  async function postJson(path, body) {
    var response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body)
    });
    if (!response.ok) throw new Error("Request failed: " + response.status);
  }

  function reloadAdminState() {
    var reloadButton = document.querySelector("[data-reload]");
    if (reloadButton) reloadButton.click();
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

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[char];
    });
  }
})();

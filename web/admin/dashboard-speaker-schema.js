(() => {
  let patchTimer = null;
  let speakerClickTimer = null;

  const observer = new MutationObserver(schedulePatch);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("DOMContentLoaded", schedulePatch);
  schedulePatch();

  function schedulePatch() {
    clearTimeout(patchTimer);
    patchTimer = setTimeout(patchDashboardSpeakerSchema, 60);
  }

  async function patchDashboardSpeakerSchema() {
    const grid = document.querySelector(".dashboard-grid.compact-dashboard");
    const speakerPanel = grid?.querySelector(".speaker-panel");
    if (!grid || !speakerPanel || speakerPanel.dataset.schemaPatched === "1") return;

    let adminState;
    try {
      adminState = await fetchJson("/api/admin/state");
    } catch {
      return;
    }

    speakerPanel.dataset.schemaPatched = "1";
    speakerPanel.classList.remove("compact-card");
    grid.parentNode.insertBefore(speakerPanel, grid);

    const h2 = speakerPanel.querySelector("h2");
    if (h2 && !speakerPanel.querySelector(".speaker-help")) {
      h2.insertAdjacentHTML(
        "afterend",
        `<p class="speaker-help">Kliknutím na stát ho přidáš do pořadníku. Dvojklikem ho přidáš jako reakci na aktuální projev.</p>`
      );
    }

    const stageWrap = document.createElement("div");
    stageWrap.className = "stage-wrap";
    stageWrap.innerHTML = `<div class="stage speaker-stage">${renderChairMarker(adminState)}${renderSpeakerSeats(adminState)}</div>`;

    const compactList = speakerPanel.querySelector(".delegation-chip-grid");
    if (compactList) {
      compactList.replaceWith(stageWrap);
    } else if (!speakerPanel.querySelector(".speaker-stage")) {
      speakerPanel.appendChild(stageWrap);
    }

    bindSpeakerSeats(stageWrap);
  }

  async function fetchJson(path) {
    const response = await fetch(path, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`Request failed: ${response.status}`);
    return response.json();
  }

  function renderSpeakerSeats(adminState) {
    const delegations = adminState.delegations || adminState.attendance?.delegations || [];
    return delegations.map((delegation, index) => {
      const seat = delegation.seat || defaultSeat(index);
      const rotation = Number(seat.rotation || 0);
      return `
        <div class="seat speaker-seat" data-dashboard-speaker-seat="${Number(delegation.id)}" style="left:${number(seat.x)}%;top:${number(seat.y)}%;width:${number(seat.w)}%;height:${number(seat.h)}%;transform:rotate(${rotation}deg);">
          <div class="seat-inner" style="transform:rotate(${-rotation}deg);">
            <div class="seat-flag">${esc(delegation.flag || "")}</div>
            <div class="seat-code">${esc(delegation.code || "")}</div>
            <div class="seat-name">${esc(delegation.name || "")}</div>
          </div>
        </div>`;
    }).join("");
  }

  function renderChairMarker(adminState) {
    const chair = chairSeat(adminState);
    return `
      <div class="chair-marker" aria-label="Předsedající" style="left:${chair.x}%;top:${chair.y}%;width:${chair.w}%;min-height:${chair.h}%;transform:rotate(${chair.rotation}deg);">
        <div class="chair-label">PŘEDSEDNICTVO</div>
        <div class="chair-desk">CHAIR</div>
      </div>`;
  }

  function chairSeat(adminState) {
    const values = adminState.settings?.values || {};
    return {
      x: numberSetting(values.chair_x, 38),
      y: numberSetting(values.chair_y, 2.2),
      w: numberSetting(values.chair_w, 24),
      h: numberSetting(values.chair_h, 7),
      rotation: numberSetting(values.chair_rotation, 0)
    };
  }

  function bindSpeakerSeats(root) {
    root.querySelectorAll("[data-dashboard-speaker-seat]").forEach((seat) => {
      seat.onclick = () => {
        if (speakerClickTimer) return;
        const delegationId = Number(seat.dataset.dashboardSpeakerSeat);
        speakerClickTimer = setTimeout(async () => {
          speakerClickTimer = null;
          await postJson("/api/speakers/add", { delegationId });
          reloadAdminState();
        }, 220);
      };
      seat.ondblclick = async () => {
        clearTimeout(speakerClickTimer);
        speakerClickTimer = null;
        await postJson("/api/speakers/reaction", { delegationId: Number(seat.dataset.dashboardSpeakerSeat) });
        reloadAdminState();
      };
    });
  }

  async function postJson(path, body) {
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body)
    });
    if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  }

  function reloadAdminState() {
    const reloadButton = document.querySelector("[data-reload]");
    if (reloadButton) reloadButton.click();
  }

  function defaultSeat(index) {
    const columns = 5;
    return { x: 5 + (index % columns) * 18, y: 7 + Math.floor(index / columns) * 14, w: 15, h: 9, rotation: 0 };
  }

  function numberSetting(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function number(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
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
})();

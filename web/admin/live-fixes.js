(() => {
  const style = document.createElement('style');
  style.textContent = `
    .dashboard-grid.compact-dashboard > .speaker-panel:not([data-schema-patched="1"]) { display: none !important; }
    [data-debate] { display: none !important; }
    .debate-flow-card .stage-wrap { margin-top: 12px; }
    .debate-flow-card .seat { cursor: pointer; }
    .debate-flow-card .seat.selected { outline: 4px solid #2563eb; }
    .settings-import-result { white-space: pre-wrap; margin-top: 12px; }
  `;
  document.head.appendChild(style);

  let timer = null;
  const observer = new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(patch, 0);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  patch();

  async function patch() {
    if (!document.querySelector('.wrap')) return;
    const state = await getState().catch(() => null);
    if (!state) return;
    fixDashboardSchema(state);
    fixAmendmentButtons(state);
    addSettingsTools(state);
  }

  async function getState() {
    const res = await fetch('/api/admin/state', { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error('state failed');
    return res.json();
  }

  async function post(path, body) {
    const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body || {}) });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error(data?.error?.message || `Request failed ${res.status}`);
    }
  }

  function reload() {
    document.querySelector('[data-reload]')?.click();
  }

  function panel(id) {
    document.querySelector(`[data-panel="${id}"]`)?.click();
  }

  function fixDashboardSchema(state) {
    const grid = document.querySelector('.dashboard-grid.compact-dashboard');
    const speakerPanel = grid?.querySelector('.speaker-panel');
    if (!grid || !speakerPanel || speakerPanel.dataset.schemaPatched === '1') return;
    speakerPanel.classList.remove('compact-card');
    const chips = speakerPanel.querySelector('.delegation-chip-grid');
    const wrap = document.createElement('div');
    wrap.className = 'stage-wrap';
    wrap.innerHTML = `<div class="stage speaker-stage">${chair(state)}${seats(state, 'data-speaker-pick')}</div>`;
    if (chips) chips.replaceWith(wrap);
    grid.parentNode.insertBefore(speakerPanel, grid);
    speakerPanel.dataset.schemaPatched = '1';
    wrap.querySelectorAll('[data-speaker-pick]').forEach(el => {
      el.onclick = () => post('/api/speakers/add', { delegationId: Number(el.dataset.speakerPick) }).then(reload);
      el.ondblclick = () => post('/api/speakers/reaction', { delegationId: Number(el.dataset.speakerPick) }).then(reload);
    });
  }

  function fixAmendmentButtons(state) {
    document.querySelectorAll('[data-debate]').forEach(b => b.remove());
    document.querySelectorAll('[data-start-voting]').forEach(b => {
      const id = Number(b.dataset.startVoting);
      const amendment = (state.amendments || []).find(a => Number(a.id) === id);
      if (!amendment || amendment.status !== 'introduced') return;
      b.disabled = false;
      b.textContent = activeDebate(state, id) ? 'Pokračovat k hlasování' : 'Zahájit hlasování';
      b.onclick = async e => {
        e.preventDefault();
        e.stopPropagation();
        const fresh = await getState();
        const debate = activeDebate(fresh, id);
        if (debate?.session?.phase === 'ready_to_vote') await post('/api/admin/voting/start', { amendmentId: id });
        else if (!debate) await post(`/api/amendments/${id}/debate`, {});
        panel('voting');
        reload();
      };
    });
    const voting = document.querySelector('.voting-current');
    if (voting && state.debate?.session && !document.querySelector('.debate-flow-card')) {
      voting.insertAdjacentHTML('afterend', debateCard(state));
      bindDebateCard();
    }
  }

  function debateCard(state) {
    const debate = state.debate || {};
    const phase = debate.session?.phase || '';
    const selecting = phase === 'select_supporter' || phase === 'select_opponent';
    return `<div class="card debate-flow-card"><h2>Průběh před hlasováním</h2><div class="meta"><div><strong>Fáze</strong><br>${phaseLabel(phase)}</div><div><strong>Podporovatel</strong><br>${name(debate.supporter) || 'nevybrán'}</div><div><strong>Odpůrce</strong><br>${name(debate.opponent) || 'nevybrán'}</div></div>${selecting ? `<p>Výběr proveď kliknutím do schématu.</p><div class="stage-wrap"><div class="stage">${chair(state)}${seats(state, 'data-debate-pick', phase === 'select_supporter' ? debate.session.supporterDelegationId : debate.session.opponentDelegationId)}</div></div>` : ''}<div class="actions"><button class="vote-button" data-debate-next>${phase === 'ready_to_vote' ? 'Spustit hlasování' : 'Další krok'}</button><button class="reject" data-debate-cancel>Zrušit jednání</button></div></div>`;
  }

  function bindDebateCard() {
    document.querySelectorAll('[data-debate-pick]').forEach(el => el.onclick = () => post('/api/debate/select', { delegationId: Number(el.dataset.debatePick) }).then(() => { panel('voting'); reload(); }));
    document.querySelector('[data-debate-next]')?.addEventListener('click', async () => {
      const state = await getState();
      const debate = state.debate || {};
      if (debate.session?.phase === 'ready_to_vote') await post('/api/admin/voting/start', { amendmentId: Number(debate.amendment.id) });
      else await post('/api/debate/next', {});
      panel('voting');
      reload();
    });
    document.querySelector('[data-debate-cancel]')?.addEventListener('click', () => post('/api/debate/cancel', {}).then(reload));
  }

  function addSettingsTools(state) {
    const danger = document.querySelector('.danger-zone');
    if (!danger || document.querySelector('.settings-extra-tools')) return;
    danger.insertAdjacentHTML('afterend', `<div class="card settings-extra-tools"><h2>PN a rozřazení účastníků</h2><div class="actions"><button class="reject" data-delete-pn>Odstranit aktivní PN</button><button class="save" data-pref-import>Nahrát preference CSV/TSV</button></div><input id="prefFile" type="file" accept=".csv,.tsv,.txt" hidden><div id="prefResult" class="settings-import-result"></div></div>`);
    document.querySelector('[data-delete-pn]').onclick = async () => {
      if (!confirm('Opravdu odstranit aktivní PN?')) return;
      const fresh = await getState();
      for (const a of fresh.amendments || []) if (!['passed','failed','rejected'].includes(a.status)) await post(`/api/amendments/${a.id}/reject`, {});
      reload();
    };
    const input = document.querySelector('#prefFile');
    document.querySelector('[data-pref-import]').onclick = () => input.click();
    input.onchange = async () => {
      const text = await input.files[0].text();
      const rows = assign(text, (await getState()).delegations || []);
      await post('/api/attendance/import', { rows });
      document.querySelector('#prefResult').textContent = `Importováno delegací: ${rows.length}`;
      reload();
    };
  }

  function assign(text, delegations) {
    const lines = text.trim().split(/\r?\n/).map(l => l.split(l.includes('\t') ? '\t' : ';'));
    const h = lines.shift().map(norm);
    const idx = names => names.map(norm).map(n => h.indexOf(n)).find(i => i >= 0) ?? -1;
    const iName = idx(['Jméno']), iEmail = idx(['E-mail']), iP1 = idx(['Preference zastupovaného státu 1']), iP2 = idx(['Preference zastupovaného státu 2']), iP3 = idx(['Preference zastupovaného státu 3']), iAnti = idx(['Antipreference zastupovaného státu']);
    const used = new Set();
    const out = [];
    for (const r of lines) {
      const prefs = [r[iP1], r[iP2], r[iP3]].map(norm);
      const anti = norm(r[iAnti]);
      const d = delegations.find(x => !used.has(x.id) && norm(x.name) !== anti && prefs.includes(norm(x.name))) || delegations.find(x => !used.has(x.id) && norm(x.name) !== anti);
      if (!d) continue;
      used.add(d.id);
      out.push({ delegationId: d.id, name: (r[iName] || '').trim(), email: (r[iEmail] || '').trim(), note: `Automaticky rozřazeno. Preference: ${[r[iP1], r[iP2], r[iP3]].filter(Boolean).join(', ')}. Antipreference: ${r[iAnti] || ''}` });
    }
    return out;
  }

  function activeDebate(state, id) { return Number(state.debate?.amendment?.id) === Number(id) ? state.debate : null; }
  function chair(state) { const v = state.settings?.values || {}; return `<div class="chair-marker" style="left:${num(v.chair_x,38)}%;top:${num(v.chair_y,2.2)}%;width:${num(v.chair_w,24)}%;min-height:${num(v.chair_h,7)}%;transform:rotate(${num(v.chair_rotation,0)}deg);"><div class="chair-label">PŘEDSEDNICTVO</div><div class="chair-desk">CHAIR</div></div>`; }
  function seats(state, attr, selected) { return (state.delegations || []).map((d,i) => { const s=d.seat || {x:5+(i%5)*18,y:7+Math.floor(i/5)*14,w:15,h:9,rotation:0}; return `<div class="seat ${Number(selected)===Number(d.id)?'selected':''}" ${attr}="${d.id}" style="left:${s.x}%;top:${s.y}%;width:${s.w}%;height:${s.h}%;transform:rotate(${s.rotation||0}deg);"><div class="seat-inner" style="transform:rotate(${-(s.rotation||0)}deg);"><div class="seat-flag">${esc(d.flag||'')}</div><div class="seat-code">${esc(d.code||'')}</div><div class="seat-name">${esc(d.name||'')}</div></div></div>`; }).join(''); }
  function phaseLabel(p) { return ({submitter_reading:'Mluví předkladatel',select_supporter:'Výběr podporovatele',select_opponent:'Výběr odpůrce',supporter_speaking:'Mluví podporovatel',opponent_ready:'Prostor odpůrci je připraven',opponent_speaking:'Mluví odpůrce',ready_to_vote:'Připraveno ke spuštění hlasování'})[p] || p; }
  function name(d) { return d ? `${d.flag||''} ${d.code||''} ${d.name||''}`.trim() : ''; }
  function num(v,f){ const n=Number(v); return Number.isFinite(n)?n:f; }
  function norm(v){ return String(v||'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[-_.\/]/g,' ').replace(/\s+/g,' '); }
  function esc(v){ return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
})();

let currentUser = null;
let isAdmin = false;
let cache = { users: [], teams: [], matches: [] };

async function api(path, opts = {}) {
  const res = await fetch('/api' + path, {
    method: opts.method || 'GET',
    headers: opts.body instanceof FormData ? {} : { 'Content-Type': 'application/json' },
    body: opts.body instanceof FormData ? opts.body : (opts.body ? JSON.stringify(opts.body) : undefined)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'صار مشكل، عاود جرب.');
  return data;
}

function val(id) { return document.getElementById(id).value; }
function clearFields(ids) { ids.forEach(id => document.getElementById(id).value = ''); }
function showMsg(el, type, text) {
  el.innerHTML = `<div class="msg ${type}">${text}</div>`;
  setTimeout(() => { if (el.innerHTML.includes(text)) el.innerHTML = ''; }, 6000);
}

/* ---------- nav ---------- */
function switchTab(tab) {
  document.querySelectorAll('section').forEach(s => s.classList.remove('active'));
  document.getElementById(tab).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  document.querySelector(`.nav-item[data-tab="${tab}"]`).classList.add('active');
  if (tab === 'board') renderBoards();
  if (tab === 'matches') renderMatches();
  if (tab === 'team') renderTeam();
  if (tab === 'admin' && isAdmin) renderAdmin();
}
document.querySelectorAll('.nav-item').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));
function scrollToReg() { document.getElementById('regCard').scrollIntoView({ behavior: 'smooth' }); }

function renderAuthArea() {
  const el = document.getElementById('authArea');
  el.innerHTML = currentUser
    ? `<div class="userchip"><span class="dot"></span> ${currentUser.username} · <span class="mono">${currentUser.points || 0} نقطة</span> <button onclick="logout()">خروج</button></div>`
    : '';
}

/* ---------- auth ---------- */
async function doRegister() {
  const msg = document.getElementById('regMsg');
  const body = {
    username: val('regUser').trim(), password: val('regPass'),
    gameId: val('regGameId').trim(), whatsapp: val('regWa').trim(),
    instagram: val('regInsta').trim(), telegram: val('regTg').trim(), facebook: val('regFb').trim()
  };
  try {
    const data = await api('/register', { method: 'POST', body });
    currentUser = data.user;
    renderAuthArea();
    showMsg(msg, 'ok', 'تم إنشاء الحساب بنجاح! مرحبا بيك ' + currentUser.username + '.');
    clearFields(['regUser', 'regPass', 'regGameId', 'regWa', 'regInsta', 'regTg', 'regFb']);
    refreshHomeStats();
  } catch (e) { showMsg(msg, 'err', e.message); }
}

async function doLogin() {
  const msg = document.getElementById('loginMsg');
  try {
    const data = await api('/login', { method: 'POST', body: { username: val('loginUser').trim(), password: val('loginPass') } });
    currentUser = data.user;
    renderAuthArea();
    showMsg(msg, 'ok', 'مرحبا بيك ' + currentUser.username + '!');
    refreshHomeStats();
  } catch (e) { showMsg(msg, 'err', e.message); }
}

async function logout() {
  await api('/logout', { method: 'POST' });
  currentUser = null;
  renderAuthArea();
  switchTab('home');
}

/* ---------- home ---------- */
async function refreshHomeStats() {
  const data = await api('/leaderboard');
  cache.users = data.users;
  cache.teams = data.teams;
  const m = await api('/matches');
  cache.matches = m.matches;
  document.getElementById('statPlayers').textContent = cache.users.length;
  document.getElementById('statTeams').textContent = cache.teams.length;
  document.getElementById('statMatches').textContent = cache.matches.length;
}

async function loadCommentator() {
  const c = await api('/commentator');
  const banner = document.getElementById('liveBanner');
  if (c.live) {
    document.getElementById('liveText').textContent = `🔴 مباشر الآن — ${c.name}${c.handle ? ' · ' + c.handle : ''}`;
    banner.style.display = 'flex';
  } else {
    banner.style.display = 'none';
  }
}

/* ---------- leaderboard ---------- */
async function renderBoards() {
  await refreshHomeStats();
  const players = cache.users;
  document.getElementById('playerBoard').innerHTML = players.length ? players.map((u, i) => `
    <div class="board-row">
      <div class="rank ${i === 0 ? 'r1' : i === 1 ? 'r2' : i === 2 ? 'r3' : ''} mono">${i + 1}</div>
      <div class="board-name">${u.username}<div class="board-sub">ID: ${u.gameId}${u.teamId ? '' : ''}</div></div>
      <div class="board-pts mono">${u.points || 0}</div>
    </div>`).join('') : `<div class="empty">مازال ما فماش لاعبين مسجّلين.</div>`;

  const teams = cache.teams;
  document.getElementById('teamBoard').innerHTML = teams.length ? teams.map((t, i) => `
    <div class="board-row">
      <div class="rank ${i === 0 ? 'r1' : i === 1 ? 'r2' : i === 2 ? 'r3' : ''} mono">${i + 1}</div>
      <div class="board-name">${t.name}<div class="board-sub">${t.members.length}/${t.capacity} أعضاء · ${modeLabel(t.mode)}</div></div>
      <div class="board-pts mono">${t.points || 0}</div>
    </div>`).join('') : `<div class="empty">مازال ما فماش فرق مسجّلة.</div>`;
}
function modeLabel(mode) { return mode === 'solo' ? 'فردي' : mode === 'duo' ? 'ثنائي' : 'فرقة'; }

/* ---------- team ---------- */
async function renderTeam() {
  const el = document.getElementById('teamArea');
  if (!currentUser) { el.innerHTML = `<div class="empty">لازم تسجل دخول باش تشوف فريقك.</div>`; return; }
  const { team } = await api('/team/mine');
  if (!team) {
    el.innerHTML = `
      <div class="row2">
        <div>
          <p class="muted" style="margin-bottom:10px;">أنشئ فريق جديد:</p>
          <div class="field"><label>اسم الفريق</label><input id="newTeamName" placeholder="اسم الفريق"></div>
          <div class="field"><label>نوع الفريق</label>
            <select id="newTeamMode">
              <option value="solo">فردي (1)</option>
              <option value="duo">ثنائي (2)</option>
              <option value="squad" selected>فرقة (4)</option>
            </select>
          </div>
          <button class="btn btn-primary" onclick="createTeam()">أنشئ الفريق</button>
        </div>
        <div>
          <p class="muted" style="margin-bottom:10px;">أو انضم بكود دعوة:</p>
          <div class="field"><label>كود الدعوة</label><input id="joinCode" class="mono" placeholder="ABC123"></div>
          <button class="btn btn-gold" onclick="joinTeam()">انضم للفريق</button>
        </div>
      </div>
      <div id="teamMsg"></div>`;
    return;
  }
  el.innerHTML = `
    <h3>${team.name} <span class="tag mono">${team.points || 0} نقطة</span></h3>
    <p class="muted" style="margin:14px 0 6px;">النوع: ${modeLabel(team.mode)} (${team.members.length}/${team.capacity})</p>
    <p class="muted" style="margin-bottom:6px;">الأعضاء:</p>
    <ul style="padding-right:20px; line-height:2; margin-bottom:18px;">${team.members.map(m => `<li>${m}</li>`).join('')}</ul>
    ${team.ownerUsername === currentUser.username ? `
      <p class="muted" style="margin-bottom:8px;">كود دعوة أصدقائك للفريق:</p>
      <div class="invite-code">${team.inviteCode}</div>
    ` : ''}
    <div style="margin-top:20px;"><button class="btn btn-danger btn-small" onclick="leaveTeam()">مغادرة الفريق</button></div>`;
}
async function createTeam() {
  const msg = document.getElementById('teamMsg');
  try {
    await api('/team/create', { method: 'POST', body: { name: val('newTeamName').trim(), mode: val('newTeamMode') } });
    renderTeam(); refreshHomeStats();
  } catch (e) { showMsg(msg, 'err', e.message); }
}
async function joinTeam() {
  const msg = document.getElementById('teamMsg');
  try {
    await api('/team/join', { method: 'POST', body: { inviteCode: val('joinCode').trim() } });
    renderTeam(); refreshHomeStats();
  } catch (e) { showMsg(msg, 'err', e.message); }
}
async function leaveTeam() {
  await api('/team/leave', { method: 'POST' });
  renderTeam(); refreshHomeStats();
}

/* ---------- matches ---------- */
async function populateOpponents() {
  const type = val('matchType');
  const sel = document.getElementById('matchOpponent');
  await refreshHomeStats();
  if (type === '1v1') {
    sel.innerHTML = cache.users.filter(u => !currentUser || u.username !== currentUser.username)
      .map(u => `<option value="${u.username}">${u.username}</option>`).join('');
  } else {
    sel.innerHTML = cache.teams.map(t => `<option value="${t.name}">${t.name}</option>`).join('');
  }
}
document.getElementById('matchType').addEventListener('change', populateOpponents);

async function createMatch() {
  const msg = document.getElementById('matchMsg');
  if (!currentUser) return showMsg(msg, 'err', 'لازم تسجل دخول باش تعمل تحدي.');
  try {
    await api('/match/create', { method: 'POST', body: { type: val('matchType'), opponent: val('matchOpponent') } });
    showMsg(msg, 'ok', 'تم إطلاق التحدي! في انتظار تأكيد الإدارة للنتيجة.');
    renderMatches();
  } catch (e) { showMsg(msg, 'err', e.message); }
}

async function renderMatches() {
  await populateOpponents();
  const list = [...cache.matches];
  const el = document.getElementById('matchList');
  el.innerHTML = list.length ? list.map(m => `
    <div class="vs-card">
      <div class="vs-side"><b>${m.side1}</b><span>${m.type === '1v1' ? 'لاعب' : 'فريق'}</span></div>
      <div class="vs-mid">VS</div>
      <div class="vs-side"><b>${m.side2}</b><span>${m.type === '1v1' ? 'لاعب' : 'فريق'}</span></div>
      <div class="proof-actions">
        <span class="badge ${m.status === 'done' ? 'done' : 'pending'}">${m.status === 'done' ? 'الفائز: ' + m.winner : 'قيد الانتظار'}</span>
        ${m.proofImage ? `<img class="proof-thumb" src="${m.proofImage}">` : (currentUser ? `
          <label class="btn btn-ghost btn-small" style="cursor:pointer;">
            📸 صورة الفوز
            <input type="file" accept="image/*" style="display:none;" onchange="uploadProof('${m.id}', this)">
          </label>` : '')}
      </div>
    </div>`).join('') : `<div class="empty card">مافماش تحديات حاليا. أطلق أول تحدي!</div>`;
}
async function uploadProof(matchId, input) {
  if (!input.files[0]) return;
  const fd = new FormData();
  fd.append('photo', input.files[0]);
  try {
    await api(`/match/${matchId}/proof`, { method: 'POST', body: fd });
    renderMatches();
  } catch (e) { alert(e.message); }
}

/* ---------- admin ---------- */
async function unlockAdmin() {
  const msg = document.getElementById('adminMsg');
  try {
    await api('/admin/login', { method: 'POST', body: { code: val('adminCode') } });
    isAdmin = true;
    document.getElementById('adminLockView').style.display = 'none';
    document.getElementById('adminPanel').style.display = 'block';
    renderAdmin();
  } catch (e) { showMsg(msg, 'err', e.message); }
}

async function renderAdmin() {
  const db = await api('/admin/data');
  const c = db.settings.commentator;
  document.getElementById('commName').value = c.name || '';
  document.getElementById('commHandle').value = c.handle || '';
  document.getElementById('commLive').checked = !!c.live;

  const pending = db.matches.filter(m => m.status === 'pending');
  document.getElementById('adminMatches').innerHTML = pending.length ? pending.map(m => `
    <div class="vs-card">
      <div class="vs-side"><b>${m.side1}</b></div>
      <div class="vs-mid">VS</div>
      <div class="vs-side"><b>${m.side2}</b></div>
      ${m.proofImage ? `<img class="proof-thumb" src="${m.proofImage}">` : ''}
      <div class="proof-actions">
        <button class="btn btn-gold btn-small" onclick="resolveMatch('${m.id}','${m.side1}')">فوز ${m.side1}</button>
        <button class="btn btn-gold btn-small" onclick="resolveMatch('${m.id}','${m.side2}')">فوز ${m.side2}</button>
      </div>
    </div>`).join('') : `<div class="empty">مافماش تحديات معلّقة.</div>`;

  document.getElementById('adminUsers').innerHTML = db.users.map(u => {
    const team = db.teams.find(t => t.id === u.teamId);
    return `<tr>
      <td>${u.username}</td>
      <td class="mono">${u.gameId}</td>
      <td>${team ? team.name : '—'}</td>
      <td><input class="mono" style="width:70px; background:var(--bg-2); border:1px solid var(--line); color:var(--text); padding:6px; border-radius:6px;" value="${u.points || 0}" onchange="setPoints('${u.username}', this.value)"></td>
      <td style="font-size:0.78rem; color:var(--text-dim);">${[u.whatsapp, u.instagram, u.telegram, u.facebook].filter(Boolean).join(' · ') || '—'}</td>
      <td><button class="btn btn-ghost btn-small" onclick="deleteUser('${u.username}')">حذف</button></td>
    </tr>`;
  }).join('');

  document.getElementById('adminTeams').innerHTML = db.teams.map(t => `
    <tr>
      <td>${t.name}</td>
      <td>${modeLabel(t.mode)}</td>
      <td>${t.members.join(', ')}</td>
      <td class="mono">${t.inviteCode}</td>
      <td class="mono">${t.points || 0}</td>
      <td><button class="btn btn-ghost btn-small" onclick="deleteTeam('${t.id}')">حذف</button></td>
    </tr>`).join('');
}
async function resolveMatch(id, winner) { await api(`/admin/match/${id}/resolve`, { method: 'POST', body: { winner } }); renderAdmin(); }
async function setPoints(username, points) { await api(`/admin/user/${username}/points`, { method: 'POST', body: { points } }); renderAdmin(); }
async function deleteUser(username) { await api(`/admin/user/${username}`, { method: 'DELETE' }); renderAdmin(); }
async function deleteTeam(id) { await api(`/admin/team/${id}`, { method: 'DELETE' }); renderAdmin(); }
async function saveCommentator() {
  await api('/admin/commentator', { method: 'POST', body: { name: val('commName'), handle: val('commHandle'), live: document.getElementById('commLive').checked } });
  loadCommentator();
  alert('تم الحفظ.');
}

/* ---------- init ---------- */
(async function init() {
  try {
    const me = await api('/me');
    currentUser = me.user;
    isAdmin = !!me.isAdmin;
  } catch (e) {}
  renderAuthArea();
  await refreshHomeStats();
  await loadCommentator();
})();

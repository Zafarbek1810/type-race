const app = document.querySelector('#app');
const code = location.pathname.match(/^\/xona\/(\d{5})$/)?.[1];
const key = code && 'harf-poygasi:' + code;
let session = key ? JSON.parse(sessionStorage.getItem(key) || '{}') : {};
let room;
let screen = '';
let displayedRound;
let polling;
let loading = false;
let clockOffset = 0;
let pendingInput;
let submitting = false;
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[char]));
const car = '<span class="car" aria-hidden="true"><i></i><b></b><em></em></span>';
const button = (label, id, extra = '') => '<button class="primary" id="' + id + '" ' + extra + '>' + label + '</button>';
const levels = [
  {value: 'easy', label: 'Oson', sentences: 1},
  {value: 'medium', label: 'O‘rtacha', sentences: 2},
  {value: 'hard', label: 'Qiyin', sentences: 3},
];
const note = '<p class="notice" id="notice" role="status"></p>';
function message(text = '') { const target = document.querySelector('#notice'); if (target) target.textContent = text; }
function remember(data, roomCode = code) { sessionStorage.setItem('harf-poygasi:' + roomCode, JSON.stringify(data)); }
async function request(path, body) {
  const response = await fetch('/api/rooms' + path, body === undefined ? {cache: 'no-store'} : {
    method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.error), {status: response.status});
  return data;
}
async function handle(action, control) {
  if (loading) return;
  loading = true;
  if (control) control.disabled = true;
  message();
  try { await action(); } catch (error) { message(error.message === 'Failed to fetch' ? 'Aloqa uzildi. Qayta urinib ko‘ring.' : error.message); }
  finally { loading = false; if (control?.isConnected) control.disabled = false; }
}
function renderHome() {
  app.innerHTML = `
    <section class="hero">
      <div class="intro">
        <div class="kicker"><span>✦</span> KLAVIATURADAN MARRAGACHA</div>
        <h1>Harf <span>poygasi<span class="dot">.</span></span></h1>
        <p class="lead">Inglizcha matnni yoz, mashinangni hayda va do‘stlaringdan oldin marraga yet!</p>
        <div class="actions">${button('O‘yinni yaratish <span aria-hidden="true">↗</span>', 'create')}<button class="secondary" id="join-open">O‘yinga qo‘shilish <span aria-hidden="true">→</span></button></div>
        <form id="join-code" class="join-form" hidden><label for="code">5 xonali xona kodi</label><div class="field-row"><input id="code" inputmode="numeric" autocomplete="off" maxlength="5" pattern="[0-9]{5}" placeholder="12345" required>${button('Davom etish', 'find-code')}</div></form>
        ${note}
      </div>
      <div class="art" aria-hidden="true">
        <div class="art-head"><span><i></i> POYGA YO‘LI</span><span>01 / 01</span></div>
        <div class="art-board">
          <div class="track-labels"><span>START</span><span>MARRA</span></div>
          <div class="demo-road"><div class="finish-line"></div><div class="demo-car orange">${car}</div><div class="demo-car blue">${car}</div><div class="demo-car purple">${car}</div></div>
          <div class="keys"><span>R</span><span>A</span><span>C</span><span>E</span><span class="enter">↵</span></div>
        </div>
        <div class="art-foot"><span>✦</span> HAR BIR HARF — BIR QADAM.</div>
      </div>
    </section>
    <section class="steps" aria-label="Qanday o‘ynaladi">
      <article><div class="step-icon lilac" aria-hidden="true">#</div><div><h2>Kodni ulash</h2><p>Xona yarat va do‘stlaringni chaqir.</p></div></article>
      <article><div class="step-icon mint" aria-hidden="true">⌨</div><div><h2>Matnni yoz</h2><p>Har bir to‘g‘ri harf mashinangni oldinga siljitadi.</p></div></article>
      <article><div class="step-icon peach" aria-hidden="true">🏆</div><div><h2>Marraga yet</h2><p>Matnni birinchi tugatgan o‘yinchi yutadi.</p></div></article>
    </section>`;
  document.querySelector('#create').onclick = (event) => handle(async () => {
    const data = await request('', {});
    remember({host: data.token}, data.code);
    location.href = '/xona/' + data.code;
  }, event.currentTarget);
  const form = document.querySelector('#join-code');
  document.querySelector('#join-open').onclick = () => { form.hidden = false; form.elements.code.focus(); };
  form.onsubmit = (event) => {
    event.preventDefault();
    handle(async () => {
      const entered = form.elements.code.value;
      const data = await request('/' + entered);
      if (data.phase !== 'lobby') throw new Error('Bu xonada poyga allaqachon boshlangan.');
      location.href = '/xona/' + entered;
    }, document.querySelector('#find-code'));
  };
}
function playerList() {
  return room.players.map(player => '<li><span class="swatch" style="--paint:' + player.color + '"></span><span>' + escapeHtml(player.name) + (player.id === session.playerId ? ' <small>(siz)</small>' : '') + '</span></li>').join('');
}
function nameForm() {
  return '<form id="name-form" class="join-form"><label for="name">O‘yinchi ismi</label><div class="field-row"><input id="name" maxlength="24" placeholder="Ismingiz" autocomplete="nickname" required>' + button('Qo‘shilish', 'enter-name') + '</div></form>';
}
function renderLobby() {
  const options = levels.map(({value, label, sentences}) =>
    '<option value="' + value + '"' + (value === (room.difficulty ?? 'easy') ? ' selected' : '') + '>' +
    label + ' · ' + sentences + ' gap</option>',
  ).join('');
  app.innerHTML = `<section class="panel"><a class="back" href="/">← Bosh sahifa</a><div class="kicker"><span>✦</span> O‘YIN XONASI</div><h1>Startga tayyormisiz?</h1>
    <div class="room-code"><div><span>XONA KODI</span><strong>${code}</strong></div><button class="secondary" id="copy">Kodni nusxalash</button></div>
    ${session.playerId ? '' : nameForm()}
    <div class="list-heading"><h2>O‘yinchilar</h2><span id="count"></span></div><ul class="players" id="players"></ul>
    <p id="waiting" class="muted"></p>
    ${session.host ? '<div class="difficulty"><label for="difficulty">O‘yin darajasi</label><select id="difficulty">' + options + '</select></div>' + button('O‘yinni boshlash <span aria-hidden="true">→</span>', 'start') : ''}${note}</section>`;
  document.querySelector('#copy').onclick = (event) => handle(async () => {
    await navigator.clipboard.writeText(code);
    message('Kod nusxalandi.');
  }, event.currentTarget);
  bindNameForm();
  document.querySelector('#start')?.addEventListener('click', event => handle(async () => {
    const difficulty = document.querySelector('#difficulty').value;
    const data = await request('/' + code + '/start', {token: session.host, difficulty});
    accept(data);
  }, event.currentTarget));
}
function bindNameForm() {
  const form = document.querySelector('#name-form');
  if (!form) return;
  form.onsubmit = (event) => {
    event.preventDefault();
    handle(async () => {
      const data = await request('/' + code + '/join', {name: form.elements.name.value});
      session = {...session, token: data.token, playerId: data.playerId};
      remember(session);
      screen = '';
      accept(room && room.version > data.version ? room : data);
    }, document.querySelector('#enter-name'));
  };
}
function updateLobby() {
  document.querySelector('#players').innerHTML = playerList();
  document.querySelector('#count').textContent = room.players.length + ' / ' + room.maxPlayers;
  const start = document.querySelector('#start');
  if (start) start.disabled = loading || !room.players.length;
  document.querySelector('#waiting').textContent = room.players.length ? (session.host ? 'Do‘stlaringiz kelgach, poygani boshlang.' : 'Xona egasi poygani boshlashini kuting.') : 'Hozircha hech kim qo‘shilmadi.';
}
function renderRace() {
  pendingInput = undefined;
  const level = levels.find(({value}) => value === room.difficulty);
  app.innerHTML = `<section class="panel race-panel"><div class="kicker"><span>✦</span> XONA ${code}${level ? ' · ' + level.label.toUpperCase() : ''}</div><h1>Poyga yo‘li</h1>
    <div class="race-controls"><div id="timer" class="timer" role="status"></div>${session.host ? '<button class="secondary" id="finish">Tugatish</button>' : ''}</div>
    <div class="track-labels"><span>START</span><span>MARRA</span></div><div id="lanes"></div>
    ${session.playerId ? '<div class="typing"><p id="passage" lang="en"></p><label for="typing">Matnni shu yerga yozing</label><input id="typing" autocomplete="off" autocapitalize="off" spellcheck="false" lang="en"><p id="typing-status" class="muted"></p></div>' : '<p class="muted">Siz poygani tomosha qilyapsiz.</p>'}${note}</section>`;
  document.querySelector('#finish')?.addEventListener('click', event => handle(async () => {
    accept(await request('/' + code + '/finish', {token: session.host, round: room.round}));
  }, event.currentTarget));
  const input = document.querySelector('#typing');
  if (!input) return;
  input.maxLength = room.passage.length;
  input.addEventListener('beforeinput', event => {
    if (['insertFromPaste', 'insertFromDrop'].includes(event.inputType)) event.preventDefault();
  });
  input.addEventListener('input', () => {
    highlight();
    pendingInput = {token: session.token, value: input.value, round: room.round};
    submitInput();
  });
}
async function submitInput() {
  if (submitting) return;
  submitting = true;
  while (pendingInput && room?.phase === 'race') {
    const data = pendingInput;
    pendingInput = undefined;
    try { accept(await request('/' + code + '/progress', data)); }
    catch { pendingInput ??= data; message('Aloqa uzildi. Qayta ulanilmoqda…'); break; }
  }
  submitting = false;
}
function highlight() {
  const input = document.querySelector('#typing');
  if (!input) return;
  const value = input.value;
  document.querySelector('#passage').innerHTML = [...room.passage].map((char, index) => {
    const style = index < value.length ? (char === value[index] ? 'right' : 'wrong') : index === value.length ? 'current' : '';
    return '<span class="' + style + '">' + escapeHtml(char) + '</span>';
  }).join('');
  const me = room.players.find(player => player.id === session.playerId);
  const status = document.querySelector('#typing-status');
  if (me?.place) status.textContent = me.place + '-o‘rin! Natijalarni kuting.';
  else if (![...value].every((char, index) => char === room.passage[index])) status.textContent = 'Qizil belgilarni tuzating.';
  else status.textContent = 'Katta harf va tinish belgilarini ham yozing.';
}
function updateRace() {
  const lanes = document.querySelector('#lanes');
  if (!lanes.children.length) {
    lanes.innerHTML = room.players.map(player => '<div class="lane" data-id="' + player.id + '"><span class="lane-name">' + escapeHtml(player.name) + '</span><div class="lane-track"><div class="lane-car" style="--paint:' + player.color + '">' + car + '</div></div><span class="lane-percent"></span></div>').join('');
  }
  room.players.forEach(player => {
    const lane = lanes.querySelector('[data-id="' + player.id + '"]');
    const percent = Math.round(player.progress * 100 / room.passage.length);
    lane.querySelector('.lane-car').style.left = percent + '%';
    lane.querySelector('.lane-percent').textContent = percent + '%';
  });
  highlight();
  updateClock();
}
function updateClock() {
  if (screen !== 'race') return;
  const now = Date.now() + clockOffset;
  const remaining = Math.ceil((room.startsAt - now) / 1000);
  const seconds = Math.max(0, Math.ceil((room.deadline - now) / 1000));
  const timer = document.querySelector('#timer');
  const timeLabel = remaining > 0 ? 'Startga ' + remaining + ' soniya' : Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
  if (timer.textContent !== timeLabel) timer.textContent = timeLabel;
  const input = document.querySelector('#typing');
  if (!input) return;
  const wasDisabled = input.disabled;
  input.disabled = remaining > 0 || seconds === 0 || Boolean(room.players.find(player => player.id === session.playerId)?.place);
  if (wasDisabled && !input.disabled) input.focus();
}
function renderResults() {
  const sorted = room.players.filter(player => player.place).sort((a, b) => a.place - b.place);
  const top = sorted.slice(0, 3).map(player => '<li><span class="medal">' + ['🥇', '🥈', '🥉'][player.place - 1] + '</span><strong>' + escapeHtml(player.name) + '</strong><span>' + player.place + '-o‘rin</span></li>').join('');
  app.innerHTML = `<section class="panel"><a class="back" href="/">← Bosh sahifa</a><div class="kicker"><span>✦</span> XONA ${code}</div><h1>Poyga natijalari</h1>
    ${top ? '<ol class="podium">' + top + '</ol>' : '<p class="muted">Bu safar hech kim marraga yetmadi.</p>'}
    ${session.host ? button('Yana o‘ynash ↻', 'restart') : '<p class="muted">Yangi poyga uchun xona egasini kuting.</p>'}${note}</section>`;
  document.querySelector('#restart')?.addEventListener('click', event => handle(async () => {
    accept(await request('/' + code + '/restart', {token: session.host}));
  }, event.currentTarget));
}
function accept(data) {
  if (room && (data.version < room.version || (data.version === room.version && data.serverTime < room.serverTime))) return;
  room = data;
  clockOffset = room.serverTime - Date.now();
  if (screen !== room.phase || displayedRound !== room.round) {
    screen = room.phase;
    displayedRound = room.round;
    if (screen === 'lobby') renderLobby();
    if (screen === 'race') renderRace();
    if (screen === 'results') renderResults();
  }
  if (screen === 'lobby') updateLobby();
  if (screen === 'race') updateRace();
}
async function poll() {
  try {
    accept(await request('/' + code));
    if (pendingInput) submitInput();
  } catch (error) {
    if (error.status === 404) {
      app.innerHTML = '<section class="panel"><h1>Xona topilmadi</h1><a class="back" href="/">← Bosh sahifa</a></section>';
      return;
    }
    message('Aloqa uzildi. Qayta ulanilmoqda…');
  }
  polling = setTimeout(poll, screen === 'race' ? 400 : 850);
}
if (code) {
  app.innerHTML = '<section class="panel"><p class="muted">Xona yuklanmoqda…</p>' + note + '</section>';
  poll();
  setInterval(updateClock, 150);
  window.addEventListener('pagehide', () => clearTimeout(polling));
  window.addEventListener('pageshow', event => { if (event.persisted) poll(); });
} else renderHome();

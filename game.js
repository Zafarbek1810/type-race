export const roomLifetimeMs = 86_400_000;
const maxPlayers = 15;

const sentencesByDifficulty = {easy: 1, medium: 2, hard: 3};
const passages = [
  [
    'A little fox found a blue kite and ran across the field.',
    'The wind lifted the kite high above the tall trees.',
    'The fox held the string tight and watched it dance.',
  ],
  [
    'We packed apples and sandwiches for a picnic by the lake.',
    'We spread a red blanket on the grass near the water.',
    'After lunch, we counted the ducks swimming past our blanket.',
  ],
  [
    'A yellow bus took our class to the zoo on a sunny morning.',
    'We saw two playful monkeys swing from branch to branch.',
    'Before we went home, we drew pictures of our favorite animals.',
  ],
  [
    'My friend made a paper boat and set it in the stream.',
    'We walked along the bank and watched it pass a stone.',
    'The boat floated under a small bridge and out of sight.',
  ],
  [
    'The rain stopped and a rainbow stretched over the garden.',
    'Drops of water shone on the leaves of the flowers.',
    'We put on our boots and jumped over the little puddles.',
  ],
];
const colors = ['#ff6545', '#36c7ec', '#ffd044', '#ac83ff', '#52dba2', '#ff85bd'];
const pick = (items) => items[Math.floor(Math.random() * items.length)];
const error = (message, status = 400) => Response.json({error: message}, {status});
const view = ({host, players, ...room}) => ({
  ...room,
  maxPlayers,
  players: players.map(({token, ...player}) => player),
});
const makeRoom = () => ({
  host: crypto.randomUUID(), phase: 'lobby', players: [], round: 0,
  createdAt: Date.now(), passage: '', startsAt: 0, deadline: 0,
});

function update(room, action, body, now) {
  const player = room.players.find(({token}) => token === body.token);
  if (action === 'join') {
    if (room.phase !== 'lobby') return error('Poyga allaqachon boshlangan.');
    if (room.players.length >= maxPlayers) return error('Xona to‘lgan.');
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name || name.length > 24) return error('1–24 belgidan iborat ism kiriting.');
    const available = colors.filter(color => !room.players.some(player => player.color === color));
    const entrant = {id: crypto.randomUUID(), token: crypto.randomUUID(), name, color: pick(available.length ? available : colors), progress: 0, place: null};
    room.players.push(entrant);
    return {token: entrant.token, playerId: entrant.id};
  }
  if (action === 'start' || action === 'restart' || action === 'finish') {
    if (body.token !== room.host) return error('Bu amal xona egasiga tegishli.', 403);
    if (action === 'finish') {
      if (room.phase === 'race' && body.round === room.round) room.phase = 'results';
      return {};
    }
    if (action === 'restart' && room.phase === 'results') {
      room.phase = 'lobby';
      room.passage = '';
      room.startsAt = 0;
      room.deadline = 0;
      room.players.forEach(player => Object.assign(player, {progress: 0, place: null}));
      return {};
    }
    if (action !== 'start' || room.phase !== 'lobby' || !room.players.length) return error('Boshlash uchun kamida bitta o‘yinchi kerak.');
    const difficulty = body.difficulty ?? room.difficulty ?? 'easy';
    if (typeof difficulty !== 'string' || !Object.hasOwn(sentencesByDifficulty, difficulty)) {
      return error('O‘yin darajasini tanlang.');
    }
    const sentenceCount = sentencesByDifficulty[difficulty];
    const choices = passages.map(sentences => sentences.slice(0, sentenceCount).join(' '));
    const passage = pick(choices.filter(text => text !== room.previousPassage));
    Object.assign(room, {phase: 'race', difficulty, passage, previousPassage: passage, round: room.round + 1, startsAt: now + 3500, deadline: now + 183500});
    return {};
  }
  if (action === 'progress') {
    if (!player) return error('Avval xonaga qo‘shiling.', 403);
    if (room.phase !== 'race' || now < room.startsAt || body.round !== room.round || player.place) return {};
    if (typeof body.value !== 'string' || body.value.length > room.passage.length) return error('Matn uzunligi noto‘g‘ri.');
    let prefix = 0;
    while (prefix < body.value.length && body.value[prefix] === room.passage[prefix]) prefix++;
    player.progress = Math.max(player.progress, prefix);
    if (body.value === room.passage) {
      player.place = room.players.filter(player => player.place).length + 1;
      if (room.players.every(player => player.place)) room.phase = 'results';
    }
    return {};
  }
  return error('Amal topilmadi.', 404);
}

export async function api(request, store) {
  const path = new URL(request.url).pathname;
  const now = Date.now();
  if (path === '/api/rooms' && request.method === 'POST') {
    const room = makeRoom();
    for (let attempt = 0; attempt < 30; attempt++) {
      const code = String(10000 + Math.floor(Math.random() * 90000));
      if (await store.create(code, room)) return Response.json({code, token: room.host}, {status: 201});
    }
    return error('Xona yaratib bo‘lmadi. Yana urinib ko‘ring.', 503);
  }
  const match = /^\/api\/rooms\/(\d{5})(?:\/(join|start|progress|restart|finish))?$/.exec(path);
  if (!match) return error('Sahifa topilmadi.', 404);
  const [, code, action] = match;
  if (request.method !== (action ? 'POST' : 'GET')) return error('So‘rov usuli noto‘g‘ri.', 405);
  let body;
  if (action) {
    try { body = JSON.parse((await request.text()).slice(0, 4096)); } catch { return error('So‘rov noto‘g‘ri.'); }
    if (!body || typeof body !== 'object') return error('So‘rov noto‘g‘ri.');
  }
  for (let attempt = 0; attempt < 12; attempt++) {
    const entry = await store.get(code);
    if (!entry || now - entry.room.createdAt >= roomLifetimeMs) return error('Bu kod bilan xona topilmadi.', 404);
    const {room, version, revision} = entry;
    const timedOut = room.phase === 'race' && now >= room.deadline;
    if (timedOut) room.phase = 'results';
    if (!action && !timedOut) return Response.json({...view(room), version, serverTime: now});
    const result = action ? update(room, action, body, now) : {};
    if (result instanceof Response) return result;
    if (await store.save(code, room, version, revision)) return Response.json({...view(room), ...result, version: version + 1, serverTime: now});
  }
  return error('Xona band. Yana urinib ko‘ring.', 503);
}

export function memoryStore() {
  const rooms = new Map();
  return {
    create(code, room) {
      for (const [key, entry] of rooms) if (Date.now() - entry.room.createdAt >= roomLifetimeMs) rooms.delete(key);
      if (rooms.has(code)) return false;
      rooms.set(code, {room: structuredClone(room), version: 0});
      return true;
    },
    get(code) { return structuredClone(rooms.get(code)); },
    save(code, room, version) {
      if (rooms.get(code)?.version !== version) return false;
      rooms.set(code, {room: structuredClone(room), version: version + 1});
      return true;
    },
  };
}

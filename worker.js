import {api, roomLifetimeMs} from './game.js';
import assets from './assets.js';

function database(db) {
  return {
    async create(code, room) {
      const result = await db.prepare(
        'INSERT INTO rooms (code, data, created_at) VALUES (?, ?, ?) ON CONFLICT(code) DO UPDATE SET data = excluded.data, created_at = excluded.created_at, version = rooms.version + 1 WHERE rooms.created_at <= ?'
      ).bind(code, JSON.stringify(room), room.createdAt, room.createdAt - roomLifetimeMs).run();
      return result.meta.changes > 0;
    },
    async get(code) {
      const result = await db.prepare('SELECT data, version FROM rooms WHERE code = ?').bind(code).first();
      return result && {room: JSON.parse(result.data), version: result.version};
    },
    async save(code, room, version) {
      const result = await db.prepare('UPDATE rooms SET data = ?, version = version + 1 WHERE code = ? AND version = ?')
        .bind(JSON.stringify(room), code, version).run();
      return result.meta.changes > 0;
    },
  };
}

export default {
  async fetch(request, env) {
    const {pathname} = new URL(request.url);
    if (pathname.startsWith('/api/')) {
      try {
        const response = await api(request, database(env.DB));
        response.headers.set('Cache-Control', 'no-store');
        return response;
      } catch (error) {
        console.error(error);
        return Response.json({error: 'Server vaqtincha ishlamayapti. Yana urinib ko‘ring.'}, {status: 503});
      }
    }
    const path = pathname === '/' || /^\/xona\/\d{5}$/.test(pathname) ? '/index.html' : pathname;
    if (!Object.hasOwn(assets, path)) return new Response('Sahifa topilmadi.', {status: 404});
    const {type, body} = assets[path];
    return new Response(body, {headers: {'Content-Type': type + '; charset=utf-8'}});
  },
};

import {getStore} from '@netlify/blobs';
import {api, roomLifetimeMs} from '../../game.js';

function roomStore(blobs) {
  return {
    async create(code, room) {
      const current = await blobs.getWithMetadata(code, {type: 'json'});
      if (current && room.createdAt - current.data.room.createdAt < roomLifetimeMs) return false;
      const version = current ? current.data.version + 1 : 0;
      const condition = current ? {onlyIfMatch: current.etag} : {onlyIfNew: true};
      const result = await blobs.setJSON(code, {room, version}, condition);
      return result.modified;
    },
    async get(code) {
      const entry = await blobs.getWithMetadata(code, {type: 'json'});
      return entry && {...entry.data, revision: entry.etag};
    },
    async save(code, room, version, revision) {
      const result = await blobs.setJSON(code, {room, version: version + 1}, {onlyIfMatch: revision});
      return result.modified;
    },
  };
}

export const config = {path: ['/api/rooms', '/api/rooms/:code', '/api/rooms/:code/:action']};

export default async function handler(request) {
  try {
    const blobs = getStore({name: 'rooms', consistency: 'strong'});
    const response = await api(request, roomStore(blobs));
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (error) {
    console.error(error);
    return Response.json(
      {error: 'Server vaqtincha ishlamayapti. Yana urinib ko‘ring.'},
      {status: 503, headers: {'Cache-Control': 'no-store'}},
    );
  }
}

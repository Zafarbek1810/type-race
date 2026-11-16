import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {Readable} from 'node:stream';
import {api, memoryStore} from './game.js';

const store = memoryStore();
const assets = {'/style.css': 'text/css', '/app.js': 'text/javascript'};
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) {
      const options = {method: req.method};
      if (req.method === 'POST') Object.assign(options, {body: Readable.toWeb(req), duplex: 'half'});
      const result = await api(new Request(url, options), store);
      res.writeHead(result.status, {'Content-Type': 'application/json', 'Cache-Control': 'no-store'});
      res.end(await result.text());
      return;
    }
    const path = url.pathname;
    const page = path === '/' || /^\/xona\/\d{5}$/.test(path);
    if (!page && !assets[path]) return res.writeHead(404).end();
    const file = page ? '/index.html' : path;
    res.writeHead(200, {'Content-Type': (page ? 'text/html' : assets[path]) + '; charset=utf-8'});
    res.end(await readFile(new URL('./public' + file, import.meta.url)));
  } catch (error) {
    console.error(error);
    if (!res.headersSent) res.writeHead(500);
    res.end();
  }
});
const port = Number(process.env.PORT || 3000);
server.listen(port, '0.0.0.0', () => console.log('Local: http://localhost:' + port));

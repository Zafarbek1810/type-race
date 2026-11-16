import {copyFile, mkdir, readFile, writeFile} from 'node:fs/promises';

const assets = {};
for (const [file, type] of Object.entries({'index.html':'text/html', 'app.js':'text/javascript', 'style.css':'text/css'})) {
  assets['/' + file] = {type, body: await readFile('public/' + file, 'utf8')};
}
await mkdir('dist/server', {recursive: true});
await mkdir('dist/.openai', {recursive: true});
await Promise.all([
  copyFile('worker.js', 'dist/server/index.js'),
  copyFile('game.js', 'dist/server/game.js'),
  copyFile('.openai/hosting.json', 'dist/.openai/hosting.json'),
  writeFile('dist/server/assets.js', 'export default ' + JSON.stringify(assets) + ';\n'),
]);

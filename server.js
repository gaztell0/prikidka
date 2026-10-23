import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root = new URL('./', import.meta.url);
const files = new Map([['/', ['index.html', 'text/html; charset=utf-8']], ['/index.html', ['index.html', 'text/html; charset=utf-8']], ['/style.css', ['style.css', 'text/css; charset=utf-8']], ['/app.js', ['app.js', 'text/javascript; charset=utf-8']], ['/model.js', ['model.js', 'text/javascript; charset=utf-8']], ['/i18n.js', ['i18n.js', 'text/javascript; charset=utf-8']]]);
const server = createServer(async (request, response) => {
  const path = new URL(request.url, 'http://localhost').pathname;
  const file = files.get(path);
  if (!file) {response.writeHead(404);response.end('Not found');return;}
  try {response.writeHead(200, {'content-type': file[1], 'cache-control': 'no-store'}); response.end(await readFile(fileURLToPath(new URL(file[0], root))));}
  catch {response.writeHead(500);response.end('Read error');}
});
server.listen(4173, '127.0.0.1', () => process.stdout.write('Local: http://127.0.0.1:4173\n'));
process.on('SIGTERM', () => server.close());
process.on('SIGINT', () => server.close());

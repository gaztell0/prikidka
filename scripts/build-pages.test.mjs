import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp, mkdir, writeFile, readFile, rm, symlink, access} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {buildPages} from './build-pages.mjs';

const hash = value => createHash('sha256').update(value).digest('hex').slice(0, 12);
const prodSha = 'a'.repeat(40);
const devSha = 'b'.repeat(40);
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'prikidka-pages-test-'));
  t.after(() => rm(root, {recursive: true, force: true}));
  for (const name of ['prod', 'dev']) {
    const dir = join(root, name);
    await mkdir(dir);
    const model = 'export const environment = "' + name + '";';
    const app = 'import {environment} from "./model.js?v=' + hash(model) + '";';
    const css = '/* ' + name + ' styles */';
    const html = '<title>Calculator ' + name + '</title><link href="./style.css?v=' + hash(css) + '"><script src="./app.js?v=' + hash(app) + '"></script>';
    for (const [file, content] of Object.entries({'model.js':model,'app.js':app,'style.css':css,'index.html':html,'.nojekyll':''})) await writeFile(join(dir,file),content);
  }
  return {root, prodDir:join(root,'prod'), devDir:join(root,'dev'), outDir:join(root,'site'), prodSha, devSha};
}

test('Published root contains only main files, /dev contains dev files and its own version', async t => {
  const options = await fixture(t);
  await writeFile(join(options.prodDir, 'private-config.txt'), 'must never be published');
  await buildPages(options);
  assert.equal(await readFile(join(options.outDir, 'style.css'), 'utf8'), '/* prod styles */');
  assert.equal(await readFile(join(options.outDir, 'dev/style.css'), 'utf8'), '/* dev styles */');
  assert.equal(await readFile(join(options.outDir, 'index.html'), 'utf8'), await readFile(join(options.prodDir, 'index.html'), 'utf8'));
  assert.match(await readFile(join(options.outDir, 'dev/index.html'), 'utf8'), /<title>DEV · Calculator dev/);
  assert.equal(JSON.parse(await readFile(join(options.outDir, 'deployment.json'))).sha, prodSha);
  assert.deepEqual(JSON.parse(await readFile(join(options.outDir, 'dev/deployment.json'))), {environment:'development',repository:'gaztell0/prikidka',branch:'dev',sha:devSha});
  await assert.rejects(access(join(options.outDir, 'private-config.txt')));
});

test('Broken asset versions block publication before any output is created', async t => {
  const options = await fixture(t);
  await writeFile(join(options.devDir, 'style.css'), 'changed without cache version');
  await assert.rejects(buildPages(options), /Stale asset version for style.css/);
  await assert.rejects(access(options.outDir));
});

test('A missing runtime file blocks publication', async t => {
  const options = await fixture(t);
  await rm(join(options.devDir, 'app.js'));
  await assert.rejects(buildPages(options), /ENOENT/);
  await assert.rejects(access(options.outDir));
});

test('Symlinked files cannot copy content from elsewhere on the runner', async t => {
  const options = await fixture(t);
  await rm(join(options.devDir, 'model.js'));
  await symlink(join(options.prodDir, 'model.js'), join(options.devDir, 'model.js'));
  await assert.rejects(buildPages(options), /Not a regular site file/);
  await assert.rejects(access(options.outDir));
});

test('Existing output is preserved and source identities must be full SHA values', async t => {
  const options = await fixture(t);
  await mkdir(options.outDir);
  await writeFile(join(options.outDir, 'keep.txt'), 'existing content');
  await assert.rejects(buildPages(options), /Output directory already exists/);
  assert.equal(await readFile(join(options.outDir, 'keep.txt'), 'utf8'), 'existing content');
  await assert.rejects(buildPages({...options, prodSha:'main'}), /full validated commit SHA/);
});

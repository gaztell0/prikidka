import {createHash} from 'node:crypto';
import {lstat, mkdir, readFile, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const siteFiles = ['index.html', 'style.css', 'app.js', 'model.js', '.nojekyll'];
const digest = data => createHash('sha256').update(data).digest('hex').slice(0, 12);

async function readSite(directory) {
  const files = {};
  for (const file of siteFiles) {
    const path = join(directory, file);
    const stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Not a regular site file: ' + path);
    files[file] = await readFile(path);
  }
  const html = files['index.html'].toString('utf8');
  const app = files['app.js'].toString('utf8');
  if (!/<title>/i.test(html)) throw new Error('Missing site title: ' + directory);
  for (const [file, source] of [['style.css', html], ['app.js', html], ['model.js', app]]) {
    if (!source.includes('./' + file + '?v=' + digest(files[file]))) {
      throw new Error('Stale asset version for ' + file + ': ' + directory);
    }
  }
  return files;
}

export async function buildPages({prodDir, devDir, outDir, prodSha, devSha}) {
  for (const sha of [prodSha, devSha]) {
    if (typeof sha !== 'string' || !/^[0-9a-f]{40}$/.test(sha)) throw new Error('A full validated commit SHA is required for both environments.');
  }
  const [prod, dev] = await Promise.all([readSite(resolve(prodDir)), readSite(resolve(devDir))]);
  const output = resolve(outDir);
  try { await mkdir(output); }
  catch (error) {
    if (error.code === 'EEXIST') throw new Error('Output directory already exists; it will not be overwritten: ' + output);
    throw error;
  }
  await mkdir(join(output, 'dev'));
  for (const file of siteFiles) {
    await writeFile(join(output, file), prod[file], {flag: 'wx'});
    const content = file === 'index.html'
      ? dev[file].toString('utf8').replace(/<title>/i, '<title>DEV · ')
      : dev[file];
    await writeFile(join(output, 'dev', file), content, {flag: 'wx'});
  }
  const version = (environment, branch, sha) => JSON.stringify({environment, repository: 'gaztell0/prikidka', branch, sha}, null, 2) + '\n';
  await writeFile(join(output, 'deployment.json'), version('production', 'main', prodSha), {flag: 'wx'});
  await writeFile(join(output, 'dev', 'deployment.json'), version('development', 'dev', devSha), {flag: 'wx'});
  return output;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = {};
  const allowed = new Set(['--prod', '--dev', '--output', '--prod-sha', '--dev-sha']);
  try {
    for (let index = 2; index < process.argv.length; index += 2) {
      const key = process.argv[index];
      if (!allowed.has(key) || !process.argv[index + 1] || args[key]) throw new Error('Invalid build arguments.');
      args[key] = process.argv[index + 1];
    }
    if (Object.keys(args).length !== allowed.size) throw new Error('Provide --prod, --dev, --output, --prod-sha and --dev-sha.');
    await buildPages({prodDir: args['--prod'], devDir: args['--dev'], outDir: args['--output'], prodSha: args['--prod-sha'], devSha: args['--dev-sha']});
    console.log('Built production from main and development at /dev/.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

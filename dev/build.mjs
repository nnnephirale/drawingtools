/* Builds index.html from src/, so the tool stays one page that opens by double-click.
   src/page.html is the markup; each whole line `@@ css/…` or `@@ js/…` in it is replaced by that file,
   verbatim. The JS files are one IIFE cut into pieces (it opens in js/00-helpers.js and closes in
   js/85-boot.js), so they share one scope and must join in name order; they are not modules.

     node dev/build.mjs           write index.html
     node dev/build.mjs --check   fail if index.html is stale or ARCHITECTURE.md misses a file
     node dev/build.mjs --force   overwrite an index.html that was edited by hand

   Line 2 of index.html says it is built, with a hash of the rest, so a hand edit to index.html is
   caught before a build would overwrite it. No dependencies: plain Node. */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = p => readFileSync(join(root, p), 'utf8');
const sha = s => createHash('sha256').update(s).digest('hex').slice(0, 16);
const BANNER = /^<!-- Built from src\/ by dev\/build\.mjs .* sha256 ([0-9a-f]{16}) -->\n/m;

// the page without its banner line, and the hash that line recorded (null when there is none)
function split(html) {
  const m = html.match(BANNER);
  return m ? { body: html.replace(BANNER, ''), hash: m[1] } : { body: html, hash: null };
}

export function build() {
  const body = read('src/page.html').replace(/^@@ (\S+)\n/gm, (_, p) => read('src/' + p));
  const i = body.indexOf('\n') + 1;   // after <!doctype html>
  return body.slice(0, i) + `<!-- Built from src/ by dev/build.mjs (edit src/, then run: node dev/build.mjs) · sha256 ${sha(body)} -->\n` + body.slice(i);
}

// every source file is named in ARCHITECTURE.md, and every file it names exists
function mapProblems() {
  const map = read('ARCHITECTURE.md'), files = ['src/page.html', 'js/shaders.js'];
  for (const d of ['src/css', 'src/js']) for (const n of readdirSync(join(root, d))) if (/\.(css|js)$/.test(n)) files.push(`${d}/${n}`);
  for (const n of readdirSync(join(root, 'dev'))) if (/\.(m?js|sh)$/.test(n)) files.push(`dev/${n}`);
  const missing = files.filter(f => !map.includes('`' + f + '`'));
  const gone = [...map.matchAll(/`((?:src|dev|js)\/[^`\s*]+\.[a-z]+)`/g)].map(m => m[1]).filter(p => !existsSync(join(root, p)));
  return [...missing.map(f => `ARCHITECTURE.md does not list ${f}`), ...gone.map(f => `ARCHITECTURE.md names ${f}, which does not exist`)];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), out = build();
  const cur = existsSync(join(root, 'index.html')) ? read('index.html') : null;
  if (args.includes('--check')) {
    const problems = mapProblems();
    if (cur !== out) problems.push('index.html is stale: run node dev/build.mjs (or move a hand edit into src/ first)');
    if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
    console.log('index.html is current and ARCHITECTURE.md lists every file.');
  } else {
    if (cur !== null && cur !== out && !args.includes('--force')) {
      const { body, hash } = split(cur);
      if (hash !== sha(body) && body !== split(out).body) {
        console.error('index.html was edited by hand since the last build. Move the change into src/, then build again\n(or run with --force to discard it).');
        process.exit(1);
      }
    }
    writeFileSync(join(root, 'index.html'), out);
    console.log('Built index.html from src/.');
  }
}

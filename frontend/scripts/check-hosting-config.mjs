// Se ejecuta tras `npm run build` (postbuild). Comprueba que lo construido encaja con ../firebase.json:
//
// 1. Scripts en línea. El build de producción de Angular mete en index.html un <script> en línea (activa el CSS no
//    crítico) y la CSP no admite 'unsafe-inline' en script-src, así que lo autoriza por hash. Si una actualización de
//    Angular cambia ese texto, el hash deja de valer, el navegador lo bloquea y la página se queda sin la hoja de
//    estilos principal. Falla también si index.html lleva un manejador on*="...".
// 2. Ficheros con hash. Las reglas `immutable` de caché solo miran `/*.js`, `/*.css` y `/media/*.woff|woff2`. Un .js,
//    .css, .woff o .woff2 en otro sitio quedaría con `no-cache`: solo avisa, porque sirve igual y se pierde la caché.
//
// Se ven aquí, en el build, y no en producción.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const firebase = JSON.parse(readFileSync(resolve(repoRoot, 'firebase.json'), 'utf8'));
const publicDir = resolve(repoRoot, firebase.hosting.public);
const html = readFileSync(resolve(publicDir, 'index.html'), 'utf8');

const policies = firebase.hosting.headers
  .flatMap((rule) => rule.headers.map((header) => ({ source: rule.source, ...header })))
  .filter((header) => header.key === 'Content-Security-Policy');
if (policies.length === 0) {
  throw new Error('firebase.json no define Content-Security-Policy');
}

const inlineScripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(
  (match) => match[1],
);
const inlineHandlers = [...html.matchAll(/\son[a-z]+\s*=\s*["']/gi)].map((match) =>
  match[0].trim(),
);

const problems = [];
if (inlineHandlers.length > 0) {
  problems.push(
    `index.html tiene manejadores en línea (${inlineHandlers.join(', ')}), que script-src no permite`,
  );
}
for (const policy of policies) {
  for (const script of inlineScripts) {
    const token = `'sha256-${createHash('sha256').update(script).digest('base64')}'`;
    if (!policy.value.split(/[\s;]+/).includes(token)) {
      problems.push(
        `La regla ${policy.source} no permite el script en línea de index.html. Añade ${token} a su script-src.`,
      );
    }
  }
}

function filesUnder(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(dir, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}

const cacheable = /\.(js|css|woff2?)$/;
const covered = /^(?:[^/]+\.(?:js|css)|media\/[^/]+\.woff2?)$/;
const looseFiles = filesUnder(publicDir)
  .map((path) => relative(publicDir, path).replaceAll('\\', '/'))
  .filter((path) => cacheable.test(path) && !covered.test(path));
if (looseFiles.length > 0) {
  // Solo aviso: sirven igual, pero con no-cache.
  console.warn(
    `Aviso: estos ficheros no entran en las reglas de caché immutable de firebase.json: ${looseFiles.join(', ')}`,
  );
}

if (problems.length > 0) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log(
  `check-hosting-config: ${inlineScripts.length} script(s) en línea cubiertos por la CSP.`,
);

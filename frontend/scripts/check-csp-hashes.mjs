// Se ejecuta tras `npm run build` (postbuild). Falla si el index.html construido lleva un <script> en línea o un
// manejador on*="..." que el Content-Security-Policy de ../firebase.json no permite.
//
// Por qué: el build de producción de Angular mete en index.html un <script> en línea (activa el CSS no crítico) y la CSP
// no admite 'unsafe-inline' en script-src, así que lo autoriza por hash. Si una actualización de Angular cambia ese
// texto, el hash deja de valer, el navegador lo bloquea y la página se queda sin la hoja de estilos principal. Este
// script lo detecta en el build en vez de en producción.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const firebase = JSON.parse(readFileSync(resolve(repoRoot, 'firebase.json'), 'utf8'));
const indexPath = resolve(repoRoot, firebase.hosting.public, 'index.html');
const html = readFileSync(indexPath, 'utf8');

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

if (problems.length > 0) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log(
  `check-csp-hashes: ${inlineScripts.length} script(s) en línea de ${firebase.hosting.public}/index.html cubiertos por la CSP.`,
);

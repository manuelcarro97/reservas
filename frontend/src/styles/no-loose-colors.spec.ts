/// <reference types="node" />
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

/**
 * Todo color del panel sale de un token de `tokens.css`. Este test recorre los CSS, las plantillas `.html` y los
 * estilos en línea de los componentes y falla si encuentra un color fijo (`#hex`, `rgb()`, `hsl()`, `oklch()`, `hwb()`,
 * `lab()`, en mayúsculas o minúsculas) fuera de él.
 *
 * Excepciones: `tokens.css` (ahí viven los valores) y `app/plano/` (el dibujo del plano y los datos de sus temas
 * llevan sus propios colores). Los `.spec.ts` no se miran.
 */
const srcDir = resolve(process.cwd(), 'src');
const tokensFile = resolve(srcDir, 'styles', 'tokens.css');
const planoDir = resolve(srcDir, 'app', 'plano') + sep;

// `#abc`, `#aabbcc` o `#aabbccdd` sin letra delante: así no casa con un campo privado de clase (`this.#add`).
const hexColor = /(?<![\w$.])#[0-9a-fA-F]{3,8}\b/g;
const colorFunction = /\b(?:rgba?|hsla?|oklch|hwb|lab)\(/gi;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return sourceFiles(path);
    }
    const isStyle =
      entry.name.endsWith('.css') ||
      entry.name.endsWith('.html') ||
      (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts'));
    return isStyle ? [path] : [];
  });
}

describe('colores fijos', () => {
  it('noLooseColorsOutsideTokens', () => {
    const offenders: string[] = [];

    for (const file of sourceFiles(srcDir)) {
      if (file === tokensFile || file.startsWith(planoDir)) {
        continue;
      }
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, index) => {
          if (new RegExp(hexColor).test(line) || new RegExp(colorFunction).test(line)) {
            offenders.push(`${relative(srcDir, file)}:${index + 1}  ${line.trim()}`);
          }
        });
    }

    expect(offenders, 'colores fijos fuera de tokens.css').toEqual([]);
  });
});

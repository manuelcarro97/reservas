/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Lee `tokens.css` tal cual está en disco: los tokens son la fuente de verdad del sistema visual.
 * Se quitan los comentarios para que un valor citado en uno (p. ej. el de la maqueta) no cuente como declaración.
 */
const tokensCss = readFileSync(resolve(process.cwd(), 'src/styles/tokens.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

function tokenHex(name: string): string {
  // Anclado al inicio de la declaración: `--bg` no casa con `--wash-bg` ni con un `var(--bg)`.
  const match = new RegExp(`(?:^|[;{\\s])${name}\\s*:\\s*(#[0-9a-fA-F]{6})\\b`).exec(tokensCss);
  if (!match) {
    throw new Error(`Falta el token ${name} con un valor #rrggbb en tokens.css`);
  }
  return match[1].toLowerCase();
}

function channel(hex: string, start: number): number {
  const value = parseInt(hex.slice(start, start + 2), 16) / 255;
  return value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
}

function luminance(hex: string): number {
  const rgb = hex.replace('#', '');
  return 0.2126 * channel(rgb, 0) + 0.7152 * channel(rgb, 2) + 0.0722 * channel(rgb, 4);
}

/** Ratio de contraste WCAG 2.x entre dos colores `#rrggbb`. */
function contrast(foreground: string, background: string): number {
  const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
}

const AA = 4.5;

describe('design tokens', () => {
  it('mutedIsReadableOnEveryBackground', () => {
    const muted = tokenHex('--muted');

    for (const background of ['--paper', '--bg', '--wash']) {
      expect(contrast(muted, tokenHex(background)), `--muted sobre ${background}`).toBeGreaterThanOrEqual(AA);
    }
  });

  it('stateColorsAreReadableOnWhite', () => {
    expect(contrast(tokenHex('--ok'), '#ffffff'), '--ok sobre blanco').toBeGreaterThanOrEqual(AA);
    expect(contrast(tokenHex('--warn'), '#ffffff'), '--warn sobre blanco').toBeGreaterThanOrEqual(AA);
  });

  it('textAndStateColorsAreReadableOnTheSelectedRow', () => {
    const selectedRow = tokenHex('--blue-tint');

    for (const token of ['--muted', '--ok', '--warn']) {
      expect(contrast(tokenHex(token), selectedRow), `${token} sobre --blue-tint`).toBeGreaterThanOrEqual(AA);
    }
  });

  it('tokensKeepTheApprovedPalette', () => {
    expect(tokenHex('--blue')).toBe('#2563eb');
    expect(tokenHex('--ink')).toBe('#0b1c30');
    expect(tokenHex('--bg')).toBe('#f6f8fd');
  });
});

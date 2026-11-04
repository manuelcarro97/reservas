export type ThemeKey = 'AZUL' | 'BOSQUE' | 'TERRACOTA' | 'NOCHE';

export interface ThemeColors {
  /** Nombre para mostrar en el selector de tema. */
  name: string;
  page: string;
  sheet: string;
  ink: string;
  muted: string;
  lineUi: string;
  floorA: string;
  floorB: string;
  plank: string;
  stone: string;
  band: string;
  line: string;
  topA: string;
  topB: string;
  topStroke: string;
  cushA: string;
  cushB: string;
  seatInk: string;
  badge: string;
  /** Color (RGB 0-1) de la veta de la madera en el filtro de las mesas. */
  grain: readonly [number, number, number];
}

export const THEME_KEYS: readonly ThemeKey[] = ['AZUL', 'BOSQUE', 'TERRACOTA', 'NOCHE'];

export const THEMES: Record<ThemeKey, ThemeColors> = {
  AZUL: {
    name: 'Azul',
    page: '#f4f6f9',
    sheet: '#ffffff',
    ink: '#0d2137',
    muted: '#4a6080',
    lineUi: '#d8e0ea',
    floorA: '#1a3a5c',
    floorB: '#1f4469',
    plank: '#16324f',
    stone: '#b9c9dc',
    band: '#0d2137',
    line: '#081626',
    topA: '#ffffff',
    topB: '#e8ecf2',
    topStroke: '#4a6080',
    cushA: '#3b9eff',
    cushB: '#1e6fbf',
    seatInk: '#0d2137',
    badge: '#0d2137',
    grain: [0.12, 0.44, 0.75],
  },
  BOSQUE: {
    name: 'Bosque',
    page: '#f3f0e8',
    sheet: '#fffdf8',
    ink: '#2b2a1f',
    muted: '#6b6450',
    lineUi: '#e2dccb',
    floorA: '#6b4a2e',
    floorB: '#7a5536',
    plank: '#573b23',
    stone: '#cfc6ae',
    band: '#2f3b2a',
    line: '#1c2418',
    topA: '#f7f0e3',
    topB: '#e4d5ba',
    topStroke: '#6b5a3e',
    cushA: '#7fae66',
    cushB: '#4a7340',
    seatInk: '#25301f',
    badge: '#2f3b2a',
    grain: [0.42, 0.3, 0.16],
  },
  TERRACOTA: {
    name: 'Terracota',
    page: '#f7efe7',
    sheet: '#fffaf5',
    ink: '#3b1d12',
    muted: '#7a5646',
    lineUi: '#ecdccd',
    floorA: '#c98b5e',
    floorB: '#d39a6c',
    plank: '#ad6f47',
    stone: '#ead9c6',
    band: '#7a3b22',
    line: '#4e2414',
    topA: '#fffaf3',
    topB: '#f1e3d0',
    topStroke: '#8a5a42',
    cushA: '#3a948e',
    cushB: '#1f5f5b',
    seatInk: '#3b1d12',
    badge: '#7a3b22',
    grain: [0.55, 0.36, 0.24],
  },
  NOCHE: {
    name: 'Noche',
    page: '#11151c',
    sheet: '#1a1f29',
    ink: '#eef2f7',
    muted: '#9aa6b8',
    lineUi: '#2c3544',
    floorA: '#1b1f27',
    floorB: '#232a35',
    plank: '#14181f',
    stone: '#3d4657',
    band: '#0a0d12',
    line: '#000000',
    topA: '#eef1f5',
    topB: '#c8d0db',
    topStroke: '#6b778a',
    cushA: '#f2b84b',
    cushB: '#d18e22',
    seatInk: '#0a0d12',
    badge: '#0a0d12',
    grain: [0.4, 0.42, 0.48],
  },
};

/** El tema del plano si el cliente lo conoce; uno nuevo del backend (cliente desfasado) no debe romper la página. */
export function knownTheme(theme: string | undefined): ThemeKey {
  return theme !== undefined && Object.hasOwn(THEMES, theme) ? (theme as ThemeKey) : 'AZUL';
}

/** Colores de estado, comunes a todos los temas. La mesa libre es blanca (`topA`/`topB` del tema). */
export const STATE_COLORS = { sel: '#2f9e68', pending: '#8b98a8', taken: '#d2453b' } as const;

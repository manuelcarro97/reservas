// Espejo en TypeScript de la geometría del backend (RoomLayout, TableFootprint y LayoutValidator, en domain).
// geometry-cases.json comprueba que ambos lados dan los mismos resultados.

export type RoomShape = 'SQUARE' | 'RECTANGLE' | 'L' | 'U' | 'T';
export type TableShape = 'SQUARE' | 'ROUND';

/** Forma del local en unidades de plano; `width` y `height` son los de antes de girar. */
export interface Room {
  shape: RoomShape;
  width: number;
  height: number;
  cutWidth: number;
  cutDepth: number;
  rotation: number;
}

/** Rectángulo alineado con los ejes; `x1 <= x2` e `y1 <= y2`. */
export interface Rect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface Point {
  x: number;
  y: number;
}

/** Mesa por su centro (`x`, `y`). */
export interface TableLike {
  label: string;
  shape: TableShape;
  seats: number;
  rotation: number;
  x: number;
  y: number;
}

/** `tableIndex` y `label` son null si el problema afecta al local y no a una mesa. */
export interface LayoutProblem {
  tableIndex: number | null;
  label: string | null;
  code: string;
}

/** Cuadrícula de imán: las mesas se colocan en múltiplos de GRID. */
export const GRID = 10;

/** Distancia mínima entre la huella de una mesa (con sillas) y el contorno del local. */
export const WALL_INSET = 16;

export const MAX_TABLES = 60;

const STEP = 20;
const MIN_SIDE = 400;
const MAX_SIDE = 2000;
const MIN_CUT = 200;
const CHAIR_DEPTH = 34;
const RESERVED_LABEL_PREFIX = '~';

/** Largo de la mesa cuadrada según las plazas; el ancho es 70 con 2 plazas y 80 con las demás. */
const SQUARE_LENGTH: Record<number, number> = { 2: 70, 4: 120, 6: 170, 8: 220 };
const ROUND_RADIUS: Record<number, number> = { 2: 38, 4: 52, 6: 66, 8: 80 };

export function isSupportedSeats(seats: number): boolean {
  return Object.hasOwn(SQUARE_LENGTH, seats);
}

/** Motivos por los que la forma no es válida; vacía si lo es. */
export function roomProblems(room: Room): string[] {
  const problems: string[] = [];
  const { width, height, cutWidth, cutDepth, rotation } = room;
  if (!room.shape) {
    return ['Falta la forma del local'];
  }
  if (width < MIN_SIDE || width > MAX_SIDE || height < MIN_SIDE || height > MAX_SIDE) {
    problems.push(`El ancho y el alto deben estar entre ${MIN_SIDE} y ${MAX_SIDE}`);
  }
  if (width % STEP !== 0 || height % STEP !== 0 || cutWidth % STEP !== 0 || cutDepth % STEP !== 0) {
    problems.push(`Las medidas deben ser múltiplos de ${STEP}`);
  }
  if (![0, 90, 180, 270].includes(rotation)) {
    problems.push('El giro debe ser 0, 90, 180 o 270');
  }
  const requireNoCut = () => {
    if (cutWidth !== 0 || cutDepth !== 0) {
      problems.push('Esta forma no lleva hueco');
    }
  };
  const requireCuts = (maxCutWidth: number) => {
    if (cutWidth < MIN_CUT || cutWidth > maxCutWidth) {
      problems.push(`El ancho del hueco debe estar entre ${MIN_CUT} y ${maxCutWidth}`);
    }
    if (cutDepth < MIN_CUT || cutDepth > height - MIN_CUT) {
      problems.push(`El fondo del hueco debe estar entre ${MIN_CUT} y ${height - MIN_CUT}`);
    }
  };
  switch (room.shape) {
    case 'SQUARE':
      if (width !== height) {
        problems.push('El local cuadrado necesita el mismo ancho y alto');
      }
      requireNoCut();
      break;
    case 'RECTANGLE':
      requireNoCut();
      break;
    case 'L':
      requireCuts(width - MIN_CUT);
      break;
    case 'U':
    case 'T':
      requireCuts(width - 2 * MIN_CUT);
      break;
  }
  return problems;
}

/** Rectángulos disjuntos que cubren el local, con el giro aplicado. */
export function roomRects(room: Room): Rect[] {
  return unrotatedRects(room).map((rect) => rotateRect(room, rect));
}

/** Contorno del local, con el giro aplicado. */
export function roomPolygon(room: Room): Point[] {
  return unrotatedPolygon(room).map((point) => rotatePoint(room, point));
}

function unrotatedRects({ shape, width, height, cutWidth, cutDepth }: Room): Rect[] {
  const notchTop = height - cutDepth;
  switch (shape) {
    case 'SQUARE':
    case 'RECTANGLE':
      return [{ x1: 0, y1: 0, x2: width, y2: height }];
    case 'L':
      return [
        { x1: 0, y1: 0, x2: width, y2: notchTop },
        { x1: 0, y1: notchTop, x2: width - cutWidth, y2: height },
      ];
    case 'U':
      return [
        { x1: 0, y1: 0, x2: width, y2: notchTop },
        { x1: 0, y1: notchTop, x2: Math.trunc((width - cutWidth) / 2), y2: height },
        { x1: Math.trunc((width + cutWidth) / 2), y1: notchTop, x2: width, y2: height },
      ];
    case 'T':
      return [
        { x1: 0, y1: 0, x2: width, y2: notchTop },
        {
          x1: Math.trunc((width - cutWidth) / 2),
          y1: notchTop,
          x2: Math.trunc((width + cutWidth) / 2),
          y2: height,
        },
      ];
  }
}

function unrotatedPolygon({ shape, width, height, cutWidth, cutDepth }: Room): Point[] {
  const notchTop = height - cutDepth;
  const left = Math.trunc((width - cutWidth) / 2);
  const right = Math.trunc((width + cutWidth) / 2);
  const points: [number, number][] = (() => {
    switch (shape) {
      case 'SQUARE':
      case 'RECTANGLE':
        return [
          [0, 0],
          [width, 0],
          [width, height],
          [0, height],
        ];
      case 'L':
        return [
          [0, 0],
          [width, 0],
          [width, notchTop],
          [width - cutWidth, notchTop],
          [width - cutWidth, height],
          [0, height],
        ];
      case 'U':
        return [
          [0, 0],
          [width, 0],
          [width, height],
          [right, height],
          [right, notchTop],
          [left, notchTop],
          [left, height],
          [0, height],
        ];
      case 'T':
        return [
          [0, 0],
          [width, 0],
          [width, notchTop],
          [right, notchTop],
          [right, height],
          [left, height],
          [left, notchTop],
          [0, notchTop],
        ];
    }
  })();
  return points.map(([x, y]) => ({ x, y }));
}

/** Giro horario en pasos de 90 grados (coordenadas SVG, con y hacia abajo), como `RoomLayout.rotate`. */
function rotatePoint({ rotation, width, height }: Room, { x, y }: Point): Point {
  switch (rotation) {
    case 90:
      return { x: height - y, y: x };
    case 180:
      return { x: width - x, y: height - y };
    case 270:
      return { x: y, y: width - x };
    default:
      return { x, y };
  }
}

function rotateRect(room: Room, rect: Rect): Rect {
  const a = rotatePoint(room, { x: rect.x1, y: rect.y1 });
  const b = rotatePoint(room, { x: rect.x2, y: rect.y2 });
  return {
    x1: Math.min(a.x, b.x),
    y1: Math.min(a.y, b.y),
    x2: Math.max(a.x, b.x),
    y2: Math.max(a.y, b.y),
  };
}

/**
 * Huella de la mesa con sus sillas. La cuadrada lleva las sillas en los dos lados largos; la redonda cuenta como
 * su cuadrado envolvente (2r + 68) y no depende del giro.
 *
 * @throws si las plazas no son 2, 4, 6 u 8 o el giro no es 0 ni 90
 */
export function footprint({ shape, seats, rotation, x, y }: TableLike): Rect {
  if (!isSupportedSeats(seats)) {
    throw new Error(`Plazas no soportadas: ${seats}`);
  }
  if (rotation !== 0 && rotation !== 90) {
    throw new Error(`Giro de mesa no soportado: ${rotation}`);
  }
  let width: number;
  let height: number;
  if (shape === 'ROUND') {
    width = 2 * ROUND_RADIUS[seats] + 2 * CHAIR_DEPTH;
    height = width;
  } else {
    width = (seats === 2 ? 70 : 80) + 2 * CHAIR_DEPTH;
    height = SQUARE_LENGTH[seats];
  }
  if (rotation === 90) {
    [width, height] = [height, width];
  }
  const halfWidth = Math.trunc(width / 2);
  const halfHeight = Math.trunc(height / 2);
  return { x1: x - halfWidth, y1: y - halfHeight, x2: x + halfWidth, y2: y + halfHeight };
}

/**
 * Problemas del plano, vacío si es válido. Los del local llevan `tableIndex` null; los de mesa, la posición de la
 * mesa en `tables`.
 */
export function validateLayout(room: Room, tables: TableLike[]): LayoutProblem[] {
  const problems: LayoutProblem[] = [];
  const roomIsValid = roomProblems(room).length === 0;
  if (!roomIsValid) {
    problems.push({ tableIndex: null, label: null, code: 'INVALID_ROOM' });
  }
  if (tables.length > MAX_TABLES) {
    problems.push({ tableIndex: null, label: null, code: 'TOO_MANY_TABLES' });
    return problems;
  }

  const footprints = tables.map(calculableFootprint);
  const rects = roomIsValid ? roomRects(room) : [];
  const labelCount = countLabels(tables);

  tables.forEach((table, index) => {
    const codes: string[] = [];
    if (!isSupportedSeats(table.seats)) {
      codes.push('INVALID_SEATS');
    }
    if (table.rotation !== 0 && table.rotation !== 90) {
      codes.push('INVALID_ROTATION');
    }
    if (table.x % GRID !== 0 || table.y % GRID !== 0) {
      codes.push('OFF_GRID');
    }
    if (hasNoUsableLabel(table.label)) {
      codes.push('BLANK_LABEL');
    } else if ((labelCount.get(table.label.trim()) ?? 0) > 1) {
      codes.push('DUPLICATE_LABEL');
    }
    const own = footprints[index];
    if (own) {
      if (rects.length > 0 && !isInside(own, rects)) {
        codes.push('OUT_OF_ROOM');
      }
      if (overlapsAnother(index, footprints)) {
        codes.push('OVERLAP');
      }
    }
    for (const code of codes) {
      problems.push({ tableIndex: index, label: table.label, code });
    }
  });
  return problems;
}

/** Huella de la mesa; null si sus plazas o su giro no permiten calcularla. */
function calculableFootprint(table: TableLike): Rect | null {
  const calculable =
    isSupportedSeats(table.seats) &&
    (table.rotation === 0 || table.rotation === 90) &&
    !!table.shape;
  return calculable ? footprint(table) : null;
}

function countLabels(tables: TableLike[]): Map<string, number> {
  const count = new Map<string, number>();
  for (const table of tables) {
    if (!hasNoUsableLabel(table.label)) {
      const label = table.label.trim();
      count.set(label, (count.get(label) ?? 0) + 1);
    }
  }
  return count;
}

function hasNoUsableLabel(label: string | null | undefined): label is null | undefined | '' {
  return label == null || label.trim() === '' || label.trim().startsWith(RESERVED_LABEL_PREFIX);
}

function area(rect: Rect): number {
  return (rect.x2 - rect.x1) * (rect.y2 - rect.y1);
}

/** Estricto: dos rectángulos que solo comparten borde no se solapan. */
function overlaps(a: Rect, b: Rect): boolean {
  return a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2;
}

function intersectionArea(a: Rect, b: Rect): number {
  const width = Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1);
  const height = Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1);
  return width > 0 && height > 0 ? width * height : 0;
}

function expand(rect: Rect, distance: number): Rect {
  return {
    x1: rect.x1 - distance,
    y1: rect.y1 - distance,
    x2: rect.x2 + distance,
    y2: rect.y2 + distance,
  };
}

/** Los rectángulos del local son disjuntos, así que la huella cabe si las áreas que cubren suman la suya. */
function isInside(rect: Rect, roomRectList: Rect[]): boolean {
  const withInset = expand(rect, WALL_INSET);
  const covered = roomRectList.reduce(
    (sum, roomRect) => sum + intersectionArea(roomRect, withInset),
    0,
  );
  return covered >= area(withInset);
}

function overlapsAnother(index: number, footprints: (Rect | null)[]): boolean {
  const own = footprints[index];
  return (
    own !== null &&
    footprints.some(
      (candidate, other) => other !== index && candidate !== null && overlaps(own, candidate),
    )
  );
}

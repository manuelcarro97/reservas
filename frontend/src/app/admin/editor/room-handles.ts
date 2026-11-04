import {
  MAX_SIDE,
  MIN_CUT,
  MIN_SIDE,
  Point,
  Rect,
  Room,
  STEP,
  rotatePoint,
  roomRects,
} from '../../plano/geometry';

/** Medida del local que mueve un tirador. Con `cutWidth` y `cutDepth` se mueve el hueco de la L, la U o la T. */
export type HandleKind = 'width' | 'height' | 'cutWidth' | 'cutDepth';

/**
 * Tirador del editor. `x` e `y` son su posición en el plano (con el giro del local aplicado); `direction` es el
 * sentido, también en el plano, en el que el tirador agranda su medida.
 */
export interface Handle {
  kind: HandleKind;
  x: number;
  y: number;
  /** Nombre para el lector de pantalla. */
  label: string;
  /** Valor, mínimo y máximo de la medida cuando se calculó el tirador. */
  value: number;
  min: number;
  max: number;
  direction: Point;
  /** Cuánto cambia la medida por cada unidad que se mueve el tirador: 2 si el hueco está centrado (U, T). */
  gain: number;
}

const HAS_CUT: readonly Room['shape'][] = ['L', 'U', 'T'];

function hasCut(room: Room): boolean {
  return HAS_CUT.includes(room.shape);
}

/** Lo que debe quedar del ancho, como mínimo, fuera del hueco: un tramo en la L y uno a cada lado en la U y la T. */
function widthOutsideCut(room: Room): number {
  return room.shape === 'L' ? MIN_CUT : 2 * MIN_CUT;
}

/** Mínimo y máximo de una medida con las demás como están; son los de `roomProblems`. */
export function handleRange(room: Room, kind: HandleKind): { min: number; max: number } {
  switch (kind) {
    case 'width':
      return {
        min: hasCut(room) ? Math.max(MIN_SIDE, MIN_CUT + widthOutsideCut(room)) : MIN_SIDE,
        max: MAX_SIDE,
      };
    case 'height':
      return { min: MIN_SIDE, max: MAX_SIDE };
    case 'cutWidth':
      return { min: MIN_CUT, max: room.width - widthOutsideCut(room) };
    case 'cutDepth':
      return { min: MIN_CUT, max: room.height - MIN_CUT };
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function snap(value: number): number {
  return Math.round(value / STEP) * STEP;
}

function label(room: Room, kind: HandleKind): string {
  const foot = room.shape === 'T';
  switch (kind) {
    case 'width':
      return 'Ancho del local';
    case 'height':
      return 'Alto del local';
    case 'cutWidth':
      return foot ? 'Ancho del pie' : 'Ancho del hueco';
    case 'cutDepth':
      return foot ? 'Largo del pie' : 'Fondo del hueco';
  }
}

function make(room: Room, kind: HandleKind, at: Point, direction: Point, gain: number): Handle {
  const { min, max } = handleRange(room, kind);
  const shown = rotatePoint(room, at);
  const ahead = rotatePoint(room, { x: at.x + direction.x, y: at.y + direction.y });
  return {
    kind,
    x: shown.x,
    y: shown.y,
    label: label(room, kind),
    value: room[kind],
    min,
    max,
    direction: { x: ahead.x - shown.x, y: ahead.y - shown.y },
    gain,
  };
}

/**
 * Tiradores del local. Ancho y alto van en el borde derecho e inferior tal como se ve el local girado: así crecer
 * es arrastrar hacia fuera, que es donde se mueve el borde (el local se ancla siempre en el origen). En la L, la U y
 * la T hay además uno para el ancho y otro para el fondo del hueco, en el borde del hueco.
 */
export function handlesFor(room: Room): Handle[] {
  const rects = roomRects(room);
  const shownWidth = Math.max(...rects.map((rect) => rect.x2));
  const shownHeight = Math.max(...rects.map((rect) => rect.y2));
  // Con el giro de 90 o 270 el ancho del local se ve como alto.
  const turned = room.rotation % 180 !== 0;
  const horizontal: HandleKind = turned ? 'height' : 'width';
  const vertical: HandleKind = turned ? 'width' : 'height';

  const handles: Handle[] = [
    sizeHandle(room, horizontal, edgeMiddle(rects, 'x2', shownWidth), 1, 0),
    sizeHandle(room, vertical, edgeMiddle(rects, 'y2', shownHeight), 0, 1),
  ];

  if (hasCut(room)) {
    const { width, cutWidth, cutDepth } = room;
    const notchTop = room.height - cutDepth;
    const centered = room.shape !== 'L';
    handles.push(
      centered
        ? make(
            room,
            'cutWidth',
            { x: (width + cutWidth) / 2, y: notchTop + cutDepth / 2 },
            { x: 1, y: 0 },
            2,
          )
        : make(
            room,
            'cutWidth',
            { x: width - cutWidth, y: notchTop + cutDepth / 2 },
            { x: -1, y: 0 },
            1,
          ),
      centered
        ? make(room, 'cutDepth', { x: width / 2, y: notchTop }, { x: 0, y: -1 }, 1)
        : make(room, 'cutDepth', { x: width - cutWidth / 2, y: notchTop }, { x: 0, y: -1 }, 1),
    );
  }
  return handles;
}

/** Tirador de ancho o alto: ya está en el plano, sin giro que aplicar; crece hacia fuera (`dx`, `dy`). */
function sizeHandle(room: Room, kind: HandleKind, at: Point, dx: number, dy: number): Handle {
  const { min, max } = handleRange(room, kind);
  return {
    kind,
    x: at.x,
    y: at.y,
    label: label(room, kind),
    value: room[kind],
    min,
    max,
    direction: { x: dx, y: dy },
    gain: 1,
  };
}

/**
 * Punto medio del tramo más largo del borde del local que toca la línea `edge` (x o y máximo). Así el tirador cae
 * siempre sobre la pared y no en el hueco de una U.
 */
function edgeMiddle(rects: Rect[], side: 'x2' | 'y2', edge: number): Point {
  const touching = rects.filter((rect) => rect[side] === edge);
  const along = (rect: Rect) => (side === 'x2' ? rect.y2 - rect.y1 : rect.x2 - rect.x1);
  const longest = touching.reduce((best, rect) => (along(rect) > along(best) ? rect : best));
  return side === 'x2'
    ? { x: edge, y: (longest.y1 + longest.y2) / 2 }
    : { x: (longest.x1 + longest.x2) / 2, y: edge };
}

/**
 * Fija la medida del tirador. Redondea a la cuadrícula del local y la limita a su rango; si el cambio deja el hueco
 * fuera de rango, lo recorta (así el local sigue siendo válido) y el cuadrado conserva el mismo ancho y alto.
 */
export function applyHandleValue(room: Room, handle: Handle, value: number): Room {
  const { min, max } = handleRange(room, handle.kind);
  const next = clamp(snap(value), min, max);
  const result: Room = { ...room };
  switch (handle.kind) {
    case 'width':
      result.width = next;
      if (room.shape === 'SQUARE') {
        result.height = next;
      }
      break;
    case 'height':
      result.height = next;
      if (room.shape === 'SQUARE') {
        result.width = next;
      }
      break;
    case 'cutWidth':
      result.cutWidth = next;
      break;
    case 'cutDepth':
      result.cutDepth = next;
      break;
  }
  if (hasCut(result)) {
    result.cutWidth = Math.min(result.cutWidth, handleRange(result, 'cutWidth').max);
    result.cutDepth = Math.min(result.cutDepth, handleRange(result, 'cutDepth').max);
  }
  return result;
}

/**
 * Local resultante de mover el tirador (`dx`, `dy`) unidades de plano desde `room`. `room` debe ser el local del
 * principio del arrastre y (`dx`, `dy`) el desplazamiento total: redondear cada movimiento suelto lo dejaría quieto.
 */
export function applyHandleDrag(room: Room, handle: Handle, dx: number, dy: number): Room {
  const growth = (dx * handle.direction.x + dy * handle.direction.y) * handle.gain;
  return applyHandleValue(room, handle, room[handle.kind] + growth);
}

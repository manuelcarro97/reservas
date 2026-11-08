import { MAX_SIDE, MIN_CUT, MIN_SIDE, Point, Room, STEP, rotatePoint } from '../../plano/geometry';

/** Medida del local que cambia al mover una pared: la "principal" del tirador. */
export type HandleKind = 'width' | 'height' | 'cutWidth' | 'cutDepth';

/**
 * Cuánto cambia cada medida por unidad de crecimiento de la medida principal, y cuánto se desplazan las mesas
 * (en el plano sin girar) para quedarse donde estaban respecto a las paredes que no se mueven.
 */
export interface WallEffect {
  width: number;
  height: number;
  cutWidth: number;
  cutDepth: number;
  shiftX: number;
  shiftY: number;
}

/**
 * Tirador de una pared del local. `x` e `y` son el punto medio de la pared en el plano (con el giro aplicado);
 * `direction` es el sentido, también en el plano, en el que mover la pared agranda `kind`.
 */
export interface Handle {
  /** Pared a la que pertenece; no cambia con el giro ni con las medidas. */
  wall: string;
  kind: HandleKind;
  x: number;
  y: number;
  /** Nombre para el lector de pantalla. */
  label: string;
  /** Valor, mínimo y máximo de `kind` cuando se calculó el tirador. */
  value: number;
  min: number;
  max: number;
  direction: Point;
  /** Cuánto cambia `kind` por cada unidad que se mueve la pared: 2 si el entrante está centrado (U, T). */
  gain: number;
  effect: WallEffect;
}

/** Resultado de mover una pared: el local nuevo y cuánto hay que desplazar las mesas (en el plano). */
export interface WallMove {
  room: Room;
  shift: Point;
}

/** Pared del local sin girar. */
interface Wall {
  id: string;
  from: Point;
  to: Point;
  kind: HandleKind;
  /** Sentido (sin girar) en el que mover la pared agranda `kind`. */
  grows: Point;
  gain: number;
  effect: WallEffect;
  /** Pared del entrante (L, U, T) en vez de pared exterior. */
  inner: boolean;
}

const HAS_CUT: readonly Room['shape'][] = ['L', 'U', 'T'];

function hasCut(room: Room): boolean {
  return HAS_CUT.includes(room.shape);
}

/** Lo que debe quedar del ancho, como mínimo, fuera del entrante: un tramo en la L y uno a cada lado en la U y la T. */
function widthOutsideCut(room: Room): number {
  return room.shape === 'L' ? MIN_CUT : 2 * MIN_CUT;
}

function minWidth(room: Room): number {
  return hasCut(room) ? Math.max(MIN_SIDE, MIN_CUT + widthOutsideCut(room)) : MIN_SIDE;
}

function snap(value: number): number {
  return Math.round(value / STEP) * STEP;
}

/** Paredes del local, cada una con lo que cambia al moverla. Las que se mueven no tocan a las demás. */
function wallsOf(room: Room): Wall[] {
  const { shape, width: w, height: h, cutWidth: cw, cutDepth: cd } = room;
  const notchTop = h - cd;
  const left = Math.trunc((w - cw) / 2);
  const right = Math.trunc((w + cw) / 2);
  const point = (x: number, y: number): Point => ({ x, y });

  const wall = (
    id: string,
    from: Point,
    to: Point,
    kind: HandleKind,
    grows: Point,
    gain: number,
    parts: Partial<WallEffect>,
    inner = false,
  ): Wall => {
    const effect: WallEffect = {
      width: 0,
      height: 0,
      cutWidth: 0,
      cutDepth: 0,
      shiftX: 0,
      shiftY: 0,
      ...parts,
    };
    // El cuadrado crece por los dos lados a la vez: ancho y alto van juntos.
    if (shape === 'SQUARE') {
      effect.width = 1;
      effect.height = 1;
    }
    return { id, from, to, kind, grows, gain, effect, inner };
  };
  const up = point(0, -1);
  const down = point(0, 1);
  const toLeft = point(-1, 0);
  const toRight = point(1, 0);

  // Paredes que crecen hacia el origen (arriba, izquierda) desplazan las mesas: el otro lado se queda quieto.
  const top = wall('top', point(0, 0), point(w, 0), 'height', up, 1, { height: 1, shiftY: 1 });
  const leftWall = (to: number) =>
    wall('left', point(0, 0), point(0, to), 'width', toLeft, 1, { width: 1, shiftX: 1 });

  switch (shape) {
    case 'SQUARE':
    case 'RECTANGLE':
      return [
        top,
        wall('bottom', point(0, h), point(w, h), 'height', down, 1, { height: 1 }),
        leftWall(h),
        wall('right', point(w, 0), point(w, h), 'width', toRight, 1, { width: 1 }),
      ];
    case 'L':
      return [
        top,
        leftWall(h),
        // La pared interior vertical del entrante se queda quieta: el ancho y el del entrante crecen a la vez.
        wall('right', point(w, 0), point(w, notchTop), 'width', toRight, 1, {
          width: 1,
          cutWidth: 1,
        }),
        wall(
          'notchTop',
          point(w - cw, notchTop),
          point(w, notchTop),
          'cutDepth',
          up,
          1,
          { cutDepth: 1 },
          true,
        ),
        wall(
          'notchInner',
          point(w - cw, notchTop),
          point(w - cw, h),
          'cutWidth',
          toLeft,
          1,
          { cutWidth: 1 },
          true,
        ),
        // El fondo del entrante crece con el alto: su pared de arriba no se mueve.
        wall('bottom', point(0, h), point(w - cw, h), 'height', down, 1, {
          height: 1,
          cutDepth: 1,
        }),
      ];
    case 'U':
      return [
        top,
        leftWall(h),
        wall('right', point(w, 0), point(w, h), 'width', toRight, 1, { width: 1 }),
        wall('bottomLeft', point(0, h), point(left, h), 'height', down, 1, {
          height: 1,
          cutDepth: 1,
        }),
        wall('bottomRight', point(right, h), point(w, h), 'height', down, 1, {
          height: 1,
          cutDepth: 1,
        }),
        // El entrante está centrado: mover una pared interior mueve la simétrica, y el ancho cambia el doble.
        wall(
          'innerLeft',
          point(left, notchTop),
          point(left, h),
          'cutWidth',
          toLeft,
          2,
          { cutWidth: 1 },
          true,
        ),
        wall(
          'innerRight',
          point(right, notchTop),
          point(right, h),
          'cutWidth',
          toRight,
          2,
          { cutWidth: 1 },
          true,
        ),
        wall(
          'notchTop',
          point(left, notchTop),
          point(right, notchTop),
          'cutDepth',
          up,
          1,
          { cutDepth: 1 },
          true,
        ),
      ];
    case 'T':
      return [
        top,
        leftWall(notchTop),
        wall('right', point(w, 0), point(w, notchTop), 'width', toRight, 1, { width: 1 }),
        wall(
          'shoulderLeft',
          point(0, notchTop),
          point(left, notchTop),
          'cutDepth',
          up,
          1,
          { cutDepth: 1 },
          true,
        ),
        wall(
          'shoulderRight',
          point(right, notchTop),
          point(w, notchTop),
          'cutDepth',
          up,
          1,
          { cutDepth: 1 },
          true,
        ),
        wall(
          'stemLeft',
          point(left, notchTop),
          point(left, h),
          'cutWidth',
          toLeft,
          2,
          { cutWidth: 1 },
          true,
        ),
        wall(
          'stemRight',
          point(right, notchTop),
          point(right, h),
          'cutWidth',
          toRight,
          2,
          { cutWidth: 1 },
          true,
        ),
        wall('stemBottom', point(left, h), point(right, h), 'height', down, 1, {
          height: 1,
          cutDepth: 1,
        }),
      ];
  }
}

/**
 * Cuánto puede crecer (`hi`) o encogerse (`lo`, negativo) la medida principal de una pared sin que el local deje de
 * ser válido (`roomProblems`). Son múltiplos de STEP.
 */
function growthRange(room: Room, effect: WallEffect): { lo: number; hi: number } {
  let lo = -Infinity;
  let hi = Infinity;
  // `coefficient * growth <= bound`
  const limit = (coefficient: number, bound: number) => {
    if (coefficient > 0) {
      hi = Math.min(hi, bound / coefficient);
    } else if (coefficient < 0) {
      lo = Math.max(lo, bound / coefficient);
    }
  };
  const { width, height, cutWidth, cutDepth } = room;
  limit(effect.width, MAX_SIDE - width);
  limit(-effect.width, width - minWidth(room));
  limit(effect.height, MAX_SIDE - height);
  limit(-effect.height, height - MIN_SIDE);
  if (hasCut(room)) {
    limit(-effect.cutWidth, cutWidth - MIN_CUT);
    limit(effect.cutWidth - effect.width, width - widthOutsideCut(room) - cutWidth);
    limit(-effect.cutDepth, cutDepth - MIN_CUT);
    limit(effect.cutDepth - effect.height, height - MIN_CUT - cutDepth);
  }
  return { lo, hi };
}

function middle(from: Point, to: Point): Point {
  return { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
}

interface Placed {
  wall: Wall;
  /** Punto medio de la pared en el plano. */
  at: Point;
  vertical: boolean;
}

/** Nombre de cada pared de un grupo de 2 según dónde están una respecto a la otra; vacío si no son 2. */
function pairNames(group: Placed[]): Map<Placed, string> {
  const names = new Map<Placed, string>();
  if (group.length !== 2) {
    return names;
  }
  const [a, b] = group;
  const byX = Math.abs(a.at.x - b.at.x) >= Math.abs(a.at.y - b.at.y);
  const first = byX ? a.at.x <= b.at.x : a.at.y <= b.at.y;
  const [low, high] = byX ? ['izquierda', 'derecha'] : ['superior', 'inferior'];
  names.set(a, first ? low : high);
  names.set(b, first ? high : low);
  return names;
}

/**
 * Nombres para el lector de pantalla, por lado del plano: "Pared izquierda"; si hay dos en el mismo lado (las patas
 * de la U), "Pared inferior izquierda". Las del entrante: "Pared interior derecha del entrante".
 */
function labelsFor(
  room: Room,
  placed: Placed[],
  shownWidth: number,
  shownHeight: number,
): Map<string, string> {
  const labels = new Map<string, string>();
  const outer = placed.filter((item) => !item.wall.inner);
  const sides = new Map<string, Placed[]>();
  for (const item of outer) {
    const side = item.vertical
      ? item.at.x === 0
        ? 'izquierda'
        : item.at.x === shownWidth
          ? 'derecha'
          : 'lateral'
      : item.at.y === 0
        ? 'superior'
        : item.at.y === shownHeight
          ? 'inferior'
          : 'horizontal';
    sides.set(side, [...(sides.get(side) ?? []), item]);
  }
  for (const [side, group] of sides) {
    const names = pairNames(group);
    for (const item of group) {
      const part = names.get(item);
      labels.set(item.wall.id, part ? `Pared ${side} ${part}` : `Pared ${side}`);
    }
  }

  const inner = placed.filter((item) => item.wall.inner);
  for (const vertical of [true, false]) {
    const group = inner.filter((item) => item.vertical === vertical);
    const orientation = vertical ? 'vertical' : 'horizontal';
    const names = pairNames(group);
    for (const item of group) {
      const part = names.get(item);
      // En la T hay dos pares (hombros y pie): sin la orientación se llamarían igual.
      const name = part ? (room.shape === 'T' ? `${orientation} ${part}` : part) : orientation;
      labels.set(item.wall.id, `Pared interior ${name} del entrante`);
    }
  }
  return labels;
}

/**
 * Un tirador por pared del local, en el punto medio de la pared tal como se ve girado. Arrastrarlo mueve esa pared y
 * solo esa: las demás se quedan donde están (el entrante centrado de la U y la T es la excepción, se mueve con el
 * ancho porque no puede dejar de estar centrado).
 */
export function handlesFor(room: Room): Handle[] {
  // Con 90 o 270 el ancho del local se ve como alto.
  const turned = room.rotation % 180 !== 0;
  const shownWidth = turned ? room.height : room.width;
  const shownHeight = turned ? room.width : room.height;
  const placed: Placed[] = wallsOf(room).map((wall) => {
    const at = rotatePoint(room, middle(wall.from, wall.to));
    // Una pared vertical sin girar se ve horizontal con 90 o 270.
    const vertical = (wall.from.x === wall.to.x) !== turned;
    return { wall, at, vertical };
  });
  const labels = labelsFor(room, placed, shownWidth, shownHeight);

  return placed.map(({ wall, at }) => {
    const middlePoint = middle(wall.from, wall.to);
    const ahead = rotatePoint(room, {
      x: middlePoint.x + wall.grows.x,
      y: middlePoint.y + wall.grows.y,
    });
    const { lo, hi } = growthRange(room, wall.effect);
    return {
      wall: wall.id,
      kind: wall.kind,
      x: at.x,
      y: at.y,
      label: labels.get(wall.id) ?? wall.id,
      value: room[wall.kind],
      min: room[wall.kind] + lo,
      max: room[wall.kind] + hi,
      direction: { x: ahead.x - at.x, y: ahead.y - at.y },
      gain: wall.gain,
      effect: wall.effect,
    };
  });
}

/** Mueve la pared hasta que su medida principal crece `growth` (redondeado a STEP y dentro de su rango). */
function grow(room: Room, handle: Handle, growth: number): WallMove {
  const { effect } = handle;
  const { lo, hi } = growthRange(room, effect);
  // `+ 0` evita un -0 cuando el redondeo de un valor pequeño y negativo da cero.
  const step = Math.min(hi, Math.max(lo, snap(growth))) + 0;
  const next: Room = {
    ...room,
    width: room.width + effect.width * step,
    height: room.height + effect.height * step,
    cutWidth: room.cutWidth + effect.cutWidth * step,
    cutDepth: room.cutDepth + effect.cutDepth * step,
  };
  // Las mesas se desplazan lo que se desplaza el origen del local en el plano, para seguir en su sitio respecto a
  // las paredes que no se mueven.
  const before = rotatePoint(room, { x: 0, y: 0 });
  const after = rotatePoint(next, { x: effect.shiftX * step, y: effect.shiftY * step });
  return { room: next, shift: { x: after.x - before.x + 0, y: after.y - before.y + 0 } };
}

/**
 * Mueve la pared del tirador (`dx`, `dy`) unidades de plano desde `room`. `room` debe ser el local del principio
 * del arrastre y (`dx`, `dy`) el desplazamiento total: redondear cada movimiento suelto lo dejaría quieto.
 */
export function moveHandleBy(room: Room, handle: Handle, dx: number, dy: number): WallMove {
  return grow(room, handle, (dx * handle.direction.x + dy * handle.direction.y) * handle.gain);
}

/** Fija la medida principal del tirador (teclado). */
export function moveHandleTo(room: Room, handle: Handle, value: number): WallMove {
  return grow(room, handle, value - room[handle.kind]);
}

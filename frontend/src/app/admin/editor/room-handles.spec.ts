import { Point, Room, RoomShape, roomPolygon, roomProblems } from '../../plano/geometry';
import { Handle, handlesFor, moveHandleBy, moveHandleTo } from './room-handles';

/** Solo el local tras arrastrar el tirador: lo que miran la mayoría de estos tests. */
function applyHandleDrag(of: Room, grabbed: Handle, dx: number, dy: number): Room {
  return moveHandleBy(of, grabbed, dx, dy).room;
}

function room(
  shape: RoomShape,
  width: number,
  height: number,
  cutWidth = 0,
  cutDepth = 0,
  rotation = 0,
): Room {
  return { shape, width, height, cutWidth, cutDepth, rotation };
}

const SQUARE = room('SQUARE', 800, 800);
const RECTANGLE = room('RECTANGLE', 1200, 560);
const L = room('L', 1000, 900, 480, 480);
const U = room('U', 1100, 820, 420, 440);
const T = room('T', 1100, 900, 340, 520);
const SHAPES = [SQUARE, RECTANGLE, L, U, T];
const ROTATIONS = [0, 90, 180, 270];

function handle(of: Room, wall: string): Handle {
  const found = handlesFor(of).find((candidate) => candidate.wall === wall);
  if (!found) {
    throw new Error(`Sin tirador ${wall}`);
  }
  return found;
}

function byLabel(of: Room, label: string): Handle {
  const found = handlesFor(of).find((candidate) => candidate.label === label);
  if (!found) {
    throw new Error(`Sin tirador "${label}"`);
  }
  return found;
}

/** Líneas de pared del contorno tal como se ve: `v:x` para las verticales y `h:y` para las horizontales. */
function lines(of: Room, shift: Point = { x: 0, y: 0 }): Set<string> {
  const polygon = roomPolygon(of);
  const found = new Set<string>();
  polygon.forEach((from, index) => {
    const to = polygon[(index + 1) % polygon.length];
    found.add(from.x === to.x ? `v:${from.x + shift.x}` : `h:${from.y + shift.y}`);
  });
  return found;
}

function bounds(of: Room): { width: number; height: number } {
  const polygon = roomPolygon(of);
  return {
    width: Math.max(...polygon.map((point) => point.x)),
    height: Math.max(...polygon.map((point) => point.y)),
  };
}

describe('room handles', () => {
  it('handleDragSnapsTo20', () => {
    const width = handle(RECTANGLE, 'right');
    expect(applyHandleDrag(RECTANGLE, width, 27, 0).width).toBe(1220);
    expect(applyHandleDrag(RECTANGLE, width, 31, 0).width).toBe(1240);
    expect(applyHandleDrag(RECTANGLE, width, 9, 0).width).toBe(1200);
    expect(applyHandleDrag(RECTANGLE, width, -31, 0).width).toBe(1160);
    const height = handle(RECTANGLE, 'bottom');
    expect(applyHandleDrag(RECTANGLE, height, 0, 27).height).toBe(580);
    // Las paredes de arriba y de la izquierda también redondean.
    expect(applyHandleDrag(RECTANGLE, handle(RECTANGLE, 'left'), -27, 0).width).toBe(1220);
    expect(applyHandleDrag(RECTANGLE, handle(RECTANGLE, 'top'), 0, -31).height).toBe(600);
  });

  it('handleDragClampsToRange', () => {
    const right = handle(RECTANGLE, 'right');
    expect(applyHandleDrag(RECTANGLE, right, 5000, 0).width).toBe(2000);
    expect(applyHandleDrag(RECTANGLE, right, -5000, 0).width).toBe(400);
    const bottom = handle(RECTANGLE, 'bottom');
    expect(applyHandleDrag(RECTANGLE, bottom, 0, 5000).height).toBe(2000);
    expect(applyHandleDrag(RECTANGLE, bottom, 0, -5000).height).toBe(400);
    expect(applyHandleDrag(RECTANGLE, handle(RECTANGLE, 'left'), -5000, 0).width).toBe(2000);
    expect(applyHandleDrag(RECTANGLE, handle(RECTANGLE, 'top'), 0, 5000).height).toBe(400);
    // Los límites del entrante: al menos 200 y que quede 200 de local a cada lado.
    expect(applyHandleDrag(L, handle(L, 'notchInner'), 5000, 0).cutWidth).toBe(200);
    expect(applyHandleDrag(L, handle(L, 'notchInner'), -5000, 0).cutWidth).toBe(800);
    expect(applyHandleDrag(L, handle(L, 'notchTop'), 0, 5000).cutDepth).toBe(200);
    expect(applyHandleDrag(L, handle(L, 'notchTop'), 0, -5000).cutDepth).toBe(700);
  });

  it('lShapeHasCutHandles', () => {
    const walls = (of: Room) =>
      handlesFor(of)
        .map((candidate) => candidate.wall)
        .sort();
    expect(walls(L)).toEqual(['bottom', 'left', 'notchInner', 'notchTop', 'right', 'top']);
    expect(walls(U)).toEqual([
      'bottomLeft',
      'bottomRight',
      'innerLeft',
      'innerRight',
      'left',
      'notchTop',
      'right',
      'top',
    ]);
    expect(walls(T)).toEqual([
      'left',
      'right',
      'shoulderLeft',
      'shoulderRight',
      'stemBottom',
      'stemLeft',
      'stemRight',
      'top',
    ]);
    expect(walls(RECTANGLE)).toEqual(['bottom', 'left', 'right', 'top']);
    expect(walls(SQUARE)).toEqual(['bottom', 'left', 'right', 'top']);
  });

  it('hay un tirador en el punto medio de cada pared, en cada forma y giro', () => {
    for (const base of SHAPES) {
      for (const rotation of ROTATIONS) {
        const turned = { ...base, rotation };
        const polygon = roomPolygon(turned);
        const middles = polygon
          .map((from, index) => {
            const to = polygon[(index + 1) % polygon.length];
            return `${(from.x + to.x) / 2},${(from.y + to.y) / 2}`;
          })
          .sort();
        const handles = handlesFor(turned)
          .map((candidate) => `${candidate.x},${candidate.y}`)
          .sort();
        expect(handles, `${base.shape} ${rotation}`).toEqual(middles);
      }
    }
  });

  it('cada tirador tiene un nombre distinto, también girado', () => {
    for (const base of SHAPES) {
      for (const rotation of ROTATIONS) {
        const labels = handlesFor({ ...base, rotation }).map((candidate) => candidate.label);
        expect(new Set(labels).size, `${base.shape} ${rotation}: ${labels}`).toBe(labels.length);
      }
    }
  });

  it('nombra las paredes por el lado en que se ven', () => {
    const labels = (of: Room) =>
      handlesFor(of)
        .map((candidate) => candidate.label)
        .sort();
    expect(labels(RECTANGLE)).toEqual([
      'Pared derecha',
      'Pared inferior',
      'Pared izquierda',
      'Pared superior',
    ]);
    // Girado, la pared de la derecha sigue siendo la de la derecha.
    expect(labels({ ...RECTANGLE, rotation: 90 })).toEqual(labels(RECTANGLE));
    expect(labels(L)).toEqual([
      'Pared derecha',
      'Pared inferior',
      'Pared interior horizontal del entrante',
      'Pared interior vertical del entrante',
      'Pared izquierda',
      'Pared superior',
    ]);
    expect(labels(U)).toEqual([
      'Pared derecha',
      'Pared inferior derecha',
      'Pared inferior izquierda',
      'Pared interior derecha del entrante',
      'Pared interior horizontal del entrante',
      'Pared interior izquierda del entrante',
      'Pared izquierda',
      'Pared superior',
    ]);
    expect(byLabel({ ...U, rotation: 270 }, 'Pared derecha superior')).toBeTruthy();
    expect(byLabel({ ...U, rotation: 270 }, 'Pared derecha inferior')).toBeTruthy();
    expect(byLabel(T, 'Pared interior vertical izquierda del entrante').wall).toBe('stemLeft');
    expect(byLabel(T, 'Pared interior horizontal izquierda del entrante').wall).toBe(
      'shoulderLeft',
    );
  });

  it('tiene valor y rango para el lector de pantalla', () => {
    expect(byLabel(RECTANGLE, 'Pared derecha')).toMatchObject({ value: 1200, min: 400, max: 2000 });
    expect(byLabel(RECTANGLE, 'Pared inferior')).toMatchObject({ value: 560, min: 400, max: 2000 });
    expect(byLabel(L, 'Pared interior vertical del entrante')).toMatchObject({
      value: 480,
      min: 200,
      max: 800,
    });
    expect(byLabel(L, 'Pared interior horizontal del entrante')).toMatchObject({
      value: 480,
      min: 200,
      max: 700,
    });
    expect(byLabel(U, 'Pared interior derecha del entrante')).toMatchObject({ min: 200, max: 700 });
  });

  it('la pared exterior del local con entrante no se pasa del hueco', () => {
    // Mover la pared derecha de la L con el entrante pegado a ella lo arrastra: no puede bajar de 200 de entrante.
    const narrower = applyHandleDrag(L, handle(L, 'right'), -5000, 0);
    expect(narrower).toMatchObject({ width: 720, cutWidth: 200 });
    expect(roomProblems(narrower)).toEqual([]);
    // En la U y la T queda 200 de local a cada lado del entrante.
    const u = applyHandleDrag(U, handle(U, 'right'), -5000, 0);
    expect(u.width).toBe(820);
    expect(roomProblems(u)).toEqual([]);
    const shorter = applyHandleDrag(L, handle(L, 'top'), 0, 5000);
    // No baja de 680: el entrante de 480 necesita 200 de local debajo.
    expect(shorter.height).toBe(680);
    expect(roomProblems(shorter)).toEqual([]);
    for (const base of [L, U, T]) {
      for (const candidate of handlesFor(base)) {
        for (const direction of [-5000, 5000]) {
          const moved = applyHandleDrag(
            base,
            candidate,
            candidate.direction.x * direction,
            candidate.direction.y * direction,
          );
          expect(roomProblems(moved), `${base.shape} ${candidate.wall} ${direction}`).toEqual([]);
        }
      }
    }
  });

  it('el local cuadrado conserva el mismo ancho y alto', () => {
    const wider = applyHandleDrag(SQUARE, handle(SQUARE, 'right'), 200, 0);
    expect(wider).toMatchObject({ width: 1000, height: 1000 });
    const lower = applyHandleDrag(SQUARE, handle(SQUARE, 'bottom'), 0, -200);
    expect(lower).toMatchObject({ width: 600, height: 600 });
    expect(roomProblems(wider)).toEqual([]);
    for (const wall of ['top', 'left', 'right', 'bottom']) {
      const moved = applyHandleDrag(SQUARE, handle(SQUARE, wall), -40, -40);
      expect(moved.width).toBe(moved.height);
    }
  });

  it('en U y T el entrante está centrado: una pared interior mueve la simétrica y el ancho cambia el doble', () => {
    for (const base of [U, T]) {
      for (const rotation of ROTATIONS) {
        const turned = { ...base, rotation };
        const walls = base === U ? ['innerLeft', 'innerRight'] : ['stemLeft', 'stemRight'];
        for (const wall of walls) {
          const tirador = handle(turned, wall);
          // 20 unidades de plano hacia fuera: el ancho del entrante crece 40.
          const move = moveHandleBy(
            turned,
            tirador,
            tirador.direction.x * 20,
            tirador.direction.y * 20,
          );
          expect(move.room.cutWidth).toBe(base.cutWidth + 40);
          expect(move.room).toMatchObject({ width: base.width, height: base.height });
          expect(move.shift).toEqual({ x: 0, y: 0 });
          // Las dos paredes interiores se han movido 20 en sentidos opuestos: sigue centrado.
          const before = [...lines(turned)].sort();
          const after = [...lines(move.room)].sort();
          expect(after).not.toEqual(before);
          const centred = roomProblems(move.room);
          expect(centred).toEqual([]);
        }
      }
    }
    expect(applyHandleDrag(U, handle(U, 'innerRight'), 20, 0).cutWidth).toBe(460);
    expect(applyHandleDrag(U, handle(U, 'innerLeft'), -20, 0).cutWidth).toBe(460);
    expect(applyHandleDrag(T, handle(T, 'stemRight'), -20, 0).cutWidth).toBe(300);
    expect(applyHandleDrag(L, handle(L, 'notchInner'), -20, 0).cutWidth).toBe(500);
    expect(applyHandleDrag(U, handle(U, 'notchTop'), 0, -20).cutDepth).toBe(460);
  });

  it('arrastrar hacia fuera agranda la medida de cualquier pared, en cada forma y giro', () => {
    for (const base of SHAPES) {
      for (const rotation of ROTATIONS) {
        const turned = { ...base, rotation };
        for (const candidate of handlesFor(turned)) {
          const out = 20 / candidate.gain;
          const moved = applyHandleDrag(
            turned,
            candidate,
            candidate.direction.x * out,
            candidate.direction.y * out,
          );
          expect(moved[candidate.kind], `${base.shape} ${rotation} ${candidate.wall}`).toBe(
            turned[candidate.kind] + 20,
          );
        }
      }
    }
  });

  /**
   * Líneas del contorno que cambian (respecto a las de antes desplazadas como las mesas) al mover una pared. Salvo
   * las excepciones inevitables es solo la de la pared movida:
   * - el cuadrado mueve también la contigua, porque ancho y alto crecen juntos;
   * - en la U y la T el entrante está centrado: mover una pared exterior izquierda o derecha lo recentra (se mueven
   *   las dos paredes interiores) y mover una interior mueve su simétrica;
   * - las dos patas de la U (y el pie de la T) comparten alto: es una sola línea.
   */
  function changedLines(base: Room, candidate: Handle): { changed: string[]; moved: string } {
    const out = 40 / candidate.gain;
    const move = moveHandleBy(
      base,
      candidate,
      candidate.direction.x * out,
      candidate.direction.y * out,
    );
    const before = lines(base, move.shift);
    const changed = [...lines(move.room)].filter((line) => !before.has(line));
    const moved =
      candidate.direction.x !== 0
        ? `v:${candidate.x + move.shift.x + out * candidate.direction.x}`
        : `h:${candidate.y + move.shift.y + out * candidate.direction.y}`;
    return { changed, moved };
  }

  it('mover una pared solo mueve esa línea del contorno; las demás se quedan quietas respecto a las mesas', () => {
    for (const base of [RECTANGLE, L]) {
      for (const rotation of ROTATIONS) {
        const turned = { ...base, rotation };
        for (const candidate of handlesFor(turned)) {
          const { changed, moved } = changedLines(turned, candidate);
          const label = `${base.shape} ${rotation} ${candidate.wall}`;
          expect(changed, label).toEqual([moved]);
        }
      }
    }
  });

  it('en el cuadrado, la U y la T mover una pared mueve además lo que el modelo obliga a mover', () => {
    const outerSides = ['left', 'right'];
    const centred = ['innerLeft', 'innerRight', 'stemLeft', 'stemRight'];
    for (const base of [SQUARE, U, T]) {
      for (const rotation of ROTATIONS) {
        const turned = { ...base, rotation };
        for (const candidate of handlesFor(turned)) {
          const { changed, moved } = changedLines(turned, candidate);
          const label = `${base.shape} ${rotation} ${candidate.wall}`;
          expect(changed, label).toContain(moved);
          let expected = 1;
          if (base === SQUARE) {
            expected = 2;
          } else if (outerSides.includes(candidate.wall)) {
            expected = 3;
          } else if (centred.includes(candidate.wall)) {
            expected = 2;
          }
          expect(changed.length, label).toBe(expected);
        }
      }
    }
  });

  it('mover la pared izquierda deja la derecha fija y las mesas en su sitio', () => {
    const left = handle(RECTANGLE, 'left');
    const move = moveHandleBy(RECTANGLE, left, -40, 0);
    expect(move.room.width).toBe(1240);
    // Las mesas se desplazan lo que crece el local por la izquierda: no se mueven respecto a la pared derecha.
    expect(move.shift).toEqual({ x: 40, y: 0 });
    expect(bounds(move.room).width - move.shift.x).toBe(bounds(RECTANGLE).width);
    const top = moveHandleBy(RECTANGLE, handle(RECTANGLE, 'top'), 0, -60);
    expect(top.room.height).toBe(620);
    expect(top.shift).toEqual({ x: 0, y: 60 });
    // Las paredes de la derecha y de abajo no desplazan las mesas.
    expect(moveHandleBy(RECTANGLE, handle(RECTANGLE, 'right'), 40, 0).shift).toEqual({
      x: 0,
      y: 0,
    });
    expect(moveHandleBy(RECTANGLE, handle(RECTANGLE, 'bottom'), 0, 40).shift).toEqual({
      x: 0,
      y: 0,
    });
  });

  it('con el local girado las paredes de la izquierda y de arriba que se ven desplazan las mesas', () => {
    for (const rotation of ROTATIONS) {
      const turned = { ...L, rotation };
      for (const candidate of handlesFor(turned)) {
        if (candidate.wall === 'notchInner' || candidate.wall === 'notchTop') {
          continue;
        }
        const move = moveHandleBy(
          turned,
          candidate,
          candidate.direction.x * 40,
          candidate.direction.y * 40,
        );
        const farSide = bounds(turned);
        const onNearSide = candidate.direction.x < 0 || candidate.direction.y < 0;
        const expected = onNearSide
          ? { x: candidate.direction.x < 0 ? 40 : 0, y: candidate.direction.y < 0 ? 40 : 0 }
          : { x: 0, y: 0 };
        expect(move.shift, `L ${rotation} ${candidate.wall} ${farSide.width}`).toEqual(expected);
      }
    }
  });

  it('moveHandleTo fija el valor con el mismo redondeo y los mismos límites', () => {
    expect(moveHandleTo(RECTANGLE, handle(RECTANGLE, 'right'), 1250).room.width).toBe(1260);
    expect(moveHandleTo(RECTANGLE, handle(RECTANGLE, 'right'), 3000).room.width).toBe(2000);
    expect(moveHandleTo(L, handle(L, 'notchTop'), 100).room.cutDepth).toBe(200);
    // Subir el valor de la pared izquierda mueve las mesas.
    expect(moveHandleTo(RECTANGLE, handle(RECTANGLE, 'left'), 1240).shift).toEqual({ x: 40, y: 0 });
  });
});

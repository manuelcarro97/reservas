import { Room, RoomShape, roomProblems, roomRects } from '../../plano/geometry';
import { Handle, HandleKind, applyHandleDrag, applyHandleValue, handlesFor } from './room-handles';

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

const RECTANGLE = room('RECTANGLE', 1200, 560);
const L = room('L', 1000, 900, 480, 480);
const U = room('U', 1100, 820, 420, 440);
const T = room('T', 1100, 900, 340, 520);

function handle(of: Room, kind: HandleKind): Handle {
  const found = handlesFor(of).find((candidate) => candidate.kind === kind);
  if (!found) {
    throw new Error(`Sin tirador ${kind}`);
  }
  return found;
}

function bounds(of: Room): { width: number; height: number } {
  const rects = roomRects(of);
  return {
    width: Math.max(...rects.map((rect) => rect.x2)),
    height: Math.max(...rects.map((rect) => rect.y2)),
  };
}

describe('room handles', () => {
  it('handleDragSnapsTo20', () => {
    const width = handle(RECTANGLE, 'width');
    expect(applyHandleDrag(RECTANGLE, width, 27, 0).width).toBe(1220);
    expect(applyHandleDrag(RECTANGLE, width, 31, 0).width).toBe(1240);
    expect(applyHandleDrag(RECTANGLE, width, 9, 0).width).toBe(1200);
    expect(applyHandleDrag(RECTANGLE, width, -31, 0).width).toBe(1160);
    const height = handle(RECTANGLE, 'height');
    expect(applyHandleDrag(RECTANGLE, height, 0, 27).height).toBe(580);
  });

  it('handleDragClampsToRange', () => {
    const width = handle(RECTANGLE, 'width');
    expect(applyHandleDrag(RECTANGLE, width, 5000, 0).width).toBe(2000);
    expect(applyHandleDrag(RECTANGLE, width, -5000, 0).width).toBe(400);
    const height = handle(RECTANGLE, 'height');
    expect(applyHandleDrag(RECTANGLE, height, 0, 5000).height).toBe(2000);
    expect(applyHandleDrag(RECTANGLE, height, 0, -5000).height).toBe(400);
    // Los límites de los huecos: al menos 200 y que quede 200 de local a cada lado.
    expect(applyHandleDrag(L, handle(L, 'cutWidth'), 5000, 0).cutWidth).toBe(200);
    expect(applyHandleDrag(L, handle(L, 'cutWidth'), -5000, 0).cutWidth).toBe(800);
    expect(applyHandleDrag(L, handle(L, 'cutDepth'), 0, 5000).cutDepth).toBe(200);
    expect(applyHandleDrag(L, handle(L, 'cutDepth'), 0, -5000).cutDepth).toBe(700);
  });

  it('lShapeHasCutHandles', () => {
    const kinds = (of: Room) =>
      handlesFor(of)
        .map((candidate) => candidate.kind)
        .sort();
    expect(kinds(L)).toEqual(['cutDepth', 'cutWidth', 'height', 'width']);
    expect(kinds(U)).toEqual(['cutDepth', 'cutWidth', 'height', 'width']);
    expect(kinds(T)).toEqual(['cutDepth', 'cutWidth', 'height', 'width']);
    expect(kinds(RECTANGLE)).toEqual(['height', 'width']);
    expect(kinds(room('SQUARE', 800, 800))).toEqual(['height', 'width']);
  });

  it('tiene nombre, valor y rango para el lector de pantalla', () => {
    const width = handle(RECTANGLE, 'width');
    expect(width).toMatchObject({ label: 'Ancho del local', value: 1200, min: 400, max: 2000 });
    expect(handle(RECTANGLE, 'height').label).toBe('Alto del local');
    expect(handle(L, 'cutWidth')).toMatchObject({
      label: 'Ancho del hueco',
      value: 480,
      min: 200,
      max: 800,
    });
    expect(handle(U, 'cutWidth')).toMatchObject({ max: 700 });
    expect(handle(L, 'cutDepth')).toMatchObject({
      label: 'Fondo del hueco',
      value: 480,
      min: 200,
      max: 700,
    });
    expect(handle(T, 'cutWidth').label).toBe('Ancho del pie');
    expect(handle(T, 'cutDepth').label).toBe('Largo del pie');
  });

  it('el ancho mínimo de U y T deja sitio al hueco', () => {
    expect(handle(U, 'width').min).toBe(600);
    expect(handle(T, 'width').min).toBe(600);
    expect(handle(L, 'width').min).toBe(400);
  });

  it('al achicar el local se recortan los huecos para que siga siendo válido', () => {
    const narrower = applyHandleDrag(U, handle(U, 'width'), -5000, 0);
    expect(narrower.width).toBe(600);
    expect(narrower.cutWidth).toBe(200);
    expect(roomProblems(narrower)).toEqual([]);
    const shorter = applyHandleDrag(L, handle(L, 'height'), 0, -5000);
    expect(shorter.height).toBe(400);
    expect(shorter.cutDepth).toBe(200);
    expect(roomProblems(shorter)).toEqual([]);
  });

  it('el local cuadrado conserva el mismo ancho y alto', () => {
    const square = room('SQUARE', 800, 800);
    const wider = applyHandleDrag(square, handle(square, 'width'), 200, 0);
    expect(wider).toMatchObject({ width: 1000, height: 1000 });
    const lower = applyHandleDrag(square, handle(square, 'height'), 0, -200);
    expect(lower).toMatchObject({ width: 600, height: 600 });
    expect(roomProblems(wider)).toEqual([]);
  });

  it('en U y T el hueco está centrado: el tirador del lado mueve el ancho al doble', () => {
    expect(applyHandleDrag(U, handle(U, 'cutWidth'), 20, 0).cutWidth).toBe(460);
    expect(applyHandleDrag(T, handle(T, 'cutWidth'), -20, 0).cutWidth).toBe(300);
    expect(applyHandleDrag(L, handle(L, 'cutWidth'), -20, 0).cutWidth).toBe(500);
    expect(applyHandleDrag(U, handle(U, 'cutDepth'), 0, -20).cutDepth).toBe(460);
  });

  it('los tiradores de tamaño están en el borde derecho e inferior del local girado', () => {
    for (const rotation of [0, 90, 180, 270]) {
      const turned = { ...L, rotation };
      const { width, height } = bounds(turned);
      const sizeKinds = rotation % 180 === 0 ? ['width', 'height'] : ['height', 'width'];
      const horizontal = handle(turned, sizeKinds[0] as HandleKind);
      const vertical = handle(turned, sizeKinds[1] as HandleKind);
      expect(horizontal.x).toBe(width);
      expect(vertical.y).toBe(height);
      // Arrastrar hacia fuera agranda, también girado.
      expect(applyHandleDrag(turned, horizontal, 40, 0)[sizeKinds[0] as 'width' | 'height']).toBe(
        turned[sizeKinds[0] as 'width' | 'height'] + 40,
      );
      expect(applyHandleDrag(turned, vertical, 0, 40)[sizeKinds[1] as 'width' | 'height']).toBe(
        turned[sizeKinds[1] as 'width' | 'height'] + 40,
      );
    }
  });

  it('el tirador del hueco sigue al puntero con el local girado', () => {
    // Con giro de 90 el fondo del hueco crece hacia la derecha en pantalla (en 0, hacia arriba).
    const turned = { ...L, rotation: 90 };
    const depth = handle(turned, 'cutDepth');
    expect(applyHandleDrag(turned, depth, 40, 0).cutDepth).toBe(520);
    expect(applyHandleDrag(turned, depth, 0, 40).cutDepth).toBe(480);
    const half = { ...U, rotation: 180 };
    expect(applyHandleDrag(half, handle(half, 'cutDepth'), 0, 40).cutDepth).toBe(480);
  });

  it('los tiradores están sobre el contorno del local', () => {
    for (const base of [RECTANGLE, L, U, T]) {
      for (const rotation of [0, 90, 180, 270]) {
        const turned = { ...base, rotation };
        const rects = roomRects(turned);
        for (const candidate of handlesFor(turned)) {
          const touches = rects.some(
            (rect) =>
              candidate.x >= rect.x1 &&
              candidate.x <= rect.x2 &&
              candidate.y >= rect.y1 &&
              candidate.y <= rect.y2,
          );
          expect(touches, `${base.shape} ${rotation} ${candidate.kind}`).toBe(true);
        }
      }
    }
  });

  it('applyHandleValue fija el valor con el mismo redondeo y los mismos límites', () => {
    expect(applyHandleValue(RECTANGLE, handle(RECTANGLE, 'width'), 1250).width).toBe(1260);
    expect(applyHandleValue(RECTANGLE, handle(RECTANGLE, 'width'), 3000).width).toBe(2000);
    expect(applyHandleValue(L, handle(L, 'cutDepth'), 100).cutDepth).toBe(200);
  });
});

import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { PlanResponse } from '../../core/api/models/plan-response';
import { MAX_TABLES, Rect, Room, roomRects, validateLayout } from '../../plano/geometry';
import { EditorStore, SHAPE_DEFAULTS, nextLabel } from './editor.store';
import { Handle, handlesFor } from './room-handles';

const L_ROOM: Room = {
  shape: 'L',
  width: 1000,
  height: 900,
  cutWidth: 480,
  cutDepth: 480,
  rotation: 0,
};

const PLAN: PlanResponse = {
  slug: 'kafe',
  name: 'Kafé',
  status: 'DRAFT',
  theme: 'BOSQUE',
  room: L_ROOM,
  tables: [
    { id: 7, label: '1', shape: 'SQUARE', seats: 4, rotation: 0, x: 130, y: 200 },
    { id: 9, label: '2', shape: 'ROUND', seats: 4, rotation: 0, x: 725, y: 300 },
    { id: 11, label: '3', shape: 'SQUARE', seats: 4, rotation: 90, x: 620 + 10, y: 130 },
  ],
};

function corners(rects: Rect[]): string[] {
  return rects
    .flatMap((rect) => [
      [rect.x1, rect.y1],
      [rect.x2, rect.y1],
      [rect.x1, rect.y2],
      [rect.x2, rect.y2],
    ])
    .map(([x, y]) => `${x},${y}`)
    .sort();
}

describe('EditorStore', () => {
  let store: EditorStore;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), EditorStore],
    });
    store = TestBed.inject(EditorStore);
    store.load(PLAN);
  });

  it('carga el plano del servidor con los ids de las mesas', () => {
    expect(store.room()).toEqual(L_ROOM);
    expect(store.theme()).toBe('BOSQUE');
    expect(store.tables().map((table) => table.id)).toEqual([7, 9, 11]);
    expect(store.dirty()).toBe(false);
    expect(store.problems()).toEqual(validateLayout(L_ROOM, store.tables()));
  });

  it('shapeChangeMarksDirty', () => {
    expect(store.dirty()).toBe(false);
    store.setShape('U');
    expect(store.dirty()).toBe(true);
    expect(store.room().shape).toBe('U');
  });

  it('setShape usa los valores de la referencia visual y mantiene el giro', () => {
    expect(SHAPE_DEFAULTS.SQUARE).toEqual({ width: 800, height: 800, cutWidth: 0, cutDepth: 0 });
    store.rotateRoom();
    for (const shape of ['SQUARE', 'RECTANGLE', 'L', 'U', 'T'] as const) {
      store.setShape(shape);
      expect(store.room()).toEqual({ shape, ...SHAPE_DEFAULTS[shape], rotation: 90 });
    }
    expect(SHAPE_DEFAULTS.RECTANGLE).toEqual({
      width: 1200,
      height: 560,
      cutWidth: 0,
      cutDepth: 0,
    });
    expect(SHAPE_DEFAULTS.L).toEqual({ width: 1000, height: 900, cutWidth: 480, cutDepth: 480 });
    expect(SHAPE_DEFAULTS.U).toEqual({ width: 1100, height: 820, cutWidth: 420, cutDepth: 440 });
    expect(SHAPE_DEFAULTS.T).toEqual({ width: 1100, height: 900, cutWidth: 340, cutDepth: 520 });
  });

  it('elegir la forma que ya está activa no hace nada', () => {
    const depth = handlesFor(store.room()).find((handle) => handle.kind === 'cutDepth') as Handle;
    store.setHandleValue(depth, 520);
    const adjusted = store.room();
    store.setShape('L');
    expect(store.room()).toBe(adjusted);
    store.load(PLAN);
    store.setShape('L');
    expect(store.dirty()).toBe(false);
  });

  it('cada forma por defecto es un local válido', () => {
    for (const shape of ['SQUARE', 'RECTANGLE', 'L', 'U', 'T'] as const) {
      store.setShape(shape);
      expect(store.problems().filter((problem) => problem.tableIndex === null)).toEqual([]);
    }
  });

  it('rotateCyclesBy90', () => {
    const seen: number[] = [];
    for (let step = 0; step < 4; step++) {
      store.rotateRoom();
      seen.push(store.room().rotation);
    }
    expect(seen).toEqual([90, 180, 270, 0]);
    expect(store.room()).toEqual(L_ROOM);
  });

  it('rotateRoomRotatesTables', () => {
    // Una mesa en el hueco de la L: la paridad de problemas no puede ser `[]` contra `[]`.
    store.placeTable({ label: '9', shape: 'SQUARE', seats: 4, rotation: 0, x: 800, y: 700 });
    expect(store.problems().map((problem) => problem.code)).toContain('OUT_OF_ROOM');
    for (let step = 0; step < 4; step++) {
      const before = store.room();
      const tablesBefore = store.tables();
      const shownHeight = Math.max(...roomRects(before).map((rect) => rect.y2));
      store.rotateRoom();

      // Mismo giro que las paredes: cada esquina del local pasa de (x, y) a (alto - y, x).
      const mapped = roomRects(before)
        .flatMap((rect) => [
          [rect.x1, rect.y1],
          [rect.x2, rect.y1],
          [rect.x1, rect.y2],
          [rect.x2, rect.y2],
        ])
        .map(([x, y]) => `${shownHeight - y},${x}`)
        .sort();
      expect(Array.from(new Set(mapped))).toEqual(
        Array.from(new Set(corners(roomRects(store.room())))),
      );

      store.tables().forEach((table, index) => {
        const old = tablesBefore[index];
        expect({ x: table.x, y: table.y }).toEqual({ x: shownHeight - old.y, y: old.x });
        expect(table.rotation).toBe(old.rotation === 0 ? 90 : 0);
        expect(table.id).toBe(old.id);
      });
      // Las mesas siguen donde estaban respecto a las paredes.
      const problemsBefore = validateLayout(before, tablesBefore);
      expect(problemsBefore.length).toBeGreaterThan(0);
      expect(validateLayout(store.room(), store.tables())).toEqual(problemsBefore);
    }
  });

  it('rotar cuatro veces deja las mesas como estaban y sin cambios que guardar', () => {
    const tables = store.tables();
    for (let step = 0; step < 4; step++) {
      store.rotateRoom();
    }
    expect(store.tables()).toEqual(tables);
    expect(store.dirty()).toBe(false);
  });

  it('dragHandle mueve la medida y marca cambios', () => {
    const width = handlesFor(store.room()).find((handle) => handle.wall === 'right') as Handle;
    store.dragHandle(width, 41, 0);
    expect(store.room().width).toBe(1040);
    expect(store.dirty()).toBe(true);
  });

  it('mover la pared izquierda o la de arriba desplaza las mesas; la derecha y la de abajo no', () => {
    const wall = (name: string) =>
      handlesFor(store.room()).find((handle) => handle.wall === name) as Handle;
    const start = store.tables();
    store.beginDrag();
    store.dragHandle(wall('left'), -40, 0);
    expect(store.room().width).toBe(1040);
    store.tables().forEach((table, index) => {
      expect({ x: table.x, y: table.y }).toEqual({ x: start[index].x + 40, y: start[index].y });
    });
    // Se calcula desde el principio del arrastre: volver deja las mesas como estaban.
    store.dragHandle(wall('left'), 0, 0);
    expect(store.tables()).toEqual(start);
    store.dragHandle(wall('top'), 0, -20);
    store.tables().forEach((table, index) => {
      expect({ x: table.x, y: table.y }).toEqual({ x: start[index].x, y: start[index].y + 20 });
    });
    store.endDrag();
    store.load(PLAN);
    store.dragHandle(wall('bottom'), 0, 40);
    store.dragHandle(wall('right'), 40, 0);
    expect(store.tables()).toEqual(start);
    // Las mesas no cambian de sitio respecto a las paredes que no se mueven.
    store.load(PLAN);
    store.dragHandle(wall('left'), -40, 0);
    expect(validateLayout(store.room(), store.tables())).toEqual(validateLayout(L_ROOM, start));
  });

  it('un arrastre se calcula desde donde empezó, no desde el último movimiento', () => {
    const width = handlesFor(store.room()).find((handle) => handle.wall === 'right') as Handle;
    store.beginDrag();
    for (const total of [4, 8, 12, 16, 24]) {
      store.dragHandle(width, total, 0);
    }
    expect(store.room().width).toBe(1020);
    store.endDrag();
    // Fuera de un arrastre (teclado) el desplazamiento se suma al local actual.
    store.dragHandle(width, 20, 0);
    expect(store.room().width).toBe(1040);
  });

  it('setHandleValue fija el valor de un tirador', () => {
    const depth = handlesFor(store.room()).find((handle) => handle.kind === 'cutDepth') as Handle;
    store.setHandleValue(depth, 520);
    expect(store.room().cutDepth).toBe(520);
  });

  it('las mesas nuevas llevan un id temporal negativo y único', () => {
    const table = { label: '9', shape: 'SQUARE', seats: 2, rotation: 0, x: 380, y: 180 } as const;
    const first = store.placeTable(table);
    const second = store.placeTable({ ...table, label: '10', x: 480 });
    expect(first).toBeLessThan(0);
    expect(second).toBeLessThan(first);
    expect(store.tables().map((candidate) => candidate.id)).toEqual([7, 9, 11, first, second]);
    // Cargar otro plano no reutiliza ids que aún puedan estar en pantalla.
    store.load(PLAN);
    expect(store.placeTable(table)).toBeLessThan(second);
  });

  it('toLayoutRequest envía el id de las mesas del servidor y omite el de las nuevas', () => {
    store.placeTable({ label: '9', shape: 'SQUARE', seats: 2, rotation: 0, x: 380, y: 180 });
    const request = store.toLayoutRequest();
    expect(request.room).toEqual(L_ROOM);
    expect(request.tables.map((table) => table.id)).toEqual([7, 9, 11, undefined]);
    expect(request.tables[3]).toEqual({
      label: '9',
      shape: 'SQUARE',
      seats: 2,
      rotation: 0,
      x: 380,
      y: 180,
    });
    expect('id' in request.tables[3]).toBe(false);
  });

  it('roomChanged compara solo la forma con la cargada', () => {
    expect(store.roomChanged()).toBe(false);
    store.rotateRoom();
    expect(store.roomChanged()).toBe(true);
    store.rotateRoom();
    store.rotateRoom();
    store.rotateRoom();
    expect(store.roomChanged()).toBe(false);
  });

  describe('mesas', () => {
    // La mesa 2 del plano de arriba está fuera de la cuadrícula (725): aquí se parte de un plano sin problemas.
    const ON_GRID: PlanResponse = {
      ...PLAN,
      tables: PLAN.tables?.map((table) => (table.id === 9 ? { ...table, x: 720 } : table)),
    };

    beforeEach(() => {
      store.load(ON_GRID);
    });

    function labels(): string[] {
      return store.tables().map((table) => table.label);
    }

    it('nextLabel es el mayor número entero entre los nombres más uno', () => {
      expect(nextLabel([])).toBe('1');
      expect(nextLabel([{ label: '1' }, { label: '2' }, { label: 'Barra' }])).toBe('3');
      expect(nextLabel([{ label: '3' }, { label: '10' }, { label: '2' }])).toBe('11');
      expect(nextLabel([{ label: ' 7 ' }, { label: 'Mesa 9' }, { label: '' }])).toBe('8');
      expect(nextLabel([{ label: 'Barra' }, { label: 'Terraza 2' }])).toBe('1');
    });

    it('nextLabelAfterRename', () => {
      expect(labels()).toEqual(['1', '2', '3']);
      store.renameTable(2, 'Barra');
      expect(labels()).toEqual(['1', '2', 'Barra']);
      store.addTable('SQUARE', 2);
      expect(labels().at(-1)).toBe('3');
      // Renombrar la mayor a otro número mueve el siguiente.
      store.renameTable(1, '12');
      store.addTable('SQUARE', 2);
      expect(labels().at(-1)).toBe('13');
    });

    it('addPlacesTableWithoutOverlap', () => {
      expect(store.problems()).toEqual([]);
      const id = store.addTable('SQUARE', 4);
      expect(id).toBeLessThan(0);
      expect(store.tables().at(-1)).toMatchObject({
        id,
        label: '4',
        shape: 'SQUARE',
        seats: 4,
        rotation: 0,
      });
      expect(store.problems()).toEqual([]);
      // Hasta que no quepa ninguna más, cada mesa nueva se coloca sin solaparse ni salirse del local.
      let added = 1;
      while (store.addTable(added % 2 === 0 ? 'ROUND' : 'SQUARE', 8) !== null) {
        expect(store.problems()).toEqual([]);
        added++;
        expect(added).toBeLessThan(MAX_TABLES);
      }
      expect(added).toBeGreaterThan(2);
      expect(store.tables().length).toBe(3 + added);
      expect(store.dirty()).toBe(true);
    });

    it('addTable pone la mesa en el primer hueco libre, de arriba abajo y de izquierda a derecha', () => {
      store.load({
        ...PLAN,
        room: { ...SHAPE_DEFAULTS.RECTANGLE, shape: 'RECTANGLE', rotation: 0 },
        tables: [],
      });
      store.addTable('SQUARE', 2);
      store.addTable('SQUARE', 2);
      // Huella de 138 x 70 con sillas: a 16 de la pared, el centro mínimo es (90, 60); la siguiente cabe a 230.
      expect(store.tables().map(({ x, y }) => ({ x, y }))).toEqual([
        { x: 90, y: 60 },
        { x: 230, y: 60 },
      ]);
    });

    it('addTable devuelve null con el máximo de mesas', () => {
      for (let i = store.tables().length; i < MAX_TABLES; i++) {
        store.placeTable({ label: `m${i}`, shape: 'SQUARE', seats: 2, rotation: 0, x: 10, y: 10 });
      }
      expect(store.tables().length).toBe(MAX_TABLES);
      expect(store.addTable('SQUARE', 2)).toBeNull();
      expect(store.tables().length).toBe(MAX_TABLES);
    });

    it('addTable devuelve null si el local no es válido', () => {
      store.load({ ...PLAN, room: { ...L_ROOM, width: 30 }, tables: [] });
      expect(store.addTable('SQUARE', 2)).toBeNull();
    });

    it('moveSnapsToGrid', () => {
      store.moveTable(0, 133, 207);
      expect(store.tables()[0]).toMatchObject({ id: 7, x: 130, y: 210 });
      store.moveTable(0, 135, 205);
      expect(store.tables()[0]).toMatchObject({ x: 140, y: 210 });
      expect(store.dirty()).toBe(true);
    });

    it('moveTable no saca la mesa de la caja del local ni la deja en coordenadas negativas', () => {
      store.moveTable(0, -500, 99999);
      expect(store.tables()[0]).toMatchObject({ x: 0, y: 900 });
      store.moveTable(0, 99999, -500);
      expect(store.tables()[0]).toMatchObject({ x: 1000, y: 0 });
    });

    it('moveTable con un índice que no existe no hace nada', () => {
      const before = store.tables();
      store.moveTable(9, 100, 100);
      store.moveTable(-1, 100, 100);
      expect(store.tables()).toBe(before);
    });

    it('rotateTable alterna 0 y 90', () => {
      store.rotateTable(0);
      expect(store.tables()[0].rotation).toBe(90);
      store.rotateTable(0);
      expect(store.tables()[0].rotation).toBe(0);
      expect(store.dirty()).toBe(false);
    });

    it('renameTable cambia el nombre y lo limita a 40 caracteres', () => {
      store.renameTable(0, 'Barra');
      expect(store.tables()[0].label).toBe('Barra');
      store.renameTable(0, 'x'.repeat(60));
      expect(store.tables()[0].label.length).toBe(40);
    });

    it('un nombre repetido es un problema de esa mesa', () => {
      store.renameTable(1, '1');
      expect(store.problems().map((problem) => `${problem.tableIndex}:${problem.code}`)).toEqual([
        '0:DUPLICATE_LABEL',
        '1:DUPLICATE_LABEL',
      ]);
    });

    it('setTableSeats y setTableShape cambian la mesa', () => {
      store.setTableSeats(0, 6);
      store.setTableShape(0, 'ROUND');
      expect(store.tables()[0]).toMatchObject({ id: 7, seats: 6, shape: 'ROUND' });
    });

    it('removeTable quita la mesa y quitar una nueva no deja cambios', () => {
      store.removeTable(1);
      expect(store.tables().map((table) => table.id)).toEqual([7, 11]);
      expect(store.dirty()).toBe(true);
      store.load(ON_GRID);
      store.addTable('ROUND', 2);
      expect(store.dirty()).toBe(true);
      store.removeTable(3);
      expect(store.dirty()).toBe(false);
    });

    it('dirty compara la estructura: volver a lo guardado lo apaga', () => {
      store.moveTable(0, 140, 200);
      expect(store.dirty()).toBe(true);
      store.moveTable(0, 130, 200);
      expect(store.dirty()).toBe(false);
      store.setTheme('NOCHE');
      expect(store.dirty()).toBe(true);
      store.setTheme('BOSQUE');
      expect(store.dirty()).toBe(false);
    });

    it('dirty no depende del orden de las claves de lo cargado', () => {
      const reordered = {
        tables: PLAN.tables?.map((table) => ({
          y: table.y,
          x: table.x,
          rotation: table.rotation,
          seats: table.seats,
          shape: table.shape,
          label: table.label,
          id: table.id,
        })),
        theme: PLAN.theme,
        room: { rotation: 0, cutDepth: 480, cutWidth: 480, height: 900, width: 1000, shape: 'L' },
        slug: 'kafe',
      } as PlanResponse;
      store.load(reordered);
      store.rotateTable(0);
      store.rotateTable(0);
      expect(store.dirty()).toBe(false);
    });

    it('roomChanged usa la misma comparación de la forma', () => {
      store.load({
        ...PLAN,
        room: { rotation: 0, cutDepth: 480, cutWidth: 480, height: 900, width: 1000, shape: 'L' },
      });
      expect(store.roomChanged()).toBe(false);
    });

    it('cambiar el tema marca cambios y lo deja en la pantalla', () => {
      store.setTheme('NOCHE');
      expect(store.theme()).toBe('NOCHE');
      expect(store.dirty()).toBe(true);
    });
  });
});

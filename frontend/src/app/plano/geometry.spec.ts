import cases from '../../../../contracts/geometry-cases.json';
import {
  GRID,
  LayoutProblem,
  Point,
  Rect,
  Room,
  TableLike,
  WALL_INSET,
  footprint,
  roomPolygon,
  roomProblems,
  roomRects,
  validateLayout,
} from './geometry';

// Mismo fichero que lee GeometryContractTest en el backend: si la geometría de uno cambia, falla el otro.

type RectCase = [number, number, number, number];
type PointCase = [number, number];

function toRect([x1, y1, x2, y2]: RectCase): Rect {
  return { x1, y1, x2, y2 };
}

function toPoint([x, y]: PointCase): Point {
  return { x, y };
}

function problemKey(problem: Pick<LayoutProblem, 'tableIndex' | 'code'>): string {
  return `${problem.tableIndex ?? '-'}:${problem.code}`;
}

describe('geometry (contrato con el backend)', () => {
  it('casesFileHasTheExpectedSections', () => {
    expect(cases.rooms.length).toBeGreaterThanOrEqual(5 + 6);
    expect(cases.footprints.length).toBeGreaterThanOrEqual(8);
    expect(cases.layouts.length).toBeGreaterThanOrEqual(4);
  });

  it('exposesTheSharedConstants', () => {
    expect(GRID).toBe(10);
    expect(WALL_INSET).toBe(16);
  });

  for (const testCase of cases.rooms) {
    it(`roomsMatch: ${testCase.name}`, () => {
      const room = testCase.room as Room;

      expect(roomProblems(room)).toEqual([]);
      expect(roomRects(room)).toEqual((testCase.rects as RectCase[]).map(toRect));
      expect(roomPolygon(room)).toEqual((testCase.polygon as PointCase[]).map(toPoint));
    });
  }

  for (const testCase of cases.footprints) {
    it(`footprintsMatch: ${testCase.shape} ${testCase.seats} rot${testCase.rotation}`, () => {
      const table = testCase as unknown as TableLike;

      expect(footprint(table)).toEqual(toRect(testCase.rect as RectCase));
    });
  }

  for (const testCase of cases.layouts) {
    it(`layoutsMatch: ${testCase.name}`, () => {
      const actual = validateLayout(testCase.room as Room, testCase.tables as TableLike[]);

      expect(new Set(actual.map(problemKey))).toEqual(new Set(testCase.problems.map(problemKey)));
    });
  }
});

describe('geometry (casos propios)', () => {
  const room: Room = {
    shape: 'RECTANGLE',
    width: 1200,
    height: 800,
    cutWidth: 0,
    cutDepth: 0,
    rotation: 0,
  };

  it('layoutProblemsCarryTheTableLabel', () => {
    const table: TableLike = {
      label: 'Mesa 1',
      shape: 'SQUARE',
      seats: 4,
      rotation: 0,
      x: 205,
      y: 200,
    };

    expect(validateLayout(room, [table])).toEqual([
      { tableIndex: 0, label: 'Mesa 1', code: 'OFF_GRID' },
    ]);
  });

  it('tooManyTablesStopsTheValidation', () => {
    const tables: TableLike[] = Array.from({ length: 61 }, (_, i) => ({
      label: `M${i}`,
      shape: 'SQUARE',
      seats: 2,
      rotation: 0,
      x: 100,
      y: 100,
    }));

    expect(validateLayout(room, tables)).toEqual([
      { tableIndex: null, label: null, code: 'TOO_MANY_TABLES' },
    ]);
  });

  it('footprintRejectsUnsupportedSeats', () => {
    expect(() =>
      footprint({ label: 'x', shape: 'SQUARE', seats: 3, rotation: 0, x: 0, y: 0 }),
    ).toThrow();
  });
});

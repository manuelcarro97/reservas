import { Room } from '../../plano/geometry';
import { EditorTable } from './editor.store';
import { sameRoom, sameTables } from './layout-compare';

const ROOM: Room = {
  shape: 'L',
  width: 1000,
  height: 900,
  cutWidth: 480,
  cutDepth: 480,
  rotation: 0,
};

const TABLES: EditorTable[] = [
  { id: 7, label: '1', shape: 'SQUARE', seats: 4, rotation: 0, x: 130, y: 200 },
  { id: 9, label: '2', shape: 'ROUND', seats: 4, rotation: 90, x: 725, y: 300 },
];

describe('layout-compare', () => {
  it('sameRoom no depende del orden de las claves', () => {
    const reordered = {
      rotation: 0,
      cutDepth: 480,
      cutWidth: 480,
      height: 900,
      width: 1000,
      shape: 'L',
    } as Room;
    expect(sameRoom(ROOM, reordered)).toBe(true);
  });

  it('sameRoom distingue cada campo', () => {
    for (const change of [
      { shape: 'U' },
      { width: 1020 },
      { height: 920 },
      { cutWidth: 500 },
      { cutDepth: 500 },
      { rotation: 90 },
    ]) {
      expect(sameRoom(ROOM, { ...ROOM, ...change } as Room)).toBe(false);
    }
  });

  it('sameTables no depende del orden de las claves ni del de las mesas', () => {
    const reordered: EditorTable[] = [
      { y: 300, x: 725, rotation: 90, seats: 4, shape: 'ROUND', label: '2', id: 9 },
      { y: 200, x: 130, rotation: 0, seats: 4, shape: 'SQUARE', label: '1', id: 7 },
    ];
    expect(sameTables(TABLES, reordered)).toBe(true);
  });

  it('sameTables distingue cada campo relevante', () => {
    for (const change of [
      { label: 'Barra' },
      { shape: 'ROUND' },
      { seats: 6 },
      { rotation: 90 },
      { x: 140 },
      { y: 210 },
    ]) {
      const changed = [{ ...TABLES[0], ...change } as EditorTable, TABLES[1]];
      expect(sameTables(TABLES, changed)).toBe(false);
    }
  });

  it('sameTables distingue mesas de más, de menos o con otro id', () => {
    expect(sameTables(TABLES, [TABLES[0]])).toBe(false);
    expect(sameTables(TABLES, [...TABLES, { ...TABLES[0], id: -1 }])).toBe(false);
    expect(sameTables(TABLES, [TABLES[0], { ...TABLES[1], id: 10 }])).toBe(false);
  });
});

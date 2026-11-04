import { Room } from '../../plano/geometry';
import { EditorTable } from './editor.store';

// Comparaciones por campos, no por texto: el resultado no depende del orden de las claves de los objetos ni, en las
// mesas, del orden de la lista.

export function sameRoom(a: Room, b: Room): boolean {
  return (
    a.shape === b.shape &&
    a.width === b.width &&
    a.height === b.height &&
    a.cutWidth === b.cutWidth &&
    a.cutDepth === b.cutDepth &&
    a.rotation === b.rotation
  );
}

/** Mismas mesas: el mismo conjunto de ids y, para cada id, el mismo nombre, forma, plazas, giro y posición. */
export function sameTables(a: EditorTable[], b: EditorTable[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  const byId = new Map(b.map((table) => [table.id, table]));
  return a.every((table) => {
    const other = byId.get(table.id);
    return (
      other !== undefined &&
      table.label === other.label &&
      table.shape === other.shape &&
      table.seats === other.seats &&
      table.rotation === other.rotation &&
      table.x === other.x &&
      table.y === other.y
    );
  });
}

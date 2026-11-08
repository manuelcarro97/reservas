import { RoomDto } from '../core/api/models/room-dto';
import { TableDto } from '../core/api/models/table-dto';
import { Room } from './geometry';
import { PlanoTable } from './plano.component';

/** Forma del local de la API como `Room` del plano; lo que falta toma un valor neutro. */
export function toRoom(dto: RoomDto | undefined): Room {
  return {
    shape: dto?.shape ?? 'RECTANGLE',
    width: dto?.width ?? 0,
    height: dto?.height ?? 0,
    cutWidth: dto?.cutWidth ?? 0,
    cutDepth: dto?.cutDepth ?? 0,
    rotation: dto?.rotation ?? 0,
  };
}

/** Mesa de la API como `PlanoTable`; lo que falta toma un valor neutro. */
export function toTable(dto: TableDto): PlanoTable {
  return {
    id: dto.id ?? 0,
    label: dto.label ?? '',
    shape: dto.shape ?? 'SQUARE',
    seats: dto.seats ?? 0,
    rotation: dto.rotation ?? 0,
    x: dto.x ?? 0,
    y: dto.y ?? 0,
  };
}

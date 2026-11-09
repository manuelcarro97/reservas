import { TableLike } from './geometry';

// Medidas y sillas de las mesas, como rectChairs/roundChairs de la referencia visual aprobada.
// Todo en coordenadas locales de la mesa (centro en 0,0, sin girar); el giro lo aplica quien dibuja.

/** Largo de la mesa cuadrada según las plazas. */
export const RECT_LEN: Record<number, number> = { 2: 70, 4: 120, 6: 170, 8: 220 };

/** Radio de la mesa redonda según las plazas. */
export const ROUND_R: Record<number, number> = { 2: 38, 4: 52, 6: 66, 8: 80 };

/** Medio lado de una silla: la silla mide 34 y se apoya en el borde de la mesa. */
const CHAIR_HALF = 17;

export interface Chair {
  x: number;
  y: number;
  /** Giro en grados para que el respaldo quede hacia fuera de la mesa. */
  deg: number;
}

export interface RectSize {
  width: number;
  height: number;
}

/** Ancho (70 con 2 plazas, 80 con las demás) y largo de la mesa cuadrada. */
export function rectSize(seats: number): RectSize {
  return { width: seats === 2 ? 70 : 80, height: RECT_LEN[seats] };
}

function rectChairs(seats: number): Chair[] {
  const { width, height } = rectSize(seats);
  const across = width / 2 + CHAIR_HALF;
  const each = seats / 2;
  const chairs: Chair[] = [];
  for (const sign of [-1, 1]) {
    for (let i = 0; i < each; i++) {
      const along = height * ((i + 0.5) / each - 0.5);
      chairs.push({ x: sign * across, y: along, deg: -sign * 90 });
    }
  }
  return chairs;
}

function roundChairs(seats: number): Chair[] {
  const r = ROUND_R[seats];
  const start = seats === 2 ? 0 : -90;
  const chairs: Chair[] = [];
  for (let i = 0; i < seats; i++) {
    const deg = start + (i * 360) / seats;
    const rad = (deg * Math.PI) / 180;
    chairs.push({
      x: Math.cos(rad) * (r + CHAIR_HALF),
      y: Math.sin(rad) * (r + CHAIR_HALF),
      deg: deg - 90,
    });
  }
  return chairs;
}

/** Posición y giro de cada silla de la mesa. */
export function chairPositions(table: Pick<TableLike, 'shape' | 'seats'>): Chair[] {
  return table.shape === 'ROUND' ? roundChairs(table.seats) : rectChairs(table.seats);
}

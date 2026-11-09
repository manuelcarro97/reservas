import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TableShape } from '../../plano/geometry';

/** Mesa que se puede añadir desde la paleta. */
export interface NewTable {
  shape: TableShape;
  seats: number;
}

const SHAPES: readonly { shape: TableShape; name: string }[] = [
  { shape: 'SQUARE', name: 'cuadrada' },
  { shape: 'ROUND', name: 'redonda' },
];

const SEATS: readonly number[] = [2, 4, 6, 8];

/** Tamaño del dibujo de cada mesa en la paleta (px): crece con las plazas. */
const GLYPH_SIZES: Record<TableShape, readonly (readonly [number, number])[]> = {
  SQUARE: [
    [14, 14],
    [22, 16],
    [30, 16],
    [36, 16],
  ],
  ROUND: [
    [14, 14],
    [18, 18],
    [22, 22],
    [26, 26],
  ],
};

/** Paleta de mesas: un botón por forma (cuadrada, redonda) y plazas (2, 4, 6, 8). */
@Component({
  selector: 'app-table-palette',
  templateUrl: './table-palette.component.html',
  styleUrl: './table-palette.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TablePaletteComponent {
  /** Con `true` no se puede añadir ninguna mesa (por ejemplo, con el máximo de mesas o mientras se guarda). */
  readonly disabled = input(false);
  readonly add = output<NewTable>();

  protected readonly options = SHAPES.flatMap(({ shape, name }) =>
    SEATS.map((seats, index) => ({
      shape,
      seats,
      round: shape === 'ROUND',
      width: GLYPH_SIZES[shape][index][0],
      height: GLYPH_SIZES[shape][index][1],
      label: `Añadir mesa ${name} de ${seats} plazas`,
    })),
  );
}

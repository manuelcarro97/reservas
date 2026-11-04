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
    SEATS.map((seats) => ({
      shape,
      seats,
      round: shape === 'ROUND',
      label: `Añadir mesa ${name} de ${seats} plazas`,
    })),
  );
}

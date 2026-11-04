import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { Point, Room, TableLike, isSupportedSeats, roomPolygon } from './geometry';
import { Chair, ROUND_R, chairPositions, rectSize } from './table-drawing';
import { STATE_COLORS, THEMES, ThemeKey } from './themes';

export type TableState = 'free' | 'selected' | 'pending' | 'taken' | 'blocked';

/** Mesa del plano; `id` es el que se emite en `tableSelected` y la clave de `states`. */
export type PlanoTable = TableLike & { id: number };

interface PlankLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

interface FloorTile {
  x: number;
  y: number;
  vertical: boolean;
  lines: PlankLine[];
}

interface DrawnTable {
  table: PlanoTable;
  chairs: Chair[];
  rect: { x: number; y: number; width: number; height: number } | null;
  radius: number | null;
  transform: string;
  badgeWidth: number;
  badgeFont: number;
}

const PAD = 40;
const BADGE_HEIGHT = 40;

const STATE_TEXT: Record<TableState, string> = {
  free: 'libre',
  selected: 'seleccionada',
  pending: 'pendiente',
  taken: 'reservada',
  blocked: 'bloqueada',
};

/** Baldosa de 100 de lado del suelo: tablas horizontales o verticales cada 20. */
function floorTile(x: number, y: number, vertical: boolean): FloorTile {
  const lines: PlankLine[] = [];
  for (let i = 20; i < 100; i += 20) {
    lines.push(
      vertical
        ? { x1: x + i, y1: y, x2: x + i, y2: y + 100 }
        : { x1: x, y1: y + i, x2: x + 100, y2: y + i },
    );
  }
  return { x, y, vertical, lines };
}

const FLOOR_TILES: FloorTile[] = [
  floorTile(0, 0, false),
  floorTile(100, 0, true),
  floorTile(0, 100, true),
  floorTile(100, 100, false),
];

let nextInstance = 0;

@Component({
  selector: 'app-plano',
  templateUrl: './plano.component.html',
  styleUrl: './plano.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlanoComponent {
  readonly room = input.required<Room>();
  readonly tables = input<PlanoTable[]>([]);
  readonly theme = input<ThemeKey>('AZUL');
  /** Estado por id de mesa; las que no aparecen están libres. */
  readonly states = input<Record<number, TableState>>({});
  /** Con `true` las mesas se pueden enfocar y activar con clic, Enter o Espacio. */
  readonly interactive = input(false);

  /** Id de la mesa activada. Se emite en cualquier estado: decide quien escucha si le sirve. */
  readonly tableSelected = output<number>();

  protected readonly floorTiles = FLOOR_TILES;
  protected readonly stateColors = STATE_COLORS;

  /** Los `id` de `<defs>` llevan este prefijo: dos planos en la misma página no se pisan. */
  private readonly prefix = `plano-${nextInstance++}`;
  protected readonly ids = {
    floor: `${this.prefix}-floor`,
    room: `${this.prefix}-room`,
    tabletop: `${this.prefix}-tabletop`,
    cushion: `${this.prefix}-cushion`,
    wood: `${this.prefix}-wood`,
  };

  protected readonly colors = computed(() => THEMES[this.theme()]);

  /** Matriz del filtro de veta: pinta el color de la madera donde el ruido es opaco. */
  protected readonly grainMatrix = computed(() => {
    const [r, g, b] = this.colors().grain;
    return `0 0 0 0 ${r} 0 0 0 0 ${g} 0 0 0 0 ${b} 0 0 0 0.5 -0.15`;
  });

  private readonly polygon = computed<Point[]>(() => roomPolygon(this.room()));

  protected readonly polygonPoints = computed(() =>
    this.polygon()
      .map((point) => `${point.x},${point.y}`)
      .join(' '),
  );

  protected readonly viewBox = computed(() => {
    const xs = this.polygon().map((point) => point.x);
    const ys = this.polygon().map((point) => point.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const width = Math.max(...xs) - minX;
    const height = Math.max(...ys) - minY;
    return `${minX - PAD} ${minY - PAD} ${width + PAD * 2} ${height + PAD * 2}`;
  });

  protected readonly drawnTables = computed<DrawnTable[]>(() =>
    this.tables()
      .filter((table) => isSupportedSeats(table.seats))
      .map((table) => {
        const round = table.shape === 'ROUND';
        const size = rectSize(table.seats);
        const label = String(table.label ?? '');
        // Círculo de 40 para etiquetas cortas; las largas lo ensanchan y bajan la letra.
        const badgeFont = label.length > 3 ? 16 : 22;
        const badgeWidth = Math.max(BADGE_HEIGHT, label.length * badgeFont * 0.62 + 16);
        return {
          table,
          chairs: chairPositions(table),
          rect: round
            ? null
            : { x: -size.width / 2, y: -size.height / 2, width: size.width, height: size.height },
          radius: round ? ROUND_R[table.seats] : null,
          transform: `translate(${table.x} ${table.y}) rotate(${table.rotation})`,
          badgeWidth,
          badgeFont,
        };
      }),
  );

  protected stateOf(id: number): TableState {
    return this.states()[id] ?? 'free';
  }

  protected ariaLabel(table: PlanoTable): string {
    const label = String(table.label ?? '').trim();
    const name = /^mesa\b/i.test(label) ? label : `Mesa ${label}`;
    return `${name}, ${table.seats} plazas, ${STATE_TEXT[this.stateOf(table.id)]}`;
  }

  protected activate(table: PlanoTable): void {
    if (this.interactive()) {
      this.tableSelected.emit(table.id);
    }
  }

  protected onKeydown(event: KeyboardEvent, table: PlanoTable): void {
    if (event.key === 'Enter' || event.key === ' ') {
      // Sin esto el Espacio desplaza la página.
      event.preventDefault();
      this.activate(table);
    }
  }
}

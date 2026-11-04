import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { Point, Room, TableLike, isSupportedSeats, roomPolygon } from './geometry';
import { Chair, ROUND_R, chairPositions, rectSize } from './table-drawing';
import { STATE_COLORS, THEMES, ThemeKey } from './themes';

/** `invalid`: mesa con un problema de plano (solape, fuera del local…); solo la usa el editor. */
export type TableState = 'free' | 'selected' | 'pending' | 'taken' | 'blocked' | 'invalid';

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

/** Encuadre del plano: esquina superior izquierda y tamaño, en unidades de plano. */
export interface PlanoFrame {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Encuadre del plano: el contorno del local con un margen de PAD. */
export function planoFrame(room: Room): PlanoFrame {
  const polygon = roomPolygon(room);
  const xs = polygon.map((point) => point.x);
  const ys = polygon.map((point) => point.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return {
    x: minX - PAD,
    y: minY - PAD,
    width: Math.max(...xs) - minX + PAD * 2,
    height: Math.max(...ys) - minY + PAD * 2,
  };
}

/** Atributo `viewBox` de un encuadre. */
export function frameViewBox({ x, y, width, height }: PlanoFrame): string {
  return `${x} ${y} ${width} ${height}`;
}

/** `viewBox` del plano: el contorno del local con un margen de PAD. Lo usan también las capas que se dibujan encima. */
export function planoViewBox(room: Room): string {
  return frameViewBox(planoFrame(room));
}

const STATE_TEXT: Record<TableState, string> = {
  free: 'libre',
  selected: 'seleccionada',
  pending: 'pendiente',
  taken: 'reservada',
  blocked: 'bloqueada',
  invalid: 'con problema',
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
  /**
   * `viewBox` fijo. Sin él el plano se encuadra al local (`planoViewBox`). El editor lo usa mientras se arrastra una
   * pared para que el plano no se reencuadre bajo el puntero.
   */
  readonly viewBox = input<string | null>(null);

  /** Id de la mesa activada. Se emite en todos los estados salvo `blocked` (la mesa que el cliente no puede elegir). */
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

  private readonly document = inject(DOCUMENT);

  /**
   * Ruta y query del documento, sin hash. Con `<base href>` y rutas sin hash, un `url(#id)` se resuelve contra la
   * base (otro documento) en Safari y Firefox antiguos; con la URL actual por delante apunta siempre a esta página.
   * Se actualiza en cada navegación: si quedase vieja, la referencia apuntaría a otro documento igual.
   */
  private readonly documentUrl = signal(this.currentDocumentUrl());

  constructor() {
    // Sin Router (tests de componente sueltos) se queda con la URL inicial.
    inject(Router, { optional: true })
      ?.events.pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.documentUrl.set(this.currentDocumentUrl()));
  }

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

  protected readonly shownViewBox = computed(() => this.viewBox() ?? planoViewBox(this.room()));

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

  /** `url("<ruta>?<query>#id")` para `fill`, `filter` y `clip-path`. */
  protected ref(id: string): string {
    const url = this.documentUrl().replace(/["\\]/g, '\\$&');
    return `url("${url}#${id}")`;
  }

  private currentDocumentUrl(): string {
    const { pathname, search } = this.document.location;
    return pathname + search;
  }

  protected stateOf(id: number): TableState {
    return this.states()[id] ?? 'free';
  }

  protected ariaLabel(table: PlanoTable): string {
    const label = String(table.label ?? '').trim();
    const name = /^mesa\b/i.test(label) ? label : `Mesa ${label}`;
    return `${name}, ${table.seats} plazas, ${STATE_TEXT[this.stateOf(table.id)]}`;
  }

  /** Interactivo y no bloqueada: solo estas mesas se enfocan y emiten `tableSelected`. */
  protected isSelectable(id: number): boolean {
    return this.interactive() && this.stateOf(id) !== 'blocked';
  }

  protected activate(table: PlanoTable): void {
    if (this.isSelectable(table.id)) {
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

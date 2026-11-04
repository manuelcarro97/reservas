import { Injectable, computed, signal } from '@angular/core';
import { LayoutRequest } from '../../core/api/models/layout-request';
import { PlanResponse } from '../../core/api/models/plan-response';
import { Room, RoomShape, roomRects, rotatePoint, validateLayout } from '../../plano/geometry';
import { PlanoTable } from '../../plano/plano.component';
import { ThemeKey } from '../../plano/themes';
import { Handle, applyHandleDrag, applyHandleValue } from './room-handles';

/** Medidas de cada forma al elegirla; son las de la referencia visual aprobada (variantes-plano.html). */
export const SHAPE_DEFAULTS: Record<
  RoomShape,
  Pick<Room, 'width' | 'height' | 'cutWidth' | 'cutDepth'>
> = {
  SQUARE: { width: 800, height: 800, cutWidth: 0, cutDepth: 0 },
  RECTANGLE: { width: 1200, height: 560, cutWidth: 0, cutDepth: 0 },
  L: { width: 1000, height: 900, cutWidth: 480, cutDepth: 480 },
  U: { width: 1100, height: 820, cutWidth: 420, cutDepth: 440 },
  T: { width: 1100, height: 900, cutWidth: 340, cutDepth: 520 },
};

/** Mesa del editor. `id` es el del servidor, o uno temporal negativo si todavía no se ha guardado. */
export type EditorTable = PlanoTable;

const EMPTY_ROOM: Room = { shape: 'RECTANGLE', ...SHAPE_DEFAULTS.RECTANGLE, rotation: 0 };

/**
 * Estado del plano que se edita: forma del local, mesas y tema. Lo provee `EditorPage`, no la raíz, para que cada
 * plano abierto empiece limpio. Los cambios solo viven aquí; guardar (`toLayoutRequest`) es cosa de quien lo llame.
 */
@Injectable()
export class EditorStore {
  private readonly roomState = signal<Room>(EMPTY_ROOM);
  private readonly tablesState = signal<EditorTable[]>([]);
  private readonly themeState = signal<ThemeKey>('AZUL');
  /** Lo último cargado o guardado; `dirty` y `roomChanged` comparan contra esto. */
  private readonly saved = signal({ room: JSON.stringify(EMPTY_ROOM), all: '' });
  /** Local al empezar el arrastre en curso, para calcular desde ahí el desplazamiento total. */
  private dragStart: Room | null = null;
  /** Los ids temporales solo bajan: nunca se repite uno mientras la página siga abierta. */
  private lastTemporaryId = 0;

  readonly room = this.roomState.asReadonly();
  readonly tables = this.tablesState.asReadonly();
  readonly theme = this.themeState.asReadonly();
  private readonly publishedState = signal(false);
  /** El plano está publicado: cambiar la forma del local puede chocar con reservas activas (409 `ROOM_LOCKED` al guardar). */
  readonly published = this.publishedState.asReadonly();

  readonly problems = computed(() => validateLayout(this.room(), this.tables()));
  readonly dirty = computed(() => this.snapshot() !== this.saved().all);
  /** La forma del local (no las mesas ni el tema) es distinta de la cargada. */
  readonly roomChanged = computed(() => JSON.stringify(this.room()) !== this.saved().room);

  constructor() {
    this.saved.set({ room: JSON.stringify(EMPTY_ROOM), all: this.snapshot() });
  }

  /** Sustituye el estado por el del plano del servidor y lo da por guardado. */
  load(plan: PlanResponse): void {
    const room: Room = {
      shape: plan.room?.shape ?? EMPTY_ROOM.shape,
      width: plan.room?.width ?? EMPTY_ROOM.width,
      height: plan.room?.height ?? EMPTY_ROOM.height,
      cutWidth: plan.room?.cutWidth ?? 0,
      cutDepth: plan.room?.cutDepth ?? 0,
      rotation: plan.room?.rotation ?? 0,
    };
    this.dragStart = null;
    this.roomState.set(room);
    this.tablesState.set(
      (plan.tables ?? []).map((table) => ({
        id: table.id ?? this.nextTemporaryId(),
        label: table.label ?? '',
        shape: table.shape ?? 'SQUARE',
        seats: table.seats ?? 4,
        rotation: table.rotation ?? 0,
        x: table.x ?? 0,
        y: table.y ?? 0,
      })),
    );
    this.themeState.set(plan.theme ?? 'AZUL');
    this.publishedState.set(plan.status === 'PUBLISHED');
    this.saved.set({ room: JSON.stringify(room), all: this.snapshot() });
  }

  /** Cambia la forma con las medidas de referencia de esa forma; mantiene el giro y deja las mesas donde están. */
  setShape(shape: RoomShape): void {
    this.roomState.update((room) => ({ shape, ...SHAPE_DEFAULTS[shape], rotation: room.rotation }));
  }

  /**
   * Gira el local 90 grados en sentido horario con la misma transformación de `geometry.ts`: un punto (x, y) del
   * plano pasa a (alto - y, x), con el alto del local tal como se ve ahora. Las mesas giran con él: su centro se
   * mueve igual y su giro pasa de 0 a 90 o de 90 a 0.
   */
  rotateRoom(): void {
    const room = this.room();
    const shownHeight = Math.max(...roomRects(room).map((rect) => rect.y2));
    // El giro de 90 de `rotatePoint` aplicado a una caja del alto que se ve ahora.
    const quarterTurn: Room = { ...room, rotation: 90, height: shownHeight };
    this.tablesState.update((tables) =>
      tables.map((table) => ({
        ...table,
        ...rotatePoint(quarterTurn, { x: table.x, y: table.y }),
        rotation: table.rotation === 0 ? 90 : 0,
      })),
    );
    this.roomState.set({ ...room, rotation: (room.rotation + 90) % 360 });
  }

  /** Empieza un arrastre: `dragHandle` calcula desde el local de ahora hasta `endDrag`. */
  beginDrag(): void {
    this.dragStart = this.room();
  }

  endDrag(): void {
    this.dragStart = null;
  }

  /**
   * Mueve el tirador (`dx`, `dy`) unidades de plano. Dentro de un arrastre son el desplazamiento total desde
   * `beginDrag`; fuera, se suman al local de ahora.
   */
  dragHandle(handle: Handle, dx: number, dy: number): void {
    this.roomState.set(applyHandleDrag(this.dragStart ?? this.room(), handle, dx, dy));
  }

  /** Fija la medida del tirador (teclado). */
  setHandleValue(handle: Handle, value: number): void {
    this.roomState.update((room) => applyHandleValue(room, handle, value));
  }

  /** Añade una mesa nueva con un id temporal negativo y devuelve ese id. */
  addTable(table: Omit<EditorTable, 'id'>): number {
    const id = this.nextTemporaryId();
    this.tablesState.update((tables) => [...tables, { ...table, id }]);
    return id;
  }

  /** Cuerpo del `PUT /layout`: las mesas del servidor llevan su `id` (se actualizan) y las nuevas no (se crean). */
  toLayoutRequest(): LayoutRequest {
    return {
      room: { ...this.room() },
      tables: this.tables().map(({ id, ...table }) => (id > 0 ? { id, ...table } : table)),
    };
  }

  private nextTemporaryId(): number {
    return --this.lastTemporaryId;
  }

  private snapshot(): string {
    return JSON.stringify({ room: this.room(), tables: this.tables(), theme: this.theme() });
  }
}

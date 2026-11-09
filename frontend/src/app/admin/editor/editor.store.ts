import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { LayoutRequest } from '../../core/api/models/layout-request';
import { PlanResponse } from '../../core/api/models/plan-response';
import { PlanSettingsRequest } from '../../core/api/models/plan-settings-request';
import { AdminPlanControllerService } from '../../core/api/services/admin-plan-controller.service';
import {
  GRID,
  MAX_TABLES,
  Point,
  Room,
  RoomShape,
  TableShape,
  calculableFootprint,
  fitsFree,
  isSupportedSeats,
  roomProblems,
  roomRects,
  rotatePoint,
  validateLayout,
} from '../../plano/geometry';
import { PlanoTable } from '../../plano/plano.component';
import { ThemeKey } from '../../plano/themes';
import {
  PUBLISH_FAILED_MESSAGE,
  adminErrorMessage,
  blockingReservations,
  layoutProblems,
} from '../admin-errors';
import { sameRoom, sameTables } from './layout-compare';
import { Handle, WallMove, moveHandleBy, moveHandleTo } from './room-handles';

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

/** Problema que devolvió el servidor al guardar. `tableId` es null si afecta al local y no a una mesa. */
export interface ServerProblem {
  tableId: number | null;
  label: string | null;
  code: string;
}

const EMPTY_ROOM: Room = { shape: 'RECTANGLE', ...SHAPE_DEFAULTS.RECTANGLE, rotation: 0 };

/** Largo máximo del nombre de una mesa (`@Size(max = 40)` en el backend). */
const MAX_LABEL = 40;

/** Coordenada máxima que acepta el backend (`MAX_COORDINATE` de `LayoutRequest`). */
const MAX_COORDINATE = 4000;

/** Plazo de cancelación si la respuesta del servidor no lo trae (el del plano nuevo, `PlanService`). */
const DEFAULT_CANCELLATION_HOURS = 2;

const SAVE_FAILED = 'No se pudo guardar el plano. Inténtalo de nuevo.';
const THEME_FAILED = 'El plano se guardó, pero el tema no se pudo cambiar.';

/**
 * Nombre para la mesa siguiente: el mayor número entero entre los nombres más uno (o "1"). Solo cuentan los nombres
 * que son un número entero (hasta 9 cifras); "Barra" o "Mesa 5" no cuentan.
 */
export function nextLabel(tables: readonly { label: string }[]): string {
  let highest = 0;
  for (const { label } of tables) {
    const text = label.trim();
    if (/^\d{1,9}$/.test(text)) {
      highest = Math.max(highest, Number(text));
    }
  }
  return String(highest + 1);
}

/** Lo último cargado o guardado: contra esto se comparan `dirty` y `roomChanged`. */
interface SavedState {
  room: Room;
  tables: EditorTable[];
  theme: ThemeKey;
}

/**
 * Estado del plano que se edita: forma del local, mesas y tema. Lo provee `EditorPage`, no la raíz, para que cada
 * plano abierto empiece limpio. Los cambios solo viven aquí (arrastrar no llama a la API); `save` y `publish` son lo
 * único que habla con el servidor.
 */
@Injectable()
export class EditorStore {
  private readonly api = inject(AdminPlanControllerService);

  private readonly roomState = signal<Room>(EMPTY_ROOM);
  private readonly tablesState = signal<EditorTable[]>([]);
  private readonly themeState = signal<ThemeKey>('AZUL');
  private readonly savedState = signal<SavedState>({
    room: EMPTY_ROOM,
    tables: [],
    theme: 'AZUL',
  });
  /** Última respuesta del servidor cargada: de ella salen los ajustes que repite el `PATCH` si no hubo `PUT`. */
  private loadedPlan: PlanResponse | null = null;
  /** Local y mesas al empezar el arrastre en curso, para calcular desde ahí el desplazamiento total. */
  private dragStart: { room: Room; tables: EditorTable[] } | null = null;
  private readonly dragShiftState = signal<Point>({ x: 0, y: 0 });
  /**
   * Cuánto se han desplazado las mesas (y el origen del local) desde que empezó el arrastre en curso; (0, 0) fuera de
   * un arrastre. El editor traslada con esto su encuadre congelado para que lo que no se mueve no se mueva en pantalla.
   */
  readonly dragShift = this.dragShiftState.asReadonly();
  /** Los ids temporales solo bajan: nunca se repite uno mientras la página siga abierta. */
  private lastTemporaryId = 0;

  readonly room = this.roomState.asReadonly();
  readonly tables = this.tablesState.asReadonly();
  readonly theme = this.themeState.asReadonly();
  private readonly publishedState = signal(false);
  /** El plano está publicado: cambiar la forma del local puede chocar con reservas activas (409 `ROOM_LOCKED` al guardar). */
  readonly published = this.publishedState.asReadonly();
  private readonly slugState = signal('');
  readonly slug = this.slugState.asReadonly();
  private readonly nameState = signal('');
  /** Nombre del plano tal como lo devolvió el servidor; el editor no lo cambia. */
  readonly name = this.nameState.asReadonly();

  private readonly savingState = signal(false);
  private readonly publishingState = signal(false);
  /** Hay un guardado en curso: no se edita ni se vuelve a enviar hasta que acabe. */
  readonly saving = this.savingState.asReadonly();
  readonly publishing = this.publishingState.asReadonly();
  private readonly busy = computed(() => this.saving() || this.publishing());

  private readonly saveErrorState = signal<string | null>(null);
  private readonly publishErrorState = signal<string | null>(null);
  private readonly blockingCodesState = signal<string[]>([]);
  readonly saveError = this.saveErrorState.asReadonly();
  readonly publishError = this.publishErrorState.asReadonly();
  /** Códigos de las reservas activas que impiden guardar (409 `TABLE_HAS_RESERVATIONS` o `ROOM_LOCKED`). */
  readonly blockingCodes = this.blockingCodesState.asReadonly();

  /**
   * Problemas que devolvió el 422 al guardar, con el id de la mesa (el servidor da su posición en la petición, que
   * cambiaría al quitar otra). Valen solo para el plano tal como se envió: cualquier edición los borra.
   */
  private readonly serverFeedback = signal<{
    room: Room;
    tables: EditorTable[];
    problems: ServerProblem[];
  } | null>(null);
  readonly serverProblems = computed(() => {
    const feedback = this.serverFeedback();
    return feedback && feedback.room === this.room() && feedback.tables === this.tables()
      ? feedback.problems
      : [];
  });

  readonly problems = computed(() => validateLayout(this.room(), this.tables()));
  /** Ids de las mesas con un problema, del plano local o devuelto por el servidor. */
  readonly invalidTableIds = computed<ReadonlySet<number>>(() => {
    const tables = this.tables();
    const ids = new Set<number>();
    for (const { tableIndex } of this.problems()) {
      if (tableIndex !== null && tables[tableIndex]) {
        ids.add(tables[tableIndex].id);
      }
    }
    for (const { tableId } of this.serverProblems()) {
      if (tableId !== null) {
        ids.add(tableId);
      }
    }
    return ids;
  });

  readonly dirty = computed(() => {
    const saved = this.savedState();
    return (
      this.theme() !== saved.theme ||
      !sameRoom(this.room(), saved.room) ||
      !sameTables(this.tables(), saved.tables)
    );
  });
  /** La forma del local (no las mesas ni el tema) es distinta de la cargada. */
  readonly roomChanged = computed(() => !sameRoom(this.room(), this.savedState().room));

  /** Se puede guardar: hay cambios, el plano local no tiene problemas y no hay otra petición en curso. */
  readonly canSave = computed(() => this.dirty() && this.problems().length === 0 && !this.busy());
  /** Se puede publicar: plano guardado, con mesas, sin problemas y todavía no publicado. */
  readonly canPublish = computed(
    () =>
      !this.dirty() &&
      this.problems().length === 0 &&
      this.tables().length > 0 &&
      !this.published() &&
      !this.busy(),
  );

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
    const tables = (plan.tables ?? []).map((table) => ({
      id: table.id ?? this.nextTemporaryId(),
      label: table.label ?? '',
      shape: table.shape ?? 'SQUARE',
      seats: table.seats ?? 4,
      rotation: table.rotation ?? 0,
      x: table.x ?? 0,
      y: table.y ?? 0,
    }));
    const theme = plan.theme ?? 'AZUL';
    this.dragStart = null;
    this.dragShiftState.set({ x: 0, y: 0 });
    this.roomState.set(room);
    this.tablesState.set(tables);
    this.themeState.set(theme);
    this.publishedState.set(plan.status === 'PUBLISHED');
    this.slugState.set(plan.slug ?? this.slug());
    this.nameState.set(plan.name ?? this.slug());
    this.savedState.set({ room, tables, theme });
    this.loadedPlan = plan;
    this.clearFeedback();
  }

  /** Cambia la forma con las medidas de referencia de esa forma; mantiene el giro y deja las mesas donde están. */
  setShape(shape: RoomShape): void {
    // Elegir la forma que ya está activa no restablece las medidas que el dueño ha ajustado.
    if (this.busy() || shape === this.room().shape) {
      return;
    }
    this.roomState.update((room) => ({ shape, ...SHAPE_DEFAULTS[shape], rotation: room.rotation }));
  }

  /**
   * Gira el local 90 grados en sentido horario con la misma transformación de `geometry.ts`: un punto (x, y) del
   * plano pasa a (alto - y, x), con el alto del local tal como se ve ahora. Las mesas giran con él: su centro se
   * mueve igual y su giro pasa de 0 a 90 o de 90 a 0.
   */
  rotateRoom(): void {
    if (this.busy()) {
      return;
    }
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

  /** Empieza un arrastre: `dragHandle` calcula desde el local y las mesas de ahora hasta `endDrag`. */
  beginDrag(): void {
    this.dragStart = { room: this.room(), tables: this.tables() };
    this.dragShiftState.set({ x: 0, y: 0 });
  }

  endDrag(): void {
    this.dragStart = null;
    this.dragShiftState.set({ x: 0, y: 0 });
  }

  /**
   * Mueve la pared del tirador (`dx`, `dy`) unidades de plano. Dentro de un arrastre son el desplazamiento total
   * desde `beginDrag`; fuera, se suman al local de ahora. Si la pared está en el lado del origen (izquierda, arriba)
   * las mesas se desplazan con el origen para quedarse donde estaban respecto a las paredes que no se mueven.
   */
  dragHandle(handle: Handle, dx: number, dy: number): void {
    if (this.busy()) {
      return;
    }
    const base = this.dragStart ?? { room: this.room(), tables: this.tables() };
    const move = moveHandleBy(base.room, handle, dx, dy);
    this.apply(base, move);
    if (this.dragStart) {
      this.dragShiftState.set(move.shift);
    }
  }

  /** Fija la medida principal del tirador (teclado). */
  setHandleValue(handle: Handle, value: number): void {
    if (this.busy()) {
      return;
    }
    const base = { room: this.room(), tables: this.tables() };
    this.apply(base, moveHandleTo(base.room, handle, value));
  }

  private apply(base: { tables: EditorTable[] }, move: WallMove): void {
    this.roomState.set(move.room);
    const { x, y } = move.shift;
    this.tablesState.set(
      x === 0 && y === 0
        ? base.tables
        : base.tables.map((table) => ({ ...table, x: table.x + x, y: table.y + y })),
    );
  }

  /** Añade una mesa tal cual, con un id temporal negativo, y devuelve ese id. No comprueba que quepa. */
  placeTable(table: Omit<EditorTable, 'id'>): number {
    const id = this.nextTemporaryId();
    this.tablesState.update((tables) => [...tables, { ...table, id }]);
    return id;
  }

  /**
   * Añade una mesa sin giro, con el nombre `nextLabel`, en el primer hueco libre del local (de arriba abajo y de
   * izquierda a derecha, en la cuadrícula). Devuelve su id, o null si no cabe, ya hay `MAX_TABLES` o el local no es
   * válido.
   */
  addTable(shape: TableShape, seats: number): number | null {
    const tables = this.tables();
    const room = this.room();
    if (
      this.busy() ||
      tables.length >= MAX_TABLES ||
      !isSupportedSeats(seats) ||
      roomProblems(room).length > 0
    ) {
      return null;
    }
    const candidate = { label: nextLabel(tables), shape, seats, rotation: 0 };
    const rects = roomRects(room);
    const taken = tables.flatMap((table) => calculableFootprint(table) ?? []);
    const maxX = Math.max(...rects.map((rect) => rect.x2));
    const maxY = Math.max(...rects.map((rect) => rect.y2));
    for (let y = 0; y <= maxY; y += GRID) {
      for (let x = 0; x <= maxX; x += GRID) {
        if (fitsFree({ ...candidate, x, y }, rects, taken)) {
          return this.placeTable({ ...candidate, x, y });
        }
      }
    }
    return null;
  }

  /** Mueve el centro de la mesa a la cuadrícula más cercana, sin salir de la caja del local. */
  moveTable(index: number, x: number, y: number): void {
    const { maxX, maxY } = this.bounds();
    this.updateTable(index, {
      x: clamp(snap(x), 0, maxX),
      y: clamp(snap(y), 0, maxY),
    });
  }

  /** Gira la mesa entre 0 y 90. */
  rotateTable(index: number): void {
    const table = this.tables()[index];
    if (table) {
      this.updateTable(index, { rotation: table.rotation === 0 ? 90 : 0 });
    }
  }

  renameTable(index: number, label: string): void {
    this.updateTable(index, { label: label.slice(0, MAX_LABEL) });
  }

  setTableSeats(index: number, seats: number): void {
    this.updateTable(index, { seats });
  }

  setTableShape(index: number, shape: TableShape): void {
    this.updateTable(index, { shape });
  }

  removeTable(index: number): void {
    if (this.busy() || !this.tables()[index]) {
      return;
    }
    this.tablesState.update((tables) => tables.filter((_, position) => position !== index));
  }

  setTheme(theme: ThemeKey): void {
    if (!this.busy()) {
      this.themeState.set(theme);
    }
  }

  /** Cambia campos de una mesa; sin efecto si no existe, si no cambia nada o si hay una petición en curso. */
  private updateTable(index: number, changes: Partial<Omit<EditorTable, 'id'>>): void {
    const current = this.tables()[index];
    if (this.busy() || !current) {
      return;
    }
    const changed = (Object.keys(changes) as (keyof typeof changes)[]).some(
      (key) => changes[key] !== current[key],
    );
    if (!changed) {
      return;
    }
    this.tablesState.update((tables) =>
      tables.map((table, position) => (position === index ? { ...table, ...changes } : table)),
    );
  }

  /** Caja del local: hasta dónde puede llegar el centro de una mesa. Con un local no válido, el tope del backend. */
  private bounds(): { maxX: number; maxY: number } {
    const room = this.room();
    if (roomProblems(room).length > 0) {
      return { maxX: MAX_COORDINATE, maxY: MAX_COORDINATE };
    }
    const rects = roomRects(room);
    return {
      maxX: Math.max(...rects.map((rect) => rect.x2)),
      maxY: Math.max(...rects.map((rect) => rect.y2)),
    };
  }

  /** Cuerpo del `PUT /layout`: las mesas del servidor llevan su `id` (se actualizan) y las nuevas no (se crean). */
  toLayoutRequest(): LayoutRequest {
    return {
      room: { ...this.room() },
      tables: this.tables().map(({ id, label, ...table }) => {
        const body = { label: label.trim(), ...table };
        return id > 0 ? { id, ...body } : body;
      }),
    };
  }

  /**
   * Guarda el plano: `PUT layout` si la sala o las mesas cambiaron y `PATCH` con el tema si el elegido no es el que se
   * cargó (el layout no lo lleva). Un cambio solo de tema no hace `PUT`. El `PATCH` repite el resto de ajustes tal
   * como los devolvió el `PUT` (sin `PUT`, los del plano cargado): no es parcial. Las respuestas llevan el plano
   * completo con los ids reales, así que se carga la última sin pedirlo otra vez.
   * Devuelve si se guardó todo; los motivos de un fallo quedan en `saveError`, `blockingCodes` y `serverProblems`.
   */
  async save(): Promise<boolean> {
    if (!this.canSave()) {
      return false;
    }
    this.savingState.set(true);
    this.clearFeedback();
    const slug = this.slug();
    const chosenTheme = this.theme();
    const saved = this.savedState();
    // Se compara con lo cargado, no con la respuesta del PUT: si otra pestaña cambió el tema, guardar solo una mesa
    // no debe devolverlo al que se cargó aquí.
    const layoutChanged =
      !sameRoom(this.room(), saved.room) || !sameTables(this.tables(), saved.tables);
    const themeChanged = chosenTheme !== saved.theme;
    let layoutSaved: PlanResponse | null = null;
    try {
      let plan = this.loadedPlan;
      if (layoutChanged) {
        layoutSaved = await firstValueFrom(
          this.api.saveLayout({ slug, body: this.toLayoutRequest() }),
        );
        plan = layoutSaved;
      }
      if (themeChanged) {
        plan = await firstValueFrom(
          this.api.updateSettings({ slug, body: settingsWithTheme(plan, slug, chosenTheme) }),
        );
      }
      if (plan) {
        this.load(plan);
      }
      return true;
    } catch (error) {
      if (layoutSaved) {
        // Las mesas ya están guardadas: se recargan con sus ids reales, y el tema elegido sigue pendiente.
        this.load(layoutSaved);
        this.themeState.set(chosenTheme);
        this.saveErrorState.set(`${THEME_FAILED} ${this.messageOf(error, 'Inténtalo de nuevo.')}`);
      } else {
        this.failSave(error);
      }
      return false;
    } finally {
      this.savingState.set(false);
    }
  }

  /** Publica el plano guardado (`POST publish`). Devuelve si quedó publicado; el motivo de un fallo, en `publishError`. */
  async publish(): Promise<boolean> {
    if (!this.canPublish()) {
      return false;
    }
    this.publishingState.set(true);
    this.clearFeedback();
    try {
      this.load(await firstValueFrom(this.api.publish({ slug: this.slug() })));
      return true;
    } catch (error) {
      this.publishErrorState.set(this.messageOf(error, PUBLISH_FAILED_MESSAGE));
      return false;
    } finally {
      this.publishingState.set(false);
    }
  }

  private failSave(error: unknown): void {
    this.saveErrorState.set(this.messageOf(error, SAVE_FAILED));
    if (!(error instanceof HttpErrorResponse)) {
      return;
    }
    this.blockingCodesState.set(blockingReservations(error));
    // Los índices del servidor son posiciones de la petición: se pasan a ids antes de que otra edición los mueva.
    const tables = this.tables();
    const problems = layoutProblems(error).flatMap((problem): ServerProblem[] => {
      if (problem.tableIndex === null) {
        return [{ tableId: null, label: problem.label, code: problem.code }];
      }
      const table = tables[problem.tableIndex];
      return table ? [{ tableId: table.id, label: problem.label, code: problem.code }] : [];
    });
    if (problems.length > 0) {
      this.serverFeedback.set({ room: this.room(), tables, problems });
    }
  }

  private messageOf(error: unknown, fallback: string): string {
    return error instanceof HttpErrorResponse ? adminErrorMessage(error, fallback) : fallback;
  }

  private clearFeedback(): void {
    this.saveErrorState.set(null);
    this.publishErrorState.set(null);
    this.blockingCodesState.set([]);
    this.serverFeedback.set(null);
  }

  private nextTemporaryId(): number {
    return --this.lastTemporaryId;
  }
}

/** Cuerpo del `PATCH` con el tema nuevo y el resto de ajustes del plano sin tocar. */
function settingsWithTheme(
  plan: PlanResponse | null,
  slug: string,
  theme: ThemeKey,
): PlanSettingsRequest {
  plan ??= {};
  return {
    name: plan.name ?? slug,
    theme,
    bookingMode: plan.bookingMode ?? 'FREE_CHOICE',
    cancellationDeadlineHours: plan.cancellationDeadlineHours ?? DEFAULT_CANCELLATION_HOURS,
  };
}

function snap(value: number): number {
  return Math.round(value / GRID) * GRID;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

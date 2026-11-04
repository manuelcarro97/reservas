import { DOCUMENT } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { EMPTY, Subject, catchError, map, merge, switchMap, tap } from 'rxjs';
import { AdminPlanControllerService } from '../../core/api/services/admin-plan-controller.service';
import { GRID, MAX_TABLES, Point, Room, RoomShape, STEP, TableShape } from '../../plano/geometry';
import {
  PlanoComponent,
  PlanoFrame,
  TableState,
  frameViewBox,
  planoFrame,
  planoViewBox,
} from '../../plano/plano.component';
import { THEMES, THEME_KEYS, ThemeKey } from '../../plano/themes';
import { EditorStore, EditorTable, ServerProblem } from './editor.store';
import { ConfirmsLeaving } from './leave-editor.guard';
import { Handle, handlesFor } from './room-handles';
import { NewTable, TablePaletteComponent } from './table-palette.component';

export type EditorStatus = 'loading' | 'ready' | 'notFound' | 'error';

/** Formas del local en el orden en que se ofrecen. */
const SHAPES: readonly { shape: RoomShape; name: string }[] = [
  { shape: 'SQUARE', name: 'Cuadrada' },
  { shape: 'RECTANGLE', name: 'Alargada' },
  { shape: 'L', name: 'En L' },
  { shape: 'U', name: 'En U' },
  { shape: 'T', name: 'En T' },
];

/** Plazas que se pueden elegir para una mesa. */
const SEAT_OPTIONS: readonly number[] = [2, 4, 6, 8];

/** Qué le pasa a la mesa (o al local), por código de problema del plano. */
const PROBLEM_TEXT: Record<string, string> = {
  OVERLAP: 'se solapa con otra mesa',
  OUT_OF_ROOM: 'queda fuera del local o demasiado cerca de la pared',
  DUPLICATE_LABEL: 'tiene el mismo nombre que otra mesa',
  BLANK_LABEL: 'no tiene un nombre válido',
  OFF_GRID: 'no está sobre la cuadrícula',
  INVALID_SEATS: 'tiene un número de plazas que no existe',
  INVALID_ROTATION: 'tiene un giro que no existe',
  UNKNOWN_TABLE: 'ya no existe en el servidor: recarga la página',
  INVALID_ROOM: 'La forma del local no es válida',
  TOO_MANY_TABLES: `Hay más de ${MAX_TABLES} mesas`,
};

/** Parte lineal de la matriz inversa pantalla -> plano (sin traslación: solo se convierten desplazamientos). */
interface ScreenToPlan {
  a: number;
  b: number;
  c: number;
  d: number;
}

/**
 * Arrastre en curso: el tirador agarrado, dónde estaba el puntero en pantalla al empezar y la conversión a unidades
 * de plano de ese instante. La conversión queda fija: el viewBox depende del tamaño del local que se está arrastrando,
 * así que la escala cambia con cada movimiento y releerla realimentaría el arrastre.
 */
interface Drag {
  handle: Handle;
  pointerId: number;
  start: Point;
  scale: ScreenToPlan;
}

/** Arrastre de una mesa: igual que `Drag`, con la mesa agarrada y dónde estaba su centro. */
interface TableDrag {
  id: number;
  element: Element;
  pointerId: number;
  start: Point;
  scale: ScreenToPlan;
  origin: Point;
}

/** Pregunta abierta en la página (en vez de `window.confirm`). */
type Dialog = { kind: 'leave'; resolve: (leave: boolean) => void } | { kind: 'delete'; id: number };

/** Nombre de la mesa para frases: "Mesa 3", o el nombre tal cual si ya empieza por "mesa". */
function tableName(label: string): string {
  const text = label.trim();
  return /^mesa\b/i.test(text) ? text : `Mesa ${text}`;
}

/**
 * `/panel/:slug/plano`: forma del local, mesas y tema. La forma se cambia con los botones, el giro y los tiradores del
 * contorno; las mesas se añaden desde la paleta y se mueven con el ratón, el dedo o las flechas. Todo eso solo toca el
 * estado local: nada llama a la API hasta Guardar (y Publicar).
 */
@Component({
  selector: 'app-editor-page',
  imports: [PlanoComponent, RouterLink, TablePaletteComponent],
  providers: [EditorStore],
  templateUrl: './editor.page.html',
  styleUrl: './editor.page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(window:beforeunload)': 'onBeforeUnload($event)' },
})
export class EditorPage implements ConfirmsLeaving {
  protected readonly store = inject(EditorStore);
  private readonly api = inject(AdminPlanControllerService);
  private readonly document = inject(DOCUMENT);

  protected readonly status = signal<EditorStatus>('loading');
  protected readonly shapes = SHAPES;
  protected readonly seatOptions = SEAT_OPTIONS;
  protected readonly themes = THEME_KEYS.map((key) => ({ key, name: THEMES[key].name }));
  protected readonly planName = signal('');
  protected readonly dragging = signal<string | null>(null);
  protected readonly maxTables = MAX_TABLES;

  private readonly slug = signal('');
  private readonly retries = new Subject<void>();
  private readonly overlay = viewChild<ElementRef<SVGSVGElement>>('overlay');
  private drag: Drag | null = null;
  private tableDrag: TableDrag | null = null;

  /** Mesa seleccionada (por id: los índices cambian al añadir o quitar mesas). */
  protected readonly selectedId = signal<number | null>(null);
  protected readonly selectedIndex = computed(() =>
    this.store.tables().findIndex((table) => table.id === this.selectedId()),
  );
  protected readonly selected = computed<EditorTable | null>(
    () => this.store.tables()[this.selectedIndex()] ?? null,
  );

  protected readonly dialog = signal<Dialog | null>(null);
  private readonly safeButton = viewChild<ElementRef<HTMLButtonElement>>('safe');

  /** Mesa por la que se pregunta si se borra (para el texto del diálogo). */
  protected readonly deleting = computed(() => {
    const current = this.dialog();
    return current?.kind === 'delete'
      ? (this.store.tables().find((table) => table.id === current.id) ?? null)
      : null;
  });

  /** Mensaje de estado ("Plano guardado."); desaparece con la siguiente edición. */
  private readonly infoState = signal<{
    text: string;
    room: Room;
    tables: EditorTable[];
    theme: ThemeKey;
  } | null>(null);
  protected readonly info = computed(() => {
    const info = this.infoState();
    return info &&
      info.room === this.store.room() &&
      info.tables === this.store.tables() &&
      info.theme === this.store.theme()
      ? info.text
      : null;
  });

  /** Encuadre al empezar el arrastre en curso; null fuera de un arrastre. */
  private readonly frozenFrame = signal<PlanoFrame | null>(null);

  /**
   * `viewBox` del plano y de la capa de tiradores (comparten coordenadas). Fuera de un arrastre se ajusta al local.
   * Durante uno queda congelado en el del principio, trasladado lo que se desplazan las mesas cuando la pared
   * arrastrada es la de la izquierda o la de arriba: así lo que no se mueve no se mueve en pantalla y solo la pared
   * arrastrada sigue al puntero (el encuadre se reajusta de golpe al soltar). Si la pared sale del encuadre se sigue
   * viendo porque el plano del editor tiene `overflow: visible`.
   */
  protected readonly viewBox = computed(() => {
    const frozen = this.frozenFrame();
    if (!frozen) {
      return planoViewBox(this.store.room());
    }
    const shift = this.store.dragShift();
    return frameViewBox({ ...frozen, x: frozen.x + shift.x, y: frozen.y + shift.y });
  });
  protected readonly handles = computed(() => handlesFor(this.store.room()));

  /** Estado de cada mesa en el plano: con problema (rojo) o seleccionada (verde); el resto, libre. */
  protected readonly tableStates = computed(() => {
    const states: Record<number, TableState> = {};
    const invalid = this.store.invalidTableIds();
    const selected = this.selectedId();
    for (const { id } of this.store.tables()) {
      if (invalid.has(id)) {
        states[id] = 'invalid';
      } else if (id === selected) {
        states[id] = 'selected';
      }
    }
    return states;
  });

  /** Frases de los problemas del plano local y de los que devolvió el servidor, sin repetir. */
  protected readonly problemLines = computed(() => {
    const tables = this.store.tables();
    const lines = new Map<string, string>();
    const add = (tableId: number | null, label: string | null, code: string) => {
      const table = tables.find((candidate) => candidate.id === tableId);
      const subject = table ? tableName(table.label) : label ? tableName(label) : 'Una mesa';
      const text = PROBLEM_TEXT[code] ?? code;
      lines.set(`${tableId}:${code}`, tableId === null ? text : `${subject}: ${text}`);
    };
    for (const problem of this.store.problems()) {
      const id = problem.tableIndex === null ? null : (tables[problem.tableIndex]?.id ?? null);
      add(id, problem.label, problem.code);
    }
    this.store.serverProblems().forEach((problem: ServerProblem) => {
      add(problem.tableId, problem.label, problem.code);
    });
    return Array.from(lines.values());
  });

  protected readonly publicLink = computed(
    () => `${this.document.location.origin}/r/${encodeURIComponent(this.store.slug())}`,
  );
  protected readonly embedCode = computed(
    () =>
      `<iframe src="${this.publicLink()}?embed=1" title="Reservas" width="100%" height="720" style="border:0" loading="lazy"></iframe>`,
  );

  constructor() {
    // Cambiar de plano desde la cabecera reutiliza esta página: se recarga con cada slug, no solo con el primero.
    merge(
      inject(ActivatedRoute).paramMap.pipe(map((params) => params.get('slug') ?? '')),
      this.retries.pipe(map(() => this.slug())),
    )
      .pipe(
        tap((slug) => this.slug.set(slug)),
        switchMap((slug) => this.load(slug)),
        takeUntilDestroyed(),
      )
      .subscribe();

    // El foco va al botón seguro del diálogo ("Seguir editando", "Cancelar") en cuanto aparece.
    effect(() => this.safeButton()?.nativeElement.focus());
  }

  protected retry(): void {
    this.retries.next();
  }

  private load(slug: string) {
    this.status.set('loading');
    return this.api.get({ slug }).pipe(
      tap((plan) => {
        this.store.load(plan);
        this.planName.set(plan.name ?? slug);
        this.selectedId.set(null);
        this.infoState.set(null);
        this.status.set('ready');
      }),
      // 404: el plano no existe o es de otro dueño (el backend no distingue). No es una excepción.
      catchError((error: HttpErrorResponse) => {
        this.status.set(error.status === 404 ? 'notFound' : 'error');
        return EMPTY;
      }),
    );
  }

  protected isShape(shape: RoomShape): boolean {
    return this.store.room().shape === shape;
  }

  /** Sentido en pantalla en el que se mueve el tirador. */
  protected orientation(handle: Handle): 'horizontal' | 'vertical' {
    return handle.direction.x !== 0 ? 'horizontal' : 'vertical';
  }

  protected tableLabel(label: string): string {
    return tableName(label);
  }

  // --- Tiradores de las paredes ---

  protected onPointerDown(event: PointerEvent, handle: Handle): void {
    if (event.button !== 0) {
      return;
    }
    const scale = this.screenToPlan();
    if (!scale) {
      return;
    }
    event.preventDefault();
    // La captura hace que el arrastre siga llegando al tirador aunque el puntero salga de él.
    (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
    this.drag = {
      handle,
      pointerId: event.pointerId,
      start: { x: event.clientX, y: event.clientY },
      scale,
    };
    this.dragging.set(handle.wall);
    this.frozenFrame.set(planoFrame(this.store.room()));
    this.store.beginDrag();
  }

  protected onPointerMove(event: PointerEvent): void {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointerId) {
      return;
    }
    // Desplazamiento total desde que se agarró: redondear cada movimiento suelto dejaría el tirador quieto.
    const { x, y } = this.planDelta(drag, event);
    this.store.dragHandle(drag.handle, x, y);
  }

  /** Fin del arrastre: soltar, cancelar o perder la captura (`lostpointercapture`). */
  protected onPointerEnd(event: PointerEvent): void {
    if (!this.drag || event.pointerId !== this.drag.pointerId) {
      return;
    }
    (event.currentTarget as Element).releasePointerCapture?.(event.pointerId);
    this.drag = null;
    this.dragging.set(null);
    this.frozenFrame.set(null);
    this.store.endDrag();
  }

  /**
   * Flechas: mueven la pared hacia donde apunta la flecha, de STEP en STEP en pantalla (en la U y la T, donde el
   * entrante está centrado, la medida cambia el doble). Una flecha perpendicular a la pared no hace nada.
   */
  protected onKeydown(event: KeyboardEvent, handle: Handle): void {
    // Alt+flecha, Ctrl+flecha y Meta+flecha son atajos del navegador (atrás, adelante…): no se tocan.
    if (event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }
    const arrow = this.arrowVector(event.key);
    const sign = arrow ? arrow.x * handle.direction.x + arrow.y * handle.direction.y : 0;
    if (sign === 0) {
      return;
    }
    // Sin esto las flechas desplazan la página.
    event.preventDefault();
    this.store.setHandleValue(handle, this.store.room()[handle.kind] + sign * STEP * handle.gain);
  }

  // --- Mesas ---

  protected addTable({ shape, seats }: NewTable): void {
    const id = this.store.addTable(shape, seats);
    if (id === null) {
      this.say('No cabe otra mesa de ese tipo en el local.');
      return;
    }
    this.selectedId.set(id);
  }

  /**
   * El arrastre de una mesa empieza en `pointerdown` sobre su grupo (`data-table-id`). El plano no sabe de arrastres:
   * se escucha en su elemento y se identifica la mesa por ese atributo. Seleccionar con clic o Enter lo hace el plano
   * (`tableSelected`). Misma técnica que los tiradores: la conversión pantalla -> plano se fija al agarrar y la
   * captura del puntero mantiene el arrastre aunque el puntero salga de la mesa. Como el encuadre solo depende del
   * local, no cambia al mover mesas y no hace falta congelarlo.
   */
  protected onTablePointerDown(event: PointerEvent): void {
    const element = this.tableElement(event);
    if (event.button !== 0 || !element) {
      return;
    }
    const table = this.store.tables().find((candidate) => candidate.id === this.tableIdOf(element));
    const scale = this.screenToPlan();
    if (!table || !scale) {
      return;
    }
    element.setPointerCapture?.(event.pointerId);
    this.tableDrag = {
      id: table.id,
      element,
      pointerId: event.pointerId,
      start: { x: event.clientX, y: event.clientY },
      scale,
      origin: { x: table.x, y: table.y },
    };
    this.selectedId.set(table.id);
  }

  protected onTablePointerMove(event: PointerEvent): void {
    const drag = this.tableDrag;
    if (!drag || event.pointerId !== drag.pointerId) {
      return;
    }
    const { x, y } = this.planDelta(drag, event);
    const index = this.store.tables().findIndex((table) => table.id === drag.id);
    this.store.moveTable(index, drag.origin.x + x, drag.origin.y + y);
  }

  /** Soltar, cancelar o perder la captura. */
  protected onTablePointerEnd(event: PointerEvent): void {
    const drag = this.tableDrag;
    if (!drag || event.pointerId !== drag.pointerId) {
      return;
    }
    drag.element.releasePointerCapture?.(event.pointerId);
    this.tableDrag = null;
  }

  /**
   * Teclado sobre una mesa enfocada: las flechas la mueven GRID (10) y Supr la borra (con confirmación si ya está
   * guardada); Escape quita la selección. Enter y Espacio los trata el plano. Solo escucha el elemento del plano:
   * las teclas de campos como el nombre de la mesa no llegan aquí.
   */
  protected onTableKeydown(event: KeyboardEvent): void {
    if (event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }
    const element = this.tableElement(event);
    if (!element) {
      return;
    }
    const id = this.tableIdOf(element);
    const index = this.store.tables().findIndex((table) => table.id === id);
    const table = this.store.tables()[index];
    if (!table) {
      return;
    }
    const arrow = this.arrowVector(event.key);
    if (arrow) {
      event.preventDefault();
      this.selectedId.set(id);
      this.store.moveTable(index, table.x + arrow.x * GRID, table.y + arrow.y * GRID);
    } else if (event.key === 'Delete') {
      event.preventDefault();
      this.requestDelete(id);
    } else if (event.key === 'Escape') {
      this.selectedId.set(null);
    }
  }

  protected rename(event: Event): void {
    this.store.renameTable(this.selectedIndex(), (event.target as HTMLInputElement).value);
  }

  protected setSeats(event: Event): void {
    this.store.setTableSeats(
      this.selectedIndex(),
      Number((event.target as HTMLSelectElement).value),
    );
  }

  protected setTableShape(shape: TableShape): void {
    this.store.setTableShape(this.selectedIndex(), shape);
  }

  protected rotateSelected(): void {
    this.store.rotateTable(this.selectedIndex());
  }

  /** Una mesa nueva se quita sin más; una que ya está en el servidor (id positivo) pregunta antes. */
  protected requestDelete(id: number | null): void {
    if (id === null) {
      return;
    }
    if (id > 0) {
      this.dialog.set({ kind: 'delete', id });
      return;
    }
    this.removeTable(id);
  }

  protected confirmDelete(): void {
    const current = this.dialog();
    this.dialog.set(null);
    if (current?.kind === 'delete') {
      this.removeTable(current.id);
    }
  }

  private removeTable(id: number): void {
    this.store.removeTable(this.store.tables().findIndex((table) => table.id === id));
    if (this.selectedId() === id) {
      this.selectedId.set(null);
    }
  }

  // --- Guardar y publicar ---

  protected async save(): Promise<void> {
    const label = this.selected()?.label.trim();
    const wasPublished = this.store.published();
    if (!(await this.store.save())) {
      return;
    }
    // Las mesas nuevas ya tienen su id real: la seleccionada se vuelve a encontrar por su nombre, que es único.
    const same = this.store.tables().find((table) => table.label.trim() === label);
    this.selectedId.set(same?.id ?? null);
    this.say(
      wasPublished && !this.store.published()
        ? 'Plano guardado. Has cambiado la forma del local, así que ha vuelto a borrador: publícalo de nuevo.'
        : 'Plano guardado.',
    );
  }

  protected async publish(): Promise<void> {
    if (await this.store.publish()) {
      this.say('Plano publicado.');
    }
  }

  private say(text: string): void {
    this.infoState.set({
      text,
      room: this.store.room(),
      tables: this.store.tables(),
      theme: this.store.theme(),
    });
  }

  // --- Salir con cambios sin guardar ---

  /** Para `leaveEditorGuard`: sin cambios se sale; con ellos, pregunta en la página y espera la respuesta. */
  confirmLeave(): boolean | Promise<boolean> {
    // Con una petición en curso no se sale: la respuesta de este plano no debe cargarse bajo la URL de otro.
    if (this.store.saving() || this.store.publishing()) {
      this.say('Espera a que termine de guardar antes de salir.');
      return false;
    }
    if (!this.store.dirty()) {
      return true;
    }
    // Una pregunta anterior sin contestar (otra navegación) se da por cancelada.
    this.answerLeave(false);
    return new Promise<boolean>((resolve) => this.dialog.set({ kind: 'leave', resolve }));
  }

  protected answerLeave(leave: boolean): void {
    const current = this.dialog();
    if (current?.kind === 'leave') {
      this.dialog.set(null);
      current.resolve(leave);
    }
  }

  /** Escape en el diálogo: la respuesta segura (seguir editando, no borrar). */
  protected dismissDialog(): void {
    if (this.dialog()?.kind === 'leave') {
      this.answerLeave(false);
    } else {
      this.dialog.set(null);
    }
  }

  protected onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.store.dirty()) {
      event.preventDefault();
    }
  }

  // --- Utilidades ---

  /** Desplazamiento del puntero desde que se agarró, en unidades de plano, con la conversión del momento de agarrar. */
  private planDelta(drag: { start: Point; scale: ScreenToPlan }, event: PointerEvent): Point {
    const screenX = event.clientX - drag.start.x;
    const screenY = event.clientY - drag.start.y;
    const { a, b, c, d } = drag.scale;
    return { x: a * screenX + c * screenY, y: b * screenX + d * screenY };
  }

  /** Grupo de mesa (`data-table-id`) sobre el que ocurrió el evento. */
  private tableElement(event: Event): Element | null {
    const target = event.target;
    return target instanceof Element ? target.closest('[data-table-id]') : null;
  }

  private tableIdOf(element: Element): number {
    return Number(element.getAttribute('data-table-id'));
  }

  private arrowVector(key: string): Point | null {
    switch (key) {
      case 'ArrowRight':
        return { x: 1, y: 0 };
      case 'ArrowLeft':
        return { x: -1, y: 0 };
      case 'ArrowUp':
        return { x: 0, y: -1 };
      case 'ArrowDown':
        return { x: 0, y: 1 };
      default:
        return null;
    }
  }

  /** Pantalla a plano con la inversa de la matriz actual del SVG; null si el navegador no la da. */
  private screenToPlan(): ScreenToPlan | null {
    const matrix = this.overlay()?.nativeElement.getScreenCTM?.();
    if (!matrix) {
      return null;
    }
    const { a, b, c, d } = matrix.inverse();
    return { a, b, c, d };
  }
}

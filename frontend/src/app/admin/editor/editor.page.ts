import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { EMPTY, Subject, catchError, map, merge, switchMap, tap } from 'rxjs';
import { AdminPlanControllerService } from '../../core/api/services/admin-plan-controller.service';
import { Point, RoomShape, STEP } from '../../plano/geometry';
import {
  PlanoComponent,
  PlanoFrame,
  frameViewBox,
  planoFrame,
  planoViewBox,
} from '../../plano/plano.component';
import { EditorStore } from './editor.store';
import { Handle, handlesFor } from './room-handles';

export type EditorStatus = 'loading' | 'ready' | 'notFound' | 'error';

/** Formas del local en el orden en que se ofrecen. */
const SHAPES: readonly { shape: RoomShape; name: string }[] = [
  { shape: 'SQUARE', name: 'Cuadrada' },
  { shape: 'RECTANGLE', name: 'Alargada' },
  { shape: 'L', name: 'En L' },
  { shape: 'U', name: 'En U' },
  { shape: 'T', name: 'En T' },
];

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

/**
 * `/panel/:slug/plano`: forma del local. Se cambia con los botones de forma, el giro y los tiradores del contorno
 * (ratón, táctil o flechas). El arrastre solo toca el estado local: nada llama a la API hasta guardar.
 */
@Component({
  selector: 'app-editor-page',
  imports: [PlanoComponent, RouterLink],
  providers: [EditorStore],
  templateUrl: './editor.page.html',
  styleUrl: './editor.page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorPage {
  protected readonly store = inject(EditorStore);
  private readonly api = inject(AdminPlanControllerService);

  protected readonly status = signal<EditorStatus>('loading');
  protected readonly shapes = SHAPES;
  protected readonly planName = signal('');
  protected readonly dragging = signal<string | null>(null);

  private readonly slug = signal('');
  private readonly retries = new Subject<void>();
  private readonly overlay = viewChild<ElementRef<SVGSVGElement>>('overlay');
  private drag: Drag | null = null;

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

  /** Mesas que se salen del local o quedan pegadas a la pared con la forma actual. */
  protected readonly misplacedTables = computed(() => {
    const labels = this.store
      .problems()
      .filter((problem) => problem.code === 'OUT_OF_ROOM')
      .map((problem) => problem.label ?? '');
    return Array.from(new Set(labels));
  });

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
    const screenX = event.clientX - drag.start.x;
    const screenY = event.clientY - drag.start.y;
    const { a, b, c, d } = drag.scale;
    this.store.dragHandle(drag.handle, a * screenX + c * screenY, b * screenX + d * screenY);
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

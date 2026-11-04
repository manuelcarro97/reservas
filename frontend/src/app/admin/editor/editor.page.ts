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
import { PlanoComponent, planoViewBox } from '../../plano/plano.component';
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

/** Arrastre en curso: el tirador agarrado y dónde estaba el puntero (en unidades de plano) al empezar. */
interface Drag {
  handle: Handle;
  pointerId: number;
  origin: Point;
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
  protected readonly dragging = signal<Handle['kind'] | null>(null);

  private readonly slug = signal('');
  private readonly retries = new Subject<void>();
  private readonly overlay = viewChild<ElementRef<SVGSVGElement>>('overlay');
  private drag: Drag | null = null;

  /** Mismo `viewBox` que `<app-plano>`: la capa de tiradores y el plano comparten coordenadas. */
  protected readonly viewBox = computed(() => planoViewBox(this.store.room()));
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

  protected onPointerDown(event: PointerEvent, handle: Handle): void {
    if (event.button !== 0) {
      return;
    }
    const origin = this.toPlan(event);
    if (!origin) {
      return;
    }
    event.preventDefault();
    // La captura hace que el arrastre siga llegando al tirador aunque el puntero salga de él.
    (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
    this.drag = { handle, pointerId: event.pointerId, origin };
    this.dragging.set(handle.kind);
    this.store.beginDrag();
  }

  protected onPointerMove(event: PointerEvent): void {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointerId) {
      return;
    }
    const point = this.toPlan(event);
    if (point) {
      // Desplazamiento total desde que se agarró: redondear cada movimiento suelto dejaría el tirador quieto.
      this.store.dragHandle(drag.handle, point.x - drag.origin.x, point.y - drag.origin.y);
    }
  }

  protected onPointerEnd(event: PointerEvent): void {
    if (!this.drag || event.pointerId !== this.drag.pointerId) {
      return;
    }
    (event.currentTarget as Element).releasePointerCapture?.(event.pointerId);
    this.drag = null;
    this.dragging.set(null);
    this.store.endDrag();
  }

  /** Flechas: derecha y arriba agrandan, izquierda y abajo achican, de STEP en STEP. */
  protected onKeydown(event: KeyboardEvent, handle: Handle): void {
    const sign = this.keySign(event.key);
    if (sign === 0) {
      return;
    }
    // Sin esto las flechas desplazan la página.
    event.preventDefault();
    this.store.setHandleValue(handle, this.store.room()[handle.kind] + sign * STEP);
  }

  private keySign(key: string): number {
    switch (key) {
      case 'ArrowRight':
      case 'ArrowUp':
        return 1;
      case 'ArrowLeft':
      case 'ArrowDown':
        return -1;
      default:
        return 0;
    }
  }

  /** Pantalla a plano con la inversa de la matriz del SVG; null si el navegador no la da. */
  private toPlan(event: PointerEvent): Point | null {
    const matrix = this.overlay()?.nativeElement.getScreenCTM?.();
    if (!matrix) {
      return null;
    }
    const inverse = matrix.inverse();
    return {
      x: inverse.a * event.clientX + inverse.c * event.clientY + inverse.e,
      y: inverse.b * event.clientX + inverse.d * event.clientY + inverse.f,
    };
  }
}

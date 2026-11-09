import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { longDateParts } from '../../core/time';
import { MeStore } from '../me.store';
import { FeedService } from '../notifications/feed.service';
import { ReservationActions } from '../reservations/reservation-actions';
import { HomePendingComponent } from './home-pending.component';
import { HomePlanCardComponent } from './home-plan-card.component';
import { HomeSettingsComponent } from './home-settings.component';
import { HomeWeekComponent } from './home-week.component';
import { shiftLoad, todayFigures } from './home-figures';
import { HomeStore } from './home.store';

/** "2 h 40 min", "2 h" o "40 min". */
function durationText(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) {
    return `${rest} min`;
  }
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/**
 * `/panel/:slug/inicio`: la entrada por defecto del panel, un resumen del día del plano actual: las cifras de hoy,
 * la tarjeta del plano, las pendientes con sus acciones, la configuración y la semana. Cada parte se lee por su lado
 * y, si falla, solo ella lo dice.
 */
@Component({
  selector: 'app-home-page',
  imports: [
    HomePendingComponent,
    HomePlanCardComponent,
    HomeSettingsComponent,
    HomeWeekComponent,
    RouterLink,
  ],
  providers: [HomeStore, ReservationActions],
  templateUrl: './home.page.html',
  styleUrl: './home.page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // `fit`: en un escritorio normal Inicio cabe en la ventana sin scroll de página (ver el CSS).
  host: { class: 'rise-stagger fit' },
})
export class HomePage {
  protected readonly store = inject(HomeStore);
  private readonly me = inject(MeStore);
  private readonly origin = inject(DOCUMENT).location.origin;

  private readonly params = inject(ActivatedRoute).paramMap;
  private readonly slug = toSignal(this.params.pipe(map((params) => params.get('slug') ?? '')), {
    initialValue: '',
  });

  /** Nombre del plano; vacío hasta que llega la lista de planos del dueño (llega antes que el plano). */
  protected readonly planName = computed(
    () => this.me.plans().find((plan) => plan.slug === this.slug())?.name ?? '',
  );

  protected readonly publicUrl = computed(() => `${this.origin}/r/${this.slug()}`);

  /** Título: `lunes` y `9 de noviembre`, de la fecha de hoy en la zona del plano. */
  protected readonly title = computed(() => {
    const { weekday, day } = longDateParts(this.store.today());
    return { weekday: weekday.toLowerCase(), day };
  });

  /** Cifras de hoy; `null` mientras se piden las reservas de hoy. */
  protected readonly figures = computed(() => {
    const rows = this.store.todayRows();
    return rows === null ? null : todayFigures(rows, this.store.capacity());
  });

  protected readonly pendingCounts = computed(() => ({
    today: this.store.pendingToday().length,
    later: this.store.pendingLater().length,
  }));

  /** Primer cierre de hoy en adelante, para la tarjeta de configuración. */
  protected readonly nextClosure = computed(
    () => [...this.store.upcomingClosures()].sort()[0] ?? null,
  );
  protected readonly closureStatus = computed(() =>
    this.store.partFailed().has('closures')
      ? 'failed'
      : this.store.partLoading().has('closures')
        ? 'loading'
        : 'ready',
  );

  /** Las dos últimas cifras: el próximo turno y las mesas libres en él. `null` si no hay próximo turno. */
  protected readonly nextShift = computed(() => {
    const next = this.store.next();
    if (!next) {
      return null;
    }
    const name = next.shift.name ?? 'Turno';
    const time = (next.shift.start ?? '').slice(0, 5);
    const weekday = longDateParts(next.date).weekday;
    const rows = next.day === 'today' ? this.store.todayRows() : this.store.nextRows();
    const load = rows === null ? null : shiftLoad(rows, next.shift, this.store.tableCount());
    // El nombre del turno va tal cual, sin artículo: lo pone el dueño ("Cena", "Noche", "Mediodía").
    const when =
      next.day === 'today'
        ? ''
        : next.day === 'tomorrow'
          ? 'mañana, '
          : `${weekday.toLowerCase()}, `;
    return {
      value:
        next.day === 'today'
          ? `${name} · ${time}`
          : `${next.day === 'tomorrow' ? 'Mañana' : weekday} · ${name} ${time}`,
      sub:
        next.minutesToStart === null
          ? 'hoy no quedan turnos'
          : `empieza en ${durationText(next.minutesToStart)}`,
      freeKicker: `Mesas libres · ${when}${name}`,
      load,
      free: load === null ? 0 : load.total - load.occupied,
      occupancy:
        load === null || load.total === 0 ? 0 : Math.round((load.occupied / load.total) * 100),
    };
  });

  constructor() {
    // Cambiar de plano desde la cabecera reutiliza esta página: se recarga con cada slug, no solo con el primero.
    this.params
      .pipe(takeUntilDestroyed())
      .subscribe((params) => this.store.load(params.get('slug') ?? ''));

    // Sin el marco del panel no hay servicio de avisos (opcional): la página sigue funcionando, sin recarga en vivo.
    inject(FeedService, { optional: true })
      ?.events.pipe(takeUntilDestroyed())
      .subscribe((event) => {
        // Mientras carga el plano no hay nada que releer: la propia carga ya trae lo último.
        if (event.restaurantSlug === this.slug() && this.store.status() === 'ready') {
          this.store.refresh();
        }
      });
  }

  private readonly pendingCard = viewChild(HomePendingComponent, { read: ElementRef });

  /** La cifra Pendientes lleva a su tarjeta: se desplaza hasta ella y le da el foco (no es un `href="#…"`: `<base href="/">`). */
  protected goToPending(): void {
    const card = this.pendingCard()?.nativeElement as HTMLElement | undefined;
    card?.scrollIntoView({ block: 'nearest' });
    card?.focus();
  }

  protected retry(): void {
    this.store.load(this.slug());
  }

  protected refresh(): void {
    this.store.refresh();
  }
}

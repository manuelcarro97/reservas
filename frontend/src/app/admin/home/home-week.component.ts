import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { calendarLeaf, longDateParts } from '../../core/time';
import { DayTile } from './home-figures';
import { HomeStore } from './home.store';

/** Un turno de una tarjeta: su barra de mesas ocupadas. */
interface ShiftView {
  id: number | undefined;
  name: string;
  occupied: number;
  total: number;
  /** Ancho de la barra, de 0 a 100. */
  percent: number;
  /** Todas las mesas ocupadas: la barra va en rojo. */
  full: boolean;
  /** Reservas activas sin mesa (modo "asigna el local"). */
  unassigned: number;
}

/** Lo que pinta la tarjeta de un día. */
interface DayView {
  date: string;
  /** `Lun 9`. */
  label: string;
  today: boolean;
  past: boolean;
  closed: boolean;
  /** `2 pendientes`, o `null` si no hay. */
  pendingText: string | null;
  shifts: ShiftView[];
  /** `5 reservas · 17 personas`, `1 reserva · 2 personas` o `sin reservas`. */
  footer: string;
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** `2026-11-09` → `{ day: '9', month: 'noviembre' }`. */
function dayAndMonth(isoDate: string): { day: string; month: string } {
  const [day, month] = longDateParts(isoDate).day.split(' de ');
  return { day, month };
}

function viewOf(tile: DayTile): DayView {
  return {
    date: tile.date,
    // El día de la semana va con tres letras ("Mié", "Sáb") y el del mes sin cero a la izquierda.
    label: `${longDateParts(tile.date).weekday.slice(0, 3)} ${calendarLeaf(tile.date).day}`,
    today: tile.isToday,
    past: tile.isPast,
    closed: tile.closed,
    pendingText: tile.pending > 0 ? plural(tile.pending, 'pendiente', 'pendientes') : null,
    shifts: tile.shifts.map((load) => ({
      id: load.shift.id,
      name: load.shift.name ?? 'Turno',
      occupied: load.occupied,
      total: load.total,
      percent: load.total === 0 ? 0 : Math.round((load.occupied / load.total) * 100),
      full: load.total > 0 && load.occupied >= load.total,
      unassigned: load.unassigned,
    })),
    footer:
      tile.reservations === 0
        ? 'sin reservas'
        : `${plural(tile.reservations, 'reserva', 'reservas')} · ${plural(tile.guests, 'persona', 'personas')}`,
  };
}

/**
 * Tarjeta "Esta semana" de Inicio: siete días de lunes a domingo, cada uno con la ocupación de sus turnos (mesas
 * ocupadas de las del plano). Un día abierto lleva a Reservas en esa fecha (también los ya pasados); uno cerrado no.
 */
@Component({
  selector: 'app-home-week',
  imports: [NgTemplateOutlet, RouterLink],
  templateUrl: './home-week.component.html',
  styleUrl: './home-week.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sheet week-sheet' },
})
export class HomeWeekComponent {
  protected readonly store = inject(HomeStore);

  protected readonly slug = computed(() => this.store.plan()?.slug ?? '');

  protected readonly days = computed(() => (this.store.week() ?? []).map(viewOf));

  /**
   * La semana falla si falla su lectura. Si no ha llegado y falló algo de lo que depende (las reservas de hoy o los
   * cierres, sin los que no se sabe qué días abren) tampoco se puede pintar: se dice en vez de quedarse en "Cargando…".
   */
  protected readonly failed = computed(() => {
    const failed = this.store.partFailed();
    return (
      failed.has('week') ||
      (this.store.week() === null && (failed.has('today') || failed.has('closures')))
    );
  });

  /** Se anuncia como alerta salvo que la causa sea la lectura de hoy: esa ya la anuncia la tarjeta de las cifras. */
  protected readonly announced = computed(() => {
    const failed = this.store.partFailed();
    return failed.has('week') || failed.has('closures');
  });

  /** `del 9 al 15 de noviembre`, o `del 26 de octubre al 1 de noviembre` si la semana cruza de mes. */
  protected readonly range = computed(() => {
    const dates = this.store.weekDates();
    const from = dayAndMonth(dates[0]);
    const to = dayAndMonth(dates[dates.length - 1]);
    return from.month === to.month
      ? `del ${from.day} al ${to.day} de ${to.month}`
      : `del ${from.day} de ${from.month} al ${to.day} de ${to.month}`;
  });
}

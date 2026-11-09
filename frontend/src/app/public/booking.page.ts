import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { EmbedMode } from '../core/embed-mode';
import { PlanoComponent } from '../plano/plano.component';
import { THEMES } from '../plano/themes';
import { BookingStore } from './booking.store';
import { PublicTitle } from './public-title.service';

/** Página pública `/r/:slug`: el cliente elige fecha, personas, turno y (en elección libre) mesa, y reserva. */
@Component({
  selector: 'app-booking-page',
  imports: [PlanoComponent, RouterLink],
  providers: [BookingStore],
  templateUrl: './booking.page.html',
  styleUrl: './booking.page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // El tema del plano solo aporta su color de acento (el filete de las hojas); el resto sigue los tokens del sistema.
  host: {
    '[style.--accent]': 'colors().cushA',
  },
})
export class BookingPage {
  protected readonly store = inject(BookingStore);
  /** Con `?embed=1` no hay cabecera con el nombre del local: la página lo pone ella. */
  protected readonly embedded = inject(EmbedMode).embedded;

  protected readonly colors = computed(() => THEMES[this.store.theme()]);
  protected readonly partySizes = computed(() =>
    Array.from({ length: this.store.maxPartySize() }, (_, index) => index + 1),
  );
  /** El plano de mesas solo se pinta al elegir mesa (elección libre) y ya con turno: si no, una sola columna. */
  protected readonly showsPlano = computed(
    () => this.store.freeChoice() && this.store.shiftId() !== null,
  );

  constructor() {
    inject(ActivatedRoute)
      .paramMap.pipe(takeUntilDestroyed())
      .subscribe((params) => this.store.load(params.get('slug') ?? ''));

    // La cabecera del marco público muestra el nombre del local mientras esta página esté abierta.
    const title = inject(PublicTitle);
    effect(() => title.name.set(this.store.plan()?.name ?? null));
    inject(DestroyRef).onDestroy(() => title.name.set(null));
  }

  protected onDateChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.store.setDate(input.value);
    // Si el valor no vale (campo vaciado o fuera de rango) el store lo ignora: el campo vuelve a la fecha que se reserva.
    input.value = this.store.date();
  }

  protected onPartySizeChange(event: Event): void {
    this.store.setPartySize(Number((event.target as HTMLSelectElement).value));
  }

  protected onName(event: Event): void {
    this.store.customerName.set((event.target as HTMLInputElement).value);
  }

  protected onPhone(event: Event): void {
    this.store.customerPhone.set((event.target as HTMLInputElement).value);
  }

  protected onSubmit(event: Event): void {
    event.preventDefault();
    this.store.submit();
  }
}

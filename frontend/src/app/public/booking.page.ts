import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PlanoComponent } from '../plano/plano.component';
import { THEMES } from '../plano/themes';
import { BookingStore } from './booking.store';
import { PoweredByComponent } from './powered-by.component';

/** Página pública `/r/:slug`: el cliente elige fecha, personas, turno y (en elección libre) mesa, y reserva. */
@Component({
  selector: 'app-booking-page',
  imports: [PlanoComponent, PoweredByComponent, RouterLink],
  providers: [BookingStore],
  templateUrl: './booking.page.html',
  styleUrl: './booking.page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[style.--page]': 'colors().page',
    '[style.--sheet]': 'colors().sheet',
    '[style.--ink]': 'colors().ink',
    '[style.--muted]': 'colors().muted',
    '[style.--line-ui]': 'colors().lineUi',
    '[style.--accent]': 'colors().cushA',
  },
})
export class BookingPage {
  protected readonly store = inject(BookingStore);

  protected readonly colors = computed(() => THEMES[this.store.theme()]);
  protected readonly partySizes = computed(() =>
    Array.from({ length: this.store.maxPartySize() }, (_, index) => index + 1),
  );

  constructor() {
    inject(ActivatedRoute)
      .paramMap.pipe(takeUntilDestroyed())
      .subscribe((params) => this.store.load(params.get('slug') ?? ''));
  }

  protected onDateChange(event: Event): void {
    this.store.setDate((event.target as HTMLInputElement).value);
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

import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { ActionFailure } from './admin-errors';

/** Aviso de error de una acción del panel, con la lista de reservas que la impiden (con tope de altura y scroll). */
@Component({
  selector: 'app-action-failure',
  template: `
    @if (failure(); as problem) {
      <div class="error" role="alert">
        <p>{{ problem.message }}</p>
        @if (problem.reservations.length > 0) {
          <ul>
            @for (code of problem.reservations; track code) {
              <li>{{ code }}</li>
            }
          </ul>
        }
      </div>
    }
  `,
  styles: `
    .error {
      margin: 0 0 16px;
      padding: 10px 14px;
      border: 1px solid var(--rule);
      border-left: 2px solid var(--bad);
      background: color-mix(in srgb, var(--bad) 5%, var(--paper));
      color: var(--ink-2);
      font-size: 13px;
    }

    p {
      margin: 0;
    }

    /* Los códigos de las reservas que lo impiden, en mono y en línea; con tope de altura y scroll. */
    ul {
      display: flex;
      flex-wrap: wrap;
      gap: 4px 14px;
      max-height: 10rem;
      overflow-y: auto;
      margin: 6px 0 0;
      padding: 0;
      color: var(--ink);
      font: 12px/18px var(--mono);
      list-style: none;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActionFailureComponent {
  readonly failure = input<ActionFailure | null>(null);
}

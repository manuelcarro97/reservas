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
      margin: 0 0 1rem;
      padding: 0.6rem 0.8rem;
      border-radius: 6px;
      background: #fde8e6;
      color: #8e1d14;
    }

    p {
      margin: 0;
    }

    ul {
      max-height: 10rem;
      overflow-y: auto;
      margin: 0.4rem 0 0;
      padding-left: 1.2rem;
      font-family: ui-monospace, monospace;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActionFailureComponent {
  readonly failure = input<ActionFailure | null>(null);
}

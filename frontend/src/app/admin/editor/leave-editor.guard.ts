import { inject } from '@angular/core';
import { CanDeactivateFn, Router } from '@angular/router';
import { SESSION_ENDED_STATE } from '../panel-exit.service';

/** Página que puede tener cambios sin guardar y pregunta antes de dejarlos. */
export interface ConfirmsLeaving {
  /** `true` si se puede salir; si hay cambios sin guardar, espera la respuesta del dueño en la propia página. */
  confirmLeave(): boolean | Promise<boolean>;
}

/**
 * Antes de salir del editor (otra sección, otro plano desde la cabecera, atrás del navegador), la página pregunta si
 * hay cambios sin guardar. Se vuelve a ejecutar al cambiar solo de plano (`:slug`) porque la página se reutiliza.
 *
 * No pregunta si la salida la provoca un cambio de sesión (`PanelExit.toLogin(true)`): esos cambios ya no se pueden
 * guardar con otro usuario y seguir en el editor dejaría su plano pintado bajo la sesión nueva.
 */
export const leaveEditorGuard: CanDeactivateFn<ConfirmsLeaving> = (page) => {
  const state = inject(Router).currentNavigation()?.extras.state;
  return state?.[SESSION_ENDED_STATE] === true || page.confirmLeave();
};

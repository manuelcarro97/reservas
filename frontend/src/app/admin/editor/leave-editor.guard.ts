import { CanDeactivateFn } from '@angular/router';

/** Página que puede tener cambios sin guardar y pregunta antes de dejarlos. */
export interface ConfirmsLeaving {
  /** `true` si se puede salir; si hay cambios sin guardar, espera la respuesta del dueño en la propia página. */
  confirmLeave(): boolean | Promise<boolean>;
}

/**
 * Antes de salir del editor (otra sección, otro plano desde la cabecera, atrás del navegador), la página pregunta si
 * hay cambios sin guardar. Se vuelve a ejecutar al cambiar solo de plano (`:slug`) porque la página se reutiliza.
 */
export const leaveEditorGuard: CanDeactivateFn<ConfirmsLeaving> = (page) => page.confirmLeave();

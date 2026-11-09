import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';

/** Clave del `state` de la navegación a `/entrar` cuando la sesión ya no es la del panel abierto. */
export const SESSION_ENDED_STATE = 'sessionEnded';

/**
 * Única salida del panel a `/entrar`. Cerrar sesión, borrar la cuenta y un cambio de sesión en otra pestaña pueden
 * coincidir en el tiempo: mientras una navegación está en curso, las demás reutilizan la misma. Al terminar se
 * olvida, para que un nuevo intento tras un "me quedo" del editor navegue de verdad.
 */
@Injectable({ providedIn: 'root' })
export class PanelExit {
  private readonly router = inject(Router);
  private navigation: Promise<boolean> | null = null;

  /**
   * Va a `/entrar`. `sessionEnded` avisa a los guards de salida (`leaveEditorGuard`) de que la sesión ya no es la del
   * panel: no tiene sentido preguntar por cambios que no se pueden guardar con otro usuario. Salir a mano no lo pone,
   * y el editor sigue preguntando.
   */
  toLogin(sessionEnded = false): Promise<boolean> {
    this.navigation ??= this.router
      .navigateByUrl('/entrar', { state: { [SESSION_ENDED_STATE]: sessionEnded } })
      .finally(() => (this.navigation = null));
    return this.navigation;
  }
}

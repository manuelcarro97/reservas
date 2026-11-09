import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

/** Clave del `state` de la navegación a `/entrar` cuando la sesión ya no es la del panel abierto. */
export const SESSION_ENDED_STATE = 'sessionEnded';

interface Exit {
  sessionEnded: boolean;
  done: Promise<boolean>;
}

/**
 * Única salida del panel a `/entrar`. Cerrar sesión, borrar la cuenta y un cambio de sesión en otra pestaña pueden
 * coincidir en el tiempo: mientras una navegación está en curso, las demás reutilizan la misma. Al terminar se
 * olvida, para que un nuevo intento tras un "me quedo" del editor navegue de verdad.
 */
@Injectable({ providedIn: 'root' })
export class PanelExit {
  private readonly router = inject(Router);
  private exit: Exit | null = null;

  /**
   * Salir a mano falló al cerrar la sesión, que se hace después de salir del panel: ya no hay cabecera donde decirlo,
   * así que lo cuenta la página de acceso.
   */
  readonly signOutFailed = signal(false);

  /**
   * Va a `/entrar` y dice si se llegó (`false` si una página, como el editor con cambios sin guardar, se negó a
   * dejarlo o la sustituyó otra navegación).
   *
   * `sessionEnded` avisa a los guards de salida (`leaveEditorGuard`) de que la sesión ya no es la del panel: no tiene
   * sentido preguntar por cambios que no se pueden guardar con otro usuario. Una salida con `sessionEnded` sustituye a
   * una en curso que no lo es (el editor esperando respuesta); salir a mano no lo pone y el editor pregunta.
   */
  toLogin(sessionEnded = false): Promise<boolean> {
    if (this.exit && (!sessionEnded || this.exit.sessionEnded)) {
      return this.exit.done;
    }
    const exit: Exit = { sessionEnded, done: Promise.resolve(false) };
    exit.done = this.router
      .navigateByUrl('/entrar', { state: { [SESSION_ENDED_STATE]: sessionEnded } })
      .finally(() => {
        if (this.exit === exit) {
          this.exit = null;
        }
      });
    this.exit = exit;
    return exit.done;
  }
}

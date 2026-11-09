import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/** Deja pasar solo con sesión iniciada; si no, lleva a `/entrar`. Espera a que el SDK restaure la sesión guardada. */
export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  await auth.whenReady();
  return auth.user() ? true : router.parseUrl('/entrar');
};

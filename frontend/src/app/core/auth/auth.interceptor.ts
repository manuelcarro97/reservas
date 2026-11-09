import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { API_BASE_URL } from '../config';
import { AuthService } from './auth.service';

/**
 * Añade `Authorization: Bearer <token de Firebase>` solo a las peticiones a `API_BASE_URL + /api/v1/admin/`.
 * Cualquier otra URL (rutas públicas de la API, otros orígenes) sale intacta y ni siquiera pide el token.
 * `AuthService` se inyecta solo para las rutas admin: así el resto de la aplicación no carga Firebase.
 *
 * - Si el token no se puede obtener, la petición sigue sin cabecera y el backend responde 401.
 * - Un 401 en una ruta admin (token caducado, cuenta borrada) cierra la sesión local y lleva a `/entrar`.
 */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const adminPrefix = `${inject(API_BASE_URL)}/api/v1/admin/`;
  if (!request.url.startsWith(adminPrefix)) {
    return next(request);
  }

  const auth = inject(AuthService);
  const router = inject(Router);
  return from(auth.idToken().catch(() => null)).pipe(
    switchMap((token) =>
      next(token ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : request),
    ),
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && error.status === 401) {
        // Sin esperar ni reintentar la petición fallida: el error llega igualmente a quien la lanzó.
        void auth
          .signOut()
          .catch(() => undefined)
          .then(() => router.navigateByUrl('/entrar'));
      }
      return throwError(() => error);
    }),
  );
};

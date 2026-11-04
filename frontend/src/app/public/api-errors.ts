import { HttpErrorResponse } from '@angular/common/http';

/** `code` del ProblemDetail (`application/problem+json`) con el que responde el backend. */
export function errorCode(error: HttpErrorResponse): string | undefined {
  return (error.error as { code?: string } | null)?.code;
}

/** Mensaje del 429 `RATE_LIMITED`, con la espera de `Retry-After` si llega. */
export function rateLimitedMessage(error: HttpErrorResponse): string {
  const seconds = Number.parseInt(error.headers?.get('Retry-After') ?? '', 10);
  if (!(seconds > 0)) {
    return 'Demasiados intentos. Espera un momento y vuelve a probar.';
  }
  return `Demasiados intentos. Vuelve a probar en ${seconds} ${seconds === 1 ? 'segundo' : 'segundos'}.`;
}

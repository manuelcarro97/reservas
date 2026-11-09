import { HttpErrorResponse } from '@angular/common/http';

/**
 * Cuerpo del error (`application/problem+json` del backend) como objeto. Las operaciones que el cliente generado
 * declara sin cuerpo (los DELETE) piden `responseType: 'text'` y entonces el cuerpo del error llega como texto
 * sin interpretar: se lee como JSON. Vacío si no es un objeto JSON.
 */
export function problemBody(error: HttpErrorResponse): Record<string, unknown> {
  let body: unknown = error.error;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return {};
    }
  }
  return typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
}

/** `code` del ProblemDetail (`application/problem+json`) con el que responde el backend. */
export function errorCode(error: HttpErrorResponse): string | undefined {
  const code = problemBody(error)['code'];
  return typeof code === 'string' ? code : undefined;
}

/** Mensaje del 429 `RATE_LIMITED`, con la espera de `Retry-After` si llega. */
export function rateLimitedMessage(error: HttpErrorResponse): string {
  const seconds = Number.parseInt(error.headers?.get('Retry-After') ?? '', 10);
  if (!(seconds > 0)) {
    return 'Demasiados intentos. Espera un momento y vuelve a probar.';
  }
  return `Demasiados intentos. Vuelve a probar en ${seconds} ${seconds === 1 ? 'segundo' : 'segundos'}.`;
}

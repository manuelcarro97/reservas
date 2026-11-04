import { HttpErrorResponse } from '@angular/common/http';
import { errorCode, problemBody, rateLimitedMessage } from '../core/api-errors';

/** Códigos de error del backend que el panel muestra con un texto propio. */
const MESSAGES: Record<string, string> = {
  PLAN_LIMIT_REACHED: 'Ya tienes el máximo de planos. Borra uno para poder crear otro.',
  PLAN_CREATION_LIMIT:
    'Has creado demasiados planos en las últimas 24 horas. Inténtalo de nuevo más tarde.',
  DEMO_READ_ONLY: 'La cuenta de demostración es de solo lectura.',
  ROOM_LOCKED:
    'No se puede cambiar la forma del local mientras haya reservas activas. Cancela estas reservas antes:',
  RESTAURANT_NOT_FOUND: 'Ese plano ya no existe.',
  SLUG_RESERVED: 'Ese enlace está reservado. Elige otro.',
  ALREADY_EXISTS: 'Ese enlace ya está en uso. Elige otro.',
  INVALID_REQUEST: 'El nombre o el enlace no son válidos. Revísalos.',
  PAYLOAD_TOO_LARGE: 'Los datos son demasiado largos. Revísalos.',
};

/**
 * Mensaje en español de un error de la API del panel. Primero el `code` (hay dos 429 distintos: `RATE_LIMITED` y
 * `PLAN_CREATION_LIMIT`); si no es un código conocido, `fallback`.
 */
export function adminErrorMessage(error: HttpErrorResponse, fallback: string): string {
  const code = errorCode(error);
  if (code === 'RATE_LIMITED') {
    return rateLimitedMessage(error);
  }
  return (code && MESSAGES[code]) || fallback;
}

/**
 * Códigos de las reservas que impiden un borrado (409 `PLAN_HAS_RESERVATIONS`) o un cambio de la forma del local
 * (409 `ROOM_LOCKED`), en la propiedad `reservations`.
 */
export function blockingReservations(error: HttpErrorResponse): string[] {
  const code = errorCode(error);
  if (code !== 'PLAN_HAS_RESERVATIONS' && code !== 'ROOM_LOCKED') {
    return [];
  }
  const codes = problemBody(error)['reservations'];
  return Array.isArray(codes)
    ? codes.filter((item): item is string => typeof item === 'string')
    : [];
}

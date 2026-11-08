import { HttpErrorResponse } from '@angular/common/http';
import { errorCode, problemBody, rateLimitedMessage } from '../core/api-errors';
import { LayoutProblem } from '../plano/geometry';

/** Códigos de error del backend que el panel muestra con un texto propio. */
const MESSAGES: Record<string, string> = {
  PLAN_LIMIT_REACHED: 'Ya tienes el máximo de planos. Borra uno para poder crear otro.',
  PLAN_CREATION_LIMIT:
    'Has creado demasiados planos en las últimas 24 horas. Inténtalo de nuevo más tarde.',
  DEMO_READ_ONLY: 'La cuenta de demostración es de solo lectura.',
  ROOM_LOCKED:
    'No se puede cambiar la forma del local mientras haya reservas activas. Cancela estas reservas antes:',
  TABLE_HAS_RESERVATIONS:
    'No se pueden quitar ni reducir estas mesas mientras haya reservas activas que dependan de ellas. Cancela estas reservas antes:',
  LAYOUT_INVALID: 'El servidor no acepta el plano. Revisa las mesas marcadas en rojo.',
  PLAN_NOT_PUBLISHABLE:
    'Para publicar, el plano necesita al menos una mesa y que todas quepan en el local.',
  RESTAURANT_NOT_FOUND: 'Ese plano ya no existe.',
  SLUG_RESERVED: 'Ese enlace está reservado. Elige otro.',
  ALREADY_EXISTS: 'Ese enlace ya está en uso. Elige otro.',
  INVALID_REQUEST: 'El nombre o el enlace no son válidos. Revísalos.',
  PAYLOAD_TOO_LARGE: 'Los datos son demasiado largos. Revísalos.',
  PLAN_HAS_RESERVATIONS:
    'No se puede borrar el plano mientras tenga reservas activas. Cancela estas reservas antes:',
  SHIFT_HAS_RESERVATIONS:
    'Este turno tiene reservas activas. Cancela estas reservas antes de cambiar su horario o borrarlo:',
  SHIFT_OVERLAP: 'Este turno se solapa con otro. Cambia las horas o los días.',
  SHIFT_LIMIT: 'Has llegado al máximo de 10 turnos. Borra uno para poder añadir otro.',
  SHIFT_NOT_FOUND: 'Ese turno ya no existe. Se ha actualizado la lista.',
  CLOSURE_HAS_RESERVATIONS:
    'Ese día tiene reservas activas. Cancélalas desde Reservas antes de cerrarlo.',
  CLOSURE_DATE_OUT_OF_RANGE: 'Solo se pueden cerrar días desde hoy hasta dentro de 90 días.',
  TELEGRAM_UNAVAILABLE: 'Telegram no está disponible en este servidor.',
};

/** Texto del 429 de las acciones del panel (reservas, turnos, días cerrados, ajustes). */
export const RATE_LIMITED_ACTIONS_MESSAGE = 'Demasiadas acciones seguidas, espera un momento';

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

/** 409 con la lista de reservas activas que lo causan, en la propiedad `reservations`. */
const RESERVATION_CONFLICTS = new Set([
  'PLAN_HAS_RESERVATIONS',
  'ROOM_LOCKED',
  'TABLE_HAS_RESERVATIONS',
  'SHIFT_HAS_RESERVATIONS',
  'CLOSURE_HAS_RESERVATIONS',
]);

/**
 * Códigos de las reservas que impiden un borrado (409 `PLAN_HAS_RESERVATIONS`), un cambio de la forma del local
 * (409 `ROOM_LOCKED`), quitar o reducir mesas (409 `TABLE_HAS_RESERVATIONS`), cambiar o borrar un turno (409
 * `SHIFT_HAS_RESERVATIONS`) o cerrar un día (409 `CLOSURE_HAS_RESERVATIONS`), en la propiedad `reservations`.
 * El backend aún no manda los códigos de un día cerrado: sin ellos la lista sale vacía.
 */
export function blockingReservations(error: HttpErrorResponse): string[] {
  const code = errorCode(error);
  if (!code || !RESERVATION_CONFLICTS.has(code)) {
    return [];
  }
  const codes = problemBody(error)['reservations'];
  return Array.isArray(codes)
    ? codes.filter((item): item is string => typeof item === 'string')
    : [];
}

/** Qué sale mal en una acción del panel, con los códigos de las reservas que la impiden si es el caso. */
export interface ActionFailure {
  message: string;
  reservations: string[];
}

/**
 * Fallo de una acción del panel (turnos, días cerrados, ajustes): cualquier 429 pide esperar con el texto común de
 * las acciones; el resto, el mensaje del `code` o `fallback`, y las reservas que lo causan.
 */
export function actionFailure(error: HttpErrorResponse, fallback: string): ActionFailure {
  return {
    message:
      error.status === 429 ? RATE_LIMITED_ACTIONS_MESSAGE : adminErrorMessage(error, fallback),
    reservations: blockingReservations(error),
  };
}

/**
 * Problemas del plano que devuelve el 422 `LAYOUT_INVALID` (propiedad `problems`). `tableIndex` es la posición de la
 * mesa en la petición. Se descarta lo que no tenga la forma esperada.
 */
export function layoutProblems(error: HttpErrorResponse): LayoutProblem[] {
  const problems = problemBody(error)['problems'];
  if (!Array.isArray(problems)) {
    return [];
  }
  return problems.flatMap((item: unknown): LayoutProblem[] => {
    if (typeof item !== 'object' || item === null) {
      return [];
    }
    const { tableIndex, label, code } = item as Record<string, unknown>;
    const index = tableIndex === null || typeof tableIndex === 'number' ? tableIndex : undefined;
    if (index === undefined || typeof code !== 'string') {
      return [];
    }
    return [{ tableIndex: index, label: typeof label === 'string' ? label : null, code }];
  });
}

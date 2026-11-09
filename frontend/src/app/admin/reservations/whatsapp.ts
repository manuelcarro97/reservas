import { formatDate } from '../../core/time';

/** Cifras mínimas de un teléfono con el que se puede abrir WhatsApp (un móvil español sin prefijo). */
const MIN_DIGITS = 9;
const SPAIN_PREFIX = '34';

/** Solo las cifras del teléfono, sin el `00` de las llamadas internacionales y con el 34 si son 9 cifras. */
function internationalDigits(phone: string): string {
  const digits = phone.replace(/\D/g, '').replace(/^00/, '');
  return digits.length === MIN_DIGITS ? SPAIN_PREFIX + digits : digits;
}

/**
 * Si hay un número real al que escribir. La cuenta demo enmascara los teléfonos de los visitantes (`•••78`): ahí no
 * hay enlace, y la acción se hace igual. Tampoco hay enlace si, quitado el `00` internacional, empieza por 0: ningún
 * prefijo de país ni móvil lo hace (los teléfonos de muestra de la demo son `000 000 00N`).
 */
export function canWhatsapp(phone: string): boolean {
  const digits = phone.replace(/\D/g, '');
  return (
    !phone.includes('•') &&
    digits.length >= MIN_DIGITS &&
    !digits.replace(/^00/, '').startsWith('0')
  );
}

/** Enlace `wa.me` con el texto ya escrito. El envío lo hace el dueño desde su móvil. */
export function whatsappLink(phone: string, text: string): string {
  return `https://wa.me/${internationalDigits(phone)}?text=${encodeURIComponent(text)}`;
}

export type MessageKind = 'confirm' | 'reject' | 'cancel';

export interface MessageInfo {
  customerName: string;
  restaurantName: string;
  /** `YYYY-MM-DD`. */
  date: string;
  shiftName: string;
  /** `HH:mm` o `HH:mm:ss`; las reservas anteriores a la hora de llegada no la tienen. */
  arrivalTime?: string;
  code: string;
}

/** Texto en español que el dueño envía al cliente al confirmar, rechazar o cancelar su reserva. */
export function reservationMessage(kind: MessageKind, info: MessageInfo): string {
  const when = info.arrivalTime
    ? `${formatDate(info.date)}, ${info.shiftName}, a las ${info.arrivalTime.slice(0, 5)}`
    : `${formatDate(info.date)}, ${info.shiftName}`;
  const greeting = `Hola ${info.customerName},`;
  const reservation = `en ${info.restaurantName} (${when})`;
  switch (kind) {
    case 'confirm':
      return `${greeting} tu reserva ${reservation} está confirmada. Tu código es ${info.code}. ¡Te esperamos!`;
    case 'reject':
      return `${greeting} lo sentimos, no hemos podido aceptar tu reserva ${reservation}. Código: ${info.code}. Si quieres, prueba con otro día u otro turno.`;
    case 'cancel':
      return `${greeting} hemos cancelado tu reserva ${reservation}. Código: ${info.code}. Si quieres, puedes reservar de nuevo.`;
  }
}

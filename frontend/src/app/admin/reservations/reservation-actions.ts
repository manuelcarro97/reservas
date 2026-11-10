import { HttpErrorResponse } from '@angular/common/http';
import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { AdminReservation } from '../../core/api/models/admin-reservation';
import { ReservationDetails } from '../../core/api/models/reservation-details';
import { AdminReservationControllerService } from '../../core/api/services/admin-reservation-controller.service';
import { errorCode } from '../../core/api-errors';
import { OPEN_WINDOW } from '../../core/open-window';
import { RATE_LIMITED_ACTIONS_MESSAGE, adminErrorMessage } from '../admin-errors';
import { MeStore } from '../me.store';
import { MessageKind, canWhatsapp, reservationMessage, whatsappLink } from './whatsapp';

/** Acciones que piden confirmación dentro de la página antes de llamar a la API. */
export type QuestionKind = 'reject' | 'cancel' | 'noShow';

export interface Question {
  kind: QuestionKind;
  reservation: AdminReservation;
}

export type ActionKind = 'confirm' | QuestionKind;

const GENERIC_ERROR = 'No se pudo completar la acción. Inténtalo de nuevo.';
export const CONFIRM_NEEDS_TABLE = 'Asigna una mesa antes de confirmar.';

/** Errores de las acciones sobre una reserva con texto propio. */
const ERROR_MESSAGES: Record<string, string> = {
  TABLE_REQUIRED: CONFIRM_NEEDS_TABLE,
  TABLE_TAKEN: 'Esa mesa ya está ocupada en este turno. Se ha actualizado el plano.',
  TABLE_TOO_SMALL: 'Esa mesa tiene menos plazas que personas en la reserva.',
  TABLE_NOT_FOUND: 'Esa mesa ya no existe. Se ha actualizado el plano.',
  INVALID_TRANSITION: 'Esa reserva ya no admite esa acción. Se ha actualizado la lista.',
  CONCURRENT_UPDATE: 'La reserva acaba de cambiar. Se ha actualizado la lista.',
  RESERVATION_NOT_FOUND: 'Esa reserva ya no existe. Se ha actualizado la lista.',
};

export const DONE_MESSAGES: Record<ActionKind, (name: string) => string> = {
  confirm: (name) => `Reserva de ${name} confirmada.`,
  reject: (name) => `Reserva de ${name} rechazada.`,
  cancel: (name) => `Reserva de ${name} cancelada.`,
  noShow: (name) => `${name} marcado como no presentado.`,
};

/** Estas respuestas significan que la reserva ya no está como la página la tenía: se cierra la asignación. */
const STALE_RESERVATION_CODES = [
  'RESERVATION_NOT_FOUND',
  'INVALID_TRANSITION',
  'CONCURRENT_UPDATE',
];

/**
 * Lo que `ReservationActions` necesita de la página que lo usa (Reservas, Inicio): qué vista está en pantalla, cómo
 * se vuelve a leer y qué hacer cuando una reserva pide mesa.
 */
export interface ActionHost {
  /** Contador de vistas de la página (sube en cada carga): una respuesta de otra vista no toca la pantalla. */
  viewToken(): number;
  /** Textos del mensaje al cliente si la respuesta del servidor no los trae. */
  messageFallback(reservation: AdminReservation): { restaurantName: string; shiftName: string };
  /** Vuelve a leer la pantalla: tras un éxito y tras 404, 409 y 422. */
  afterAction(): void;
  /** La reserva ya no es la de antes (éxito o `STALE_RESERVATION_CODES`): cierra lo que la página tuviera abierto sobre ella. */
  forget(reservation: AdminReservation): void;
  /** La reserva no tiene mesa (sin mesa al confirmar o `TABLE_REQUIRED`): la página decide cómo elegirla. */
  needsTable(reservation: AdminReservation, message: string): void;
  /** `TABLE_NOT_FOUND`: las mesas que la página tenía están viejas. */
  reloadPlan(): void;
}

/**
 * Confirmar, rechazar, cancelar y marcar no presentado, con la pregunta previa, el mensaje de WhatsApp al cliente y los
 * errores de siempre. Lo comparten las páginas del panel; cada una lo provee en su propio `providers` y le pasa su
 * `ActionHost` con `attach`.
 */
@Injectable()
export class ReservationActions {
  private readonly reservationsApi = inject(AdminReservationControllerService);
  private readonly openWindow = inject(OPEN_WINDOW);
  /** Sin el marco del panel no hay `MeStore`: entonces no se sabe si es la demo y se trata como un dueño normal. */
  private readonly me = inject(MeStore, { optional: true });
  private host: ActionHost | undefined;

  /**
   * Acciones en vuelo. Cambiar de plano no las cancela: la petición ya salió, el servidor la va a aplicar y el dueño
   * tiene que poder escribir al cliente. Solo se cancelan al cerrar la página.
   */
  private readonly actionRequests = new Subscription();

  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly notice = signal<string | null>(null);
  /**
   * Enlace de WhatsApp de la última acción, por si el navegador bloqueó la pestaña (`window.open` llega después de
   * una respuesta HTTP, ya no es un clic). Se quita con la siguiente acción o al cambiar de vista.
   */
  readonly whatsappUrl = signal<string | null>(null);
  readonly question = signal<Question | null>(null);

  /** Texto de la pregunta abierta y de su botón de confirmar. */
  readonly questionText = computed(() => {
    const question = this.question();
    if (!question) {
      return null;
    }
    const name = question.reservation.customerName ?? '';
    switch (question.kind) {
      case 'reject':
        return { text: `¿Rechazar la reserva de ${name}?`, yes: 'Sí, rechazar' };
      case 'cancel':
        return { text: `¿Cancelar la reserva de ${name}?`, yes: 'Sí, cancelar' };
      case 'noShow':
        return { text: `¿Marcar a ${name} como no presentado?`, yes: 'Sí, no se presentó' };
    }
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.actionRequests.unsubscribe());
  }

  attach(host: ActionHost): void {
    this.host = host;
  }

  confirm(reservation: AdminReservation): void {
    if (reservation.tableId === undefined || reservation.tableId === null) {
      // En modo asignado la reserva llega sin mesa: hay que elegirla antes de confirmar.
      this.requireHost().needsTable(reservation, CONFIRM_NEEDS_TABLE);
      return;
    }
    this.run(reservation, 'confirm');
  }

  ask(kind: QuestionKind, reservation: AdminReservation): void {
    this.resetMessages();
    this.question.set({ kind, reservation });
  }

  answerYes(): void {
    const question = this.question();
    this.question.set(null);
    if (question) {
      this.run(question.reservation, question.kind);
    }
  }

  dismissQuestion(): void {
    this.question.set(null);
  }

  /** Empieza una acción: limpia los mensajes y marca la página como ocupada. */
  begin(): void {
    this.resetMessages();
    this.busy.set(true);
  }

  resetMessages(): void {
    this.error.set(null);
    this.notice.set(null);
    this.whatsappUrl.set(null);
  }

  /**
   * Una acción falló: se muestra el motivo y, si el servidor vio otra cosa que la página, se vuelve a leer todo. `view`
   * es la vista en la que salió la acción: si ya no es la de la pantalla, no se toca nada.
   */
  fail(error: unknown, reservation: AdminReservation, view: number): void {
    const host = this.requireHost();
    if (view !== host.viewToken()) {
      return;
    }
    const failure = error as HttpErrorResponse;
    // Antes que `needsTable`: elegir mesa no se abre con una acción en vuelo.
    this.busy.set(false);
    const code = errorCode(failure);
    if (failure.status === 429) {
      this.error.set(RATE_LIMITED_ACTIONS_MESSAGE);
      return;
    }
    if (code === 'TABLE_REQUIRED') {
      host.needsTable(reservation, CONFIRM_NEEDS_TABLE);
    } else {
      this.error.set((code && ERROR_MESSAGES[code]) || adminErrorMessage(failure, GENERIC_ERROR));
    }
    if (code && STALE_RESERVATION_CODES.includes(code)) {
      host.forget(reservation);
    }
    if (code === 'TABLE_NOT_FOUND') {
      // Las mesas que la página tenía están viejas: hay que volver a leer el plano, no solo la ocupación.
      host.reloadPlan();
    }
    if (failure.status === 404 || failure.status === 409 || failure.status === 422) {
      host.afterAction();
    }
  }

  private run(reservation: AdminReservation, kind: ActionKind): void {
    const id = reservation.id;
    if (this.busy() || id === undefined) {
      return;
    }
    const host = this.requireHost();
    this.begin();
    const call =
      kind === 'confirm'
        ? this.reservationsApi.confirm({ id })
        : kind === 'noShow'
          ? this.reservationsApi.markNoShow({ id })
          : this.reservationsApi.cancel1({ id });
    const view = host.viewToken();
    // Si la respuesta llega con otro plano en pantalla, el texto del mensaje sigue siendo el del plano de la acción.
    const fallback = host.messageFallback(reservation);
    this.actionRequests.add(
      call.subscribe({
        next: (details) => {
          const current = view === host.viewToken();
          if (current) {
            this.busy.set(false);
            host.forget(reservation);
            this.notice.set(DONE_MESSAGES[kind](reservation.customerName ?? ''));
            host.afterAction();
          }
          // Al no presentado no se le escribe.
          if (kind !== 'noShow') {
            this.openWhatsapp(kind, reservation, details, fallback, current);
          }
        },
        error: (error: HttpErrorResponse) => this.fail(error, reservation, view),
      }),
    );
  }

  /**
   * Abre WhatsApp con el mensaje al cliente. No hay enlace sin un teléfono real: ni con la máscara que la demo pone a
   * los de los visitantes, ni en la cuenta demo, cuyos teléfonos de muestra tienen forma de móvil real. `current`
   * dice si la pantalla sigue siendo la del plano de la acción; si no, se abre la pestaña pero no se guarda el enlace
   * de respaldo (sería el de un cliente de otro plano).
   */
  private openWhatsapp(
    kind: MessageKind,
    reservation: AdminReservation,
    details: ReservationDetails,
    fallback: { restaurantName: string; shiftName: string },
    current: boolean,
  ): void {
    const phone = reservation.customerPhone ?? '';
    if (this.me?.demo() || !canWhatsapp(phone)) {
      return;
    }
    const date = details.date ?? reservation.date ?? '';
    const text = reservationMessage(kind, {
      customerName: reservation.customerName ?? '',
      restaurantName: details.restaurantName ?? fallback.restaurantName,
      date,
      shiftName: details.shiftName ?? fallback.shiftName,
      arrivalTime: details.arrivalTime ?? reservation.arrivalTime,
      code: details.code ?? reservation.code ?? '',
    });
    const url = whatsappLink(phone, text);
    if (current) {
      this.whatsappUrl.set(url);
    }
    this.openWindow(url);
  }

  private requireHost(): ActionHost {
    if (!this.host) {
      throw new Error('ReservationActions: falta llamar a attach() con la página que lo usa.');
    }
    return this.host;
  }
}

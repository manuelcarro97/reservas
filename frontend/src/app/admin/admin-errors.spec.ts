import { HttpErrorResponse } from '@angular/common/http';
import {
  RATE_LIMITED_ACTIONS_MESSAGE,
  actionFailure,
  adminErrorMessage,
  blockingReservations,
  layoutProblems,
} from './admin-errors';

function conflict(code: string, reservations?: string[]): HttpErrorResponse {
  return new HttpErrorResponse({ status: 409, error: { code, reservations } });
}

describe('admin errors', () => {
  it('ROOM_LOCKED tiene su mensaje y lista las reservas que lo bloquean', () => {
    const error = conflict('ROOM_LOCKED', ['KAFE1234', 'KAFE5678']);
    expect(adminErrorMessage(error, 'otro')).toContain('forma del local');
    expect(blockingReservations(error)).toEqual(['KAFE1234', 'KAFE5678']);
  });

  it('PLAN_HAS_RESERVATIONS sigue listando sus reservas', () => {
    expect(blockingReservations(conflict('PLAN_HAS_RESERVATIONS', ['A']))).toEqual(['A']);
  });

  it('TABLE_HAS_RESERVATIONS tiene su mensaje y lista las reservas que dependen de las mesas', () => {
    const error = conflict('TABLE_HAS_RESERVATIONS', ['KAFE1234']);
    expect(adminErrorMessage(error, 'otro')).toContain('reservas activas');
    expect(blockingReservations(error)).toEqual(['KAFE1234']);
  });

  it('LAYOUT_INVALID y PLAN_NOT_PUBLISHABLE tienen su mensaje', () => {
    const invalid = new HttpErrorResponse({ status: 422, error: { code: 'LAYOUT_INVALID' } });
    const unpublishable = new HttpErrorResponse({
      status: 422,
      error: { code: 'PLAN_NOT_PUBLISHABLE' },
    });
    expect(adminErrorMessage(invalid, 'otro')).toContain('rojo');
    expect(adminErrorMessage(unpublishable, 'otro')).toContain('al menos una mesa');
  });

  it('layoutProblems lee los problemas del 422 y descarta lo que no lo es', () => {
    const error = new HttpErrorResponse({
      status: 422,
      error: {
        code: 'LAYOUT_INVALID',
        problems: [
          { tableIndex: 1, label: '2', code: 'OVERLAP' },
          { tableIndex: null, label: null, code: 'INVALID_ROOM' },
          { tableIndex: 'x', code: 'OVERLAP' },
          { tableIndex: 2 },
          'basura',
          null,
        ],
      },
    });
    expect(layoutProblems(error)).toEqual([
      { tableIndex: 1, label: '2', code: 'OVERLAP' },
      { tableIndex: null, label: null, code: 'INVALID_ROOM' },
    ]);
    expect(layoutProblems(conflict('ROOM_LOCKED', ['A']))).toEqual([]);
    expect(layoutProblems(new HttpErrorResponse({ status: 422, error: 'texto' }))).toEqual([]);
  });

  it('otros códigos no listan reservas', () => {
    expect(blockingReservations(conflict('ALREADY_EXISTS', ['A']))).toEqual([]);
  });

  it('los conflictos de turnos y de días cerrados tienen su mensaje y listan las reservas', () => {
    const shift = conflict('SHIFT_HAS_RESERVATIONS', ['KAFE1']);
    expect(adminErrorMessage(shift, 'otro')).toContain('reservas activas');
    expect(blockingReservations(shift)).toEqual(['KAFE1']);

    const closure = conflict('CLOSURE_HAS_RESERVATIONS', ['KAFE2']);
    expect(adminErrorMessage(closure, 'otro')).toContain('reservas activas');
    expect(blockingReservations(closure)).toEqual(['KAFE2']);
    // El backend aún no manda los códigos de un día cerrado: sin ellos, la lista queda vacía.
    expect(blockingReservations(conflict('CLOSURE_HAS_RESERVATIONS'))).toEqual([]);

    expect(adminErrorMessage(conflict('SHIFT_OVERLAP'), 'otro')).toContain('solapa');
    expect(adminErrorMessage(conflict('SHIFT_LIMIT'), 'otro')).toContain('máximo de 10 turnos');
    expect(adminErrorMessage(conflict('SHIFT_NOT_FOUND'), 'otro')).toContain('ya no existe');
    expect(adminErrorMessage(conflict('CLOSURE_DATE_OUT_OF_RANGE'), 'otro')).toContain('90 días');
    expect(adminErrorMessage(conflict('TELEGRAM_UNAVAILABLE'), 'otro')).toContain('Telegram');
  });

  it('actionFailure junta el mensaje y las reservas, y el 429 usa el texto común de las acciones', () => {
    expect(actionFailure(conflict('SHIFT_HAS_RESERVATIONS', ['A', 'B']), 'otro')).toEqual({
      message: adminErrorMessage(conflict('SHIFT_HAS_RESERVATIONS'), 'otro'),
      reservations: ['A', 'B'],
    });
    expect(actionFailure(conflict('NO_CONOCIDO'), 'Fallback')).toEqual({
      message: 'Fallback',
      reservations: [],
    });

    const limited = new HttpErrorResponse({ status: 429, error: { code: 'RATE_LIMITED' } });
    expect(actionFailure(limited, 'otro').message).toBe(RATE_LIMITED_ACTIONS_MESSAGE);
    expect(RATE_LIMITED_ACTIONS_MESSAGE).toBe('Demasiadas acciones seguidas, espera un momento');
  });
});

import { HttpErrorResponse } from '@angular/common/http';
import { adminErrorMessage, blockingReservations, layoutProblems } from './admin-errors';

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
});

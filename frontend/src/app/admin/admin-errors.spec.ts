import { HttpErrorResponse } from '@angular/common/http';
import { adminErrorMessage, blockingReservations } from './admin-errors';

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

  it('otros códigos no listan reservas', () => {
    expect(blockingReservations(conflict('ALREADY_EXISTS', ['A']))).toEqual([]);
  });
});

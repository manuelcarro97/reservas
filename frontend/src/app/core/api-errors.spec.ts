import { HttpErrorResponse } from '@angular/common/http';
import { errorCode, problemBody } from './api-errors';

describe('api-errors', () => {
  it('readsTheCodeOfAJsonBody', () => {
    const error = new HttpErrorResponse({ status: 409, error: { code: 'ALREADY_EXISTS' } });

    expect(errorCode(error)).toBe('ALREADY_EXISTS');
  });

  it('readsTheCodeOfATextBody', () => {
    // Los DELETE del cliente generado piden `responseType: 'text'`: el cuerpo del error llega como texto.
    const error = new HttpErrorResponse({
      status: 409,
      error: '{"code":"PLAN_HAS_RESERVATIONS","reservations":["KAFE23456789ABCD"]}',
    });

    expect(errorCode(error)).toBe('PLAN_HAS_RESERVATIONS');
    expect(problemBody(error)['reservations']).toEqual(['KAFE23456789ABCD']);
  });

  it('ignoresBodiesThatAreNotProblemDetails', () => {
    expect(
      errorCode(new HttpErrorResponse({ status: 502, error: '<html>Bad gateway</html>' })),
    ).toBeUndefined();
    expect(errorCode(new HttpErrorResponse({ status: 0, error: null }))).toBeUndefined();
    expect(errorCode(new HttpErrorResponse({ status: 500, error: '42' }))).toBeUndefined();
  });
});

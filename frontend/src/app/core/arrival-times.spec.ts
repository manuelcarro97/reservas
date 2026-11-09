import { arrivalRange } from './arrival-times';

describe('arrivalRange', () => {
  it('lastArrivalIsAnHourBeforeTheEnd', () => {
    expect(arrivalRange('13:00', '16:00')).toEqual({ first: '13:00', last: '15:00' });
    expect(arrivalRange('20:00', '23:30')).toEqual({ first: '20:00', last: '22:30' });
  });

  it('shortShiftOnlyArrivesAtItsStart', () => {
    expect(arrivalRange('13:00', '13:30')).toEqual({ first: '13:00', last: '13:00' });
    expect(arrivalRange('13:00', '14:00')).toEqual({ first: '13:00', last: '13:00' });
  });

  it('lastArrivalIsOnTheGrid', () => {
    // 165 min de turno: 105 min de margen, y la última hora de la rejilla de 30 min es la de 90.
    expect(arrivalRange('13:00', '15:45')).toEqual({ first: '13:00', last: '14:30' });
  });

  it('startsOffTheHourKeepTheirMinutes', () => {
    expect(arrivalRange('12:15', '15:15')).toEqual({ first: '12:15', last: '14:15' });
  });

  it('acceptsTimesWithSeconds', () => {
    expect(arrivalRange('13:00:00', '16:00:00')).toEqual({ first: '13:00', last: '15:00' });
  });
});

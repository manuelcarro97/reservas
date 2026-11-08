import { canWhatsapp, reservationMessage, whatsappLink } from './whatsapp';

describe('whatsapp', () => {
  it('whatsappAddsSpainPrefix', () => {
    expect(whatsappLink('612 345 678', 'Hola')).toBe('https://wa.me/34612345678?text=Hola');
  });

  it('whatsappKeepsInternational', () => {
    expect(whatsappLink('+44 7700 900123', 'Hola')).toBe('https://wa.me/447700900123?text=Hola');
  });

  it('whatsappDoesNotDoubleTheSpainPrefix', () => {
    expect(whatsappLink('+34 612 345 678', 'Hola')).toBe('https://wa.me/34612345678?text=Hola');
    expect(whatsappLink('0034612345678', 'Hola')).toBe('https://wa.me/34612345678?text=Hola');
  });

  it('whatsappDropsTheDoubleZeroPrefix', () => {
    expect(whatsappLink('0044 7700 900123', 'Hola')).toBe('https://wa.me/447700900123?text=Hola');
  });

  it('whatsappEncodesTheText', () => {
    const link = whatsappLink('612345678', 'Código A&B 100%\nAdiós');

    expect(link).toBe(
      `https://wa.me/34612345678?text=${encodeURIComponent('Código A&B 100%\nAdiós')}`,
    );
    expect(link).not.toContain('&');
    expect(link).not.toContain('\n');
  });

  it('canWhatsappNeedsRealDigits', () => {
    expect(canWhatsapp('612 345 678')).toBe(true);
    expect(canWhatsapp('+44 7700 900123')).toBe(true);
    // La cuenta demo enmascara los teléfonos de los visitantes.
    expect(canWhatsapp('•••78')).toBe(false);
    expect(canWhatsapp('•••••••78')).toBe(false);
    expect(canWhatsapp('12345')).toBe(false);
    expect(canWhatsapp('')).toBe(false);
  });

  it('messagesCarryNameDateShiftArrivalAndCode', () => {
    const info = {
      customerName: 'Ana',
      restaurantName: 'Kafé',
      date: '2026-11-09',
      shiftName: 'Cena',
      arrivalTime: '21:30:00',
      code: 'KAFE23456789ABCD',
    };

    for (const kind of ['confirm', 'reject', 'cancel'] as const) {
      const text = reservationMessage(kind, info);
      expect(text).toContain('Ana');
      expect(text).toContain('Kafé');
      expect(text).toContain('09/11/2026');
      expect(text).toContain('Cena');
      expect(text).toContain('21:30');
      expect(text).not.toContain('21:30:00');
      expect(text).toContain('KAFE23456789ABCD');
    }
    expect(reservationMessage('confirm', info)).toContain('confirmada');
    expect(reservationMessage('reject', info)).toContain('no hemos podido');
    expect(reservationMessage('cancel', info)).toContain('cancelado');
  });

  it('messagesWithoutArrivalTimeKeepTheShiftOnly', () => {
    const text = reservationMessage('confirm', {
      customerName: 'Ana',
      restaurantName: 'Kafé',
      date: '2026-11-09',
      shiftName: 'Cena',
      code: 'KAFE23456789ABCD',
    });

    expect(text).toContain('Cena');
    expect(text).not.toContain('a las');
  });
});

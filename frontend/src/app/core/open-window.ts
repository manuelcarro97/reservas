import { InjectionToken } from '@angular/core';

/**
 * Cómo se abre un enlace en una pestaña nueva. Es un token para que los tests lo sustituyan: `window.open` no hace
 * nada en jsdom. `noopener` evita que la pestaña de WhatsApp pueda manejar la del panel.
 */
export const OPEN_WINDOW = new InjectionToken<(url: string) => void>('OPEN_WINDOW', {
  providedIn: 'root',
  factory: () => (url) => {
    window.open(url, '_blank', 'noopener');
  },
});

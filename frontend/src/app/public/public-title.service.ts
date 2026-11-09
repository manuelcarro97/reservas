import { Injectable, signal } from '@angular/core';

/**
 * Nombre del local de la página pública abierta. Lo rellenan `BookingPage` y `ReservationPage` y lo lee la cabecera
 * del marco público. Es un servicio de la raíz porque `BookingStore` se provee en la página y el marco no lo ve.
 */
@Injectable({ providedIn: 'root' })
export class PublicTitle {
  /** `null` mientras no hay local (cargando, no encontrado, otra ruta): la cabecera muestra la marca. */
  readonly name = signal<string | null>(null);
}

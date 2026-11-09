import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { AdminReservation } from '../../core/api/models/admin-reservation';
import { API_BASE_URL } from '../../core/config';

/**
 * Pendientes de confirmar de todos los días: `GET /admin/restaurants/{slug}/reservations?status=PENDING`.
 *
 * Se llama a mano porque el cliente generado no tiene esta variante: el snapshot de OpenAPI solo publica la lista
 * con `date` (su método `pending()` pide la fecha y devuelve la del día), así que el backend responde 400 a una
 * petición sin ella. La URL empieza por `API_BASE_URL + /api/v1/admin/` para que `authInterceptor` añada el token.
 */
@Injectable({ providedIn: 'root' })
export class PendingReservationsService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  list(slug: string): Observable<AdminReservation[]> {
    return this.http.get<AdminReservation[]>(
      `${this.baseUrl}/api/v1/admin/restaurants/${encodeURIComponent(slug)}/reservations`,
      { params: { status: 'PENDING' } },
    );
  }
}

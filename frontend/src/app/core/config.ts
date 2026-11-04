import { InjectionToken } from '@angular/core';
import { environment } from '../../environments/environment';

/** URL base del backend, sin barra final (el cliente generado añade `/api/v1/...`). */
export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL', {
  providedIn: 'root',
  factory: () => environment.apiBaseUrl,
});

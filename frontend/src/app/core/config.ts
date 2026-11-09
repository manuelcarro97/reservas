import { InjectionToken } from '@angular/core';
import { environment } from '../../environments/environment';
import type { Environment } from '../../environments/environment.model';

/** URL base del backend, sin barra final (el cliente generado añade `/api/v1/...`). */
export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL', {
  providedIn: 'root',
  factory: () => environment.apiBaseUrl,
});

/** Credenciales de la cuenta demo pública; `null` si el despliegue no define `demoAccount` (no hay recuadro de demo). */
export type DemoAccount = NonNullable<Environment['demoAccount']>;

export const DEMO_ACCOUNT = new InjectionToken<DemoAccount | null>('DEMO_ACCOUNT', {
  providedIn: 'root',
  factory: () => environment.demoAccount ?? null,
});

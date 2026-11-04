import { ApplicationConfig, inject, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { ApiConfiguration } from './core/api/api-configuration';
import { API_BASE_URL } from './core/config';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(),
    // El cliente generado toma su URL raíz de ApiConfiguration; la fuente única es API_BASE_URL.
    provideAppInitializer(() => {
      inject(ApiConfiguration).rootUrl = inject(API_BASE_URL);
    }),
  ],
};

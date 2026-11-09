import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';

/**
 * Modo incrustado (`?embed=1`, iframe en la web del restaurante). Se decide una sola vez con la URL de la primera
 * navegación y se mantiene toda la sesión: navegar a otra ruta sin el parámetro no devuelve la cabecera.
 * Debe inyectarse durante la primera navegación (el marco de la aplicación lo hace al crearse).
 */
@Injectable({ providedIn: 'root' })
export class EmbedMode {
  private readonly router = inject(Router);

  readonly embedded: boolean = this.isEmbedUrl();

  private isEmbedUrl(): boolean {
    const navigation = this.router.currentNavigation();
    const url = navigation
      ? (navigation.finalUrl ?? navigation.extractedUrl)
      : this.router.parseUrl(this.router.url);
    return url.queryParamMap.get('embed') === '1';
  }
}

import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * Provisional: ocupa las secciones del panel que aún no existen (Reservas, Plano, Turnos y Ajustes) para que sus
 * enlaces no den error de navegación. Cada tarea que implemente una sección sustituye su ruta en `admin.routes.ts`.
 */
@Component({
  selector: 'app-placeholder-page',
  template: '<p>Esta sección llega pronto.</p>',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlaceholderPage {}

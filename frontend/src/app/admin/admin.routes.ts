import { Routes } from '@angular/router';
import { authGuard } from '../core/auth/auth.guard';
import { leaveEditorGuard } from './editor/leave-editor.guard';

const placeholder = () => import('./placeholder.page').then((m) => m.PlaceholderPage);

/**
 * Rutas del panel del dueño, colgadas de `/panel` y cargadas bajo demanda (ni el bundle inicial ni las páginas
 * públicas las traen). Las tareas siguientes añaden aquí sus páginas, siempre dentro del marco del panel.
 *
 * Orden: `cuenta` va antes que `:slug` para que no se lea como el slug de un plano (el backend reserva ese slug).
 */
export const adminRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./admin-shell.component').then((m) => m.AdminShellComponent),
    canActivate: [authGuard],
    children: [
      { path: '', loadComponent: () => import('./plans.page').then((m) => m.PlansPage) },
      { path: 'cuenta', loadComponent: () => import('./account.page').then((m) => m.AccountPage) },
      {
        path: ':slug',
        loadComponent: () =>
          import('./reservations/reservations.page').then((m) => m.ReservationsPage),
      },
      // Provisionales: cada tarea (F10 Turnos y Ajustes) sustituye la suya.
      {
        path: ':slug/plano',
        loadComponent: () => import('./editor/editor.page').then((m) => m.EditorPage),
        canDeactivate: [leaveEditorGuard],
      },
      { path: ':slug/turnos', loadComponent: placeholder },
      { path: ':slug/ajustes', loadComponent: placeholder },
    ],
  },
];

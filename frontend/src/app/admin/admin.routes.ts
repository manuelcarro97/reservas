import { Routes } from '@angular/router';
import { authGuard } from '../core/auth/auth.guard';

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
      // Provisionales: cada tarea (F7 Plano, F8 Turnos y Ajustes, F9 Reservas) sustituye la suya.
      { path: ':slug', loadComponent: placeholder },
      { path: ':slug/plano', loadComponent: placeholder },
      { path: ':slug/turnos', loadComponent: placeholder },
      { path: ':slug/ajustes', loadComponent: placeholder },
    ],
  },
];

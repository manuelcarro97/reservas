import { Routes } from '@angular/router';
import { authGuard } from '../core/auth/auth.guard';
import { leaveEditorGuard } from './editor/leave-editor.guard';

/**
 * Rutas del panel del dueño, colgadas de `/panel` y cargadas bajo demanda (ni el bundle inicial ni las páginas
 * públicas las traen). Todas van dentro del marco del panel.
 *
 * `/panel` solo es la entrada: redirige al Inicio del plano actual. Mis planos vive en `/panel/planos`.
 *
 * Orden: `planos` y `cuenta` van antes que `:slug` para que no se lean como el slug de un plano (el backend reserva
 * esos slugs).
 */
export const adminRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./admin-shell.component').then((m) => m.AdminShellComponent),
    canActivate: [authGuard],
    children: [
      {
        path: '',
        loadComponent: () => import('./panel-entry.component').then((m) => m.PanelEntryComponent),
      },
      { path: 'planos', loadComponent: () => import('./plans.page').then((m) => m.PlansPage) },
      { path: 'cuenta', loadComponent: () => import('./account.page').then((m) => m.AccountPage) },
      {
        path: ':slug',
        loadComponent: () =>
          import('./reservations/reservations.page').then((m) => m.ReservationsPage),
      },
      {
        path: ':slug/inicio',
        loadComponent: () => import('./home/home.page').then((m) => m.HomePage),
      },
      {
        path: ':slug/plano',
        loadComponent: () => import('./editor/editor.page').then((m) => m.EditorPage),
        canDeactivate: [leaveEditorGuard],
      },
      {
        path: ':slug/turnos',
        loadComponent: () => import('./shifts.page').then((m) => m.ShiftsPage),
      },
      {
        path: ':slug/ajustes',
        loadComponent: () => import('./settings.page').then((m) => m.SettingsPage),
      },
    ],
  },
];

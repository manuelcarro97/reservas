import { Routes } from '@angular/router';
import { BookingPage } from './public/booking.page';
import { ReservationPage } from './public/reservation.page';
import { ShellComponent } from './shell/shell.component';

export const routes: Routes = [
  // Panel del dueño: marco propio (no el público, que no puede inyectar `AuthService`) y protegido con `authGuard`.
  {
    path: 'panel',
    loadChildren: () => import('./admin/admin.routes').then((m) => m.adminRoutes),
  },
  {
    path: '',
    component: ShellComponent,
    children: [
      { path: 'r/:slug', component: BookingPage },
      { path: 'reserva/:code', component: ReservationPage },
      // Acceso del dueño. Páginas perezosas; el SDK de Firebase se descarga aparte (import() en `LOAD_AUTH_SDK`)
      // al crearse `AuthService`, así que ni el bundle inicial ni las páginas públicas lo cargan.
      {
        path: 'entrar',
        loadComponent: () => import('./admin/auth/login.page').then((m) => m.LoginPage),
      },
      {
        path: 'registro',
        loadComponent: () => import('./admin/auth/register.page').then((m) => m.RegisterPage),
      },
      {
        path: 'recuperar',
        loadComponent: () => import('./admin/auth/reset.page').then((m) => m.ResetPage),
      },
    ],
  },
];

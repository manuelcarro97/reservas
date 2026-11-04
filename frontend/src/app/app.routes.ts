import { Routes } from '@angular/router';
import { BookingPage } from './public/booking.page';
import { ReservationPage } from './public/reservation.page';
import { ShellComponent } from './shell/shell.component';

export const routes: Routes = [
  {
    path: '',
    component: ShellComponent,
    // Las tareas siguientes añaden aquí las rutas del panel.
    children: [
      { path: 'r/:slug', component: BookingPage },
      { path: 'reserva/:code', component: ReservationPage },
    ],
  },
];

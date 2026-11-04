import { Routes } from '@angular/router';
import { BookingPage } from './public/booking.page';
import { ShellComponent } from './shell/shell.component';

export const routes: Routes = [
  {
    path: '',
    component: ShellComponent,
    // Las tareas siguientes añaden aquí /reserva/:code y las rutas del panel.
    children: [{ path: 'r/:slug', component: BookingPage }],
  },
];

import { Routes } from '@angular/router';
import { ShellComponent } from './shell/shell.component';

export const routes: Routes = [
  {
    path: '',
    component: ShellComponent,
    // Las tareas siguientes añaden aquí las rutas públicas (/r/:slug) y las del panel.
    children: [],
  },
];

import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./features/home/home').then((m) => m.Home) },
  {
    path: 'connect',
    loadComponent: () =>
      import('./features/connect-account/connect-account').then((m) => m.ConnectAccount),
  },
  {
    path: 'accounts/:id',
    loadComponent: () =>
      import('./features/account-stream/account-stream').then((m) => m.AccountStream),
  },
];

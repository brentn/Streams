import { Routes } from '@angular/router';
import { hasAccountsGuard } from './core/routing/has-accounts-guard';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./features/home/home').then((m) => m.Home) },
  {
    path: 'connect',
    loadComponent: () =>
      import('./features/connect-account/connect-account').then((m) => m.ConnectAccount),
  },
  {
    path: 'accounts',
    canActivate: [hasAccountsGuard],
    loadComponent: () =>
      import('./features/multi-account-stream/multi-account-stream').then(
        (m) => m.MultiAccountStream,
      ),
  },
  {
    path: 'accounts/:id',
    canActivate: [hasAccountsGuard],
    loadComponent: () =>
      import('./features/account-stream/account-stream').then((m) => m.AccountStream),
  },
  {
    path: 'settings',
    canActivate: [hasAccountsGuard],
    loadComponent: () => import('./features/settings/settings').then((m) => m.Settings),
  },
];

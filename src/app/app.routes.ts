import { Routes } from '@angular/router';
import { hasAccountsGuard } from './core/routing/has-accounts-guard';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./features/home/home').then((m) => m.Home) },
  // PROTOTYPE (wayfinder ticket #53) — delete once the ticket is resolved.
  {
    path: 'prototype/issue-53',
    loadComponent: () =>
      import('./features/account-stream/prototype-issue-53/prototype-issue-53').then(
        (m) => m.PrototypeIssue53,
      ),
  },
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

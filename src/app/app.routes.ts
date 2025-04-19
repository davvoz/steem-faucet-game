import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'home',
    pathMatch: 'full'
  },
  {
    path: 'home',
    loadChildren: () => import('./features/home/home.routes').then(m => m.HOME_ROUTES)
  },
  {
    path: 'faucet',
    loadChildren: () => import('./features/faucet/faucet.routes').then(m => m.FAUCET_ROUTES)
  },
  {
    path: 'games',
    loadChildren: () => import('./features/games/games.routes').then(m => m.GAMES_ROUTES)
  },
  {
    path: 'leaderboard',
    loadChildren: () => import('./features/leaderboard/leaderboard.routes').then(m => m.LEADERBOARD_ROUTES)
  },
  {
    path: 'admin',
    loadChildren: () => import('./features/admin/admin.routes').then(m => m.ADMIN_ROUTES)
  },
  {
    path: '**',
    loadChildren: () => import('./shared/components/not-found/not-found.routes').then(m => m.NOT_FOUND_ROUTES)
  }
];

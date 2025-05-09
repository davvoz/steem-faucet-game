import { Route } from '@angular/router';
import { AdminComponent } from './admin/admin.component';
import { inject } from '@angular/core';
import { AuthService } from '../../core/services/auth.service';
import { map } from 'rxjs';

export const ADMIN_ROUTES: Route[] = [
  {
    path: '',
    component: AdminComponent,
    // Aggiunto guard per proteggere la route admin
    canActivate: [() => {
      const authService = inject(AuthService);
      return authService.currentUser$.pipe(
        map(user => {
          // Controllo se l'utente è autenticato e ha il ruolo admin
          // Modifica questo controllo in base alla tua implementazione dell'AuthService
          return user && (user.isAdmin === true);
        })
      );
    }],
    title: 'Pannello Amministrativo'
  }
];

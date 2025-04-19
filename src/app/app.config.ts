import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideFirebaseApp, initializeApp } from '@angular/fire/app';
import { provideAuth, getAuth } from '@angular/fire/auth';
import { provideFirestore, getFirestore } from '@angular/fire/firestore';
import { provideStorage, getStorage } from '@angular/fire/storage';
import { provideAnimations } from '@angular/platform-browser/animations';
import { environment } from '../environments/environment';
import { REGISTER_GAMES_PROVIDER } from './core/initialization/register-games';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }), 
    provideRouter(routes),
    // Provide animations
    provideAnimations(),
    // Inizializza Firebase
    provideFirebaseApp(() => initializeApp(environment.firebase)),
    // Fornisce il servizio di autenticazione di Firebase
    provideAuth(() => getAuth()),
    // Fornisce il servizio Firestore di Firebase
    provideFirestore(() => getFirestore()),
    // Fornisce il servizio Storage di Firebase
    provideStorage(() => getStorage()),
    // Provider per la registrazione dei giochi
    REGISTER_GAMES_PROVIDER
  ]
};

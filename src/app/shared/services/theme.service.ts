import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

type ThemeMode = 'light' | 'dark';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  private readonly THEME_KEY = 'steem-faucet-theme';
  
  // Subject per il tema corrente
  private themeSubject = new BehaviorSubject<ThemeMode>(this.getInitialTheme());
  
  // Observable pubblico per il tema corrente
  public theme$: Observable<ThemeMode> = this.themeSubject.asObservable();

  constructor() {
    // Applica il tema all'avvio
    this.applyTheme(this.themeSubject.value);
    
    // Rileva cambio tema da altre tab o finestre
    window.addEventListener('storage', this.handleStorageChange.bind(this));
    
    // Rileva preferenze di sistema
    this.detectSystemPreference();
  }

  private getInitialTheme(): ThemeMode {
    // Recupera il tema da localStorage se presente
    const savedTheme = localStorage.getItem(this.THEME_KEY) as ThemeMode;
    
    if (savedTheme) {
      return savedTheme;
    }
    
    // Altrimenti usa le preferenze del sistema
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  private detectSystemPreference(): void {
    // Ascolta cambiamenti nelle preferenze di sistema
    window.matchMedia('(prefers-color-scheme: dark)')
      .addEventListener('change', (e) => {
        // Aggiorna il tema solo se l'utente non ha impostato manualmente una preferenza
        if (!localStorage.getItem(this.THEME_KEY)) {
          const newTheme = e.matches ? 'dark' : 'light';
          this.applyTheme(newTheme);
          this.themeSubject.next(newTheme);
        }
      });
  }

  private handleStorageChange(event: StorageEvent): void {
    if (event.key === this.THEME_KEY) {
      const newTheme = event.newValue as ThemeMode;
      if (newTheme) {
        this.applyTheme(newTheme);
        this.themeSubject.next(newTheme);
      }
    }
  }

  // Applica il tema al documento
  private applyTheme(theme: ThemeMode): void {
    if (theme === 'dark') {
      document.body.classList.add('dark-theme');
    } else {
      document.body.classList.remove('dark-theme');
    }
  }

  // Metodo pubblico per cambiare tema
  public toggleTheme(): void {
    const currentTheme = this.themeSubject.value;
    const newTheme: ThemeMode = currentTheme === 'light' ? 'dark' : 'light';
    
    // Salva in localStorage
    localStorage.setItem(this.THEME_KEY, newTheme);
    
    // Aggiorna il tema
    this.applyTheme(newTheme);
    
    // Notifica gli osservatori
    this.themeSubject.next(newTheme);
  }

  // Metodo pubblico per impostare un tema specifico
  public setTheme(theme: ThemeMode): void {
    if (theme !== this.themeSubject.value) {
      // Salva in localStorage
      localStorage.setItem(this.THEME_KEY, theme);
      
      // Aggiorna il tema
      this.applyTheme(theme);
      
      // Notifica gli osservatori
      this.themeSubject.next(theme);
    }
  }

  // Metodo pubblico per controllare se il tema è scuro
  public isDarkTheme(): boolean {
    return this.themeSubject.value === 'dark';
  }
}
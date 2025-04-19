import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from './core/services/auth.service';
import { SteemService } from './core/services/steem.service';
import { Subscription, tap } from 'rxjs';
import { User } from './core/models/user.model';
import { NotificationComponent } from './shared/components/notification/notification.component';
import { ThemeToggleComponent } from './shared/components/theme-toggle/theme-toggle.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule, 
    RouterOutlet, 
    RouterLink, 
    RouterLinkActive, 
    NotificationComponent,
    ThemeToggleComponent
  ],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit, OnDestroy {
  title = 'steem-faucet-game';
  isLoggedIn = false;
  username = '';
  steemBalance = '0.000';
  currentYear = new Date().getFullYear();
  mobileMenuOpen = false;
  userSubscription: Subscription | null = null;

  constructor(
    private authService: AuthService,
    private steemService: SteemService
  ) { }

  ngOnInit(): void {
    // Subscribe to authentication state changes
    this.userSubscription = this.authService.currentUser$.pipe(
      tap(user => this.updateUserState(user))
    ).subscribe();
  }

  ngOnDestroy(): void {
    // Clean up subscriptions to prevent memory leaks
    if (this.userSubscription) {
      this.userSubscription.unsubscribe();
    }
  }

  updateUserState(user: User | null): void {
    this.isLoggedIn = !!user;
    
    if (user) {
      this.username = user.displayName || user.email || 'User';
      if (user.steemUsername && user.steemBalance !== undefined) {
        this.steemBalance = user.steemBalance.toFixed(3);
      } else {
        this.steemBalance = '0.000';
      }
    } else {
      this.username = '';
      this.steemBalance = '0.000';
    }
  }

  login(): void {
    this.authService.signInWithGoogle().subscribe({
      next: () => console.log('Login successful'),
      error: (error) => console.error('Login failed:', error)
    });
  }

  logout(): void {
    this.authService.signOut().subscribe({
      next: () => console.log('Logout successful'),
      error: (error) => console.error('Logout failed:', error)
    });
  }

  toggleMobileMenu(): void {
    this.mobileMenuOpen = !this.mobileMenuOpen;
    // Prevent scrolling when menu is open
    document.body.style.overflow = this.mobileMenuOpen ? 'hidden' : '';
  }
  
  closeMobileMenu(): void {
    if (this.mobileMenuOpen) {
      this.mobileMenuOpen = false;
      document.body.style.overflow = '';
    }
  }
}

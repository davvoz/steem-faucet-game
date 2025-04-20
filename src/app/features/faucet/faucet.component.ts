import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { SteemService } from '../../core/services/steem.service';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';
import { User } from '../../core/models/user.model';
import { Observable, Subscription, catchError, interval, map, of, take, tap } from 'rxjs';

@Component({
  selector: 'app-faucet',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './faucet.component.html',
  styleUrls: ['./faucet.component.scss']
})
export class FaucetComponent implements OnInit, OnDestroy {
  faucetForm: FormGroup;
  user$: Observable<User | null>;
  isSubmitting = false;
  canClaim = true;
  cooldownTimeRemaining = '';
  cooldownPercent = 0;
  recentClaims: any[] = [];
  
  // Reward variables
  minReward = 0.001;
  maxReward = 0.010;
  rewardPercent = 30; // Default percentage between min and max reward
  currentTier = 1; // User's current tier: 1 or 2
  
  // Tier rewards - updated to match backend limits
  baseTierReward = 0.002; // Tier 1 max
  tier2Reward = 0.005;    // Tier 2 max
  
  // Sostituisco i valori hardcoded con proprietà che verranno aggiornate dal database
  totalDistributed = 0;  // Verrà impostato dal servizio
  totalUsers = 0;        // Verrà impostato dal servizio

  // Subscriptions
  private timerSubscription: Subscription | null = null;
  private userSubscription: Subscription | null = null;
  private statsSubscription: Subscription | null = null;

  // Aggiungo variabili per le richieste pendenti
  pendingClaims: any[] = [];
  hasPendingClaims = false;
  checkingPendingClaimsInterval: any;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private steemService: SteemService,
    private notificationService: NotificationService
  ) {
    this.faucetForm = this.fb.group({
      steemUsername: ['', [Validators.required]]
    });

    this.user$ = this.authService.currentUser$;
  }

  ngOnInit(): void {
    this.loadUserData();
    this.loadRecentClaims();
    this.calculatePotentialReward();

    // Use reactive approach for timer with 1 second interval for smooth updates
    this.startCooldownTimer();
    
    // Subscribe to user changes to update the cooldown timer when user data changes
    this.userSubscription = this.user$.subscribe(user => {
      if (user && user.lastFaucetClaim) {
        this.checkCooldown(user.lastFaucetClaim);
      }
    });

    // Controlla le richieste pendenti all'avvio e ogni 2 minuti
    this.checkPendingClaims();
    this.checkingPendingClaimsInterval = setInterval(() => {
      this.checkPendingClaims();
    }, 120000); // 2 minuti
    
    // Carica le statistiche del faucet
    this.loadFaucetStats();
  }
  
  ngOnDestroy(): void {
    if (this.timerSubscription) {
      this.timerSubscription.unsubscribe();
    }
    if (this.userSubscription) {
      this.userSubscription.unsubscribe();
    }
    
    // Pulisci l'intervallo di controllo delle richieste pendenti
    if (this.checkingPendingClaimsInterval) {
      clearInterval(this.checkingPendingClaimsInterval);
    }
    
    if (this.statsSubscription) {
      this.statsSubscription.unsubscribe();
    }
  }
  
  startCooldownTimer(): void {
    // Update every 30 seconds with interval
    this.timerSubscription = interval(30000).subscribe(() => {
      this.user$.pipe(
        take(1)
      ).subscribe(user => {
        if (user && user.lastFaucetClaim) {
          this.checkCooldown(user.lastFaucetClaim);
        }
      });
    });
  }

  loadUserData(): void {
    this.user$.pipe(
      take(1),
      tap(user => {
        if (user && user.steemUsername) {
          this.faucetForm.patchValue({
            steemUsername: user.steemUsername
          });

          if (user.lastFaucetClaim) {
            this.checkCooldown(user.lastFaucetClaim);
          }
          
          // Determine user's tier
          this.determineTier(user);
        }
      })
    ).subscribe();
  }

  determineTier(user: User): void {
    // Logic now based only on consecutive claims, no game points
    if (user.consecutiveClaims && user.consecutiveClaims >= 5) {
      this.currentTier = 2;
    } else {
      this.currentTier = 1;
    }
    
    // Update min/max rewards based on tier
    this.updateTierRewards();
  }
  
  updateTierRewards(): void {
    // Set proper min/max rewards based on the current tier
    switch (this.currentTier) {
      case 2:
        this.minReward = 0.001;
        this.maxReward = this.tier2Reward;
        break;
      case 1:
      default:
        this.minReward = 0.001;
        this.maxReward = this.baseTierReward;
        break;
    }
  }

  calculatePotentialReward(): void {
    // In a real app, this would be more sophisticated and might involve API calls
    // For now, we'll generate a semi-random value based on the user tier
    this.user$.pipe(
      take(1),
      tap(user => {
        if (user) {
          // Base percentage depending on tier
          let basePercent = 0;
          
          switch(this.currentTier) {
            case 2:
              basePercent = 50; // Medium chance for tier 2
              break;
            case 1:
            default:
              basePercent = 25; // Lower chance for tier 1
              break;
          }
          
          // Add some randomness (-15 to +15%)
          const randomFactor = Math.floor(Math.random() * 30) - 15;
          this.rewardPercent = Math.min(95, Math.max(5, basePercent + randomFactor));
        }
      })
    ).subscribe();
  }

  checkCooldown(lastClaimTimestamp: any): void {
    // Gestione corretta dei timestamp Firestore
    const lastClaimDate = lastClaimTimestamp instanceof Date 
      ? lastClaimTimestamp 
      : lastClaimTimestamp?.toDate 
        ? lastClaimTimestamp.toDate() 
        : new Date(lastClaimTimestamp);
    
    const now = new Date();
    const hoursSinceLastClaim = (now.getTime() - lastClaimDate.getTime()) / (1000 * 60 * 60);
    const cooldownHours = 24;
    
    if (hoursSinceLastClaim < cooldownHours) {
      this.canClaim = false;
      
      const hoursRemaining = cooldownHours - hoursSinceLastClaim;
      const hours = Math.floor(hoursRemaining);
      const minutes = Math.floor((hoursRemaining - hours) * 60);
      
      this.cooldownTimeRemaining = `${hours}h ${minutes}m`;
      
      // Calculate cooldown progress percentage
      this.cooldownPercent = (hoursSinceLastClaim / cooldownHours) * 100;
    } else {
      this.canClaim = true;
      this.cooldownPercent = 100;
    }
  }

  loadRecentClaims(): void {
    this.steemService.getGlobalClaimHistory(5)
      .subscribe(claims => {
        this.recentClaims = claims;
      });
  }

  claimFaucet(): void {
    if (this.faucetForm.invalid || this.isSubmitting) {
      return;
    }

    this.isSubmitting = true;
    const steemUsername = this.faucetForm.get('steemUsername')?.value;
    
    // Calculate reward based on current tier and display percentage
    let claimAmount = this.calculateActualReward();
    
    // Ensure the amount doesn't exceed the tier maximum
    const tierMax = this.currentTier === 2 ? this.tier2Reward : this.baseTierReward;
    
    if (claimAmount > tierMax) {
      claimAmount = tierMax;
    }

    this.steemService.claimFaucet(steemUsername, claimAmount).pipe(
      tap((result) => {
        // Modifica il messaggio per riflettere che il pagamento è in elaborazione
        this.notificationService.success(`Richiesta registrata! Riceverai ${result.amount} STEEM a breve.`);
        
        // Update the user data and form state after the claim
        this.updateUserAfterClaim(result.amount);
        this.loadRecentClaims();
        this.loadFaucetStats(); // Load updated global stats
        
        // Controlla subito le richieste pendenti
        setTimeout(() => {
          this.checkPendingClaims();
        }, 1000);
      }),
      catchError(error => {
        console.error('Errore durante la richiesta faucet:', error);
        // Use notification service for error messages
        this.notificationService.error(`Errore: ${error.message || 'Si è verificato un problema con la richiesta.'}`);
        this.isSubmitting = false;
        return of(null);
      })
    ).subscribe(() => {
      this.isSubmitting = false;
    });
  }

  updateUserAfterClaim(claimAmount: number): void {
    this.canClaim = false;
    this.cooldownTimeRemaining = '24h 0m';
    this.cooldownPercent = 0;
    
    this.user$.pipe(
      take(1),
      tap(user => {
        if (user) {
          const steemUsername = this.faucetForm.get('steemUsername')?.value;
          
          // Update the total distributed amount
          this.totalDistributed += claimAmount;
          
          // Load fresh user data to get updated tier and consecutive claims
          setTimeout(() => {
            this.loadUserData();
          }, 1000);
          
          // Animate the reward info to show the user got something
          this.animateRewardClaim();
        }
      })
    ).subscribe();
  }
  
  // New method to animate the reward claim
  animateRewardClaim(): void {
    // In a more sophisticated app, implement animations
    // For now, just recalculate the potential reward for next time
    setTimeout(() => {
      this.calculatePotentialReward();
    }, 500);
  }
  
  // Metodo per caricare le statistiche del faucet
  loadFaucetStats(): void {
    this.statsSubscription = this.steemService.getFaucetStats().subscribe({
      next: (stats) => {
        this.totalDistributed = stats.totalDistributed;
        this.totalUsers = stats.totalUsers;
      },
      error: (error) => {
        console.error('Error loading faucet stats:', error);
      }
    });
  }

  calculateActualReward(): number {
    // Calculate the actual reward based on tier and percentage
    const rewardRange = this.maxReward - this.minReward;
    const reward = this.minReward + (rewardRange * (this.rewardPercent / 100));
    
    // Round to 3 decimal places
    return Math.round(reward * 1000) / 1000;
  }

  // Metodo per controllare le richieste pendenti
  checkPendingClaims(): void {
    this.steemService.checkPendingClaims().subscribe({
      next: (claims) => {
        this.pendingClaims = claims;
        this.hasPendingClaims = claims.length > 0;
        
        // Notifica l'utente se ci sono richieste che sono state completate
        this.pendingClaims.forEach(claim => {
          if (claim.status === 'completed' && claim.transactionId && !claim.notified) {
            this.notificationService.success(
              `La tua richiesta di ${claim.amount} STEEM è stata processata! ID Transazione: ${claim.transactionId}`
            );
            
            // Aggiorna lo stato locale per evitare notifiche duplicate
            claim.notified = true;
          }
        });
      },
      error: (error) => {
        console.error('Error checking pending claims:', error);
      }
    });
  }

  login(): void {
    this.authService.signInWithGoogle().subscribe({
      next: () => console.log('Login successful'),
      error: (error) => console.error('Login failed:', error)
    });
  }
}
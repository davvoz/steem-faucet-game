import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, from, of, throwError } from 'rxjs';
import { catchError, map, switchMap, tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { Firestore, collection, addDoc, getDocs, query, where, orderBy, limit, serverTimestamp, doc, getDoc } from '@angular/fire/firestore';
import { AuthService } from './auth.service';
// Import dsteem with a fallback for regeneratorRuntime
import { Client, DatabaseAPI } from 'dsteem';

@Injectable({
  providedIn: 'root'
})
export class SteemService {
  private steemNodesSubject = new BehaviorSubject<string[]>(environment.steemApi.nodes);
  public steemNodes$ = this.steemNodesSubject.asObservable();
  private activeNode = environment.steemApi.nodes[0];
  private client!: Client;

  constructor(
    private firestore: Firestore,
    private authService: AuthService
  ) {
    // Initialize Steem API
    this.initializeSteemAPI();
  }

  // Initialize Steem API with available nodes
  private initializeSteemAPI(): void {
    try {
      this.client = new Client(this.activeNode);
      this.testConnection().pipe(
        catchError((error) => {
          console.warn('Failed to connect to Steem node:', error);
          // If the connection fails, try another node
          const nodes = this.steemNodesSubject.value;
          if (nodes.length > 1) {
            const nextNode = nodes.find(node => node !== this.activeNode) || nodes[0];
            this.activeNode = nextNode;
            console.log(`Switching to alternate node: ${this.activeNode}`);
            this.client = new Client(this.activeNode);
          }
          return of(null);
        })
      ).subscribe({
        next: (result) => {
          if (result) {
            console.log('Connected to Steem node:', this.activeNode);
          }
        },
        error: (err) => console.error('Error initializing Steem API:', err)
      });
    } catch (error) {
      console.error('Error creating Steem client:', error);
    }
  }

  // Test connection to Steem API
  private testConnection(): Observable<any> {
    return from(
      this.client.database.getDynamicGlobalProperties()
        .catch(error => {
          throw new Error(`Connection failed: ${error}`);
        })
    );
  }

  // Get account information from Steem
  getAccount(username: string): Observable<any> {
    return from(this.client.database.getAccounts([username])).pipe(
      map(accounts => accounts && accounts.length > 0 ? accounts[0] : null),
      catchError(error => throwError(() => new Error(`Failed to get account: ${error}`)))
    );
  }

  // Get account balance from Steem
  getAccountBalance(username: string): Observable<number> {
    return this.getAccount(username).pipe(
      map(account => {
        if (!account) return 0;
        return parseFloat(account.balance.split(' ')[0]);
      }),
      catchError(() => of(0))
    );
  }

  // Track faucet claims in Firestore with enhanced security and rewards
  claimFaucet(steemUsername: string, amount: number): Observable<any> {
    return this.authService.currentUser$.pipe(
      switchMap(user => {
        if (!user) {
          return throwError(() => new Error('User not authenticated'));
        }
        
        // Check if steemUsername exists on the blockchain
        return this.getAccount(steemUsername).pipe(
          switchMap(account => {
            if (!account) {
              return throwError(() => new Error('Steem username not found. Please check and try again.'));
            }
            
            // Check for cooldown period
            if (user.lastFaucetClaim) {
              const cooldownHours = 24; // 24 hour cooldown
              const lastClaimDate = user.lastFaucetClaim instanceof Date 
                ? user.lastFaucetClaim 
                : new Date(user.lastFaucetClaim);
              const now = new Date();
              const hoursSinceLastClaim = (now.getTime() - lastClaimDate.getTime()) / (1000 * 60 * 60);
              
              if (hoursSinceLastClaim < cooldownHours) {
                const hoursRemaining = Math.ceil(cooldownHours - hoursSinceLastClaim);
                return throwError(() => new Error(`You can claim again in ${hoursRemaining} hours`));
              }
            }

            // Implement anti-fraud checks
            // 1. Check IP rate limiting (would be implemented in a real backend)
            // 2. Check account age on Steem blockchain
            const accountCreationDate = new Date(account.created);
            const accountAgeInDays = (new Date().getTime() - accountCreationDate.getTime()) / (1000 * 60 * 60 * 24);
            
            if (accountAgeInDays < 7) {
              return throwError(() => new Error('Your Steem account must be at least 7 days old to use this faucet'));
            }
            
            // 3. Verify the amount is within allowed range based on user tier
            const userTier = user.faucetTier || 1;
            const maxAllowedAmount = userTier === 3 ? 0.010 : (userTier === 2 ? 0.005 : 0.002);
            
            if (amount > maxAllowedAmount) {
              return throwError(() => new Error(`The maximum amount for your tier is ${maxAllowedAmount} STEEM`));
            }
            
            // Record the claim in Firestore with additional metadata
            const claimsCollectionRef = collection(this.firestore, 'faucet_claims');
            return from(addDoc(claimsCollectionRef, {
              userId: user.uid,
              steemUsername,
              amount,
              timestamp: serverTimestamp(),
              status: 'pending', // This will be updated to 'completed' after processing
              userTier: userTier,
              ipAddress: 'masked-for-privacy', // In a real app, would use the user's IP
              userAgent: navigator.userAgent, // For tracking potential abuse patterns
              processedAt: null // Will be updated when the blockchain transaction completes
            })).pipe(
              switchMap(() => this.authService.updateLastFaucetClaim(user.uid, amount)),
              map(() => ({
                success: true,
                message: `Successfully claimed ${amount} STEEM!`,
                amount,
                timestamp: new Date(),
                steemUsername
              })),
              tap((result) => {
                // Here you would typically trigger a backend function to process the actual Steem blockchain transaction
                // For this example, we're just recording it in Firestore
                console.log(`Faucet claim recorded for ${steemUsername}: ${amount} STEEM`);
              })
            );
          }),
          catchError(error => {
            console.error('Error processing claim:', error);
            return throwError(() => new Error(`Failed to process claim: ${error.message}`));
          })
        );
      })
    );
  }

  // Metodo per controllare lo stato delle richieste pendenti di un utente
  checkPendingClaims(): Observable<any> {
    return this.authService.currentUser$.pipe(
      switchMap(user => {
        if (!user) {
          return of([]);
        }
        
        const claimsCollectionRef = collection(this.firestore, 'faucet_claims');
        const pendingClaimsQuery = query(
          claimsCollectionRef,
          where('userId', '==', user.uid),
          where('status', '==', 'pending'),
          orderBy('timestamp', 'desc'),
          limit(5)
        );
        
        return from(getDocs(pendingClaimsQuery)).pipe(
          map(snapshot => snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }))), 
          tap(pendingClaims => {
            if (pendingClaims.length > 0) {
              console.log(`Hai ${pendingClaims.length} richieste in attesa di elaborazione.`);
            }
          })
        );
      })
    );
  }
  
  // Metodo per ottenere i dettagli di una specifica richiesta
  getClaimDetails(claimId: string): Observable<any> {
    const claimRef = doc(this.firestore, `faucet_claims/${claimId}`);
    return from(getDoc(claimRef)).pipe(
      map(docSnap => docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } : null)
    );
  }

  // Get user's faucet claim history
  getUserClaimHistory(limitCount = 10): Observable<any[]> {
    return this.authService.currentUser$.pipe(
      switchMap(user => {
        if (!user) {
          return throwError(() => new Error('User not authenticated'));
        }
        
        const claimsCollectionRef = collection(this.firestore, 'faucet_claims');
        const userClaimsQuery = query(
          claimsCollectionRef,
          where('userId', '==', user.uid),
          orderBy('timestamp', 'desc'),
          limit(limitCount) // Renamed parameter to avoid conflict with function name
        );
        
        return from(getDocs(userClaimsQuery)).pipe(
          map(snapshot => snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          })))
        );
      })
    );
  }

  // Get global faucet claim history
  getGlobalClaimHistory(limitCount = 20): Observable<any[]> {
    const claimsCollectionRef = collection(this.firestore, 'faucet_claims');
    const globalClaimsQuery = query(
      claimsCollectionRef,
      orderBy('timestamp', 'desc'),
      limit(limitCount) // Renamed parameter to avoid conflict with function name
    );
    
    return from(getDocs(globalClaimsQuery)).pipe(
      map(snapshot => snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })))
    );
  }
}
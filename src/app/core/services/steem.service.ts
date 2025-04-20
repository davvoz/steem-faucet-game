import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, from, of, throwError } from 'rxjs';
import { catchError, map, switchMap, tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { Firestore, collection, addDoc, getDocs, query, where, orderBy, limit, serverTimestamp, doc, getDoc, runTransaction } from '@angular/fire/firestore';
import { AuthService } from './auth.service';
// Import dsteem with a fallback for regeneratorRuntime
import { Client, DatabaseAPI } from 'dsteem';

// Define User interface
interface User {
  lastFaucetClaim?: Date | any;
  faucetTier?: number;
  [key: string]: any;
}

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
        
        // Utilizzo di runTransaction per eseguire il claim in modo atomico
        return from(runTransaction(this.firestore, async (transaction) => {
          // 1. Verifica l'esistenza dell'account Steem
          const account = await this.client.database.getAccounts([steemUsername])
            .then(accounts => accounts && accounts.length > 0 ? accounts[0] : null)
            .catch(error => {
              throw new Error(`Failed to get account: ${error}`);
            });
              
          if (!account) {
            throw new Error('Steem username not found. Please check and try again.');
          }
            
          // 2. Verifica del cooldown tramite dati più recenti in Firestore
          const userDocRef = doc(this.firestore, `users/${user.uid}`);
          const userDocSnap = await transaction.get(userDocRef);
            
          if (!userDocSnap.exists()) {
            throw new Error('User document not found');
          }
            
          const userData = userDocSnap.data() as User;
            
          if (userData.lastFaucetClaim) {
            const lastClaimTimestamp = userData.lastFaucetClaim;
            // Convertiamo il timestamp Firestore in Date
            const lastClaimDate = lastClaimTimestamp instanceof Date ? 
              lastClaimTimestamp : 
              lastClaimTimestamp.toDate ? lastClaimTimestamp.toDate() : new Date(lastClaimTimestamp);
              
            const now = new Date();
            const hoursSinceLastClaim = (now.getTime() - lastClaimDate.getTime()) / (1000 * 60 * 60);
              
            if (hoursSinceLastClaim < 24) {
              const hoursRemaining = Math.ceil(24 - hoursSinceLastClaim);
              throw new Error(`You can claim again in ${hoursRemaining} hours`);
            }
          }
            
          // 3. Check account age on Steem blockchain
          const accountCreationDate = new Date(account.created);
          const accountAgeInDays = (new Date().getTime() - accountCreationDate.getTime()) / (1000 * 60 * 60 * 24);
            
          if (accountAgeInDays < 7) {
            throw new Error('Your Steem account must be at least 7 days old to use this faucet');
          }
            
          // 4. Verify the amount is within allowed range based on user tier
          const userTier = userData.faucetTier || 1;
          const maxAllowedAmount = userTier === 3 ? 0.010 : (userTier === 2 ? 0.005 : 0.002);
            
          if (amount > maxAllowedAmount) {
            throw new Error(`The maximum amount for your tier is ${maxAllowedAmount} STEEM`);
          }
            
          // 5. Verifica se ci sono altri claim pendenti per questo utente
          const claimsCollectionRef = collection(this.firestore, 'faucet_claims');
          const pendingClaimsQuery = query(
            claimsCollectionRef,
            where('userId', '==', user.uid),
            where('status', '==', 'pending')
          );
            
          const pendingClaimsSnapshot = await getDocs(pendingClaimsQuery);
          if (!pendingClaimsSnapshot.empty) {
            throw new Error('You have pending claims. Please wait until they are processed.');
          }
            
          // 6. Crea il nuovo claim
          const newClaimRef = doc(claimsCollectionRef);
          transaction.set(newClaimRef, {
            id: newClaimRef.id,
            userId: user.uid,
            steemUsername,
            amount,
            timestamp: serverTimestamp(), // Sempre usare serverTimestamp per maggiore sicurezza
            status: 'pending',
            userTier: userTier,
            userAgent: navigator.userAgent,
            createdAt: serverTimestamp(),
            processedAt: null
          });
            
          // 7. Aggiorna il timestamp dell'ultimo claim dell'utente
          // Nota: questo non aggiorna più direttamente lastFaucetClaim
          // La sicurezza è spostata nella transazione in updateLastFaucetClaim
            
          return {
            success: true,
            message: `Successfully claimed ${amount} STEEM!`,
            amount,
            timestamp: new Date(),
            steemUsername
          };
        })).pipe(
          switchMap(result => 
            // Utilizza il metodo updateLastFaucetClaim dall'authService che ora contiene
            // anche esso una transazione per massima sicurezza
            this.authService.updateLastFaucetClaim(user.uid, amount).pipe(
              map(() => result)
            )
          )
        );
      }),
      catchError(error => {
        console.error('Error processing claim:', error);
        return throwError(() => new Error(`Failed to process claim: ${error.message}`));
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
  
  // Metodo per ottenere le statistiche del faucet
  getFaucetStats(): Observable<{totalDistributed: number, totalUsers: number}> {
    const statsRef = doc(this.firestore, 'stats', 'faucet');
    
    return from(getDoc(statsRef)).pipe(
      map(docSnap => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          return {
            totalDistributed: data['totalDistributed'] || 0,
            totalUsers: data['totalUsers'] || 0
          };
        }
        return { totalDistributed: 0, totalUsers: 0 };
      })
    );
  }
}
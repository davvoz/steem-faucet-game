import { Injectable, NgZone } from '@angular/core';
import { 
  Auth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged, 
  User as FirebaseUser, 
  UserCredential, 
  GoogleAuthProvider, 
  signInWithPopup 
} from '@angular/fire/auth';
import { Firestore, doc, setDoc, getDoc, updateDoc, serverTimestamp } from '@angular/fire/firestore';
import { BehaviorSubject, Observable, from, of } from 'rxjs';
import { switchMap, map, tap, catchError } from 'rxjs/operators';
import { User } from '../models/user.model';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private currentUserSubject = new BehaviorSubject<User | null>(null);
  public currentUser$: Observable<User | null> = this.currentUserSubject.asObservable();
  public isAuthenticated$: Observable<boolean>;

  constructor(
    private auth: Auth,
    private firestore: Firestore,
    private ngZone: NgZone
  ) {
    this.isAuthenticated$ = this.currentUser$.pipe(
      map(user => !!user)
    );

    // Subscribe to Firebase auth state changes
    onAuthStateChanged(this.auth, (firebaseUser) => {
      if (firebaseUser) {
        this.getUserData(firebaseUser.uid).pipe(
          tap(userData => this.currentUserSubject.next(userData))
        ).subscribe();
      } else {
        this.currentUserSubject.next(null);
      }
    });
  }

  // Sign in with email and password
  signIn(email: string, password: string): Observable<UserCredential> {
    return from(signInWithEmailAndPassword(this.auth, email, password));
  }

  // Sign up with email and password
  signUp(email: string, password: string, displayName?: string): Observable<User> {
    return from(createUserWithEmailAndPassword(this.auth, email, password)).pipe(
      switchMap((credentials) => {
        const user: User = {
          uid: credentials.user.uid,
          email: email,
          displayName: displayName || '',
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        return this.createUserData(user);
      })
    );
  }

  // Sign in with Google
  signInWithGoogle(): Observable<User> {
    const provider = new GoogleAuthProvider();
    return this.ngZone.run(() => {
      return from(signInWithPopup(this.auth, provider)).pipe(
        switchMap((credentials) => {
          const user: User = {
            uid: credentials.user.uid,
            email: credentials.user.email!,
            displayName: credentials.user.displayName || '',
            photoURL: credentials.user.photoURL || '',
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          return this.updateUserData(user);
        })
      );
    });
  }

  // Sign out
  signOut(): Observable<void> {
    return this.ngZone.run(() => {
      return from(signOut(this.auth)).pipe(
        tap(() => {
          this.currentUserSubject.next(null);
        }),
        catchError(error => {
          console.error('Error during sign out:', error);
          return of(undefined);
        })
      );
    });
  }

  // Get current user data
  getUserData(uid: string): Observable<User> {
    const userDocRef = doc(this.firestore, `users/${uid}`);
    return this.ngZone.run(() => {
      return from(getDoc(userDocRef)).pipe(
        switchMap(docSnap => {
          if (docSnap.exists()) {
            return of(docSnap.data() as User);
          } else {
            // Instead of throwing an error, create a new user document
            console.log(`User ${uid} not found in Firestore, creating new record`);
            
            // Get the current Firebase user to access email and displayName
            const firebaseUser = this.auth.currentUser;
            if (!firebaseUser) {
              // If we can't get the Firebase user, create a minimal user record
              // to avoid type errors
              const fallbackUser: User = {
                uid: uid,
                email: '',
                displayName: '',
                createdAt: new Date(),
                updatedAt: new Date(),
              };
              return this.createUserData(fallbackUser);
            }
            
            const newUser: User = {
              uid: uid,
              email: firebaseUser.email || '',
              displayName: firebaseUser.displayName || '',
              photoURL: firebaseUser.photoURL || '',
              createdAt: new Date(),
              updatedAt: new Date(),
            };
            
            // Create the user in Firestore
            return this.createUserData(newUser);
          }
        })
      );
    });
  }

  // Create user data in Firestore
  private createUserData(user: User): Observable<User> {
    const userDocRef = doc(this.firestore, `users/${user.uid}`);
    return this.ngZone.run(() => {
      return from(setDoc(userDocRef, {
        ...user,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      })).pipe(
        map(() => user)
      );
    });
  }

  // Update user data in Firestore
  private updateUserData(user: User): Observable<User> {
    const userDocRef = doc(this.firestore, `users/${user.uid}`);
    
    return this.ngZone.run(() => {
      return from(getDoc(userDocRef)).pipe(
        switchMap(docSnap => {
          if (docSnap.exists()) {
            // Update existing user
            return from(updateDoc(userDocRef, {
              ...user,
              updatedAt: serverTimestamp()
            })).pipe(
              map(() => ({...user, ...docSnap.data()} as User))
            );
          } else {
            // Create new user
            return this.createUserData(user);
          }
        })
      );
    });
  }

  // Update user Steem information
  updateSteemInfo(uid: string, steemUsername: string, steemBalance?: number): Observable<void> {
    const userDocRef = doc(this.firestore, `users/${uid}`);
    const updateData: Partial<User> = {
      steemUsername,
      updatedAt: new Date()
    };

    if (steemBalance !== undefined) {
      updateData.steemBalance = steemBalance;
    }

    return this.ngZone.run(() => {
      return from(updateDoc(userDocRef, updateData));
    });
  }

  // Update last faucet claim timestamp with enhanced tracking
  updateLastFaucetClaim(uid: string, claimAmount: number): Observable<void> {
    const userDocRef = doc(this.firestore, `users/${uid}`);
    const now = new Date();
    
    return this.ngZone.run(() => {
      return from(getDoc(userDocRef)).pipe(
        switchMap(docSnap => {
          if (!docSnap.exists()) {
            return of(undefined);
          }
          
          const userData = docSnap.data() as User;
          const lastClaimDate = userData.lastFaucetClaim ? 
            (userData.lastFaucetClaim instanceof Date ? 
              userData.lastFaucetClaim : 
              new Date(userData.lastFaucetClaim)) : 
            null;
          const lastClaimStreak = userData.lastClaimStreak ? 
            (userData.lastClaimStreak instanceof Date ? 
              userData.lastClaimStreak : 
              new Date(userData.lastClaimStreak)) : 
            null;
            
          // Track consecutive claims
          let consecutiveClaims = userData.consecutiveClaims || 0;
          
          // If there was a previous claim, check if streak is maintained
          if (lastClaimDate) {
            const yesterday = new Date(now);
            yesterday.setDate(yesterday.getDate() - 1);
            
            const daysSinceLastClaim = Math.floor((now.getTime() - lastClaimDate.getTime()) / (1000 * 60 * 60 * 24));
            
            // If user claimed yesterday or today (within grace period), maintain/increase streak
            if (daysSinceLastClaim <= 1) {
              consecutiveClaims += 1;
            } else {
              // Streak broken, reset counter
              consecutiveClaims = 1;
            }
          } else {
            // First claim ever
            consecutiveClaims = 1;
          }
          
          // Calculate user's faucet tier based on consecutive claims
          let faucetTier = 1;
          
          if (consecutiveClaims >= 5) {
            faucetTier = 2;
          }
          
          // Update total claimed amount
          const totalClaimedAmount = (userData.totalClaimedAmount || 0) + claimAmount;
          
          // Update user data
          return from(updateDoc(userDocRef, {
            lastFaucetClaim: now,
            lastClaimStreak: now,
            consecutiveClaims: consecutiveClaims,
            faucetTier: faucetTier,
            totalClaimedAmount: totalClaimedAmount,
            lastClaimAmount: claimAmount,
            updatedAt: new Date()
          }));
        })
      );
    });
  }
}
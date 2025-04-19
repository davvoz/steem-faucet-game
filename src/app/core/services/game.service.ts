import { Injectable, NgZone } from '@angular/core';
import { Firestore, collection, addDoc, getDocs, query, where, orderBy, limit, serverTimestamp, doc, updateDoc, onSnapshot, QueryConstraint } from '@angular/fire/firestore';
import { BehaviorSubject, Observable, from, throwError, of } from 'rxjs';
import { map, switchMap, catchError, take } from 'rxjs/operators';
import { AuthService } from './auth.service';
import { GameRegistryService } from './game-registry.service';
import { GamePlugin, GamePlayResult } from '../models/game-plugin.interface';

export interface Game {
  id?: string;
  name: string;
  description: string;
  type: string;
  minReward: number;
  maxReward: number;
  cooldownMinutes: number;
  imageUrl?: string;
  active: boolean;
  pluginId?: string; // ID del plugin che implementa la logica del gioco
}

export interface GameResult {
  id?: string;
  userId: string;
  gameId: string;
  gameName: string;
  reward: number;
  timestamp: any; // Firebase timestamp
  metadata?: any; // Additional game-specific data
}

@Injectable({
  providedIn: 'root'
})
export class GameService {
  private gamesSubject = new BehaviorSubject<Game[]>([]);
  public games$ = this.gamesSubject.asObservable();

  constructor(
    private firestore: Firestore,
    private authService: AuthService,
    private gameRegistryService: GameRegistryService,
    private ngZone: NgZone  // Add NgZone for handling Firebase operations
  ) {
    // Load available games on service initialization
    this.loadGames();
  }

  // Load available games from Firestore
  private loadGames(): void {
    this.ngZone.run(() => {
      const gamesCollectionRef = collection(this.firestore, 'games');
      const activeGamesQuery = query(
        gamesCollectionRef,
        where('active', '==', true)
      );
      
      from(getDocs(activeGamesQuery)).pipe(
        map(snapshot => snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as Game))),
        switchMap(games => {
          // If no games are found, create default games
          if (games.length === 0) {
            console.log('No games found, creating default games');
            return this.createDefaultGames().pipe(
              // After creating default games, try to load them again
              switchMap(() => from(getDocs(activeGamesQuery)).pipe(
                map(snapshot => snapshot.docs.map(doc => ({
                  id: doc.id,
                  ...doc.data()
                } as Game)))
              ))
            );
          }
          return of(games);
        }),
        catchError(error => {
          console.error('Error loading games:', error);
          return of([]);
        })
      ).subscribe(games => {
        this.gamesSubject.next(games);
      });
    });
  }

  // Create default games in Firestore if none exist
  private createDefaultGames(): Observable<any> {
    console.log('Creating default games in Firestore');
    return this.ngZone.run(() => {
      const gamesCollectionRef = collection(this.firestore, 'games');
      
      // Define the default games
      const defaultGames: Game[] = [
        {
          name: 'Memory Game',
          description: 'Trova tutte le coppie di carte nel minor tempo e numero di mosse possibile.',
          type: 'Puzzle',
          minReward: 10,
          maxReward: 50,
          cooldownMinutes: 30,
          imageUrl: '/assets/images/default-game.jpg',
          active: true,
          pluginId: 'memory-game'
        },
        {
          name: 'Quiz Game',
          description: 'Metti alla prova le tue conoscenze su blockchain e criptovalute.',
          type: 'Quiz',
          minReward: 5,
          maxReward: 40,
          cooldownMinutes: 60,
          imageUrl: '/assets/images/default-game.jpg',
          active: true,
          pluginId: 'quiz-game'
        }
      ];
      
      // Add each game to Firestore
      const addGamePromises = defaultGames.map(game => addDoc(gamesCollectionRef, game));
      
      return from(Promise.all(addGamePromises));
    });
  }

  // Get a specific game by ID
  getGame(gameId: string): Observable<Game> {
    return this.games$.pipe(
      take(1),
      map(games => {
        const game = games.find(g => g.id === gameId);
        if (!game) {
          throw new Error('Game not found');
        }
        return game;
      })
    );
  }

  // Play a game and record the result
  playGame(gameId: string, gameMetadata: any = {}): Observable<GameResult> {
    return this.authService.currentUser$.pipe(
      take(1),
      switchMap(user => {
        if (!user) {
          return throwError(() => new Error('User not authenticated'));
        }
        
        return this.getGame(gameId).pipe(
          switchMap(game => {
            // Check if user can play (cooldown period)
            return this.canPlayGame(user.uid, gameId).pipe(
              switchMap(canPlay => {
                if (!canPlay.allowed) {
                  return throwError(() => new Error(`You can play again in ${canPlay.remainingMinutes} minutes`));
                }
                
                // Calculate reward based on game settings
                const reward = this.calculateReward(game.minReward, game.maxReward);
                
                return this.ngZone.run(() => {
                  // Record game result
                  const resultsCollectionRef = collection(this.firestore, 'game_results');
                  const gameResult: GameResult = {
                    userId: user.uid,
                    gameId: gameId,
                    gameName: game.name,
                    reward: reward,
                    timestamp: serverTimestamp(),
                    metadata: gameMetadata
                  };
                  
                  // Add result to Firestore
                  return from(addDoc(resultsCollectionRef, gameResult)).pipe(
                    switchMap(() => this.authService.updateGamePoints(user.uid, reward)),
                    map(() => gameResult)
                  );
                });
              })
            );
          })
        );
      })
    );
  }

  // Nuovo metodo per giocare utilizzando un plugin
  playGameWithPlugin(gameId: string, options?: any): Observable<GameResult> {
    return this.authService.currentUser$.pipe(
      take(1),
      switchMap(user => {
        if (!user) {
          return throwError(() => new Error('User not authenticated'));
        }
        
        return this.getGame(gameId).pipe(
          switchMap(game => {
            if (!game.pluginId || !this.gameRegistryService.hasGamePlugin(game.pluginId)) {
              return throwError(() => new Error('Plugin del gioco non trovato'));
            }

            return this.canPlayGame(user.uid, gameId).pipe(
              switchMap(canPlay => {
                if (!canPlay.allowed) {
                  return throwError(() => new Error(`Potrai giocare nuovamente tra ${canPlay.remainingMinutes} minuti`));
                }
                
                // Istanzia il plugin di gioco
                if (!game.pluginId) {
                  return throwError(() => new Error('Plugin ID del gioco non trovato'));
                }
                
                const gamePlugin = this.gameRegistryService.createGamePluginInstance(game.pluginId);
                if (!gamePlugin) {
                  return throwError(() => new Error('Impossibile creare il plugin del gioco'));
                }
                
                // Inizializza e poi esegui il gioco attraverso il plugin
                gamePlugin.initialize();
                
                // Esegui il gioco attraverso il plugin
                return from(gamePlugin.play(options)).pipe(
                  switchMap((result: GamePlayResult) => {
                    if (!result.success) {
                      return throwError(() => new Error('Gioco non completato con successo'));
                    }
                    
                    // Calcola la ricompensa basata sul punteggio del gioco
                    const reward = this.calculateGameReward(game, result.score);
                    
                    return this.ngZone.run(() => {
                      // Record game result
                      const resultsCollectionRef = collection(this.firestore, 'game_results');
                      const gameResult: GameResult = {
                        userId: user.uid,
                        gameId: gameId,
                        gameName: game.name,
                        reward: reward,
                        timestamp: serverTimestamp(),
                        metadata: result.metadata || {}
                      };
                      
                      // Add result to Firestore
                      return from(addDoc(resultsCollectionRef, gameResult)).pipe(
                        switchMap(() => this.authService.updateGamePoints(user.uid, reward)),
                        map(() => {
                          gamePlugin.cleanup(); // Pulisci risorse dopo aver finito
                          return gameResult;
                        })
                      );
                    });
                  })
                );
              })
            );
          })
        );
      })
    );
  }

  // Check if user can play a game (cooldown period)
  canPlayGame(userId: string, gameId: string): Observable<{allowed: boolean, remainingMinutes: number}> {
    return this.ngZone.run(() => {
      // Get the game to check cooldown period
      return this.getGame(gameId).pipe(
        take(1),
        switchMap(game => {
          const resultsCollectionRef = collection(this.firestore, 'game_results');
          const recentGameQuery = query(
            resultsCollectionRef,
            where('userId', '==', userId),
            where('gameId', '==', gameId),
            orderBy('timestamp', 'desc'),
            limit(1)
          );
          
          return from(getDocs(recentGameQuery)).pipe(
            map(snapshot => {
              if (snapshot.empty) {
                // No previous play, user can play
                return { allowed: true, remainingMinutes: 0 };
              }
              
              const lastPlay = snapshot.docs[0].data() as GameResult;
              const lastPlayTime = lastPlay.timestamp?.toDate(); // Convert Firebase timestamp to Date
              const now = new Date();
              
              // Handle case where timestamp might not be available yet (serverTimestamp is async)
              if (!lastPlayTime) {
                return { allowed: true, remainingMinutes: 0 };
              }
              
              const minutesSinceLastPlay = (now.getTime() - lastPlayTime.getTime()) / (1000 * 60);
              
              if (minutesSinceLastPlay >= game.cooldownMinutes) {
                return { allowed: true, remainingMinutes: 0 };
              } else {
                const remainingMinutes = Math.ceil(game.cooldownMinutes - minutesSinceLastPlay);
                return { allowed: false, remainingMinutes };
              }
            }),
            catchError(error => {
              console.error('Firestore index error in canPlayGame:', error);
              // If there's an index error, allow the user to play but log the error
              if (error.code === 'failed-precondition') {
                console.error('Firestore index error. Please create the required index:', 
                  'https://console.firebase.google.com/project/_/firestore/indexes');
                return of({ allowed: true, remainingMinutes: 0 });
              }
              return throwError(() => error);
            })
          );
        })
      );
    });
  }

  // Calculate random reward within min-max range
  private calculateReward(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1) + min);
  }

  // Calcola ricompensa basata sul punteggio e configurazione del gioco
  private calculateGameReward(game: Game, score: number): number {
    // Implementa una logica che tenga conto del punteggio ottenuto
    const baseReward = this.calculateReward(game.minReward, game.maxReward);
    const scoreMultiplier = Math.min(Math.max(score / 100, 0.5), 2); // Limita il moltiplicatore tra 0.5x e 2x
    return Math.round(baseReward * scoreMultiplier);
  }

  // Get user's game history
  getUserGameHistory(limitCount = 10): Observable<GameResult[]> {
    return this.authService.currentUser$.pipe(
      take(1),  // Take only one emission to complete the Observable
      switchMap(user => {
        if (!user) {
          return throwError(() => new Error('User not authenticated'));
        }
        
        return this.ngZone.run(() => {
          const resultsCollectionRef = collection(this.firestore, 'game_results');
          const userGamesQuery = query(
            resultsCollectionRef,
            where('userId', '==', user.uid),
            orderBy('timestamp', 'desc'),
            limit(limitCount)
          );
          
          return from(getDocs(userGamesQuery)).pipe(
            map(snapshot => snapshot.docs.map(doc => ({
              id: doc.id,
              ...doc.data()
            } as GameResult))),
            catchError(error => {
              if (error.code === 'failed-precondition') {
                // This is likely due to a missing index
                console.error('Firestore index error. Please create the required index:', 
                  'https://console.firebase.google.com/project/_/firestore/indexes');
                return of([] as GameResult[]);  // Return empty array instead of failing
              }
              return throwError(() => error);
            })
          );
        });
      })
    );
  }

  // Get global leaderboard
  getLeaderboard(limitCount = 20): Observable<any[]> {
    return this.ngZone.run(() => {
      // This would ideally be a Cloud Function aggregation
      // For simplicity, we'll query from a leaderboard collection
      // that would be updated by a background function
      const leaderboardCollectionRef = collection(this.firestore, 'leaderboard');
      const leaderboardQuery = query(
        leaderboardCollectionRef,
        orderBy('points', 'desc'),
        limit(limitCount) // Renamed parameter to avoid conflict with function name
      );
      
      return from(getDocs(leaderboardQuery)).pipe(
        map(snapshot => snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }))),
        catchError(error => {
          console.error('Error loading leaderboard:', error);
          return of([]);
        })
      );
    });
  }

  // Get real-time updates for the latest game result by gameId
  getLatestGameResultObservable(gameId: string): Observable<GameResult | null> {
    return this.authService.currentUser$.pipe(
      switchMap(user => {
        if (!user) {
          return of(null);
        }
        
        return new Observable<GameResult | null>(observer => {
          const resultsCollectionRef = collection(this.firestore, 'game_results');
          const constraints: QueryConstraint[] = [
            where('userId', '==', user.uid),
            where('gameId', '==', gameId),
            orderBy('timestamp', 'desc'),
            limit(1)
          ];
          
          const q = query(resultsCollectionRef, ...constraints);
          
          // Set up real-time listener
          const unsubscribe = onSnapshot(
            q,
            (snapshot) => {
              if (snapshot.empty) {
                observer.next(null);
              } else {
                const doc = snapshot.docs[0];
                observer.next({
                  id: doc.id,
                  ...doc.data()
                } as GameResult);
              }
            },
            (error) => {
              console.error('Error getting game results:', error);
              observer.error(error);
            }
          );
          
          // Clean up the listener when unsubscribing
          return () => unsubscribe();
        });
      })
    );
  }
}
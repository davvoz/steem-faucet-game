import { Component, OnInit, AfterViewChecked, ViewChild, ViewContainerRef, ComponentRef, OnDestroy, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Observable, of, catchError, tap, take, switchMap, Subscription } from 'rxjs';
import { Game, GameService, GameResult } from '../../core/services/game.service';
import { AuthService } from '../../core/services/auth.service';
import { GameRegistryService } from '../../core/services/game-registry.service';

@Component({
  selector: 'app-games',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './games.component.html',
  styleUrls: ['./games.component.scss']
})
export class GamesComponent implements OnInit, AfterViewChecked, OnDestroy {
  games$: Observable<Game[]>;
  gameHistory: any[] = [];
  isAuthenticated$: Observable<boolean>;
  userPoints = 0;
  activeGame: Game | null = null;
  isPlaying = false;
  gameResult: any = null;
  activeGameComponent: ComponentRef<any> | null = null;
  needsGameInit = false;
  private gameResultSubscription: Subscription | null = null;

  @ViewChild('gameContainer', { read: ViewContainerRef, static: false }) 
  gameContainer!: ViewContainerRef;

  constructor(
    private gameService: GameService,
    private authService: AuthService,
    private gameRegistryService: GameRegistryService,
    private ngZone: NgZone // Aggiunto NgZone
  ) {
    this.games$ = this.gameService.games$;
    this.isAuthenticated$ = this.authService.isAuthenticated$;
  }

  ngOnInit(): void {
    this.loadUserData();
    this.loadGameHistory();
  }

  ngAfterViewChecked(): void {
    const shouldInitGame = this.needsGameInit && this.gameContainer && this.activeGame?.pluginId;
    shouldInitGame && this.initializeGame();
  }

  ngOnDestroy(): void {
    this.cleanupGameComponent();
    if (this.gameResultSubscription) {
      this.gameResultSubscription.unsubscribe();
    }
  }

  initializeGame(): void {
    this.needsGameInit = false;
    if (this.activeGame && this.activeGame.pluginId) {
      this.loadGameComponent(this.activeGame.pluginId);
    }
  }

  loadUserData(): void {
    this.authService.currentUser$.pipe(
      take(1),
      tap(user => this.updateUserPoints(user))
    ).subscribe();
  }

  updateUserPoints(user: any): void {
    this.userPoints = user?.gamePoints || 0;
  }

  loadGameHistory(): void {
    this.isAuthenticated$.pipe(
      take(1),
      switchMap(isAuthenticated => isAuthenticated 
        ? this.ngZone.run(() => this.gameService.getUserGameHistory()) 
        : of([]))
    ).subscribe(history => {
      this.gameHistory = history;
    });
  }

  playGame(game: Game): void {
    this.activeGame = game;
    this.isPlaying = true;
    this.gameResult = null;
    this.needsGameInit = true;
  }

  closeGame(): void {
    this.cleanupGameComponent();
    this.resetGameState();
    this.refreshUserData();
  }

  cleanupGameComponent(): void {
    this.activeGameComponent?.destroy();
    this.activeGameComponent = null;
    this.gameContainer?.clear();
  }

  resetGameState(): void {
    this.activeGame = null;
    this.gameResult = null;
  }

  refreshUserData(): void {
    this.loadUserData();
    this.loadGameHistory();
  }

  private loadGameComponent(pluginId: string): void {
    this.ensureGameContainer() && this.createGameComponent(pluginId);
  }

  private ensureGameContainer(): boolean {
    const containerExists = Boolean(this.gameContainer);
    containerExists && this.gameContainer.clear();
    return containerExists;
  }

  private createGameComponent(pluginId: string): void {
    const gamePlugin = this.gameRegistryService.createGamePluginInstance(pluginId);
    
    !gamePlugin && this.logPluginError(pluginId);
    gamePlugin && this.instantiateGameComponent(pluginId);
  }

  private logPluginError(pluginId: string): void {
    console.error(`Plugin del gioco non trovato: ${pluginId}`);
  }

  private instantiateGameComponent(pluginId: string): void {
    const gameComponents = this.gameRegistryService.getGameComponents();
    const componentType = gameComponents[pluginId];
    
    componentType 
      ? this.createAndListenComponent(componentType)
      : console.error(`Tipo di gioco non supportato: ${pluginId}`);
  }

  private createAndListenComponent(componentType: any): void {
    if (!this.gameContainer) {
      console.error('Game container not found');
      return;
    }

    this.gameContainer.clear();
    this.activeGameComponent = this.gameContainer.createComponent(componentType);
    
    // Once component is created, listen for game results
    if (this.activeGame?.id) {
      this.listenForGameResults(this.activeGame.id);
    }
  }

  private listenForGameResults(gameId: string): void {
    // Unsubscribe from any existing subscription
    if (this.gameResultSubscription) {
      this.gameResultSubscription.unsubscribe();
    }
    
    this.ngZone.run(() => {
      // Use the game_results collection directly with a query that automatically updates
      this.gameResultSubscription = this.gameService.getLatestGameResultObservable(gameId)
        .subscribe(result => {
          if (result) {
            this.processNewResult(result);
          }
        });
    });
  }

  private processNewResult(result: any): void {
    this.gameResult = result;
    this.loadUserData();
  }

  simulateGamePlay(): void {
    const canPlay = Boolean(this.activeGame) && !this.isPlaying;
    canPlay && this.startGameSimulation();
  }

  startGameSimulation(): void {
    this.isPlaying = true;
    
    setTimeout(() => {
      this.activeGame && this.completeGameSimulation();
    }, 2000);
  }

  completeGameSimulation(): void {
    const simulatedGameResult = {
      success: true,
      score: Math.floor(Math.random() * 100) + 1,
      metadata: { action: 'play', simulated: true }
    };
    
    this.ngZone.run(() => {
      this.gameService.playGameWithPlugin(this.activeGame!.id!, simulatedGameResult).pipe(
        tap(result => this.handleGameResult(result)),
        catchError(error => this.handleGameError(error))
      ).subscribe();
    });
  }

  handleGameResult(result: any): void {
    this.gameResult = result;
    this.userPoints += result.reward;
    this.isPlaying = false;
  }

  handleGameError(error: any): Observable<null> {
    console.error('Errore durante il gioco:', error);
    this.isPlaying = false;
    return of(null);
  }

  login(): void {
    this.authService.signInWithGoogle().subscribe({
      next: () => console.log('Login successful'),
      error: (error) => console.error('Login failed:', error)
    });
  }
}
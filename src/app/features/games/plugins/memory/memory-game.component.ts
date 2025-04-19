import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription, of } from 'rxjs';
import { catchError, filter, map, take, tap } from 'rxjs/operators';
import { MemoryCardComponent } from './components/memory-card/memory-card.component';
import { MemoryScoreboardComponent } from './components/memory-scoreboard/memory-scoreboard.component';
import { MemoryGamePlugin } from './memory-game.plugin';
import { GameService } from '../../../../core/services/game.service';

@Component({
  selector: 'app-memory-game',
  standalone: true,
  imports: [CommonModule, MemoryCardComponent, MemoryScoreboardComponent],
  templateUrl: './memory-game.component.html',
  styleUrls: ['./memory-game.component.scss']
})
export class MemoryGameComponent implements OnInit, OnDestroy {
  cards: { id: number; flipped: boolean; matched: boolean }[] = [];
  moves = 0;
  matches = 0;
  isGameCompleted = false;
  elapsedTime = 0;
  timer: any = null;
  gameInitialized = false;
  errorMessage: string | null = null;
  private gamesSubscription: Subscription | null = null;

  constructor(
    private memoryGamePlugin: MemoryGamePlugin,
    private gameService: GameService
  ) { }

  ngOnInit(): void {
    this.initializeWithReactiveApproach();
  }

  ngOnDestroy(): void {
    this.stopTimer();
    // Clean up subscriptions
    if (this.gamesSubscription) {
      this.gamesSubscription.unsubscribe();
    }
    if (this.gameInitialized) {
      this.memoryGamePlugin.cleanup();
    }
  }

  initializeWithReactiveApproach(): void {
    // Use a reactive approach with retries
    this.gamesSubscription = this.gameService.games$
      .pipe(
        // Wait for games to be loaded and non-empty
        filter(games => games && games.length > 0),
        // Find the memory game
        map(games => games.find(g => g.pluginId === this.memoryGamePlugin.id)),
        // Handle the case where the game is not found
        filter(game => !!game),
        // Take only one emission (when found)
        take(1),
        tap(memoryGame => {
          if (memoryGame && memoryGame.id) {
            console.log('Memory game found:', memoryGame.id);
            // Use the game ID from the database
            this.memoryGamePlugin.id = memoryGame.id;
            this.gameInitialized = true;
            this.initializeGame();
          }
        }),
        // Implement better error handling
        catchError(error => {
          this.errorMessage = 'Error initializing the memory game.';
          console.error('Error in memory game initialization:', error);
          return of(null);
        })
      )
      .subscribe();
  }

  initializeGame(): void {
    if (!this.gameInitialized) return;
    
    this.memoryGamePlugin.initialize();
    this.cards = this.memoryGamePlugin.getCards();
    this.moves = this.memoryGamePlugin.getMoves();
    this.matches = this.memoryGamePlugin.getMatches();
    this.isGameCompleted = false;
    this.startTimer();
  }

  onCardClick(index: number): void {
    if (!this.gameInitialized) return;
    
    const result = this.memoryGamePlugin.flipCard(index);
    if (result) {
      this.cards = this.memoryGamePlugin.getCards();
      this.moves = this.memoryGamePlugin.getMoves();
      this.matches = this.memoryGamePlugin.getMatches();
      
      if (result.completed) {
        this.onGameCompleted();
      }
    }
  }

  async onGameCompleted(): Promise<void> {
    if (!this.gameInitialized) return;
    
    this.isGameCompleted = true;
    this.stopTimer();
    
    try {
      // Ensure we have valid values before passing them
      const moves = this.moves || 0;
      const timeMs = this.elapsedTime || 0;
      
      // Invia il risultato al servizio di gioco
      const gameResult = await this.memoryGamePlugin.play({
        moves: moves,
        timeMs: timeMs
      });
      
      // Usa il metodo playGameWithPlugin invece di submitGameResult
      this.gameService.playGameWithPlugin(this.memoryGamePlugin.id, gameResult)
        .subscribe({
          next: (result) => console.log('Game result submitted successfully', result),
          error: (error) => {
            console.error('Error submitting game result', error);
            this.errorMessage = 'Could not save game results. Try again later.';
          }
        });
    } catch (error) {
      console.error('Error processing game completion:', error);
      this.errorMessage = 'Error completing the game. Please try again.';
    }
  }

  restartGame(): void {
    this.stopTimer();
    this.errorMessage = '';
    this.initializeGame();
  }

  private startTime: number = 0;
  private timerInterval: any = null;
  
  private startTimer(): void {
    this.startTime = Date.now();
    this.timerInterval = setInterval(() => {
      this.elapsedTime = Date.now() - this.startTime;
    }, 100);
  }

  private stopTimer(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }
}
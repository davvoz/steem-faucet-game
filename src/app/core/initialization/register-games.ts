import { APP_INITIALIZER, Provider } from '@angular/core';
import { GameRegistryService } from '../services/game-registry.service';

// Import game plugins
import { MemoryGamePlugin } from '../../features/games/plugins/memory/memory-game.plugin';
import { QuizGamePlugin } from '../../features/games/plugins/quiz/quiz-game.plugin';

export function registerGamesFactory(gameRegistry: GameRegistryService) {
  return () => {
    // Register available games
    gameRegistry.registerGame('memory-game', MemoryGamePlugin);
    gameRegistry.registerGame('quiz-game', QuizGamePlugin);
    
    console.log('Sistema di registrazione giochi inizializzato');
    return Promise.resolve();
  };
}

export const REGISTER_GAMES_PROVIDER: Provider = {
  provide: APP_INITIALIZER,
  useFactory: registerGamesFactory,
  deps: [GameRegistryService],
  multi: true
};
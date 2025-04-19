import { Injectable, Type, Injector } from '@angular/core';
import { GamePlugin } from '../models/game-plugin.interface';
import { MemoryGameComponent } from '../../features/games/plugins/memory/memory-game.component';
import { QuizGameComponent } from '../../features/games/plugins/quiz/quiz-game.component';

@Injectable({
  providedIn: 'root'
})
export class GameRegistryService {
  private gamePlugins = new Map<string, Type<GamePlugin>>();
  private gameComponentsMap: { [key: string]: any } = {
    'memory-game': MemoryGameComponent,
    'quiz-game': QuizGameComponent
  };

  constructor(private injector: Injector) {}

  registerGame(gameId: string, pluginComponent: Type<GamePlugin>): void {
    this.gamePlugins.set(gameId, pluginComponent);
  }

  getGamePlugin(gameId: string): Type<GamePlugin> | undefined {
    return this.gamePlugins.get(gameId);
  }

  createGamePluginInstance(gameId: string): GamePlugin | undefined {
    const pluginType = this.getGamePlugin(gameId);
    if (!pluginType) {
      return undefined;
    }

    try {
      return this.injector.get(pluginType);
    } catch (error) {
      console.error(`Errore nella creazione del plugin per il gioco ${gameId}:`, error);
      return undefined;
    }
  }

  hasGamePlugin(gameId: string): boolean {
    return this.gamePlugins.has(gameId);
  }

  getAllRegisteredGameIds(): string[] {
    return Array.from(this.gamePlugins.keys());
  }
  
  getGameComponents(): { [key: string]: any } {
    return this.gameComponentsMap;
  }
}
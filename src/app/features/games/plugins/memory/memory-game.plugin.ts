import { Injectable } from '@angular/core';
import { GamePlugin, GamePlayResult } from '../../../../core/models/game-plugin.interface';
import { MemoryGameComponent } from './memory-game.component';

@Injectable({
  providedIn: 'root'
})
export class MemoryGamePlugin implements GamePlugin {
  id = 'memory-game';
  name = 'Memory Game';
  component = MemoryGameComponent;
  
  private cards: {id: number, flipped: boolean, matched: boolean}[] = [];
  private flippedCards: number[] = [];
  private moves = 0;
  private matches = 0;
  
  initialize(): void {
    // Genera una griglia di carte per il memory game
    const cardPairs = 8; // 16 carte totali (8 coppie)
    this.cards = [];
    this.flippedCards = [];
    this.moves = 0;
    this.matches = 0;
    
    // Crea le coppie di carte
    for (let i = 0; i < cardPairs; i++) {
      this.cards.push({ id: i, flipped: false, matched: false });
      this.cards.push({ id: i, flipped: false, matched: false });
    }
    
    // Mescola le carte
    this.shuffleCards();
  }
  
  async play(options?: any): Promise<GamePlayResult> {
    // Il punteggio è calcolato in base a:
    // - Numero di mosse (meno mosse = più punti)
    // - Tempo impiegato (meno tempo = più punti)
    const { moves, timeMs } = options || { moves: 30, timeMs: 60000 };
    
    const maxScore = 100;
    const maxMoves = 30;
    const maxTimeMs = 60000; // 60 secondi
    
    // Formula punteggio: più basso è meglio (meno mosse, meno tempo)
    const moveScore = Math.max(0, 100 - ((moves / maxMoves) * 60));
    const timeScore = Math.max(0, 100 - ((timeMs / maxTimeMs) * 40));
    
    // Score finale da 0 a 100
    const finalScore = Math.round((moveScore + timeScore) / 2);
    
    return {
      success: true,
      score: finalScore,
      metadata: {
        moves,
        timeMs,
        pairs: this.matches
      }
    };
  }
  
  cleanup(): void {
    // Pulizia risorse se necessario
    this.cards = [];
    this.flippedCards = [];
  }
  
  // Metodo interno per mescolare le carte
  private shuffleCards(): void {
    for (let i = this.cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
    }
  }
  
  // Metodo che può essere chiamato dal componente
  flipCard(index: number): {matched: boolean, completed: boolean} | null {
    if (this.flippedCards.length >= 2 || this.cards[index].flipped || this.cards[index].matched) {
      return null; // Non puoi girare più di 2 carte o carte già girate/abbinate
    }
    
    this.cards[index].flipped = true;
    this.flippedCards.push(index);
    
    if (this.flippedCards.length === 2) {
      this.moves++;
      
      const [firstIndex, secondIndex] = this.flippedCards;
      const matched = this.cards[firstIndex].id === this.cards[secondIndex].id;
      
      if (matched) {
        this.cards[firstIndex].matched = true;
        this.cards[secondIndex].matched = true;
        this.matches++;
        this.flippedCards = [];
      } else {
        // Nel componente verranno rigirate dopo un timeout
        setTimeout(() => {
          this.cards[firstIndex].flipped = false;
          this.cards[secondIndex].flipped = false;
          this.flippedCards = [];
        }, 1000);
      }
      
      return {
        matched,
        completed: this.matches === this.cards.length / 2
      };
    }
    
    return null;
  }
  
  // Getter per accedere alle carte dall'esterno
  getCards(): {id: number, flipped: boolean, matched: boolean}[] {
    return [...this.cards];
  }
  
  // Getter per i contatori
  getMoves(): number {
    return this.moves;
  }
  
  getMatches(): number {
    return this.matches;
  }
}
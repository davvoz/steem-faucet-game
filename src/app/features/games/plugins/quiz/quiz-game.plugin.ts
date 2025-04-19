import { Injectable } from '@angular/core';
import { GamePlugin, GamePlayResult } from '../../../../core/models/game-plugin.interface';
import { QuizGameComponent } from './quiz-game.component';

export interface QuizQuestion {
  id: number;
  question: string;
  options: string[];
  correctAnswer: number;
  answered?: boolean;
  selectedOption?: number;
}

@Injectable({
  providedIn: 'root'
})
export class QuizGamePlugin implements GamePlugin {
  id = 'quiz-game';
  name = 'Quiz Game';
  component = QuizGameComponent;
  
  private questions: QuizQuestion[] = [];
  private currentQuestionIndex = 0;
  private correctAnswers = 0;
  private timeSpent = 0;
  
  initialize(): void {
    this.questions = this.generateQuestions();
    this.currentQuestionIndex = 0;
    this.correctAnswers = 0;
    this.timeSpent = 0;
    
    // Reimposta lo stato delle domande
    this.questions.forEach(q => {
      q.answered = false;
      q.selectedOption = undefined;
    });
  }
  
  async play(options?: any): Promise<GamePlayResult> {
    // Il punteggio è calcolato in base a:
    // - Risposte corrette
    // - Tempo impiegato
    
    const { correctAnswers, timeMs } = options || { correctAnswers: 0, timeMs: 0 };
    
    const totalQuestions = this.questions.length;
    const maxTimeMs = totalQuestions * 15000; // 15 secondi per domanda
    
    // Formula punteggio: più risposte corrette = più punti, meno tempo = più punti
    const answerScore = (correctAnswers / totalQuestions) * 80; // 80% del punteggio
    const timeScore = Math.max(0, 20 - ((timeMs / maxTimeMs) * 20)); // 20% del punteggio
    
    // Score finale da 0 a 100
    const finalScore = Math.round(answerScore + timeScore);
    
    return {
      success: true,
      score: finalScore,
      metadata: {
        correctAnswers,
        totalQuestions,
        timeMs
      }
    };
  }
  
  cleanup(): void {
    this.questions = [];
  }
  
  getQuestions(): QuizQuestion[] {
    return [...this.questions];
  }
  
  getCurrentQuestion(): QuizQuestion | null {
    if (this.currentQuestionIndex >= this.questions.length) {
      return null;
    }
    
    return this.questions[this.currentQuestionIndex];
  }
  
  answerQuestion(optionIndex: number): boolean {
    const currentQuestion = this.getCurrentQuestion();
    if (!currentQuestion || currentQuestion.answered) {
      return false;
    }
    
    // Registra la risposta
    currentQuestion.answered = true;
    currentQuestion.selectedOption = optionIndex;
    
    // Controlla se è corretta
    const isCorrect = currentQuestion.correctAnswer === optionIndex;
    if (isCorrect) {
      this.correctAnswers++;
    }
    
    return isCorrect;
  }
  
  nextQuestion(): boolean {
    if (this.currentQuestionIndex < this.questions.length - 1) {
      this.currentQuestionIndex++;
      return true;
    }
    return false;
  }
  
  isLastQuestion(): boolean {
    return this.currentQuestionIndex === this.questions.length - 1;
  }
  
  isQuizCompleted(): boolean {
    return this.questions.every(q => q.answered);
  }
  
  getStats(): { totalQuestions: number, correctAnswers: number, progress: number } {
    return {
      totalQuestions: this.questions.length,
      correctAnswers: this.correctAnswers,
      progress: this.currentQuestionIndex + 1
    };
  }
  
  private generateQuestions(): QuizQuestion[] {
    // In un'implementazione reale, queste domande potrebbero provenire da un database o API
    return [
      {
        id: 1,
        question: 'Quale criptovaluta è stata la prima ad essere creata?',
        options: ['Ethereum', 'Bitcoin', 'Litecoin', 'Dogecoin'],
        correctAnswer: 1  // L'indice 1 corrisponde a Bitcoin
      },
      {
        id: 2,
        question: 'Chi ha creato Bitcoin?',
        options: ['Vitalik Buterin', 'Satoshi Nakamoto', 'Charlie Lee', 'Elon Musk'],
        correctAnswer: 1  // L'indice 1 corrisponde a Satoshi Nakamoto
      },
      {
        id: 3,
        question: 'In quale anno è stato pubblicato il white paper di Bitcoin?',
        options: ['2007', '2008', '2009', '2010'],
        correctAnswer: 1  // L'indice 1 corrisponde a 2008
      },
      {
        id: 4,
        question: 'Qual è il limite massimo di Bitcoin che possono essere creati?',
        options: ['10 milioni', '21 milioni', '100 milioni', 'Nessun limite'],
        correctAnswer: 1  // L'indice 1 corrisponde a 21 milioni
      },
      {
        id: 5,
        question: 'Quale di questi termini si riferisce al processo di validazione delle transazioni in blockchain?',
        options: ['Mining', 'Hashing', 'Staking', 'Tutte le precedenti'],
        correctAnswer: 3  // L'indice 3 corrisponde a Tutte le precedenti
      }
    ];
  }
}
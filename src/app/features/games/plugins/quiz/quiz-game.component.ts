import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { QuizGamePlugin, QuizQuestion } from './quiz-game.plugin';
import { GameService } from '../../../../core/services/game.service';

@Component({
  selector: 'app-quiz-game',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './quiz-game.component.html',
  styleUrls: ['./quiz-game.component.scss']
})
export class QuizGameComponent implements OnInit, OnDestroy {
  currentQuestion: QuizQuestion | null = null;
  questions: QuizQuestion[] = [];
  isLastQuestion = false;
  isQuizCompleted = false;
  startTime: number = 0;
  elapsedTime: number = 0;
  timerInterval: any;
  stats: { totalQuestions: number, correctAnswers: number, progress: number } = {
    totalQuestions: 0,
    correctAnswers: 0,
    progress: 0
  };

  constructor(
    private quizGamePlugin: QuizGamePlugin,
    private gameService: GameService
  ) { }

  ngOnInit(): void {
    this.initializeQuiz();
  }

  ngOnDestroy(): void {
    this.stopTimer();
    this.quizGamePlugin.cleanup();
  }

  initializeQuiz(): void {
    this.quizGamePlugin.initialize();
    this.questions = this.quizGamePlugin.getQuestions();
    this.currentQuestion = this.quizGamePlugin.getCurrentQuestion();
    this.isLastQuestion = this.quizGamePlugin.isLastQuestion();
    this.isQuizCompleted = false;
    this.stats = this.quizGamePlugin.getStats();
    this.startTimer();
  }

  onAnswerSelected(optionIndex: number): void {
    if (!this.currentQuestion || this.currentQuestion.answered) {
      return;
    }

    const isCorrect = this.quizGamePlugin.answerQuestion(optionIndex);
    this.currentQuestion = this.quizGamePlugin.getCurrentQuestion();
    this.stats = this.quizGamePlugin.getStats();

    // Aggiorna la UI dando tempo all'utente di vedere il risultato
    setTimeout(() => {
      if (this.quizGamePlugin.isLastQuestion()) {
        this.completeQuiz();
      } else {
        this.quizGamePlugin.nextQuestion();
        this.currentQuestion = this.quizGamePlugin.getCurrentQuestion();
        this.isLastQuestion = this.quizGamePlugin.isLastQuestion();
        this.stats = this.quizGamePlugin.getStats();
      }
    }, 1000);
  }

  nextQuestion(): void {
    if (this.quizGamePlugin.nextQuestion()) {
      this.currentQuestion = this.quizGamePlugin.getCurrentQuestion();
      this.isLastQuestion = this.quizGamePlugin.isLastQuestion();
      this.stats = this.quizGamePlugin.getStats();
    } else {
      this.completeQuiz();
    }
  }

  async completeQuiz(): Promise<void> {
    this.isQuizCompleted = true;
    this.stopTimer();

    // Invia il risultato al servizio di gioco
    const gameResult = await this.quizGamePlugin.play({
      correctAnswers: this.stats.correctAnswers,
      timeMs: this.elapsedTime
    });

    // Usa il metodo playGameWithPlugin invece di submitGameResult
    this.gameService.playGameWithPlugin(this.quizGamePlugin.id, gameResult)
      .subscribe({
        next: (result) => console.log('Quiz result submitted successfully', result),
        error: (error) => console.error('Error submitting quiz result', error)
      });
  }

  restartQuiz(): void {
    this.stopTimer();
    this.initializeQuiz();
  }

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
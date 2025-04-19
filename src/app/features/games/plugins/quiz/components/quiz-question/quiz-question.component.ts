import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { QuizQuestion } from '../../quiz-game.plugin';

@Component({
  selector: 'app-quiz-question',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './quiz-question.component.html',
  styleUrls: ['./quiz-question.component.scss']
})
export class QuizQuestionComponent {
  @Input() question: QuizQuestion | null = null;
  @Input() questionNumber: number = 1;
  @Input() totalQuestions: number = 5;
  @Output() optionSelected = new EventEmitter<number>();

  onOptionSelect(optionIndex: number): void {
    if (this.question && !this.question.answered) {
      this.optionSelected.emit(optionIndex);
    }
  }
}

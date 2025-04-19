import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-memory-scoreboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './memory-scoreboard.component.html',
  styleUrls: ['./memory-scoreboard.component.scss']
})
export class MemoryScoreboardComponent {
  @Input() moves: number = 0;
  @Input() matches: number = 0;
  @Input() totalPairs: number = 8;
  @Input() elapsedTime: number = 0;
  @Input() gameCompleted: boolean = false;
  @Output() restart = new EventEmitter<void>();

  formatTime(milliseconds: number): string {
    const seconds = Math.floor((milliseconds / 1000) % 60);
    const minutes = Math.floor((milliseconds / (1000 * 60)) % 60);
    
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  onRestart(): void {
    this.restart.emit();
  }
}

import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-memory-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './memory-card.component.html',
  styleUrls: ['./memory-card.component.scss']
})
export class MemoryCardComponent {
  @Input() card: { id: number, flipped: boolean, matched: boolean } = { id: 0, flipped: false, matched: false };
  @Input() index: number = 0;
  @Output() cardClick = new EventEmitter<number>();

  onClick(): void {
    if (!this.card.flipped && !this.card.matched) {
      this.cardClick.emit(this.index);
    }
  }
}

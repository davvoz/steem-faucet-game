import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminService, FirestoreCollection } from '../../../core/services/admin.service';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin.component.html',
  styleUrl: './admin.component.scss'
})
export class AdminComponent {
  collections: { name: FirestoreCollection; selected: boolean }[] = [
    { name: 'game_results', selected: false },
    { name: 'faucet_claims', selected: false },
    { name: 'games', selected: false },
    { name: 'leaderboard', selected: false },
    { name: 'users', selected: false }
  ];
  
  isResetting = false;
  resetResults: string[] = [];

  constructor(private adminService: AdminService) {}

  resetSelected() {
    const selectedCollections = this.collections
      .filter(coll => coll.selected)
      .map(coll => coll.name);
    
    if (selectedCollections.length === 0) {
      this.resetResults = ['Seleziona almeno una tabella da resettare'];
      return;
    }
    
    this.isResetting = true;
    this.resetResults = [`Operazione di reset iniziata per: ${selectedCollections.join(', ')}`];
    
    this.adminService.resetCollections(selectedCollections).subscribe({
      next: (results) => {
        this.resetResults = results;
        this.isResetting = false;
      },
      error: (error) => {
        this.resetResults = [`Errore durante il reset: ${error.message}`];
        this.isResetting = false;
      }
    });
  }

  toggleAll(select: boolean) {
    this.collections.forEach(coll => coll.selected = select);
  }
  
  hasSelectedCollections(): boolean {
    return this.collections.some(c => c.selected);
  }
}

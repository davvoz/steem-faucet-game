import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GameService } from '../../core/services/game.service';
import { AuthService } from '../../core/services/auth.service';
import { Observable, of, switchMap, tap } from 'rxjs';

interface LeaderboardEntry {
  id: string;
  displayName: string;
  photoURL?: string;
  steemUsername?: string;
  points: number;
  rank?: number;
}

@Component({
  selector: 'app-leaderboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './leaderboard.component.html',
  styleUrls: ['./leaderboard.component.scss']
})
export class LeaderboardComponent implements OnInit {
  leaderboard: LeaderboardEntry[] = [];
  isAuthenticated$: Observable<boolean>;
  currentUserId: string | null = null;
  userRank: LeaderboardEntry | null = null;

  constructor(
    private gameService: GameService,
    private authService: AuthService
  ) {
    this.isAuthenticated$ = this.authService.isAuthenticated$;
  }

  ngOnInit(): void {
    this.loadLeaderboardData();
    this.loadUserData();
  }

  loadLeaderboardData(): void {
    this.gameService.getLeaderboard().subscribe(data => {
      this.leaderboard = data.map((entry: any, index: number) => ({
        ...entry,
        rank: index + 1
      }));
    });
  }

  loadUserData(): void {
    this.authService.currentUser$.pipe(
      tap(user => {
        if (user) {
          this.currentUserId = user.uid;
          
          // Find user in the leaderboard
          const userInLeaderboard = this.leaderboard.find(entry => entry.id === user.uid);
          if (userInLeaderboard) {
            this.userRank = userInLeaderboard;
          } else if (user.gamePoints !== undefined) {
            // If user is not in top leaderboard but has points
            this.userRank = {
              id: user.uid,
              displayName: user.displayName || 'Utente',
              photoURL: user.photoURL,
              steemUsername: user.steemUsername,
              points: user.gamePoints,
              rank: this.calculateUserRank(user.gamePoints)
            };
          }
        }
      })
    ).subscribe();
  }

  calculateUserRank(userPoints: number): number {
    // Count how many users have more points
    const usersWithMorePoints = this.leaderboard.filter(entry => entry.points > userPoints).length;
    return usersWithMorePoints + 1;
  }

  getInitials(name: string): string {
    if (!name) return '?';
    return name
      .split(' ')
      .map(word => word.charAt(0).toUpperCase())
      .slice(0, 2)
      .join('');
  }
}
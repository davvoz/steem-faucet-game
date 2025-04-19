import { Injectable } from '@angular/core';
import { Firestore, collection, getDocs, doc, deleteDoc, query, limit } from '@angular/fire/firestore';
import { Observable, from, forkJoin, of } from 'rxjs';
import { map, switchMap, catchError, tap } from 'rxjs/operators';
import { NotificationService } from './notification.service';

/**
 * Collections that can be reset in the application database
 */
export type FirestoreCollection = 'game_results' | 'faucet_claims' | 'games' | 'leaderboard' | 'users';

@Injectable({
  providedIn: 'root'
})
export class AdminService {

  constructor(
    private firestore: Firestore,
    private notificationService: NotificationService
  ) { }

  /**
   * Reset specified collections in Firestore database
   * @param collections Array of collection names to reset
   * @returns Observable with results of database operations
   */
  resetCollections(collections: FirestoreCollection[]): Observable<string[]> {
    if (!collections || collections.length === 0) {
      return of(['No collections specified for reset']);
    }

    // Create observables for each collection reset
    const resetOperations = collections.map(collectionName => 
      this.deleteAllDocumentsInCollection(collectionName)
    );

    return forkJoin(resetOperations).pipe(
      tap(results => {
        // Show a notification with the results
        const successMessage = `Database tables reset successfully: ${collections.join(', ')}`;
        this.notificationService.success(successMessage);
      }),
      catchError(error => {
        const errorMessage = `Error resetting database: ${error.message}`;
        this.notificationService.error(errorMessage);
        return of([errorMessage]);
      })
    );
  }

  /**
   * Delete all documents in a specific collection
   * @param collectionName Name of the collection to reset
   * @returns Observable with the result message
   */
  private deleteAllDocumentsInCollection(collectionName: FirestoreCollection): Observable<string> {
    const collectionRef = collection(this.firestore, collectionName);
    
    return from(getDocs(collectionRef)).pipe(
      switchMap(snapshot => {
        if (snapshot.empty) {
          return of(`Collection ${collectionName} is already empty`);
        }
        
        const deleteOperations = snapshot.docs.map(docSnapshot => {
          const docRef = doc(this.firestore, `${collectionName}/${docSnapshot.id}`);
          return from(deleteDoc(docRef));
        });
        
        // Execute all delete operations and return result
        return forkJoin(deleteOperations).pipe(
          map(() => `Deleted ${snapshot.size} documents from ${collectionName}`)
        );
      }),
      catchError(error => {
        console.error(`Error deleting collection ${collectionName}:`, error);
        return of(`Error deleting collection ${collectionName}: ${error.message}`);
      })
    );
  }
}

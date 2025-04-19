import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export interface Notification {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
  timeout?: number;
}

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private notificationsSubject = new BehaviorSubject<Notification[]>([]);
  public notifications$ = this.notificationsSubject.asObservable();

  constructor() {}

  // Show a success notification
  success(message: string, timeout: number = 5000): string {
    return this.addNotification({
      id: this.generateId(),
      type: 'success',
      message,
      timeout
    });
  }

  // Show an error notification
  error(message: string, timeout: number = 7000): string {
    return this.addNotification({
      id: this.generateId(),
      type: 'error',
      message,
      timeout
    });
  }

  // Show an info notification
  info(message: string, timeout: number = 4000): string {
    return this.addNotification({
      id: this.generateId(),
      type: 'info',
      message,
      timeout
    });
  }

  // Show a warning notification
  warning(message: string, timeout: number = 6000): string {
    return this.addNotification({
      id: this.generateId(),
      type: 'warning',
      message,
      timeout
    });
  }

  // Remove notification by id
  remove(id: string): void {
    const currentNotifications = this.notificationsSubject.value;
    this.notificationsSubject.next(
      currentNotifications.filter(notification => notification.id !== id)
    );
  }

  // Clear all notifications
  clear(): void {
    this.notificationsSubject.next([]);
  }

  // Private method to add a notification
  private addNotification(notification: Notification): string {
    const currentNotifications = this.notificationsSubject.value;
    this.notificationsSubject.next([...currentNotifications, notification]);

    // Auto-remove notification after timeout if specified
    if (notification.timeout) {
      setTimeout(() => {
        this.remove(notification.id);
      }, notification.timeout);
    }

    return notification.id;
  }

  // Generate a unique ID for each notification
  private generateId(): string {
    return Math.random().toString(36).substring(2, 15);
  }
}
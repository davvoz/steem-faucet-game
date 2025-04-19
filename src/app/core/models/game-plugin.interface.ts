export interface GamePlugin {
  id: string;
  name: string;
  component: any; // Riferimento al componente Angular
  initialize(): void;
  play(options?: any): Promise<GamePlayResult>;
  cleanup(): void;
}

export interface GamePlayResult {
  success: boolean;
  score: number;
  metadata?: any;
}
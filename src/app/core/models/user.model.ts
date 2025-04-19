export interface User {
  uid: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  steemUsername?: string;
  steemBalance?: number;
  lastFaucetClaim?: Date;
  gamePoints?: number;
  createdAt: Date;
  updatedAt: Date;
  isAdmin?: boolean;  // Adding isAdmin property
  
  // New faucet-related fields
  consecutiveClaims?: number;     // Number of consecutive daily claims
  lastClaimStreak?: Date;         // Date to track claim streak
  totalClaimedAmount?: number;    // Total amount claimed from faucet
  faucetTier?: number;            // User's faucet tier (1, 2, or 3)
  lastClaimAmount?: number;       // Amount of last claim
  claimHistory?: FaucetClaim[];   // Individual claim history
}

// Interface for individual faucet claims
export interface FaucetClaim {
  amount: number;
  timestamp: Date;
  steemUsername: string;
  status: 'pending' | 'completed' | 'failed';
}
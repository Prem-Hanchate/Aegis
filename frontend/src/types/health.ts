export interface BackendHealthResponse {
  status: string;
  service: string;
  environment: string;
  timestamp: string;
  database: {
    connected: boolean;
    readyState: number;
    name: string | null;
  };
  blockchain?: {
    configured: boolean;
    connected: boolean;
    chainId: string | null;
    lastSyncAttemptAt: string | null;
    lastSyncError: string | null;
  };
}

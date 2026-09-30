export interface User {
    id: string;
    username?: string;
    role?: "user" | "admin";
    helmholtz_sub?: string;
}

export interface TermsAcceptanceStatus {
    current_terms_version: string;
    accepted_terms_version?: string | null;
    terms_accepted_at?: string | null;
}

export type AuthState =
    | {
          authenticated: true;
          user: User;
          legal: TermsAcceptanceStatus | null;
      }
    | {
          authenticated: false;
          user: null;
          legal: TermsAcceptanceStatus | null;
      };

export interface LegalDocument {
    document: string;
    title: string;
    version: string;
    body: string;
    published_at?: string | null;
}

export type AuthContextType = AuthState & {
    loading: boolean;
    acceptTerms: () => Promise<boolean>;
    checkAuth: () => Promise<void>;
    logout: () => void;
    logoutWithConfirmation: () => void;
};

export type RunState =
    | "started"
    | "success"
    | "failure"
    | "pending"
    | "timeout"
    | "empty_result";

export interface RunMetrics {
    started_at?: string;
    finished_at?: string;
    queue_wait_seconds?: number;
    execution_seconds?: number;
    total_seconds?: number;
}

export interface PipelineRun {
    _id: string;
    run_name: string;
    pipeline: string;
    status: RunState;
    timestamp: string;
    user_id: string;
    error_message?: string;
    priority: "high" | "default";
    queue_position: [number, number]; // [highPriorityAhead, defaultPriorityAhead]
    metrics?: RunMetrics;
}

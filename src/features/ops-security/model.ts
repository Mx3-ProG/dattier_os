/** Shared vocabulary of the Security Center. Pure: safe for client components. */
export const severities = [
  "DEBUG",
  "INFO",
  "NOTICE",
  "WARNING",
  "ERROR",
  "CRITICAL",
] as const;
export type SeverityName = (typeof severities)[number];
/** 1 = DEBUG … 6 = CRITICAL, as stored in ops_security_events.severity. */
export const level = (name: SeverityName) => severities.indexOf(name) + 1;
export const severityName = (n: number): SeverityName =>
  severities[Math.min(Math.max(n, 1), 6) - 1];
export const severityLabels: Record<SeverityName, string> = {
  DEBUG: "Diagnostic",
  INFO: "Information",
  NOTICE: "Sensible",
  WARNING: "Avertissement",
  ERROR: "Erreur",
  CRITICAL: "Critique",
};

export const resolutionStatuses = [
  "detected",
  "analyzing",
  "auto_fixing",
  "auto_resolved",
  "intervention_required",
  "manually_resolved",
] as const;
export type ResolutionStatus = (typeof resolutionStatuses)[number];
export const resolutionLabels: Record<ResolutionStatus, string> = {
  detected: "Détecté",
  analyzing: "En cours d’analyse",
  auto_fixing: "Correction automatique en cours",
  auto_resolved: "Résolu automatiquement",
  intervention_required: "Intervention nécessaire",
  manually_resolved: "Résolu manuellement",
};
export const openStatuses: ResolutionStatus[] = [
  "detected",
  "analyzing",
  "auto_fixing",
  "intervention_required",
];

export const modules = {
  auth: "Connexion",
  orders: "Commandes",
  kitchen: "Cuisine & bar",
  payments: "Paiements",
  stock: "Stocks",
  purchases: "Achats",
  reservations: "Réservations",
  team: "Équipe",
  customers: "Clients & fidélité",
  catalog: "Carte",
  settings: "Configuration",
  notifications: "Notifications",
  email: "E-mails",
  security: "Sécurité",
  system: "Système",
} as const;
export type ModuleId = keyof typeof modules;

export const remediationLabels: Record<string, string> = {
  observed: "Observée (non exécutée)",
  scheduled: "Planifiée",
  running: "En cours",
  succeeded: "Réussie",
  failed: "Échouée · nouvelle tentative prévue",
  abandoned: "Abandonnée · intervention nécessaire",
  awaiting_approval: "En attente d’autorisation",
  rejected: "Refusée",
};

export type SecurityEvent = {
  event_id: string;
  occurred_at: string;
  severity: number;
  event_type: string;
  module: string;
  action: string;
  actor_id: string | null;
  actor_name: string | null;
  restaurant_id: string | null;
  session_id: string | null;
  correlation_id: string | null;
  resource_id: string | null;
  status: "success" | "failure" | "info";
  error_code: string | null;
  message: string;
  /** null when the viewer may not see technical details. */
  technical_details: Record<string, unknown> | null;
  resolution_status: ResolutionStatus | null;
  incident_id: string | null;
};
export type SecurityIncident = {
  id: string;
  rule_id: string;
  restaurant_id: string | null;
  severity: number;
  module: string;
  title: string;
  user_message: string;
  intervention_level: "A" | "B" | "C";
  status: ResolutionStatus;
  occurrences: number;
  opened_at: string;
  updated_at: string;
  resolved_at: string | null;
  resolution_note: string | null;
  context: Record<string, unknown> | null;
};
export type Remediation = {
  id: string;
  incident_id: string;
  incident_title: string;
  action: string;
  action_label: string;
  intervention_level: "A" | "B";
  status: string;
  attempts: number;
  max_attempts: number;
  next_attempt_at: string | null;
  proposal: Record<string, string>;
  last_result: string | null;
  requested_at: string;
  executed_at: string | null;
  decided_by: string | null;
};
export type ArchiveRow = {
  day: string;
  event_count: number;
  restaurant_event_count: number;
  sha256: string | null;
  chain_sha256: string | null;
  created_at: string;
  file_path: string | null;
};
export type HealthCheck = {
  id: string;
  label: string;
  state: "ok" | "degraded" | "down" | "unmonitored" | "not_configured";
  detail: string;
};
export type Metric =
  | { available: true; value: number | string; detail: string }
  | { available: false; reason: "Non surveillé" | "Données indisponibles" };
export type SecurityOverview = {
  platformAdmin: boolean;
  restaurant: string;
  mode: "observation" | "active";
  retentionDays: number;
  generatedAt: string;
  health: HealthCheck[];
  metrics: {
    system: Metric;
    critical: Metric;
    warnings: Metric;
    recent: Metric;
    remediations: Metric;
    sessions: Metric;
    lastArchive: Metric;
    unavailable: Metric;
  };
  pendingBuffer: number;
};
export type Diagnosis = {
  event: SecurityEvent;
  timeline: SecurityEvent[];
  components: string[];
  causes: { text: string; confirmed: boolean }[];
  checks: string[];
  remediations: Remediation[];
  incident: SecurityIncident | null;
  status: string;
};

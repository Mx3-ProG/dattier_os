"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  ShieldAlert,
  Users,
  Store,
  Activity,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Search,
  ExternalLink,
  Lock,
  Unlock,
  Radio,
  FileText,
  Server,
  Layers,
  HelpCircle,
  Wrench,
} from "lucide-react";
import type {
  SuperAdminDashboardData,
  ComponentHealth,
  UserItem,
  SiteItem,
  SecurityIncidentItem,
  AuditLogItem,
  SecurityLogItem,
} from "@/features/admin/service";
import "./admin.css";

export function SuperAdminDashboard() {
  const [data, setData] = useState<SuperAdminDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<
    "overview" | "users" | "sites" | "security" | "logs"
  >("overview");

  // Filtering states
  const [userSearch, setUserSearch] = useState("");
  const [siteSearch, setSiteSearch] = useState("");
  const [logFilter, setLogFilter] = useState<"all" | "audit" | "security" | "errors">("all");
  const [logSearch, setLogSearch] = useState("");
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const fetchDashboard = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/platform/admin");
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error?.message || `Erreur HTTP ${res.status}`);
      }
      const json = await res.json();
      setData(json);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Impossible de charger les données d'administration.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void fetchDashboard();
  }, [fetchDashboard]);

  const handleAction = async (payload: {
    type: "resolveIncident" | "toggleUserStatus" | "refreshDiagnostics";
    incidentId?: string;
    profileId?: string;
  }) => {
    setActionNotice(null);
    try {
      const res = await fetch("/api/platform/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error?.message || "Action impossible.");
      setActionNotice(result.message || "Opération réussie.");
      await fetchDashboard(true);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erreur lors de l'opération.");
    }
  };

  if (loading && !data) {
    return (
      <main className="superadmin-dashboard">
        <div className="empty-state">
          <RefreshCw size={36} className="animate-spin text-muted" />
          <p>Chargement de la supervision globale du monolithe…</p>
        </div>
      </main>
    );
  }

  if (error && !data) {
    return (
      <main className="superadmin-dashboard">
        <div className="empty-state">
          <XCircle size={40} color="#dc2626" />
          <h2>Accès restreint ou service indisponible</h2>
          <p>{error}</p>
          <button className="btn-admin btn-admin-primary" onClick={() => fetchDashboard()}>
            Réessayer
          </button>
        </div>
      </main>
    );
  }

  if (!data) return null;

  const { metrics, subsystems, users, sites, incidents, auditLogs, securityLogs } = data;

  // Filtered users
  const filteredUsers = users.filter((u) => {
    const term = userSearch.toLowerCase();
    return (
      u.name.toLowerCase().includes(term) ||
      u.email.toLowerCase().includes(term) ||
      u.role.toLowerCase().includes(term) ||
      u.id.toLowerCase().includes(term)
    );
  });

  // Filtered sites
  const filteredSites = sites.filter((s) => {
    const term = siteSearch.toLowerCase();
    return (
      s.name.toLowerCase().includes(term) ||
      s.organization_name.toLowerCase().includes(term) ||
      s.industry.toLowerCase().includes(term) ||
      s.trade.toLowerCase().includes(term) ||
      s.id.toLowerCase().includes(term)
    );
  });

  // Filtered logs
  type UnifiedLog = {
    id: string;
    type: "audit" | "security";
    timestamp: string;
    source: string;
    action: string;
    actor: string;
    status: "success" | "failure" | "info";
    message: string;
  };

  const combinedLogs: UnifiedLog[] = [
    ...auditLogs.map((a) => ({
      id: a.id,
      type: "audit" as const,
      timestamp: a.created_at,
      source: a.restaurant_name || a.restaurant_id || "Plateforme",
      action: a.action,
      actor: a.actor_name || a.actor || "Système",
      status: "success" as const,
      message: `Action audit : ${a.action}${a.object_id ? ` (cible: ${a.object_id})` : ""}`,
    })),
    ...securityLogs.map((s) => ({
      id: s.id,
      type: "security" as const,
      timestamp: s.created_at,
      source: s.restaurant_id || "Système",
      action: s.action || s.event_type,
      actor: s.actor_id || "Automate",
      status: (s.status === "failure" ? "failure" : s.status === "success" ? "success" : "info") as
        | "success"
        | "failure"
        | "info",
      message: `[${s.event_type}] ${s.message}${s.error_code ? ` (code: ${s.error_code})` : ""}`,
    })),
  ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const filteredLogs = combinedLogs.filter((l) => {
    if (logFilter === "audit" && l.type !== "audit") return false;
    if (logFilter === "security" && l.type !== "security") return false;
    if (logFilter === "errors" && l.status !== "failure") return false;
    if (logSearch) {
      const term = logSearch.toLowerCase();
      return (
        l.message.toLowerCase().includes(term) ||
        l.action.toLowerCase().includes(term) ||
        l.source.toLowerCase().includes(term) ||
        l.actor.toLowerCase().includes(term)
      );
    }
    return true;
  });

  const statusClass =
    metrics.systemState === "Opérationnel"
      ? "status-ok"
      : metrics.systemState === "Dégradé"
        ? "status-degraded"
        : "status-incident";

  return (
    <main className="superadmin-dashboard">
      {/* ─── Header ─── */}
      <header className="superadmin-header">
        <div className="superadmin-title-area">
          <div className="superadmin-badge">
            <ShieldAlert size={14} />
            <span>Super Admin · Privilèges Monolithe</span>
          </div>
          <h1>Supervision & Maintenance Globale</h1>
          <p className="superadmin-subtitle">
            Connecté en tant que <strong>{data.currentUser.name}</strong> ({data.currentUser.email || data.currentUser.id})
            — Accès root en production sur tous les sites, la sécurité et les logs.
          </p>
        </div>

        <div className="superadmin-actions">
          <button
            className="btn-admin"
            disabled={refreshing}
            onClick={() => void fetchDashboard(true)}
            title="Rafraîchir les métriques"
          >
            <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
            <span>Actualiser</span>
          </button>
          <button
            className="btn-admin btn-admin-primary"
            onClick={() => void handleAction({ type: "refreshDiagnostics" })}
          >
            <Wrench size={16} />
            <span>Lancer un diagnostic</span>
          </button>
        </div>
      </header>

      {actionNotice && (
        <div
          role="status"
          style={{
            padding: "12px 16px",
            borderRadius: "8px",
            background: "#ecfdf5",
            border: "1px solid #a7f3d0",
            color: "#065f46",
            fontSize: "14px",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <CheckCircle2 size={16} />
          <span>{actionNotice}</span>
        </div>
      )}

      {/* ─── Metrics Cards ─── */}
      <section className="admin-metrics-grid" aria-label="Indicateurs clés">
        <div className="admin-metric-card">
          <div className="admin-metric-head">
            <span>Utilisateurs Totaux</span>
            <Users size={20} />
          </div>
          <div className="admin-metric-value">{metrics.totalUsers}</div>
          <div className="admin-metric-foot">
            <span className="admin-status-pill status-ok">{metrics.activeUsers} actifs</span>
            {metrics.suspendedUsers > 0 && (
              <span className="admin-status-pill status-incident">
                {metrics.suspendedUsers} suspendu(s)
              </span>
            )}
          </div>
        </div>

        <div className="admin-metric-card">
          <div className="admin-metric-head">
            <span>Sites & Établissements</span>
            <Store size={20} />
          </div>
          <div className="admin-metric-value">{metrics.totalSites}</div>
          <div className="admin-metric-foot">
            <span>Répartis sur {metrics.totalOrganizations} organisation(s)</span>
          </div>
        </div>

        <div className="admin-metric-card">
          <div className="admin-metric-head">
            <span>Santé de la Plateforme</span>
            <Activity size={20} />
          </div>
          <div className="admin-metric-value" style={{ fontSize: "24px" }}>
            <span className={`admin-status-pill ${statusClass}`}>
              {metrics.systemState === "Opérationnel" ? (
                <CheckCircle2 size={16} />
              ) : metrics.systemState === "Dégradé" ? (
                <AlertTriangle size={16} />
              ) : (
                <XCircle size={16} />
              )}
              {metrics.systemState}
            </span>
          </div>
          <div className="admin-metric-foot">
            <span>{subsystems.filter((s) => s.status === "ok").length}/{subsystems.length} sous-systèmes conformes</span>
          </div>
        </div>

        <div className="admin-metric-card">
          <div className="admin-metric-head">
            <span>Incidents Sécurité</span>
            <ShieldAlert size={20} />
          </div>
          <div className="admin-metric-value" style={{ color: metrics.openIncidents > 0 ? "#dc2626" : "inherit" }}>
            {metrics.openIncidents}
          </div>
          <div className="admin-metric-foot">
            {metrics.criticalIncidents > 0 ? (
              <span className="admin-status-pill status-incident">
                {metrics.criticalIncidents} critique(s) ouvert(s)
              </span>
            ) : (
              <span className="admin-status-pill status-ok">Aucun incident critique</span>
            )}
          </div>
        </div>
      </section>

      {/* ─── Diagnostic Matrix (Ce qui fonctionne / Ce qui ne fonctionne pas) ─── */}
      <section className="admin-section" aria-label="État des composants de la plateforme">
        <div className="admin-section-head">
          <h2>
            <Layers size={20} />
            État des Services Monolithe (Ce qui fonctionne & Points d'attention)
          </h2>
          <small className="superadmin-subtitle">
            Dernière vérification : {new Date(data.timestamp).toLocaleTimeString("fr-FR")}
          </small>
        </div>

        <div className="subsystems-grid">
          {subsystems.map((sub) => {
            const pillClass =
              sub.status === "ok"
                ? "status-ok"
                : sub.status === "degraded"
                  ? "status-degraded"
                  : sub.status === "unconfigured"
                    ? "status-unconfigured"
                    : "status-incident";

            return (
              <div key={sub.id} className="subsystem-card">
                <div className="subsystem-top">
                  <span className="subsystem-name">{sub.name}</span>
                  <span className={`admin-status-pill ${pillClass}`}>
                    {sub.status === "ok" ? (
                      <CheckCircle2 size={13} />
                    ) : sub.status === "degraded" ? (
                      <AlertTriangle size={13} />
                    ) : sub.status === "unconfigured" ? (
                      <HelpCircle size={13} />
                    ) : (
                      <XCircle size={13} />
                    )}
                    {sub.status.toUpperCase()}
                  </span>
                </div>
                <p className="subsystem-msg">{sub.message}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ─── Tabs Navigation ─── */}
      <nav className="admin-tabs" aria-label="Sections d'administration">
        <button
          className={`admin-tab-btn ${activeTab === "overview" ? "active" : ""}`}
          onClick={() => setActiveTab("overview")}
        >
          <Activity size={16} />
          <span>Vue d'ensemble</span>
        </button>
        <button
          className={`admin-tab-btn ${activeTab === "users" ? "active" : ""}`}
          onClick={() => setActiveTab("users")}
        >
          <Users size={16} />
          <span>Utilisateurs</span>
          <span className="tab-badge">{users.length}</span>
        </button>
        <button
          className={`admin-tab-btn ${activeTab === "sites" ? "active" : ""}`}
          onClick={() => setActiveTab("sites")}
        >
          <Store size={16} />
          <span>Sites & Établissements</span>
          <span className="tab-badge">{sites.length}</span>
        </button>
        <button
          className={`admin-tab-btn ${activeTab === "security" ? "active" : ""}`}
          onClick={() => setActiveTab("security")}
        >
          <ShieldAlert size={16} />
          <span>Sécurité & Incidents</span>
          {incidents.length > 0 && (
            <span
              className="tab-badge"
              style={{ background: "#fee2e2", color: "#dc2626", fontWeight: "bold" }}
            >
              {incidents.length}
            </span>
          )}
        </button>
        <button
          className={`admin-tab-btn ${activeTab === "logs" ? "active" : ""}`}
          onClick={() => setActiveTab("logs")}
        >
          <FileText size={16} />
          <span>Logs & Audit</span>
          <span className="tab-badge">{combinedLogs.length}</span>
        </button>
      </nav>

      {/* ─── TAB 1: Overview ─── */}
      {activeTab === "overview" && (
        <div style={{ display: "grid", gap: "20px" }}>
          <div className="admin-section">
            <div className="admin-section-head">
              <h2>Répartition des rôles sur la plateforme</h2>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
              {data.usersByRole.map((r) => (
                <div
                  key={r.role}
                  style={{
                    padding: "10px 16px",
                    borderRadius: "8px",
                    background: "#f8fafc",
                    border: "1px solid #e2e8f0",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  <span className={`role-chip role-${r.role === "SUPER_ADMIN" ? "SUPER_ADMIN" : r.role === "OWNER" ? "OWNER" : r.role === "MANAGER" ? "MANAGER" : "OTHER"}`}>
                    {r.role}
                  </span>
                  <strong>{r.count}</strong> compte(s)
                </div>
              ))}
            </div>
          </div>

          <div className="admin-section">
            <div className="admin-section-head">
              <h2>Actions rapides & Navigation directe dans le monolithe</h2>
            </div>
            <p style={{ margin: 0, fontSize: "14px", color: "var(--text-muted, #64748b)" }}>
              En tant que Super Admin, vous pouvez accéder et gérer chaque établissement directement, sans restriction de rôle local :
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "12px" }}>
              {sites.slice(0, 6).map((site) => (
                <Link
                  key={site.id}
                  href={`/commerce/${encodeURIComponent(site.id)}`}
                  style={{
                    padding: "14px",
                    borderRadius: "10px",
                    border: "1px solid #e2e8f0",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    textDecoration: "none",
                    color: "inherit",
                    background: "#ffffff",
                    transition: "all 0.15s ease",
                  }}
                >
                  <div>
                    <strong style={{ display: "block", fontSize: "14px" }}>{site.name}</strong>
                    <small style={{ color: "#64748b" }}>{site.organization_name}</small>
                  </div>
                  <ExternalLink size={16} color="#64748b" />
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ─── TAB 2: Users ─── */}
      {activeTab === "users" && (
        <div className="admin-section">
          <div className="admin-toolbar">
            <div className="admin-search-wrapper" style={{ position: "relative" }}>
              <input
                type="text"
                className="admin-search-input"
                placeholder="Rechercher par nom, email, rôle..."
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
              />
            </div>
            <div style={{ fontSize: "13px", color: "#64748b" }}>
              {filteredUsers.length} utilisateur(s) trouvé(s)
            </div>
          </div>

          <div className="admin-table-wrapper">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Nom</th>
                  <th>Email</th>
                  <th>Rôle Monolithe</th>
                  <th>Statut</th>
                  <th>ID</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((u) => {
                  const isProtected =
                    u.email.toLowerCase() === "mat75.deff@gmail.com" ||
                    u.role === "SUPER_ADMIN" ||
                    u.id === data.currentUser.id;

                  return (
                    <tr key={u.id}>
                      <td>
                        <strong>{u.name}</strong>
                      </td>
                      <td>{u.email || <em style={{ color: "#94a3b8" }}>Non renseigné</em>}</td>
                      <td>
                        <span
                          className={`role-chip role-${u.role === "SUPER_ADMIN" ? "SUPER_ADMIN" : u.role === "OWNER" ? "OWNER" : u.role === "MANAGER" ? "MANAGER" : "OTHER"}`}
                        >
                          {u.role}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`admin-status-pill ${u.status === "active" ? "status-ok" : "status-incident"}`}
                        >
                          {u.status === "active" ? "Actif" : "Suspendu"}
                        </span>
                      </td>
                      <td>
                        <code style={{ fontSize: "11px", color: "#64748b" }}>
                          {u.id.length > 20 ? `${u.id.slice(0, 18)}…` : u.id}
                        </code>
                      </td>
                      <td>
                        {isProtected ? (
                          <span style={{ fontSize: "11px", color: "#94a3b8" }}>Protégé</span>
                        ) : (
                          <button
                            className={`btn-admin btn-admin-sm ${u.status === "active" ? "btn-admin-danger" : "btn-admin-primary"}`}
                            onClick={() =>
                              void handleAction({
                                type: "toggleUserStatus",
                                profileId: u.id,
                              })
                            }
                          >
                            {u.status === "active" ? (
                              <>
                                <Lock size={12} />
                                <span>Suspendre</span>
                              </>
                            ) : (
                              <>
                                <Unlock size={12} />
                                <span>Activer</span>
                              </>
                            )}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── TAB 3: Sites ─── */}
      {activeTab === "sites" && (
        <div className="admin-section">
          <div className="admin-toolbar">
            <input
              type="text"
              className="admin-search-input"
              placeholder="Rechercher par nom, organisation, secteur..."
              value={siteSearch}
              onChange={(e) => setSiteSearch(e.target.value)}
            />
            <div style={{ fontSize: "13px", color: "#64748b" }}>
              {filteredSites.length} site(s) trouvé(s)
            </div>
          </div>

          <div className="admin-table-wrapper">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Nom Établissement</th>
                  <th>Organisation</th>
                  <th>Secteur / Métier</th>
                  <th>Forfait</th>
                  <th>Membres</th>
                  <th>Commandes</th>
                  <th>Accès Direct</th>
                </tr>
              </thead>
              <tbody>
                {filteredSites.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <strong>{s.name}</strong>
                    </td>
                    <td>{s.organization_name}</td>
                    <td>
                      <span className="admin-status-pill status-unconfigured">
                        {s.trade} ({s.industry})
                      </span>
                    </td>
                    <td>
                      <span className={`admin-status-pill ${s.plan >= 39 ? "status-ok" : "status-unconfigured"}`}>
                        {s.plan >= 39 ? "Studio (Payé)" : "Essai / Démo"}
                      </span>
                    </td>
                    <td>{s.members_count} membre(s)</td>
                    <td>{s.orders_count}</td>
                    <td>
                      <Link
                        href={`/commerce/${encodeURIComponent(s.id)}`}
                        className="btn-admin btn-admin-sm"
                        style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
                      >
                        <span>Gérer</span>
                        <ExternalLink size={12} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── TAB 4: Security & Incidents ─── */}
      {activeTab === "security" && (
        <div style={{ display: "grid", gap: "20px" }}>
          <div className="admin-section">
            <div className="admin-section-head">
              <h2>Incidents de Sécurité Détectés</h2>
              <span className="superadmin-subtitle">
                {incidents.length} incident(s) non résolu(s)
              </span>
            </div>

            {incidents.length === 0 ? (
              <div className="empty-state">
                <CheckCircle2 size={36} color="#059669" />
                <p>Aucun incident de sécurité en cours. Tout le système est opérationnel.</p>
              </div>
            ) : (
              <div className="incidents-list">
                {incidents.map((inc) => (
                  <div key={inc.id} className="incident-card">
                    <div className="incident-card-head">
                      <span className="incident-card-title">{inc.title}</span>
                      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                        <span className={`admin-status-pill ${inc.severity >= 5 ? "status-incident" : "status-degraded"}`}>
                          Sévérité {inc.severity}/6
                        </span>
                        <button
                          className="btn-admin btn-admin-sm btn-admin-primary"
                          onClick={() =>
                            void handleAction({
                              type: "resolveIncident",
                              incidentId: inc.id,
                            })
                          }
                        >
                          Acquitter / Résoudre
                        </button>
                      </div>
                    </div>
                    <p className="incident-card-body">{inc.user_message}</p>
                    <div className="incident-card-foot">
                      <span>Module : {inc.module} · Règle : {inc.rule_id}</span>
                      <span>Dernière détection : {new Date(inc.updated_at).toLocaleString("fr-FR")}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── TAB 5: Logs & Audit ─── */}
      {activeTab === "logs" && (
        <div className="admin-section">
          <div className="admin-toolbar">
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <button
                className={`btn-admin btn-admin-sm ${logFilter === "all" ? "btn-admin-primary" : ""}`}
                onClick={() => setLogFilter("all")}
              >
                Tous les flux
              </button>
              <button
                className={`btn-admin btn-admin-sm ${logFilter === "audit" ? "btn-admin-primary" : ""}`}
                onClick={() => setLogFilter("audit")}
              >
                Audit Métier
              </button>
              <button
                className={`btn-admin btn-admin-sm ${logFilter === "security" ? "btn-admin-primary" : ""}`}
                onClick={() => setLogFilter("security")}
              >
                Événements Sécurité
              </button>
              <button
                className={`btn-admin btn-admin-sm ${logFilter === "errors" ? "btn-admin-danger" : ""}`}
                onClick={() => setLogFilter("errors")}
              >
                Erreurs & Échecs
              </button>
            </div>

            <input
              type="text"
              className="admin-search-input"
              placeholder="Filtrer les messages de log..."
              value={logSearch}
              onChange={(e) => setLogSearch(e.target.value)}
            />
          </div>

          <div className="logs-feed" role="log" aria-label="Journal des événements système">
            {filteredLogs.length === 0 ? (
              <div style={{ color: "#94a3b8", textAlign: "center", padding: "20px" }}>
                Aucun log correspondant aux filtres.
              </div>
            ) : (
              filteredLogs.map((log) => {
                const entryClass =
                  log.status === "failure"
                    ? "log-failure"
                    : log.type === "audit"
                      ? "log-success"
                      : "log-info";

                return (
                  <div key={`${log.type}-${log.id}`} className={`log-entry ${entryClass}`}>
                    <span className="log-time">
                      {new Date(log.timestamp).toLocaleTimeString("fr-FR")}
                    </span>
                    <span className="log-tag" style={{ color: log.type === "audit" ? "#10b981" : "#38bdf8" }}>
                      [{log.type}]
                    </span>
                    <span className="log-msg">
                      <strong>{log.source}</strong> · {log.actor} : {log.message}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </main>
  );
}

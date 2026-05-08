import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  LayoutDashboard,
  Wifi,
  WifiOff,
  AlertTriangle,
  CheckCircle2,
  Send,
  Clock,
  Activity,
  RefreshCw,
  XCircle,
  Loader2,
  TrendingUp,
  Zap,
  Bell,
  ChevronRight,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { fetchInstances, Instance, isInstanceConnected } from "@/lib/evolution-api";
import { fetchVPSCampaigns, VPSCampaign } from "@/lib/vps-queue";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — WhatsApp Painel" },
      { name: "description", content: "Monitoramento em tempo real de disparos e chips." },
    ],
  }),
  component: DashboardPage,
});

// ── Tipos internos ──────────────────────────────────────────────────────────

interface ChipAlert {
  id: string;
  chipName: string;
  type: "disconnected" | "high_error" | "campaign_stalled";
  message: string;
  timestamp: number;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000) return "agora mesmo";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}min atrás`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h atrás`;
  return `${Math.floor(diff / 86_400_000)}d atrás`;
}

function eta(campaign: VPSCampaign): string | null {
  const pending = campaign.numbers.filter((n) => n.status === "pending").length;
  if (pending === 0 || campaign.status !== "running") return null;
  const avgSec = (campaign.min_sec + campaign.max_sec) / 2;
  const totalSec = pending * avgSec;
  if (totalSec < 60) return `~${Math.round(totalSec)}s`;
  if (totalSec < 3600) return `~${Math.round(totalSec / 60)}min`;
  return `~${(totalSec / 3600).toFixed(1)}h`;
}

// ── Componentes ──────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  color,
  pulse,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  color: "green" | "blue" | "yellow" | "red" | "purple";
  pulse?: boolean;
}) {
  const colorMap = {
    green: "text-emerald-400 bg-emerald-400/10",
    blue: "text-blue-400 bg-blue-400/10",
    yellow: "text-yellow-400 bg-yellow-400/10",
    red: "text-red-400 bg-red-400/10",
    purple: "text-violet-400 bg-violet-400/10",
  };
  return (
    <div className="rounded-xl border border-border bg-card p-5 flex items-start gap-4">
      <div className={`rounded-lg p-2.5 shrink-0 ${colorMap[color]}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <p className="text-2xl font-bold tabular-nums">{value}</p>
          {pulse && (
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
          )}
        </div>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function ChipCard({
  instance,
  wasConnected,
}: {
  instance: Instance;
  wasConnected: boolean;
}) {
  const connected = isInstanceConnected(instance);
  const wasOnline = wasConnected;
  const droppedUnexpectedly = !connected && wasOnline;

  return (
    <div
      className={`rounded-xl border p-4 flex items-center gap-3 transition-colors ${
        connected
          ? "border-emerald-500/30 bg-emerald-500/5"
          : droppedUnexpectedly
            ? "border-red-500/50 bg-red-500/10"
            : "border-border bg-muted/30"
      }`}
    >
      {/* Status indicator */}
      <div className="shrink-0 relative">
        {connected ? (
          <>
            <div className="h-10 w-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
              <Wifi className="h-5 w-5 text-emerald-400" />
            </div>
            <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-500 border-2 border-background" />
          </>
        ) : (
          <div
            className={`h-10 w-10 rounded-full flex items-center justify-center ${
              droppedUnexpectedly ? "bg-red-500/20" : "bg-muted"
            }`}
          >
            <WifiOff
              className={`h-5 w-5 ${droppedUnexpectedly ? "text-red-400" : "text-muted-foreground"}`}
            />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">
          {instance.profileName || instance.name}
        </p>
        <p className="text-xs text-muted-foreground truncate">{instance.name}</p>
      </div>

      {/* Badge */}
      <div className="shrink-0">
        {connected ? (
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 uppercase tracking-wide">
            Online
          </span>
        ) : droppedUnexpectedly ? (
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 uppercase tracking-wide flex items-center gap-1">
            <AlertTriangle className="h-2.5 w-2.5" />
            Caiu
          </span>
        ) : (
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground uppercase tracking-wide">
            Offline
          </span>
        )}
      </div>
    </div>
  );
}

function CampaignProgressCard({ campaign }: { campaign: VPSCampaign }) {
  const total = campaign.numbers.length;
  const sent = campaign.numbers.filter((n) => n.status === "sent").length;
  const errors = campaign.numbers.filter((n) => n.status === "error").length;
  const pending = campaign.numbers.filter((n) => n.status === "pending").length;
  const pct = total > 0 ? Math.round(((sent + errors) / total) * 100) : 0;
  const successRate = sent + errors > 0 ? Math.round((sent / (sent + errors)) * 100) : 100;
  const etaStr = eta(campaign);

  const statusColor =
    campaign.status === "running"
      ? "text-emerald-400"
      : campaign.status === "paused"
        ? "text-yellow-400"
        : campaign.status === "stopped"
          ? "text-red-400"
          : "text-muted-foreground";

  const statusLabel =
    campaign.status === "running"
      ? "Rodando"
      : campaign.status === "paused"
        ? "Pausada"
        : campaign.status === "stopped"
          ? "Cancelada"
          : "Concluída";

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold truncate">{campaign.name}</p>
          <p className={`text-xs font-medium mt-0.5 ${statusColor}`}>{statusLabel}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-2xl font-bold tabular-nums">{pct}%</p>
          <p className="text-xs text-muted-foreground">concluído</p>
        </div>
      </div>

      {/* Barra de progresso */}
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500 bg-primary"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-2 text-center">
        {[
          { label: "Enviados", val: sent, color: "text-emerald-400" },
          { label: "Erros", val: errors, color: "text-red-400" },
          { label: "Pendentes", val: pending, color: "text-blue-400" },
          { label: "Taxa ok", val: `${successRate}%`, color: successRate >= 80 ? "text-emerald-400" : "text-yellow-400" },
        ].map((s) => (
          <div key={s.label} className="rounded-lg bg-muted/50 p-2">
            <p className={`text-base font-bold tabular-nums ${s.color}`}>{s.val}</p>
            <p className="text-[10px] text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t border-border">
        <span>{campaign.chips.length} chip{campaign.chips.length !== 1 ? "s" : ""} · {campaign.min_sec}–{campaign.max_sec}s</span>
        {etaStr && (
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {etaStr} restante
          </span>
        )}
      </div>
    </div>
  );
}

// ── Página principal ─────────────────────────────────────────────────────────

function DashboardPage() {
  const [instances, setInstances] = useState<Instance[]>([]);
  const [campaigns, setCampaigns] = useState<VPSCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<number>(Date.now());
  const [alerts, setAlerts] = useState<ChipAlert[]>([]);

  // Rastreia o estado anterior dos chips para detectar quedas automáticas
  const prevInstanceMap = useRef<Record<string, boolean>>({});

  const load = useCallback(async (isBackground = false) => {
    if (!isBackground) setLoading(true);
    try {
      const [inst, camps] = await Promise.all([
        fetchInstances().catch(() => [] as Instance[]),
        fetchVPSCampaigns().catch(() => [] as VPSCampaign[]),
      ]);

      // ── Detecta desconexão automática de chips ──
      const newAlerts: ChipAlert[] = [];
      inst.forEach((i) => {
        const nowConnected = isInstanceConnected(i);
        const wasConn = prevInstanceMap.current[i.name];
        // Se estava conectado e agora não está → queda automática
        if (wasConn === true && !nowConnected) {
          newAlerts.push({
            id: `${i.name}-${Date.now()}`,
            chipName: i.profileName || i.name,
            type: "disconnected",
            message: `Chip "${i.profileName || i.name}" foi desconectado automaticamente.`,
            timestamp: Date.now(),
          });
        }
        prevInstanceMap.current[i.name] = nowConnected;
      });

      // ── Detecta campanhas com alta taxa de erro (>30%) ──
      camps.forEach((c) => {
        if (c.status !== "running" && c.status !== "paused") return;
        const done = c.numbers.filter((n) => n.status !== "pending").length;
        if (done < 10) return; // amostra muito pequena
        const errRate = c.numbers.filter((n) => n.status === "error").length / done;
        if (errRate > 0.3) {
          newAlerts.push({
            id: `${c.id}-highErr-${Date.now()}`,
            chipName: c.name,
            type: "high_error",
            message: `Campanha "${c.name}" com ${Math.round(errRate * 100)}% de erros — verifique os chips.`,
            timestamp: Date.now(),
          });
        }
      });

      if (newAlerts.length > 0) {
        setAlerts((prev) => [...newAlerts, ...prev].slice(0, 20));
      }

      setInstances(inst);
      setCampaigns(camps);
      setLastRefresh(Date.now());
    } finally {
      if (!isBackground) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(() => load(true), 20_000);
    return () => clearInterval(interval);
  }, [load]);

  // ── Métricas agregadas ──────────────────────────────────────────────────
  const chipsOnline = instances.filter(isInstanceConnected).length;
  const chipsTotal = instances.length;

  const allNumbers = campaigns.flatMap((c) => c.numbers);
  const totalSent = allNumbers.filter((n) => n.status === "sent").length;
  const totalErrors = allNumbers.filter((n) => n.status === "error").length;
  const totalPending = allNumbers.filter((n) => n.status === "pending").length;
  const successRate =
    totalSent + totalErrors > 0
      ? Math.round((totalSent / (totalSent + totalErrors)) * 100)
      : 100;

  const activeCampaigns = campaigns.filter((c) => c.status === "running");
  const pausedCampaigns = campaigns.filter((c) => c.status === "paused");
  const visibleCampaigns = campaigns
    .filter((c) => c.status === "running" || c.status === "paused")
    .slice(0, 6);

  const hasProblems = chipsOnline < chipsTotal || successRate < 80 || alerts.length > 0;

  return (
    <AppShell>
      <div className="h-full overflow-y-auto">
        <div className="max-w-7xl mx-auto p-6 space-y-6">

          {/* ── Cabeçalho ── */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <LayoutDashboard className="h-6 w-6 text-primary" />
                Dashboard de Produção
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Monitoramento em tempo real · Atualiza a cada 20s
              </p>
            </div>
            <div className="flex items-center gap-3">
              {hasProblems && (
                <span className="flex items-center gap-1.5 text-xs font-medium text-yellow-400 bg-yellow-400/10 border border-yellow-400/30 px-2.5 py-1 rounded-full">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Atenção necessária
                </span>
              )}
              <button
                onClick={() => load()}
                disabled={loading}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg px-3 py-1.5 transition-colors"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                {timeAgo(lastRefresh)}
              </button>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-32">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-6">

              {/* ── KPIs ── */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <KpiCard
                  label="Chips online"
                  value={`${chipsOnline}/${chipsTotal}`}
                  sub={chipsOnline === chipsTotal ? "Todos conectados" : `${chipsTotal - chipsOnline} desconectado${chipsTotal - chipsOnline !== 1 ? "s" : ""}`}
                  icon={Wifi}
                  color={chipsOnline === chipsTotal ? "green" : chipsOnline === 0 ? "red" : "yellow"}
                  pulse={chipsOnline > 0}
                />
                <KpiCard
                  label="Campanhas ativas"
                  value={activeCampaigns.length}
                  sub={pausedCampaigns.length > 0 ? `${pausedCampaigns.length} pausada${pausedCampaigns.length !== 1 ? "s" : ""}` : "Nenhuma pausada"}
                  icon={Activity}
                  color="blue"
                  pulse={activeCampaigns.length > 0}
                />
                <KpiCard
                  label="Taxa de sucesso"
                  value={`${successRate}%`}
                  sub={`${totalSent} enviadas · ${totalErrors} erros`}
                  icon={TrendingUp}
                  color={successRate >= 90 ? "green" : successRate >= 70 ? "yellow" : "red"}
                />
                <KpiCard
                  label="Em fila"
                  value={totalPending.toLocaleString("pt-BR")}
                  sub={totalPending > 0 ? "Aguardando disparo" : "Nada pendente"}
                  icon={Zap}
                  color="purple"
                />
              </div>

              {/* ── Grid principal: chips + campanhas ── */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                {/* Saúde dos chips */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="font-semibold text-sm flex items-center gap-2">
                      <Wifi className="h-4 w-4 text-primary" />
                      Saúde dos chips
                    </h2>
                    <span className="text-xs text-muted-foreground">
                      {chipsOnline} de {chipsTotal} online
                    </span>
                  </div>
                  {instances.length === 0 ? (
                    <div className="rounded-xl border border-border bg-muted/20 p-8 text-center text-sm text-muted-foreground">
                      Nenhum chip encontrado
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {instances.map((inst) => (
                        <ChipCard
                          key={inst.name}
                          instance={inst}
                          wasConnected={prevInstanceMap.current[inst.name] ?? isInstanceConnected(inst)}
                        />
                      ))}
                    </div>
                  )}
                </div>

                {/* Campanhas em andamento */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="font-semibold text-sm flex items-center gap-2">
                      <Send className="h-4 w-4 text-primary" />
                      Campanhas em andamento
                    </h2>
                    <span className="text-xs text-muted-foreground">
                      {visibleCampaigns.length} visível{visibleCampaigns.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  {visibleCampaigns.length === 0 ? (
                    <div className="rounded-xl border border-border bg-muted/20 p-8 text-center text-sm text-muted-foreground">
                      Nenhuma campanha ativa no momento
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {visibleCampaigns.map((c) => (
                        <CampaignProgressCard key={c.id} campaign={c} />
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* ── Alertas ── */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold text-sm flex items-center gap-2">
                    <Bell className="h-4 w-4 text-primary" />
                    Alertas da sessão
                    {alerts.length > 0 && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400">
                        {alerts.length}
                      </span>
                    )}
                  </h2>
                  {alerts.length > 0 && (
                    <button
                      onClick={() => setAlerts([])}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Limpar todos
                    </button>
                  )}
                </div>

                {alerts.length === 0 ? (
                  <div className="rounded-xl border border-border bg-muted/20 p-5 flex items-center gap-3 text-sm text-muted-foreground">
                    <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
                    Nenhum alerta registrado nesta sessão. Chips estáveis, sem quedas detectadas.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {alerts.map((a) => (
                      <div
                        key={a.id}
                        className={`rounded-xl border p-4 flex items-start gap-3 ${
                          a.type === "disconnected"
                            ? "border-red-500/30 bg-red-500/5"
                            : "border-yellow-500/30 bg-yellow-500/5"
                        }`}
                      >
                        {a.type === "disconnected" ? (
                          <XCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                        ) : (
                          <AlertTriangle className="h-4 w-4 text-yellow-400 shrink-0 mt-0.5" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm">{a.message}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{timeAgo(a.timestamp)}</p>
                        </div>
                        <button
                          onClick={() => setAlerts((prev) => prev.filter((x) => x.id !== a.id))}
                          className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                        >
                          <XCircle className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ── Todas as campanhas (histórico compacto) ── */}
              {campaigns.length > 0 && (
                <div className="space-y-3">
                  <h2 className="font-semibold text-sm flex items-center gap-2">
                    <Clock className="h-4 w-4 text-primary" />
                    Histórico de campanhas
                  </h2>
                  <div className="rounded-xl border border-border overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-muted/50 border-b border-border">
                          <th className="text-left text-xs font-medium text-muted-foreground px-4 py-2.5">Campanha</th>
                          <th className="text-center text-xs font-medium text-muted-foreground px-3 py-2.5">Status</th>
                          <th className="text-center text-xs font-medium text-muted-foreground px-3 py-2.5">Enviados</th>
                          <th className="text-center text-xs font-medium text-muted-foreground px-3 py-2.5">Erros</th>
                          <th className="text-center text-xs font-medium text-muted-foreground px-3 py-2.5">Taxa</th>
                          <th className="text-right text-xs font-medium text-muted-foreground px-4 py-2.5">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {campaigns.map((c) => {
                          const sent = c.numbers.filter((n) => n.status === "sent").length;
                          const errs = c.numbers.filter((n) => n.status === "error").length;
                          const rate = sent + errs > 0 ? Math.round((sent / (sent + errs)) * 100) : 100;
                          const statusColors: Record<string, string> = {
                            running: "text-emerald-400 bg-emerald-400/10",
                            paused: "text-yellow-400 bg-yellow-400/10",
                            stopped: "text-red-400 bg-red-400/10",
                            completed: "text-muted-foreground bg-muted",
                          };
                          const statusLabels: Record<string, string> = {
                            running: "Rodando",
                            paused: "Pausada",
                            stopped: "Cancelada",
                            completed: "Concluída",
                          };
                          return (
                            <tr key={c.id} className="hover:bg-muted/30 transition-colors">
                              <td className="px-4 py-3 font-medium truncate max-w-[220px]">
                                {c.parentId && <span className="text-muted-foreground mr-1.5 text-xs">↳</span>}
                                {c.name}
                              </td>
                              <td className="px-3 py-3 text-center">
                                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusColors[c.status] || "bg-muted text-muted-foreground"}`}>
                                  {statusLabels[c.status] || c.status}
                                </span>
                              </td>
                              <td className="px-3 py-3 text-center tabular-nums text-emerald-400 font-medium">{sent}</td>
                              <td className="px-3 py-3 text-center tabular-nums text-red-400 font-medium">{errs}</td>
                              <td className="px-3 py-3 text-center tabular-nums">
                                <span className={rate >= 90 ? "text-emerald-400" : rate >= 70 ? "text-yellow-400" : "text-red-400"}>
                                  {rate}%
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{c.numbers.length}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

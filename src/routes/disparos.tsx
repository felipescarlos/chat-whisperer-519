import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";
import {
  Play, Pause, Square, Send, Server, CheckCircle2, AlertCircle, ChevronDown,
  ChevronUp, Clock, RefreshCw, Trash2, Plus, Users, Database, FileSpreadsheet,
  Pencil, Target, AlertTriangle, Info, ChevronRight, Loader2, X, Sparkles,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Instance, fetchInstances, isInstanceConnected, fetchCRMStages, CRMStage } from "@/lib/evolution-api";
import { expandVariations } from "@/lib/broadcast-utils";
import { getChipDisplayName, loadAllLabels } from "@/lib/chip-labels";
import {
  createVPSCampaign, updateVPSCampaignStatus, retryVPSCampaignErrors,
  deleteVPSCampaign, fetchCampaignAudience, checkCampaignDuplicates, checkCadastros,
  translateEvolutionError, VPSCampaign, BroadcastStatus, CampaignAudienceItem,
  DuplicateCheckResult, CadastrosCheckResult,
} from "@/lib/vps-queue";
import { useBroadcastQueue } from "@/lib/useBroadcastQueue";
import { ConversaDialog } from "@/components/ConversaDialog";

export const Route = createFileRoute("/disparos")({
  head: () => ({
    meta: [
      { title: "Disparos — WhatsApp Painel" },
      { name: "description", content: "Gerenciador de campanhas de disparo em massa." },
    ],
  }),
  component: DisparosPage,
});

// ── Status config ─────────────────────────────────────────────
const STATUS_CFG: Record<BroadcastStatus, { label: string; className: string }> = {
  running:   { label: "Rodando",    className: "bg-primary/20 text-primary border-primary/30" },
  paused:    { label: "Pausada",    className: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" },
  completed: { label: "Concluída",  className: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
  stopped:   { label: "Cancelada",  className: "bg-muted text-muted-foreground border-border" },
  pending:   { label: "Pendente",   className: "bg-muted text-muted-foreground border-border" },
};

function StatusBadge({ status }: { status: BroadcastStatus }) {
  const cfg = STATUS_CFG[status] ?? STATUS_CFG.pending;
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${cfg.className}`}>
      {cfg.label}
    </span>
  );
}

// ── Estimated duration ────────────────────────────────────────
function estimateDuration(count: number, minSec: number, maxSec: number): string {
  const avgSec = (minSec + maxSec) / 2;
  const totalMin = Math.ceil((count * avgSec) / 60);
  if (totalMin < 60) return `~${totalMin} min`;
  return `~${Math.ceil(totalMin / 60)}h ${totalMin % 60}min`;
}

// ─────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────
function DisparosPage() {
  const { campaigns, setStatus, refresh, error } = useBroadcastQueue();
  const [showModal, setShowModal] = useState(false);

  const running   = campaigns.filter((c) => c.status === "running").length;
  const paused    = campaigns.filter((c) => c.status === "paused").length;
  const completed = campaigns.filter((c) => c.status === "completed").length;

  const handleDelete = async (id: string) => {
    try {
      await deleteVPSCampaign(id);
      refresh();
      toast.success("Campanha removida");
    } catch {
      toast.error("Erro ao remover campanha");
    }
  };

  return (
    <AppShell>
      <div className="h-full overflow-y-auto p-6">
        <div className="max-w-6xl mx-auto space-y-6">

          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">Disparos</h1>
              <p className="text-sm text-muted-foreground">
                Fila no servidor — campanhas continuam com o computador desligado
              </p>
            </div>
            <Button onClick={() => setShowModal(true)} className="gap-2">
              <Plus className="h-4 w-4" /> Nova Campanha
            </Button>
          </div>

          {error && (
            <div className="bg-destructive/10 border border-destructive/30 text-destructive text-sm rounded-md px-4 py-3">
              Erro ao conectar com o servidor: {error}
            </div>
          )}

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Total",      value: campaigns.length, icon: Server,       color: "text-muted-foreground" },
              { label: "Rodando",    value: running,           icon: Play,         color: "text-primary" },
              { label: "Pausadas",   value: paused,            icon: Pause,        color: "text-yellow-400" },
              { label: "Concluídas", value: completed,         icon: CheckCircle2, color: "text-emerald-400" },
            ].map((s) => (
              <div key={s.label} className="bg-card border border-border rounded-lg p-4 flex items-center gap-3">
                <s.icon className={`h-5 w-5 shrink-0 ${s.color}`} />
                <div>
                  <p className="text-2xl font-bold leading-none">{s.value}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Campaign list */}
          {campaigns.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground border border-dashed rounded-lg">
              <Server className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p className="font-medium">Nenhuma campanha criada ainda</p>
              <p className="text-sm mt-1">Clique em "Nova Campanha" para começar</p>
            </div>
          ) : (
            <div className="space-y-3">
              {campaigns.filter((c) => !c.parentId).map((camp) => (
                <CampaignCard
                  key={camp.id}
                  camp={camp}
                  setStatus={setStatus}
                  onDelete={handleDelete}
                  onRefresh={refresh}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modal de criação */}
      {showModal && (
        <NovaCampanhaModal
          onClose={() => setShowModal(false)}
          onCreated={() => { setShowModal(false); refresh(); }}
        />
      )}
    </AppShell>
  );
}

// ─────────────────────────────────────────────────────────────
// CAMPAIGN CARD
// ─────────────────────────────────────────────────────────────
function CampaignCard({
  camp, setStatus, onDelete, onRefresh,
}: {
  camp: VPSCampaign;
  setStatus: (id: string, s: BroadcastStatus) => void;
  onDelete: (id: string) => void;
  onRefresh: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [errorDialog, setErrorDialog] = useState<{ number: string; message: string } | null>(null);
  const [conversaDialog, setConversaDialog] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [numberFilter, setNumberFilter] = useState<"all" | "sent" | "error" | "pending">("all");

  const total   = camp.numbers.length;
  const sent    = camp.numbers.filter((n) => n.status === "sent").length;
  const errors  = camp.numbers.filter((n) => n.status === "error").length;
  const pending = camp.numbers.filter((n) => n.status === "pending").length;
  const pct     = total ? ((sent + errors) / total) * 100 : 0;

  const isActive = camp.status === "running" || camp.status === "paused";

  const filteredNumbers = camp.numbers.filter((n) =>
    numberFilter === "all" ? true : n.status === numberFilter
  );

  return (
    <>
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        {/* Header row */}
        <div className="p-4 flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-base truncate">{camp.name}</h3>
              <StatusBadge status={camp.status} />
              {camp.segmentLabel && (
                <span className="text-xs bg-accent px-2 py-0.5 rounded-full text-muted-foreground border border-border">
                  {camp.segmentLabel}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1 truncate max-w-xl">
              {camp.message.slice(0, 120)}{camp.message.length > 120 ? "…" : ""}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {new Date(camp.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
              {" · "}{camp.chips?.join(", ")}
              {" · "}{camp.min_sec}s–{camp.max_sec}s
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
            {camp.status === "running" && (
              <Button variant="secondary" size="sm" onClick={() => setStatus(camp.id, "paused")}>
                <Pause className="h-3.5 w-3.5 mr-1" /> Pausar
              </Button>
            )}
            {camp.status === "paused" && (
              <Button variant="outline" size="sm" onClick={() => setStatus(camp.id, "running")}>
                <Play className="h-3.5 w-3.5 mr-1" /> Retomar
              </Button>
            )}
            {isActive && (
              <Button variant="destructive" size="sm" onClick={() => setStatus(camp.id, "stopped")}>
                <Square className="h-3.5 w-3.5 mr-1" /> Cancelar
              </Button>
            )}
            {errors > 0 && !isActive && (
              <Button
                variant="outline" size="sm"
                onClick={async () => { await retryVPSCampaignErrors(camp.id); onRefresh(); }}
                className="text-yellow-400 border-yellow-500/50 hover:bg-yellow-500/10"
              >
                <RefreshCw className="h-3.5 w-3.5 mr-1" /> Retentar ({errors})
              </Button>
            )}
            {!isActive && (
              confirmDelete ? (
                <div className="flex gap-1">
                  <Button variant="destructive" size="sm" onClick={() => onDelete(camp.id)}>
                    Confirmar
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" onClick={() => setConfirmDelete(true)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )
            )}
          </div>
        </div>

        {/* Progress */}
        <div className="px-4 pb-3 space-y-1.5">
          <div className="flex justify-between items-center text-xs">
            <span className="text-muted-foreground">{sent + errors} / {total} processados</span>
            <span className="flex gap-3 font-medium">
              <span className="text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" />{sent}
              </span>
              <span className="text-destructive flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />{errors}
              </span>
              <span className="text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />{pending}
              </span>
            </span>
          </div>
          <Progress value={pct} className="h-1.5" />
        </div>

        {/* Expand toggle */}
        <div
          className="px-4 py-2 border-t border-border bg-muted/30 flex items-center justify-between cursor-pointer hover:bg-muted/50 transition-colors"
          onClick={() => setExpanded((v) => !v)}
        >
          <span className="text-xs text-muted-foreground">
            {expanded ? "Ocultar destinatários" : `Ver ${total} destinatários`}
          </span>
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>

        {/* Numbers list */}
        {expanded && (
          <div className="border-t border-border">
            {/* Filter tabs */}
            <div className="flex gap-1 p-2 bg-muted/20 border-b border-border">
              {(["all", "sent", "error", "pending"] as const).map((f) => {
                const counts = { all: total, sent, error: errors, pending };
                const labels = { all: "Todos", sent: "Enviados", error: "Erros", pending: "Pendentes" };
                return (
                  <button
                    key={f}
                    onClick={() => setNumberFilter(f)}
                    className={`text-xs px-2.5 py-1 rounded transition-colors ${
                      numberFilter === f
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent"
                    }`}
                  >
                    {labels[f]} ({counts[f]})
                  </button>
                );
              })}
            </div>

            <div className="max-h-72 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">#</th>
                    <th className="text-left px-3 py-2 font-medium">Número</th>
                    <th className="text-left px-3 py-2 font-medium">Nome</th>
                    <th className="text-left px-3 py-2 font-medium">Cidade</th>
                    <th className="text-left px-3 py-2 font-medium">Status</th>
                    <th className="text-left px-3 py-2 font-medium">Chip</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {filteredNumbers.map((n, idx) => (
                    <tr key={idx} className="border-t border-border hover:bg-accent/30">
                      <td className="px-3 py-2 text-muted-foreground">{idx + 1}</td>
                      <td className="px-3 py-2 font-mono">
                        <button
                          className="hover:text-primary hover:underline transition-colors"
                          onClick={() => setConversaDialog(n.number)}
                        >
                          +{n.number}
                        </button>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{n.name || "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground">{n.city || "—"}</td>
                      <td className="px-3 py-2">
                        {n.status === "sent" && <span className="text-emerald-400 font-medium flex items-center gap-1"><CheckCircle2 className="h-3 w-3" />Enviado</span>}
                        {n.status === "error" && <span className="text-destructive font-medium flex items-center gap-1"><AlertCircle className="h-3 w-3" />Erro</span>}
                        {n.status === "pending" && <span className="text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" />Pendente</span>}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{n.instance || "—"}</td>
                      <td className="px-3 py-2">
                        {n.status === "error" && n.error_message && (
                          <Button
                            variant="ghost" size="sm"
                            className="h-6 text-xs text-destructive hover:text-destructive"
                            onClick={() => setErrorDialog({ number: n.number, message: n.error_message! })}
                          >
                            Ver erro
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Error dialog */}
      <Dialog open={!!errorDialog} onOpenChange={() => setErrorDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" /> Erro no envio
            </DialogTitle>
          </DialogHeader>
          {errorDialog && (() => {
            const t = translateEvolutionError(errorDialog.message);
            return (
              <div className="space-y-4">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Número</p>
                  <p className="font-mono text-sm">+{errorDialog.number}</p>
                </div>
                <div className="bg-destructive/10 border border-destructive/20 rounded-md p-4 space-y-2">
                  <p className="font-semibold text-sm text-destructive">{t.title}</p>
                  <p className="text-sm">{t.explanation}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Mensagem técnica</p>
                  <div className="bg-muted rounded-md p-3">
                    <p className="text-xs font-mono break-all text-muted-foreground">{errorDialog.message}</p>
                  </div>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      <ConversaDialog
        number={conversaDialog ?? ""}
        chips={camp.chips}
        open={!!conversaDialog}
        onClose={() => setConversaDialog(null)}
      />
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// NOVA CAMPANHA MODAL — 4 etapas
// ─────────────────────────────────────────────────────────────
type AudienceSource = "funil" | "leads" | "planilha" | "manual";

const STEPS = ["Público", "Mensagem", "Configurações", "Revisão"];

function NovaCampanhaModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [step, setStep] = useState(0);

  // Step 1: Público
  const [source, setSource] = useState<AudienceSource | null>(null);
  const [stages, setStages] = useState<CRMStage[]>([]);
  const [selectedStage, setSelectedStage] = useState("");
  const [audienceState, setAudienceState] = useState("");
  const [audienceCity, setAudienceCity] = useState("");
  const [audience, setAudience] = useState<CampaignAudienceItem[]>([]);
  const [loadingAudience, setLoadingAudience] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Step 2: Mensagem
  const [message, setMessage] = useState("");

  // Step 3: Configurações
  const [campaignName, setCampaignName] = useState("");
  const [instances, setInstances] = useState<Instance[]>([]);
  const [selectedChips, setSelectedChips] = useState<Set<string>>(new Set());
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [minSec, setMinSec] = useState(10);
  const [maxSec, setMaxSec] = useState(30);
  const [perChipLimit, setPerChipLimit] = useState(50);

  // Step 4: Revisão
  const [dupResult, setDupResult] = useState<DuplicateCheckResult | null>(null);
  const [checkingDups, setCheckingDups] = useState(false);
  const [checkCadastrosEnabled, setCheckCadastrosEnabled] = useState(false);
  const [cadastrosResult, setCadastrosResult] = useState<CadastrosCheckResult | null>(null);
  const [checkingCadastros, setCheckingCadastros] = useState(false);
  const [removeCadastros, setRemoveCadastros] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchCRMStages().then(setStages).catch(() => {});
    fetchInstances().then(setInstances).catch(() => {});
    setLabels(loadAllLabels());
  }, []);

  // Load audience when source/filters change
  useEffect(() => {
    if (source === "funil" || source === "leads") {
      loadAudience();
    }
  }, [source, selectedStage, audienceState, audienceCity]);

  const loadAudience = async () => {
    if (source === "funil" && !selectedStage) { setAudience([]); return; }
    setLoadingAudience(true);
    try {
      const items = await fetchCampaignAudience({
        type: source === "funil" ? "contacts" : "prospects",
        stageId: source === "funil" ? selectedStage : undefined,
        state: audienceState || undefined,
        city: audienceCity || undefined,
      });
      setAudience(items);
    } catch (e) {
      toast.error("Erro ao carregar audiência");
    } finally {
      setLoadingAudience(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target?.result, { type: "binary" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
        const items: CampaignAudienceItem[] = [];
        rows.forEach((row) => {
          const raw = String(row[0] ?? "").replace(/\D/g, "");
          if (raw.length >= 10) {
            items.push({
              number: raw,
              name: String(row[1] ?? ""),
              city: String(row[2] ?? ""),
              state: String(row[3] ?? ""),
            });
          }
        });
        setAudience(items);
        toast.success(`${items.length} números importados da planilha`);
      } catch {
        toast.error("Erro ao ler planilha");
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleManualNumbers = (text: string) => {
    const items: CampaignAudienceItem[] = text
      .split("\n")
      .map((l) => l.replace(/\D/g, ""))
      .filter((n) => n.length >= 10)
      .map((n) => ({ number: n, name: "", city: "", state: "" }));
    setAudience(items);
  };

  const handleCheckDups = async () => {
    setCheckingDups(true);
    try {
      const numbers = audience.map((a) => a.number);
      const result = await checkCampaignDuplicates(numbers);
      setDupResult(result);
    } catch {
      toast.error("Erro ao verificar duplicatas");
    } finally {
      setCheckingDups(false);
    }
  };

  const handleCheckCadastros = async () => {
    setCheckingCadastros(true);
    try {
      const numbers = audience.map((a) => a.number);
      const result = await checkCadastros(numbers);
      setCadastrosResult(result);
    } catch {
      toast.error("Erro ao verificar cadastros");
    } finally {
      setCheckingCadastros(false);
    }
  };

  const handleCreate = async () => {
    const chips = Array.from(selectedChips);
    if (!message.trim()) return toast.error("Escreva a mensagem");
    if (chips.length === 0) return toast.error("Selecione ao menos 1 chip");
    if (audience.length === 0) return toast.error("Nenhum destinatário selecionado");

    setCreating(true);
    try {
      const segmentLabel =
        source === "funil" ? `Funil: ${stages.find((s) => s.id === selectedStage)?.name || selectedStage}`
        : source === "leads" ? `Leads${audienceState ? ` · ${audienceState}` : ""}${audienceCity ? ` / ${audienceCity}` : ""}`
        : source === "planilha" ? "Planilha"
        : "Manual";

      let finalAudience = audience;
      if (removeCadastros && cadastrosResult && cadastrosResult.found.length > 0) {
        const foundSet = new Set(cadastrosResult.found.map((f) => f.number));
        finalAudience = audience.filter((a) => !foundSet.has(a.number));
        toast.info(`${cadastrosResult.found.length} cadastrado(s) removido(s) da lista`);
      }

      await createVPSCampaign({
        name: campaignName.trim() || `Campanha ${new Date().toLocaleDateString("pt-BR")}`,
        message,
        min_sec: minSec,
        max_sec: maxSec,
        per_chip_limit: perChipLimit,
        chips,
        segmentLabel,
        numbers: finalAudience,
      });
      toast.success("Campanha criada e iniciada no servidor!");
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao criar campanha");
    } finally {
      setCreating(false);
    }
  };

  const canNext = [
    () => source !== null && audience.length > 0,
    () => message.trim().length > 0,
    () => selectedChips.size > 0,
    () => true,
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">

        {/* Modal header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-border shrink-0">
          <h2 className="text-lg font-bold">Nova Campanha</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Step indicator */}
        <div className="px-6 pt-4 pb-2 shrink-0">
          <div className="flex items-center gap-0">
            {STEPS.map((label, i) => (
              <div key={i} className="flex items-center flex-1">
                <div className={`flex items-center gap-2 ${i <= step ? "text-foreground" : "text-muted-foreground"}`}>
                  <div className={`h-6 w-6 rounded-full text-xs font-bold flex items-center justify-center border-2 shrink-0 ${
                    i < step ? "bg-primary border-primary text-primary-foreground"
                    : i === step ? "border-primary text-primary"
                    : "border-border"
                  }`}>
                    {i < step ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
                  </div>
                  <span className="text-xs font-medium hidden sm:block">{label}</span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`flex-1 h-px mx-2 ${i < step ? "bg-primary" : "bg-border"}`} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Step content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">

          {/* ── Step 1: Público ── */}
          {step === 0 && (
            <div className="space-y-4">
              {/* Source selector */}
              <div className="grid grid-cols-2 gap-3">
                {([
                  { id: "funil",    icon: Target,          label: "Funil do CRM",   desc: "Contatos por etapa" },
                  { id: "leads",    icon: Database,        label: "Banco de Leads", desc: "Prospects scraped" },
                  { id: "planilha", icon: FileSpreadsheet, label: "Planilha",        desc: ".xlsx ou .csv" },
                  { id: "manual",   icon: Pencil,          label: "Manual",          desc: "Colar números" },
                ] as { id: AudienceSource; icon: any; label: string; desc: string }[]).map((s) => (
                  <button
                    key={s.id}
                    onClick={() => { setSource(s.id); setAudience([]); }}
                    className={`flex items-center gap-3 p-3 rounded-lg border-2 text-left transition-all ${
                      source === s.id
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/40 hover:bg-accent/40"
                    }`}
                  >
                    <s.icon className={`h-5 w-5 shrink-0 ${source === s.id ? "text-primary" : "text-muted-foreground"}`} />
                    <div>
                      <p className="text-sm font-medium">{s.label}</p>
                      <p className="text-xs text-muted-foreground">{s.desc}</p>
                    </div>
                  </button>
                ))}
              </div>

              {/* Source configuration */}
              {source === "funil" && (
                <div className="space-y-3 bg-muted/30 rounded-lg p-4 border border-border">
                  <div>
                    <Label className="text-xs mb-1 block">Etapa do funil</Label>
                    <Select value={selectedStage} onValueChange={setSelectedStage}>
                      <SelectTrigger><SelectValue placeholder="Selecione uma etapa" /></SelectTrigger>
                      <SelectContent>
                        {stages.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            <span className="flex items-center gap-2">
                              <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                              {s.name}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {source === "leads" && (
                <div className="space-y-3 bg-muted/30 rounded-lg p-4 border border-border">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs mb-1 block">Estado (opcional)</Label>
                      <Input placeholder="Ex: RN" value={audienceState} onChange={(e) => setAudienceState(e.target.value.toUpperCase())} maxLength={2} />
                    </div>
                    <div>
                      <Label className="text-xs mb-1 block">Cidade (opcional)</Label>
                      <Input placeholder="Ex: Natal" value={audienceCity} onChange={(e) => setAudienceCity(e.target.value)} />
                    </div>
                  </div>
                </div>
              )}

              {source === "planilha" && (
                <div className="space-y-2">
                  <div
                    className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary/40 hover:bg-accent/20 transition-colors"
                    onClick={() => fileRef.current?.click()}
                  >
                    <FileSpreadsheet className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm font-medium">Clique para selecionar</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      .xlsx ou .csv · Coluna A: número · B: nome · C: cidade · D: estado
                    </p>
                  </div>
                  <input ref={fileRef} type="file" accept=".xlsx,.csv" className="hidden" onChange={handleFileUpload} />
                </div>
              )}

              {source === "manual" && (
                <div className="space-y-2">
                  <Textarea
                    rows={7}
                    placeholder={"5584999999999\n5584988888888"}
                    className="font-mono text-sm resize-none"
                    onChange={(e) => handleManualNumbers(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">Um número por linha, com código do país</p>
                </div>
              )}

              {/* Audience preview */}
              {(source === "funil" || source === "leads") && (
                <div className="flex items-center justify-between bg-muted/30 rounded-lg px-4 py-3 border border-border">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    {loadingAudience ? (
                      <span className="text-sm text-muted-foreground flex items-center gap-1">
                        <Loader2 className="h-3 w-3 animate-spin" /> Carregando...
                      </span>
                    ) : (
                      <span className="text-sm">
                        <strong>{audience.length}</strong> destinatários selecionados
                      </span>
                    )}
                  </div>
                  {audience.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Ex: {audience[0].name || audience[0].number}
                      {audience.length > 1 ? `, ${audience[1].name || audience[1].number}` : ""}
                      {audience.length > 2 ? ` +${audience.length - 2}` : ""}
                    </p>
                  )}
                </div>
              )}

              {(source === "planilha" || source === "manual") && audience.length > 0 && (
                <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-4 py-3">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  <span className="text-sm"><strong>{audience.length}</strong> números prontos para disparar</span>
                </div>
              )}
            </div>
          )}

          {/* ── Step 2: Mensagem ── */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Mensagem</Label>
                  <span className="text-xs text-muted-foreground">{message.length} caracteres</span>
                </div>
                <Textarea
                  rows={7}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Oi {{nome}}, estou passando aqui rapidinho..."
                  className="resize-none"
                />
              </div>

              {/* Variable chips */}
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground font-medium">Variáveis disponíveis (clique para inserir):</p>
                <div className="flex gap-2 flex-wrap">
                  {[["{{nome}}", "Nome da pessoa"], ["{{cidade}}", "Cidade"], ["{{estado}}", "Estado"]].map(([v, label]) => (
                    <button
                      key={v}
                      onClick={() => setMessage((m) => m + v)}
                      className="text-xs bg-primary/10 border border-primary/30 text-primary px-2.5 py-1 rounded-full hover:bg-primary/20 transition-colors font-mono"
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>

              {/* Spintax hint */}
              <div className="bg-muted/30 rounded-lg p-3 border border-border">
                <p className="text-xs font-medium mb-1 flex items-center gap-1">
                  <Info className="h-3.5 w-3.5 text-primary" /> Spintax — variação aleatória por envio
                </p>
                <p className="text-xs text-muted-foreground font-mono">
                  {"Oi {amor|linda|querida}, tudo bem?"}
                </p>
              </div>

              {/* Preview */}
              {message.trim() && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Pré-visualização:</p>
                  <div className="bg-muted/30 rounded-lg p-3 border border-border text-sm">
                    {expandVariations(
                      message
                        .replace(/\{\{nome\}\}/g, audience[0]?.name || "Maria")
                        .replace(/\{\{cidade\}\}/g, audience[0]?.city || "Natal")
                        .replace(/\{\{estado\}\}/g, audience[0]?.state || "RN")
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Step 3: Configurações ── */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="camp-name" className="mb-1.5 block">Nome da campanha</Label>
                <Input
                  id="camp-name"
                  placeholder={`Campanha ${new Date().toLocaleDateString("pt-BR")}`}
                  value={campaignName}
                  onChange={(e) => setCampaignName(e.target.value)}
                />
              </div>

              <div>
                <Label className="mb-2 block">Chips (remetentes)</Label>
                <div className="space-y-1.5 max-h-44 overflow-y-auto bg-muted/20 rounded-lg p-3 border border-border">
                  {instances.map((inst) => {
                    const connected = isInstanceConnected(inst);
                    return (
                      <label
                        key={inst.name}
                        className={`flex items-center gap-2.5 p-2 rounded cursor-pointer hover:bg-accent/50 transition-colors ${!connected ? "opacity-50" : ""}`}
                      >
                        <Checkbox
                          checked={selectedChips.has(inst.name)}
                          onCheckedChange={() =>
                            setSelectedChips((s) => {
                              const n = new Set(s);
                              n.has(inst.name) ? n.delete(inst.name) : n.add(inst.name);
                              return n;
                            })
                          }
                          disabled={!connected}
                        />
                        <span className="flex-1 text-sm">{getChipDisplayName(inst, labels)}</span>
                        <span className={`h-2 w-2 rounded-full ${connected ? "bg-emerald-500" : "bg-destructive"}`} />
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs mb-1 block">Intervalo mín (s)</Label>
                  <Input type="number" min={1} value={minSec} onChange={(e) => setMinSec(Number(e.target.value) || 1)} />
                </div>
                <div>
                  <Label className="text-xs mb-1 block">Intervalo máx (s)</Label>
                  <Input type="number" min={1} value={maxSec} onChange={(e) => setMaxSec(Number(e.target.value) || 1)} />
                </div>
                <div>
                  <Label className="text-xs mb-1 block">Limite por chip</Label>
                  <Input type="number" min={1} value={perChipLimit} onChange={(e) => setPerChipLimit(Number(e.target.value) || 1)} />
                </div>
              </div>
            </div>
          )}

          {/* ── Step 4: Revisão ── */}
          {step === 3 && (
            <div className="space-y-4">
              {/* Summary */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Destinatários", value: String(audience.length), icon: Users },
                  { label: "Chips",          value: String(selectedChips.size), icon: Server },
                  { label: "Duração est.",   value: estimateDuration(audience.length, minSec, maxSec), icon: Clock },
                  { label: "Limite/chip",    value: String(perChipLimit), icon: Target },
                ].map((item) => (
                  <div key={item.label} className="bg-muted/30 border border-border rounded-lg p-3 flex items-center gap-3">
                    <item.icon className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div>
                      <p className="text-base font-bold leading-none">{item.value}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{item.label}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="bg-muted/30 border border-border rounded-lg p-3 text-sm space-y-1">
                <p><span className="text-muted-foreground">Campanha:</span> {campaignName || `Campanha ${new Date().toLocaleDateString("pt-BR")}`}</p>
                <p><span className="text-muted-foreground">Público:</span> {source === "funil" ? `Funil · ${stages.find((s) => s.id === selectedStage)?.name}` : source === "leads" ? `Leads ${audienceState || ""} ${audienceCity || ""}` : source === "planilha" ? "Planilha" : "Manual"}</p>
                <p><span className="text-muted-foreground">Chips:</span> {Array.from(selectedChips).join(", ")}</p>
                <p><span className="text-muted-foreground">Intervalo:</span> {minSec}s – {maxSec}s</p>
              </div>

              {/* Duplicate check */}
              <div className="border border-border rounded-lg overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 bg-muted/30">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <AlertTriangle className="h-4 w-4 text-yellow-400" />
                    Verificação de duplicatas
                  </div>
                  <Button variant="outline" size="sm" onClick={handleCheckDups} disabled={checkingDups}>
                    {checkingDups ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
                    Verificar
                  </Button>
                </div>

                {dupResult && (
                  <div className="px-4 py-3 space-y-2 text-sm">
                    <div className="flex gap-4">
                      <span className="text-muted-foreground">Total: <strong>{dupResult.total}</strong></span>
                      <span className="text-emerald-400">Limpos: <strong>{dupResult.cleanCount}</strong></span>
                      {dupResult.duplicateCount > 0 && (
                        <span className="text-yellow-400">Duplicatas: <strong>{dupResult.duplicateCount}</strong></span>
                      )}
                    </div>
                    {dupResult.inActiveCampaign.length > 0 && (
                      <p className="text-xs text-yellow-400">
                        {dupResult.inActiveCampaign.length} número(s) já estão em campanhas ativas
                      </p>
                    )}
                    {dupResult.activeConversations.length > 0 && (
                      <p className="text-xs text-yellow-400">
                        {dupResult.activeConversations.length} número(s) têm bot ativo no momento
                      </p>
                    )}
                    {dupResult.duplicateCount === 0 && (
                      <p className="text-xs text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Nenhuma duplicata encontrada
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Cadastros check */}
              <div className="border border-border rounded-lg overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 bg-muted/30">
                  <label className="flex items-center gap-2 text-sm font-medium cursor-pointer select-none">
                    <Checkbox
                      checked={checkCadastrosEnabled}
                      onCheckedChange={(v) => {
                        setCheckCadastrosEnabled(!!v);
                        if (!v) { setCadastrosResult(null); setRemoveCadastros(false); }
                      }}
                    />
                    <Database className="h-4 w-4 text-blue-400" />
                    Cruzar com base de cadastros
                  </label>
                  {checkCadastrosEnabled && (
                    <Button variant="outline" size="sm" onClick={handleCheckCadastros} disabled={checkingCadastros}>
                      {checkingCadastros
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                        : <Sparkles className="h-3.5 w-3.5 mr-1" />}
                      Analisar com IA
                    </Button>
                  )}
                </div>

                {checkCadastrosEnabled && cadastrosResult && (
                  <div className="px-4 py-3 space-y-3 text-sm">
                    <div className="flex gap-4">
                      <span className="text-muted-foreground">Total: <strong>{cadastrosResult.total}</strong></span>
                      <span className="text-blue-400">Cadastrados: <strong>{cadastrosResult.found.length}</strong></span>
                      <span className="text-emerald-400">Novos: <strong>{cadastrosResult.clean.length}</strong></span>
                    </div>

                    {cadastrosResult.gptAnalysis && (
                      <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 space-y-1.5">
                        <div className="flex items-center gap-1.5 text-xs font-medium text-primary">
                          <Sparkles className="h-3 w-3" /> Parecer da IA
                        </div>
                        <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap">
                          {cadastrosResult.gptAnalysis}
                        </p>
                      </div>
                    )}

                    {cadastrosResult.found.length > 0 && (
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <Checkbox
                          checked={removeCadastros}
                          onCheckedChange={(v) => setRemoveCadastros(!!v)}
                        />
                        <span className="text-xs">
                          Remover {cadastrosResult.found.length} cadastrado(s) da lista antes de disparar
                        </span>
                      </label>
                    )}
                  </div>
                )}

                {checkCadastrosEnabled && !cadastrosResult && !checkingCadastros && (
                  <p className="px-4 py-3 text-xs text-muted-foreground">
                    Clique em "Analisar com IA" para cruzar a lista com os cadastros do site e receber um parecer.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer navigation */}
        <div className="px-6 py-4 border-t border-border flex items-center justify-between shrink-0">
          <Button variant="ghost" onClick={step === 0 ? onClose : () => setStep((s) => s - 1)}>
            {step === 0 ? "Cancelar" : "Voltar"}
          </Button>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">{step + 1} de {STEPS.length}</span>
            {step < STEPS.length - 1 ? (
              <Button onClick={() => setStep((s) => s + 1)} disabled={!canNext[step]()}>
                Próximo <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            ) : (
              <Button onClick={handleCreate} disabled={creating} className="gap-2">
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {creating ? "Criando..." : "Iniciar Campanha"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

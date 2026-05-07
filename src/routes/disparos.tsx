import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Play, Pause, Square, Send, Server, CheckCircle2, AlertCircle, ChevronDown, ChevronUp, Clock, RefreshCw, GitBranch } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Instance, fetchInstances, isInstanceConnected } from "@/lib/evolution-api";
import { expandVariations } from "@/lib/broadcast-utils";
import { getChipDisplayName, loadAllLabels } from "@/lib/chip-labels";
import { createVPSCampaign, translateEvolutionError } from "@/lib/vps-queue";
import { useBroadcastQueue } from "@/lib/useBroadcastQueue";
import { VPSCampaign, BroadcastStatus } from "@/lib/vps-queue";
import { ConversaDialog } from "@/components/ConversaDialog";
import { RetentarDialog } from "@/components/RetentarDialog";

export const Route = createFileRoute("/disparos")({
  head: () => ({
    meta: [
      { title: "Disparos — WhatsApp Painel" },
      { name: "description", content: "Disparos em massa com fila no servidor." },
    ],
  }),
  component: DisparosPage,
});

function DisparosPage() {
  const [activeTab, setActiveTab] = useState("novo");
  const { campaigns, setStatus, refresh, error } = useBroadcastQueue();

  return (
    <AppShell>
      <div className="h-full overflow-y-auto p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          <div>
            <h1 className="text-2xl font-bold">Disparos em Massa</h1>
            <p className="text-sm text-muted-foreground">
              Fila no servidor — os disparos continuam mesmo com o computador desligado.
            </p>
          </div>

          {error && (
            <div className="bg-destructive/10 border border-destructive/30 text-destructive text-sm rounded-md px-4 py-3">
              Erro ao conectar com o servidor: {error}
            </div>
          )}

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full max-w-md grid-cols-2 mb-6">
              <TabsTrigger value="novo">Nova Campanha</TabsTrigger>
              <TabsTrigger value="producao" className="flex items-center gap-2">
                <Server className="h-4 w-4" /> Produção
              </TabsTrigger>
            </TabsList>

            <TabsContent value="novo">
              <NovoDisparoTab
                onCreated={() => {
                  refresh();
                  setActiveTab("producao");
                }}
              />
            </TabsContent>

            <TabsContent value="producao">
              <ProducaoTab campaigns={campaigns} setStatus={setStatus} onRefresh={refresh} />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </AppShell>
  );
}

function NovoDisparoTab({ onCreated }: { onCreated: () => void }) {
  const [instances, setInstances] = useState<Instance[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [campaignName, setCampaignName] = useState("");
  const [numbers, setNumbers] = useState("");
  const [message, setMessage] = useState("{Oi|Olá|E aí}, tudo bem?");
  const [minSec, setMinSec] = useState(10);
  const [maxSec, setMaxSec] = useState(30);
  const [perChipLimit, setPerChipLimit] = useState(50);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLabels(loadAllLabels());
    fetchInstances()
      .then(setInstances)
      .catch(() => toast.error("Falha ao carregar chips"));
  }, []);

  const toggle = (name: string) => {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(name)) n.delete(name);
      else n.add(name);
      return n;
    });
  };

  const startCampaign = async () => {
    const list = numbers
      .split("\n")
      .map((n) => n.replace(/\D/g, ""))
      .filter(Boolean);
    const chips = Array.from(selected);

    if (chips.length === 0) return toast.error("Selecione ao menos 1 chip");
    if (list.length === 0) return toast.error("Cole ao menos 1 número");
    if (!message.trim()) return toast.error("Informe a mensagem");

    setLoading(true);
    try {
      await createVPSCampaign({
        name: campaignName.trim() || `Campanha ${new Date().toLocaleDateString("pt-BR")}`,
        message,
        min_sec: minSec,
        max_sec: maxSec,
        per_chip_limit: perChipLimit,
        chips,
        numbers: list.map((n) => ({ number: n, status: "pending" as const })),
      });
      toast.success("Campanha enviada para o servidor!");
      setNumbers("");
      setCampaignName("");
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao criar campanha");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-4">
        <div className="bg-card border border-border rounded-lg p-4">
          <Label className="mb-2 block">Chips (Remetentes)</Label>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {instances.length === 0 && (
              <div className="text-sm text-muted-foreground">Nenhum chip encontrado.</div>
            )}
            {instances.map((i) => {
              const connected = isInstanceConnected(i);
              return (
                <label
                  key={i.name}
                  className={`flex items-center gap-2 p-2 rounded hover:bg-accent/50 cursor-pointer ${
                    !connected ? "opacity-50" : ""
                  }`}
                >
                  <Checkbox
                    checked={selected.has(i.name)}
                    onCheckedChange={() => toggle(i.name)}
                    disabled={!connected}
                  />
                  <span className="flex-1 text-sm">
                    {getChipDisplayName(i, labels)}{" "}
                    <span className="text-muted-foreground">@{i.name}</span>
                  </span>
                  <span
                    className={`h-2 w-2 rounded-full ${
                      connected ? "bg-success" : "bg-destructive"
                    }`}
                  />
                </label>
              );
            })}
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg p-4">
          <Label htmlFor="numbers" className="mb-2 block">
            Números de Destino (um por linha)
          </Label>
          <Textarea
            id="numbers"
            value={numbers}
            onChange={(e) => setNumbers(e.target.value)}
            rows={8}
            placeholder={"5511999999999\n5511988888888"}
            className="bg-input border-border font-mono text-sm"
          />
          <p className="text-xs text-muted-foreground mt-1">
            {numbers.split("\n").filter((n) => n.trim()).length} números listados
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="bg-card border border-border rounded-lg p-4">
          <Label htmlFor="campaign-name" className="mb-2 block">
            Nome da campanha
          </Label>
          <Input
            id="campaign-name"
            placeholder={`Campanha ${new Date().toLocaleDateString("pt-BR")}`}
            value={campaignName}
            onChange={(e) => setCampaignName(e.target.value)}
          />
        </div>

        <div className="bg-card border border-border rounded-lg p-4">
          <Label htmlFor="msg" className="mb-2 block">
            Mensagem (suporta spintax: {"{oi|olá|e aí}"})
          </Label>
          <Textarea
            id="msg"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={6}
            className="bg-input border-border"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Exemplo gerado: <em>{expandVariations(message)}</em>
          </p>
        </div>

        <div className="bg-card border border-border rounded-lg p-4 grid grid-cols-3 gap-3">
          <div>
            <Label>Intervalo mín (s)</Label>
            <Input
              type="number"
              min={1}
              value={minSec}
              onChange={(e) => setMinSec(Number(e.target.value) || 1)}
            />
          </div>
          <div>
            <Label>Intervalo máx (s)</Label>
            <Input
              type="number"
              min={1}
              value={maxSec}
              onChange={(e) => setMaxSec(Number(e.target.value) || 1)}
            />
          </div>
          <div>
            <Label>Limite por chip</Label>
            <Input
              type="number"
              min={1}
              value={perChipLimit}
              onChange={(e) => setPerChipLimit(Number(e.target.value) || 1)}
            />
          </div>
        </div>

        <Button onClick={startCampaign} disabled={loading} className="w-full" size="lg">
          <Send className="h-4 w-4 mr-2" />
          {loading ? "Enviando para o servidor..." : "Iniciar no Servidor"}
        </Button>
      </div>
    </div>
  );
}

function CampanhaCard({
  camp,
  isSubcampaign = false,
  setStatus,
  onRetentarClick,
}: {
  camp: VPSCampaign;
  isSubcampaign?: boolean;
  setStatus: (id: string, s: BroadcastStatus) => void;
  onRetentarClick: (camp: VPSCampaign) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [errorDialog, setErrorDialog] = useState<{ number: string; message: string } | null>(null);
  const [conversaDialog, setConversaDialog] = useState<string | null>(null);

  const total = camp.numbers.length;
  const sent = camp.numbers.filter((n) => n.status === "sent").length;
  const errors = camp.numbers.filter((n) => n.status === "error").length;
  const pending = camp.numbers.filter((n) => n.status === "pending").length;
  const pct = total ? ((sent + errors) / total) * 100 : 0;

  return (
    <>
      <div
        className={`bg-card border border-border rounded-lg flex flex-col gap-3 ${
          isSubcampaign ? "p-3 ml-6 border-l-4 border-l-primary/30" : "p-5 gap-4"
        }`}
      >
        {/* Indicador de subcampanha */}
        {isSubcampaign && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <GitBranch className="h-3 w-3" />
            <span>Subcampanha · retentativa</span>
          </div>
        )}

        {/* Cabeçalho */}
        <div className="flex justify-between items-start">
          <div>
            <h3
              className={`font-semibold flex items-center gap-2 ${isSubcampaign ? "text-base" : "text-lg"}`}
            >
              {camp.name || "Campanha"}
              <span
                className={`text-xs px-2 py-0.5 rounded-full ${
                  camp.status === "running"
                    ? "bg-primary/20 text-primary"
                    : camp.status === "completed"
                      ? "bg-success/20 text-success"
                      : camp.status === "paused"
                        ? "bg-warning/20 text-warning"
                        : "bg-muted text-muted-foreground"
                }`}
              >
                {camp.status.toUpperCase()}
              </span>
            </h3>
            <div className="text-xs text-muted-foreground mt-0.5 max-w-2xl truncate">
              {camp.message}
            </div>
          </div>
          <div className="flex gap-2 flex-wrap justify-end">
            {camp.status === "running" && (
              <Button variant="secondary" size="sm" onClick={() => setStatus(camp.id, "paused")}>
                <Pause className="h-4 w-4 mr-1" /> Pausar
              </Button>
            )}
            {camp.status === "paused" && (
              <Button variant="outline" size="sm" onClick={() => setStatus(camp.id, "running")}>
                <Play className="h-4 w-4 mr-1" /> Retomar
              </Button>
            )}
            {(camp.status === "running" || camp.status === "paused") && (
              <Button variant="destructive" size="sm" onClick={() => setStatus(camp.id, "stopped")}>
                <Square className="h-4 w-4 mr-1" /> Cancelar
              </Button>
            )}
            {errors > 0 && camp.status !== "running" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onRetentarClick(camp)}
                className="text-warning border-warning/50 hover:bg-warning/10"
              >
                <RefreshCw className="h-4 w-4 mr-1" />
                Retentar ({errors})
              </Button>
            )}
          </div>
        </div>

        {/* Progresso */}
        <div>
          <div className="flex justify-between text-sm mb-1">
            <span className="flex items-center gap-2">
              <span className="text-muted-foreground">Progresso:</span>
              <strong>{sent + errors} / {total}</strong>
            </span>
            <span className="flex gap-3 text-xs font-medium">
              <span className="flex items-center text-success">
                <CheckCircle2 className="h-3 w-3 mr-1" /> {sent}
              </span>
              <span className="flex items-center text-destructive">
                <AlertCircle className="h-3 w-3 mr-1" /> {errors}
              </span>
              <span className="flex items-center text-muted-foreground">
                <Clock className="h-3 w-3 mr-1" /> {pending}
              </span>
            </span>
          </div>
          <Progress value={pct} className="h-2" />
        </div>

        {/* Info + expandir */}
        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground">
            {camp.chips?.join(", ")} · {camp.min_sec}s – {camp.max_sec}s
          </div>
          <Button variant="ghost" size="sm" className="text-xs" onClick={() => setExpanded((v) => !v)}>
            {expanded ? (
              <><ChevronUp className="h-4 w-4 mr-1" /> Ocultar</>
            ) : (
              <><ChevronDown className="h-4 w-4 mr-1" /> Ver números ({total})</>
            )}
          </Button>
        </div>

        {/* Lista de números */}
        {expanded && (
          <div className="border border-border rounded-md overflow-hidden">
            <div className="max-h-72 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">#</th>
                    <th className="text-left px-3 py-2 font-medium">Número</th>
                    <th className="text-left px-3 py-2 font-medium">Status</th>
                    <th className="text-left px-3 py-2 font-medium">Chip</th>
                    <th className="text-left px-3 py-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {camp.numbers.map((n, idx) => (
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
                      <td className="px-3 py-2">
                        {n.status === "sent" && (
                          <span className="flex items-center gap-1 text-success font-medium">
                            <CheckCircle2 className="h-3 w-3" /> Enviado
                          </span>
                        )}
                        {n.status === "error" && (
                          <span className="flex items-center gap-1 text-destructive font-medium">
                            <AlertCircle className="h-3 w-3" /> Erro
                          </span>
                        )}
                        {n.status === "pending" && (
                          <span className="flex items-center gap-1 text-muted-foreground">
                            <Clock className="h-3 w-3" /> Pendente
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{n.instance || "—"}</td>
                      <td className="px-3 py-2">
                        {n.status === "error" && n.error_message && (
                          <Button
                            variant="ghost"
                            size="sm"
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

      {/* Pop-up de erro */}
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

      {/* Pop-up de conversa */}
      <ConversaDialog
        number={conversaDialog ?? ""}
        chips={camp.chips}
        open={!!conversaDialog}
        onClose={() => setConversaDialog(null)}
      />
    </>
  );
}

function ProducaoTab({
  campaigns,
  setStatus,
  onRefresh,
}: {
  campaigns: VPSCampaign[];
  setStatus: (id: string, s: BroadcastStatus) => void;
  onRefresh: () => void;
}) {
  const [retentarCamp, setRetentarCamp] = useState<VPSCampaign | null>(null);
  const [subExpanded, setSubExpanded] = useState<Set<string>>(new Set());

  const mainCampaigns = campaigns.filter((c) => !c.parentId);
  const subMap = new Map<string, VPSCampaign[]>();
  campaigns.filter((c) => c.parentId).forEach((c) => {
    const arr = subMap.get(c.parentId!) || [];
    arr.push(c);
    subMap.set(c.parentId!, arr);
  });

  if (mainCampaigns.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground border border-dashed rounded-lg">
        <Server className="h-10 w-10 mx-auto mb-3 opacity-20" />
        Nenhuma campanha no servidor.
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6">
        {mainCampaigns.map((camp) => {
          const subs = subMap.get(camp.id) || [];
          const hasSubs = subs.length > 0;
          const subsExpanded = subExpanded.has(camp.id);

          return (
            <div key={camp.id} className="space-y-2">
              <CampanhaCard
                camp={camp}
                setStatus={setStatus}
                onRetentarClick={setRetentarCamp}
              />

              {/* Subcampanhas */}
              {hasSubs && (
                <div>
                  <button
                    className="flex items-center gap-1.5 text-xs text-muted-foreground ml-6 mb-2 hover:text-foreground transition-colors"
                    onClick={() =>
                      setSubExpanded((prev) => {
                        const next = new Set(prev);
                        if (next.has(camp.id)) next.delete(camp.id);
                        else next.add(camp.id);
                        return next;
                      })
                    }
                  >
                    <GitBranch className="h-3 w-3" />
                    {subsExpanded ? "Ocultar" : "Ver"} {subs.length} subcampanha{subs.length !== 1 ? "s" : ""}
                    {subsExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </button>

                  {subsExpanded && (
                    <div className="space-y-2">
                      {subs
                        .sort((a, b) => a.created_at - b.created_at)
                        .map((sub) => (
                          <CampanhaCard
                            key={sub.id}
                            camp={sub}
                            isSubcampaign
                            setStatus={setStatus}
                            onRetentarClick={setRetentarCamp}
                          />
                        ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Dialog de retentar */}
      {retentarCamp && (
        <RetentarDialog
          campaign={retentarCamp}
          open={!!retentarCamp}
          onClose={() => setRetentarCamp(null)}
          onSuccess={onRefresh}
        />
      )}
    </>
  );
}

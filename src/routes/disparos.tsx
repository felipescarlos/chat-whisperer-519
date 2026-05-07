import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Play, Pause, Square, Send, Server, CheckCircle2, AlertCircle } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Instance, fetchInstances, isInstanceConnected } from "@/lib/evolution-api";
import { expandVariations } from "@/lib/broadcast-utils";
import { getChipDisplayName, loadAllLabels } from "@/lib/chip-labels";
import { createVPSCampaign } from "@/lib/vps-queue";
import { useBroadcastQueue } from "@/lib/useBroadcastQueue";
import { VPSCampaign, BroadcastStatus } from "@/lib/vps-queue";

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
              <ProducaoTab campaigns={campaigns} setStatus={setStatus} />
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
        message,
        min_sec: minSec,
        max_sec: maxSec,
        per_chip_limit: perChipLimit,
        chips,
        numbers: list.map((n) => ({ number: n, status: "pending" as const })),
      });
      toast.success("Campanha enviada para o servidor!");
      setNumbers("");
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

function ProducaoTab({
  campaigns,
  setStatus,
}: {
  campaigns: VPSCampaign[];
  setStatus: (id: string, s: BroadcastStatus) => void;
}) {
  if (campaigns.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground border border-dashed rounded-lg">
        <Server className="h-10 w-10 mx-auto mb-3 opacity-20" />
        Nenhuma campanha no servidor.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {campaigns.map((camp) => {
        const total = camp.numbers.length;
        const sent = camp.numbers.filter((n) => n.status === "sent").length;
        const errors = camp.numbers.filter((n) => n.status === "error").length;
        const pct = total ? ((sent + errors) / total) * 100 : 0;

        return (
          <div
            key={camp.id}
            className="bg-card border border-border rounded-lg p-5 flex flex-col gap-4"
          >
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-semibold text-lg flex items-center gap-2">
                  Campanha
                  <span
                    className={`text-xs px-2 py-1 rounded-full ${
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
                <div className="text-xs text-muted-foreground mt-1 max-w-2xl truncate">
                  {camp.message}
                </div>
              </div>
              <div className="flex gap-2">
                {camp.status === "running" && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setStatus(camp.id, "paused")}
                  >
                    <Pause className="h-4 w-4 mr-1" /> Pausar
                  </Button>
                )}
                {camp.status === "paused" && (
                  <Button variant="outline" size="sm" onClick={() => setStatus(camp.id, "running")}>
                    <Play className="h-4 w-4 mr-1" /> Retomar
                  </Button>
                )}
                {(camp.status === "running" || camp.status === "paused") && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setStatus(camp.id, "stopped")}
                  >
                    <Square className="h-4 w-4 mr-1" /> Cancelar
                  </Button>
                )}
              </div>
            </div>

            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="flex items-center gap-2">
                  <span className="text-muted-foreground">Progresso:</span>
                  <strong>
                    {sent + errors} / {total}
                  </strong>
                </span>
                <span className="flex gap-3 text-xs font-medium">
                  <span className="flex items-center text-success">
                    <CheckCircle2 className="h-3 w-3 mr-1" /> {sent}
                  </span>
                  <span className="flex items-center text-destructive">
                    <AlertCircle className="h-3 w-3 mr-1" /> {errors}
                  </span>
                </span>
              </div>
              <Progress value={pct} className="h-2" />
            </div>

            <div className="text-xs text-muted-foreground">
              Chips: {camp.chips?.join(", ") || "Nenhum"} | Intervalo: {camp.min_sec}s –{" "}
              {camp.max_sec}s
            </div>
          </div>
        );
      })}
    </div>
  );
}

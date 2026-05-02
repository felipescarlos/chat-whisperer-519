import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Play, Pause, Square, Send } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  Instance,
  fetchInstances,
  isInstanceConnected,
  sendText,
} from "@/lib/evolution-api";
import { expandVariations, randomBetween, sleep } from "@/lib/broadcast-utils";
import { appendHistory } from "@/lib/broadcast-history";
import { getChipDisplayName } from "@/lib/chip-labels";

export const Route = createFileRoute("/disparos")({
  head: () => ({
    meta: [
      { title: "Disparos — WhatsApp Painel" },
      { name: "description", content: "Disparos em massa com variações de mensagem." },
    ],
  }),
  component: DisparosPage,
});

type Status = "idle" | "running" | "paused" | "stopped";

interface LogEntry {
  number: string;
  instance: string;
  status: "success" | "error";
  error?: string;
}

function DisparosPage() {
  const [instances, setInstances] = useState<Instance[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [numbers, setNumbers] = useState("");
  const [message, setMessage] = useState("{Oi|Olá|E aí}, tudo bem?");
  const [minSec, setMinSec] = useState(10);
  const [maxSec, setMaxSec] = useState(30);
  const [perChipLimit, setPerChipLimit] = useState(50);
  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState({ sent: 0, total: 0, errors: 0 });
  const [log, setLog] = useState<LogEntry[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const pauseRef = useRef<{ paused: boolean }>({ paused: false });

  useEffect(() => {
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

  const start = async () => {
    const list = numbers
      .split("\n")
      .map((n) => n.replace(/\D/g, ""))
      .filter(Boolean);
    const chips = Array.from(selected);
    if (chips.length === 0) {
      toast.error("Selecione ao menos 1 chip");
      return;
    }
    if (list.length === 0) {
      toast.error("Cole ao menos 1 número");
      return;
    }
    if (!message.trim()) {
      toast.error("Informe a mensagem");
      return;
    }

    abortRef.current = new AbortController();
    pauseRef.current.paused = false;
    setStatus("running");
    setProgress({ sent: 0, total: list.length, errors: 0 });
    setLog([]);

    let idx = 0;
    const perChipCount: Record<string, number> = {};
    chips.forEach((c) => (perChipCount[c] = 0));
    let success = 0;
    let errors = 0;

    try {
      for (const number of list) {
        if (abortRef.current.signal.aborted) break;
        // Pause loop
        while (pauseRef.current.paused) {
          await sleep(500, abortRef.current.signal).catch(() => {});
          if (abortRef.current.signal.aborted) break;
        }
        if (abortRef.current.signal.aborted) break;

        // Pick chip with available capacity, round-robin
        let chip: string | null = null;
        for (let i = 0; i < chips.length; i++) {
          const candidate = chips[(idx + i) % chips.length];
          if (perChipCount[candidate] < perChipLimit) {
            chip = candidate;
            idx = (idx + i + 1) % chips.length;
            break;
          }
        }
        if (!chip) {
          toast.warning("Limite por chip atingido em todos");
          break;
        }

        const text = expandVariations(message);
        try {
          await sendText(chip, number, text);
          perChipCount[chip]++;
          success++;
          setProgress((p) => ({ ...p, sent: p.sent + 1 }));
          const entry: LogEntry = { number, instance: chip!, status: "success" };
          setLog((l) => [entry, ...l].slice(0, 200));
        } catch (e) {
          errors++;
          const msg = e instanceof Error ? e.message : "Erro";
          setProgress((p) => ({ ...p, sent: p.sent + 1, errors: p.errors + 1 }));
          const entry: LogEntry = { number, instance: chip!, status: "error", error: msg };
          setLog((l) => [entry, ...l].slice(0, 200));
        }

        // Wait
        const wait = randomBetween(minSec, maxSec) * 1000;
        try {
          await sleep(wait, abortRef.current.signal);
        } catch {
          break;
        }
      }
    } finally {
      const finalStatus: Status = abortRef.current?.signal.aborted ? "stopped" : "idle";
      setStatus(finalStatus);
      appendHistory({
        id: `b-${Date.now()}`,
        date: Date.now(),
        instances: chips,
        total: list.length,
        success,
        failed: errors,
        message,
      });
      toast.success(`Disparo finalizado: ${success} ok, ${errors} erros`);
    }
  };

  const pause = () => {
    pauseRef.current.paused = true;
    setStatus("paused");
  };

  const resume = () => {
    pauseRef.current.paused = false;
    setStatus("running");
  };

  const stop = () => {
    abortRef.current?.abort();
    pauseRef.current.paused = false;
    setStatus("stopped");
  };

  const pct = progress.total ? (progress.sent / progress.total) * 100 : 0;

  return (
    <AppShell>
      <div className="h-full overflow-y-auto p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          <div>
            <h1 className="text-2xl font-bold">Disparos</h1>
            <p className="text-sm text-muted-foreground">
              Envie em massa com variações e intervalos aleatórios.
            </p>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-4">
              <div className="bg-card border border-border rounded-lg p-4">
                <Label className="mb-2 block">Chips</Label>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {instances.length === 0 && (
                    <div className="text-sm text-muted-foreground">Nenhum chip.</div>
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
                          {getChipDisplayName(i)}{" "}
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
                  Números (um por linha)
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
                  {numbers.split("\n").filter((n) => n.trim()).length} números
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="bg-card border border-border rounded-lg p-4">
                <Label htmlFor="msg" className="mb-2 block">
                  Mensagem (com variações: {"{oi|olá|e aí}"})
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

              <div className="bg-card border border-border rounded-lg p-4 space-y-3">
                <div className="flex gap-2">
                  {status === "idle" || status === "stopped" ? (
                    <Button onClick={start} className="flex-1">
                      <Play className="h-4 w-4 mr-2" /> Iniciar
                    </Button>
                  ) : status === "running" ? (
                    <Button onClick={pause} variant="secondary" className="flex-1">
                      <Pause className="h-4 w-4 mr-2" /> Pausar
                    </Button>
                  ) : (
                    <Button onClick={resume} className="flex-1">
                      <Play className="h-4 w-4 mr-2" /> Retomar
                    </Button>
                  )}
                  <Button
                    onClick={stop}
                    variant="destructive"
                    disabled={status === "idle" || status === "stopped"}
                  >
                    <Square className="h-4 w-4 mr-2" /> Parar
                  </Button>
                </div>

                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>
                      {progress.sent} / {progress.total} enviados
                    </span>
                    <span className="text-destructive">{progress.errors} erros</span>
                  </div>
                  <Progress value={pct} />
                </div>
              </div>
            </div>
          </div>

          {log.length > 0 && (
            <div className="bg-card border border-border rounded-lg p-4">
              <Label className="mb-2 block flex items-center gap-2">
                <Send className="h-4 w-4" /> Log
              </Label>
              <div className="max-h-64 overflow-y-auto text-xs space-y-1 font-mono">
                {log.map((l, idx) => (
                  <div
                    key={idx}
                    className={`flex gap-2 ${
                      l.status === "error" ? "text-destructive" : "text-success"
                    }`}
                  >
                    <span>{l.status === "success" ? "✓" : "✗"}</span>
                    <span>{l.number}</span>
                    <span className="text-muted-foreground">via {l.instance}</span>
                    {l.error && <span className="text-muted-foreground">— {l.error}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

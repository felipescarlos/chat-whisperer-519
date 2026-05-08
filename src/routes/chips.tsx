import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, Trash2, RefreshCw, Smartphone, Pencil, Webhook, Shield, ShieldCheck } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Instance,
  connectInstance,
  createInstance,
  deleteInstance,
  fetchInstances,
  instanceState,
  isInstanceConnected,
  getWebhook,
  setWebhook,
  getProxy,
} from "@/lib/evolution-api";
import { getChipDisplayName, setChipLabel, loadAllLabels } from "@/lib/chip-labels";
import { ProxyDialog } from "@/components/ProxyDialog";

export const Route = createFileRoute("/chips")({
  head: () => ({
    meta: [
      { title: "Chips — WhatsApp Painel" },
      { name: "description", content: "Gerencie chips/instâncias WhatsApp." },
    ],
  }),
  component: ChipsPage,
});

function ChipsPage() {
  const [instances, setInstances] = useState<Instance[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newNumber, setNewNumber] = useState("");
  const [usePairingCode, setUsePairingCode] = useState(false);
  const [creating, setCreating] = useState(false);
  const [qrInstance, setQrInstance] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string>("");
  const [pairingCode, setPairingCode] = useState<string>("");
  const [pairingNumber, setPairingNumber] = useState<string>("");
  const [qrLoading, setQrLoading] = useState(false);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [editLabelOpen, setEditLabelOpen] = useState(false);
  const [labelInstance, setLabelInstance] = useState<string | null>(null);
  const [newLabel, setNewLabel] = useState("");
  const [webhooks, setWebhooks] = useState<Record<string, boolean>>({});
  const [proxies, setProxies] = useState<Record<string, boolean>>({});
  const [proxyOpen, setProxyOpen] = useState(false);
  const [proxyInstance, setProxyInstance] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setLabels(loadAllLabels());
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await fetchInstances();
      setInstances(list);
      
      const hooks: Record<string, boolean> = {};
      const prxs: Record<string, boolean> = {};
      await Promise.all(
        list.map(async (i) => {
          if (isInstanceConnected(i)) {
            const [h, p] = await Promise.all([
              getWebhook(i.name),
              getProxy(i.name),
            ]);
            hooks[i.name] = h?.enabled || false;
            prxs[i.name] = p?.enabled || false;
          }
        })
      );
      setWebhooks(hooks);
      setProxies(prxs);
    } catch (e) {
      console.error(e);
      toast.error("Falha ao carregar chips");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const stopPolling = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  useEffect(() => () => stopPolling(), []);

  const refreshQr = useCallback(
    async (name: string) => {
      setQrLoading(true);
      try {
        // Check if already connected
        const state = await instanceState(name).catch(() => null);
        if (state?.instance?.state === "open") {
          toast.success(`Chip ${name} conectado!`);
          setQrInstance(null);
          stopPolling();
          load();
          return;
        }
        const r = await connectInstance(name, pairingNumber || undefined);
        const code = r.base64 || r.code || "";
        setQrCode(code);
        if (r.pairingCode) setPairingCode(r.pairingCode);
      } catch (e) {
        console.error(e);
        toast.error("Falha ao gerar QR Code");
      } finally {
        setQrLoading(false);
      }
    },
    [load, pairingNumber],
  );

  const openQr = async (name: string, number?: string) => {
    setQrInstance(name);
    setQrCode("");
    setPairingCode("");
    setPairingNumber(number || "");
    await refreshQr(name);
    stopPolling();
    // Pairing codes expire ~60s; refresh more often when in pairing mode
    const ms = number ? 30_000 : 20_000;
    intervalRef.current = setInterval(() => refreshQr(name), ms);
  };

  const closeQr = () => {
    stopPolling();
    setQrInstance(null);
    setQrCode("");
    setPairingCode("");
    setPairingNumber("");
    load();
  };

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) {
      toast.error("Informe um nome");
      return;
    }
    const number = newNumber.replace(/\D/g, "");
    if (usePairingCode && number.length < 10) {
      toast.error("Informe o número com DDI + DDD (ex: 5511999999999)");
      return;
    }
    setCreating(true);
    try {
      await createInstance(name, usePairingCode ? number : undefined);
      toast.success("Chip criado");
      setAddOpen(false);
      setNewName("");
      setNewNumber("");
      const usingPair = usePairingCode;
      const pairNum = number;
      setUsePairingCode(false);
      await load();
      // Always go through openQr so polling refreshes the (short-lived) code
      openQr(name, usingPair ? pairNum : undefined);
    } catch (e) {
      console.error(e);
      toast.error("Falha ao criar chip");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (name: string) => {
    if (!confirm(`Desconectar e remover ${name}?`)) return;
    try {
      await deleteInstance(name);
      toast.success("Chip removido");
      load();
    } catch (e) {
      console.error(e);
      toast.error("Falha ao remover");
    }
  };

  const openEditLabel = (name: string) => {
    setLabelInstance(name);
    setNewLabel(labels[name] || "");
    setEditLabelOpen(true);
  };

  const handleSaveLabel = () => {
    if (labelInstance) {
      setChipLabel(labelInstance, newLabel);
      setLabels(loadAllLabels());
      toast.success("Etiqueta atualizada");
      setEditLabelOpen(false);
    }
  };

  const handleToggleWebhook = async (name: string, isCurrentlyEnabled: boolean) => {
    const globalUrl = localStorage.getItem("global-webhook-url");
    if (!isCurrentlyEnabled && !globalUrl) {
      toast.error("Configure uma URL de Webhook na aba 'Config' primeiro.");
      return;
    }
    const targetState = !isCurrentlyEnabled;
    try {
      await setWebhook(name, globalUrl || "", targetState);
      setWebhooks((prev) => ({ ...prev, [name]: targetState }));
      toast.success(`Webhook ${targetState ? "ativado" : "desativado"} para ${name}`);
    } catch (e) {
      console.error(e);
      toast.error("Falha ao alterar status do Webhook");
    }
  };

  return (
    <AppShell>
      <div className="h-full overflow-y-auto p-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold">Chips</h1>
              <p className="text-sm text-muted-foreground">Gerencie suas instâncias WhatsApp</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={load}>
                <RefreshCw className="h-4 w-4 mr-2" /> Atualizar
              </Button>
              <Button onClick={() => setAddOpen(true)}>
                <Plus className="h-4 w-4 mr-2" /> Adicionar chip
              </Button>
            </div>
          </div>

          {loading ? (
            <div className="text-center text-muted-foreground py-12">Carregando chips...</div>
          ) : instances.length === 0 ? (
            <div className="text-center text-muted-foreground py-12">
              <Smartphone className="h-12 w-12 mx-auto mb-3 opacity-40" />
              Nenhum chip cadastrado.
            </div>
          ) : (
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {instances.map((i) => {
                const connected = isInstanceConnected(i);
                return (
                  <div
                    key={i.name}
                    className="bg-card border border-border rounded-lg p-4 flex flex-col gap-3"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar className="h-14 w-14">
                        <AvatarImage src={i.profilePicUrl || undefined} />
                        <AvatarFallback className="bg-muted">
                          {(i.profileName || i.name).slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1 group">
                          <div className="font-semibold truncate">
                            {getChipDisplayName(i, labels)}
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-foreground transition-colors"
                            onClick={() => openEditLabel(i.name)}
                            title="Editar etiqueta"
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                          {connected && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className={`h-6 w-6 transition-colors ${webhooks[i.name] ? 'text-primary hover:text-primary/80' : 'text-muted-foreground hover:text-foreground'}`}
                              onClick={() => handleToggleWebhook(i.name, webhooks[i.name] || false)}
                              title={webhooks[i.name] ? "Webhook Ativo (Clique para desativar)" : "Webhook Inativo (Clique para ativar)"}
                            >
                              <Webhook className="h-3 w-3" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className={`h-6 w-6 transition-colors ${
                              proxies[i.name]
                                ? "text-emerald-400 hover:text-emerald-300"
                                : "text-muted-foreground hover:text-foreground"
                            }`}
                            onClick={() => { setProxyInstance(i.name); setProxyOpen(true); }}
                            title={proxies[i.name] ? "Proxy ativo — clique para configurar" : "Configurar proxy"}
                          >
                            {proxies[i.name] ? (
                              <ShieldCheck className="h-3.5 w-3.5" />
                            ) : (
                              <Shield className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {i.ownerJid ? i.ownerJid.replace(/@.*$/, "") : i.number || "—"}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">@{i.name}</div>
                      </div>
                      <span
                        className={`h-3 w-3 rounded-full shrink-0 ${
                          connected ? "bg-success" : "bg-destructive"
                        }`}
                        title={connected ? "Conectado" : "Desconectado"}
                      />
                    </div>
                    <div className="flex gap-2">
                      {!connected && (
                        <Button
                          size="sm"
                          variant="secondary"
                          className="flex-1"
                          onClick={() => openQr(i.name)}
                        >
                          Conectar
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 text-destructive hover:text-destructive"
                        onClick={() => handleDelete(i.name)}
                      >
                        <Trash2 className="h-4 w-4 mr-1" /> Remover
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Add modal */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar chip</DialogTitle>
            <DialogDescription>Dê um nome único para a instância (sem espaços).</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Nome (ex: chip_vendas_01)"
              value={newName}
              onChange={(e) => setNewName(e.target.value.replace(/\s+/g, "_"))}
            />
            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <input
                type="checkbox"
                checked={usePairingCode}
                onChange={(e) => setUsePairingCode(e.target.checked)}
                className="h-4 w-4 accent-primary"
              />
              Conectar por código de pareamento (sem QR)
            </label>
            {usePairingCode && (
              <div className="space-y-1">
                <Input
                  placeholder="Número com DDI+DDD (ex: 5511999999999)"
                  value={newNumber}
                  onChange={(e) => setNewNumber(e.target.value.replace(/\D/g, ""))}
                  inputMode="numeric"
                />
                <p className="text-xs text-muted-foreground">
                  Você receberá um código de 8 dígitos para digitar no WhatsApp: Aparelhos
                  conectados → Vincular com número de telefone.
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? "Criando..." : "Criar e conectar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* QR modal */}
      <Dialog open={!!qrInstance} onOpenChange={(o) => !o && closeQr()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Conectar {qrInstance}</DialogTitle>
            <DialogDescription>
              {pairingCode
                ? "No WhatsApp do celular: Aparelhos conectados → Vincular com número de telefone, e digite o código abaixo."
                : "Abra o WhatsApp no celular → Aparelhos conectados → Conectar aparelho. O QR atualiza a cada 20 segundos."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center justify-center py-4 min-h-[280px] gap-4">
            {pairingCode ? (
              <div className="text-center">
                <div className="text-xs text-muted-foreground mb-2">Código de pareamento</div>
                <div className="text-4xl font-mono font-bold tracking-[0.3em] bg-muted px-6 py-4 rounded-lg">
                  {pairingCode.match(/.{1,4}/g)?.join("-") || pairingCode}
                </div>
                {pairingNumber && (
                  <div className="text-xs text-muted-foreground mt-2">Número: {pairingNumber}</div>
                )}
              </div>
            ) : qrLoading && !qrCode ? (
              <div className="text-muted-foreground">Gerando QR Code...</div>
            ) : qrCode ? (
              qrCode.startsWith("data:image") ? (
                <img src={qrCode} alt="QR Code" className="w-64 h-64 bg-white p-2 rounded" />
              ) : (
                <div className="bg-white p-3 rounded">
                  <QRCodeSVG value={qrCode} size={240} />
                </div>
              )
            ) : (
              <div className="text-muted-foreground">Aguardando QR...</div>
            )}
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            {!pairingCode && qrInstance && (
              <Button
                variant="outline"
                onClick={() => {
                  const inst = instances.find((x) => x.name === qrInstance);
                  const existing =
                    (inst?.number || "").replace(/\D/g, "") ||
                    (inst?.ownerJid || "").replace(/@.*$/, "");
                  const input = prompt("Número com DDI+DDD (ex: 5511999999999):", existing);
                  if (!input) return;
                  const num = input.replace(/\D/g, "");
                  if (num.length < 10) {
                    toast.error("Número inválido");
                    return;
                  }
                  openQr(qrInstance, num);
                }}
              >
                Usar código no lugar do QR
              </Button>
            )}
            <Button variant="outline" onClick={() => qrInstance && refreshQr(qrInstance)}>
              <RefreshCw className="h-4 w-4 mr-2" /> Atualizar agora
            </Button>
            <Button onClick={closeQr}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Label Edit modal */}
      <Dialog open={editLabelOpen} onOpenChange={setEditLabelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar etiqueta</DialogTitle>
            <DialogDescription>
              Defina um nome amigável para identificar este chip (ex: 7195).
            </DialogDescription>
          </DialogHeader>
          <Input
            placeholder="Etiqueta do chip"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditLabelOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveLabel}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Proxy modal */}
      {proxyInstance && (
        <ProxyDialog
          instanceName={proxyInstance}
          open={proxyOpen}
          onClose={() => { setProxyOpen(false); setProxyInstance(null); }}
          onSaved={() => {
            // Re-fetch proxy status for this chip
            getProxy(proxyInstance).then((p) => {
              setProxies((prev) => ({ ...prev, [proxyInstance]: p?.enabled || false }));
            });
          }}
        />
      )}
    </AppShell>
  );
}

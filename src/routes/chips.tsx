import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, Trash2, RefreshCw, Smartphone } from "lucide-react";
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
} from "@/lib/evolution-api";

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
  const [creating, setCreating] = useState(false);
  const [qrInstance, setQrInstance] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string>("");
  const [qrLoading, setQrLoading] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await fetchInstances();
      setInstances(list);
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

  const refreshQr = useCallback(async (name: string) => {
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
      const r = await connectInstance(name);
      const code = r.base64 || r.code || "";
      setQrCode(code);
    } catch (e) {
      console.error(e);
      toast.error("Falha ao gerar QR Code");
    } finally {
      setQrLoading(false);
    }
  }, [load]);

  const openQr = async (name: string) => {
    setQrInstance(name);
    setQrCode("");
    await refreshQr(name);
    stopPolling();
    intervalRef.current = setInterval(() => refreshQr(name), 20_000);
  };

  const closeQr = () => {
    stopPolling();
    setQrInstance(null);
    setQrCode("");
    load();
  };

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) {
      toast.error("Informe um nome");
      return;
    }
    setCreating(true);
    try {
      await createInstance(name);
      toast.success("Chip criado");
      setAddOpen(false);
      setNewName("");
      await load();
      openQr(name);
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

  return (
    <AppShell>
      <div className="h-full overflow-y-auto p-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold">Chips</h1>
              <p className="text-sm text-muted-foreground">
                Gerencie suas instâncias WhatsApp
              </p>
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
                        <div className="font-semibold truncate">
                          {i.profileName || i.name}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {i.ownerJid ? i.ownerJid.replace(/@.*$/, "") : i.number || "—"}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          @{i.name}
                        </div>
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
            <DialogDescription>
              Dê um nome único para a instância (sem espaços).
            </DialogDescription>
          </DialogHeader>
          <Input
            placeholder="ex: chip_vendas_01"
            value={newName}
            onChange={(e) => setNewName(e.target.value.replace(/\s+/g, "_"))}
          />
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
              Abra o WhatsApp no celular → Aparelhos conectados → Conectar aparelho. O QR
              atualiza a cada 20 segundos.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-center py-4 min-h-[280px] items-center">
            {qrLoading && !qrCode ? (
              <div className="text-muted-foreground">Gerando QR Code...</div>
            ) : qrCode ? (
              qrCode.startsWith("data:image") ? (
                // eslint-disable-next-line @next/next/no-img-element
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
          <DialogFooter>
            <Button variant="outline" onClick={() => qrInstance && refreshQr(qrInstance)}>
              <RefreshCw className="h-4 w-4 mr-2" /> Atualizar agora
            </Button>
            <Button onClick={closeQr}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

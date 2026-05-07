import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Save, Webhook, Loader2, RefreshCw } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  fetchInstances,
  isInstanceConnected,
  setWebhook,
  getWebhook,
} from "@/lib/evolution-api";

export const Route = createFileRoute("/configuracoes")({
  head: () => ({
    meta: [
      { title: "Configurações — WhatsApp Painel" },
      { name: "description", content: "Configurações globais e Webhooks." },
    ],
  }),
  component: ConfiguracoesPage,
});

function ConfiguracoesPage() {
  const [webhookUrl, setWebhookUrl] = useState("");
  const [isApplying, setIsApplying] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Busca o webhook atual configurado no VPS
  const loadCurrentWebhook = async () => {
    setIsLoading(true);
    try {
      const instances = await fetchInstances();
      const connected = instances.filter(isInstanceConnected);

      if (connected.length > 0) {
        const config = await getWebhook(connected[0].name);
        if (config?.url) {
          setWebhookUrl(config.url);
          return;
        }
      }

      // Fallback: tenta qualquer instância
      for (const instance of instances) {
        const config = await getWebhook(instance.name);
        if (config?.url) {
          setWebhookUrl(config.url);
          return;
        }
      }

      setWebhookUrl("");
    } catch (err) {
      console.error("Erro ao buscar webhook:", err);
      toast.error("Não foi possível carregar o webhook atual.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadCurrentWebhook();
  }, []);

  const handleApplyWebhooks = async () => {
    if (!webhookUrl.trim() || !webhookUrl.startsWith("http")) {
      return toast.error("Por favor, insira uma URL válida (http:// ou https://)");
    }

    setIsApplying(true);
    try {
      const instances = await fetchInstances();
      const connectedInstances = instances.filter(isInstanceConnected);

      if (connectedInstances.length === 0) {
        toast.warning("Nenhum chip conectado foi encontrado para aplicar o webhook.");
        setIsApplying(false);
        return;
      }

      let successCount = 0;
      let errorCount = 0;

      for (const instance of connectedInstances) {
        try {
          await setWebhook(instance.name, webhookUrl.trim());
          successCount++;
        } catch (err) {
          console.error(`Erro ao configurar webhook em ${instance.name}`, err);
          errorCount++;
        }
      }

      if (errorCount === 0) {
        toast.success(`Webhook aplicado com sucesso em ${successCount} chips!`);
      } else {
        toast.warning(`Webhook aplicado em ${successCount} chips, mas falhou em ${errorCount}.`);
      }
    } catch (error) {
      console.error(error);
      toast.error("Erro ao buscar chips. Tente novamente.");
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <AppShell>
      <div className="h-full overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Webhook className="h-6 w-6 text-primary" />
              Configurações
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Gerencie opções globais para todas as suas instâncias do WhatsApp.
            </p>
          </div>

          <div className="bg-card border border-border rounded-lg p-6 space-y-6">
            <div>
              <h2 className="text-lg font-semibold mb-1">Webhook Global (Mensagens Recebidas)</h2>
              <p className="text-sm text-muted-foreground mb-4">
                URL configurada no servidor para receber todas as mensagens que chegarem nos chips conectados.
                O valor atual é carregado diretamente do VPS.
              </p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="webhook-url">URL do Webhook atual</Label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={loadCurrentWebhook}
                  disabled={isLoading}
                  className="text-xs text-muted-foreground"
                >
                  {isLoading ? (
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3 w-3 mr-1" />
                  )}
                  Recarregar do servidor
                </Button>
              </div>
              <Input
                id="webhook-url"
                placeholder={isLoading ? "Carregando..." : "Nenhum webhook configurado"}
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                className="font-mono text-sm"
                disabled={isLoading}
              />
            </div>

            <div className="flex justify-end pt-2 border-t border-border">
              <Button onClick={handleApplyWebhooks} disabled={isApplying || isLoading}>
                {isApplying ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Aplicar a Todos os Chips
              </Button>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

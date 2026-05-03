import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Save, Webhook, Loader2, Info } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { fetchInstances, isInstanceConnected, setWebhook } from "@/lib/evolution-api";

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

  // Load the saved URL from localStorage as a simple preference
  useEffect(() => {
    const saved = localStorage.getItem("global-webhook-url");
    if (saved) setWebhookUrl(saved);
  }, []);

  const handleApplyWebhooks = async () => {
    if (!webhookUrl.trim() || !webhookUrl.startsWith("http")) {
      return toast.error("Por favor, insira uma URL válida (http:// ou https://)");
    }

    setIsApplying(true);
    try {
      localStorage.setItem("global-webhook-url", webhookUrl.trim());

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
                Ao configurar uma URL, todas as mensagens que chegarem em qualquer chip conectado
                serão enviadas imediatamente via POST para essa URL. Ideal para integrar com o Make.com ou n8n.
              </p>
            </div>

            <div className="space-y-3">
              <Label htmlFor="webhook-url">URL do Webhook (Ex: Make.com)</Label>
              <Input
                id="webhook-url"
                placeholder="https://hook.us2.make.com/..."
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                className="font-mono text-sm"
              />
            </div>

            <div className="bg-accent/50 p-4 rounded-md flex gap-3 text-sm">
              <Info className="h-5 w-5 text-primary shrink-0" />
              <div className="space-y-1">
                <p><strong>Dica para Mapeamento no Make.com:</strong> A Evolution API envia um formato próprio. No Make, busque por:</p>
                <ul className="list-disc pl-4 space-y-1 text-muted-foreground">
                  <li><strong>Número do rementente:</strong> <code className="bg-background px-1 py-0.5 rounded text-xs">data.key.remoteJid</code></li>
                  <li><strong>Número que recebeu (Chip):</strong> <code className="bg-background px-1 py-0.5 rounded text-xs">instance</code></li>
                  <li><strong>Texto da mensagem:</strong> <code className="bg-background px-1 py-0.5 rounded text-xs">data.message.conversation</code> ou <code className="bg-background px-1 py-0.5 rounded text-xs">extendedTextMessage.text</code></li>
                </ul>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-border">
              <Button onClick={handleApplyWebhooks} disabled={isApplying}>
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

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Bot, Save, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/agente")({
  head: () => ({
    meta: [
      { title: "Agente IA — WhatsApp Painel" },
      { name: "description", content: "Configure o agente de IA." },
    ],
  }),
  component: AgentePage,
});

const AGENT_URL = "https://wpp.rodrigobernardo.com.br/agent";
const AGENT_KEY = "picjob-agent-2026";

const AVAILABLE_MODELS = [
  { value: "gemini-3-flash-preview", label: "Gemini 3 Flash (Preview)" },
  { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { value: "gemini-2.0-flash-lite", label: "Gemini 2.0 Flash Lite" },
  { value: "gemini-1.5-flash", label: "Gemini 1.5 Flash" },
];

function AgentePage() {
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState("gemini-3-flash-preview");
  const [originalPrompt, setOriginalPrompt] = useState("");
  const [originalModel, setOriginalModel] = useState("gemini-3-flash-preview");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const hasChanges = prompt !== originalPrompt || model !== originalModel;

  useEffect(() => {
    fetchConfig();
  }, []);

  async function fetchConfig() {
    setLoading(true);
    try {
      const res = await fetch(`${AGENT_URL}/config`, {
        headers: { "x-agent-key": AGENT_KEY },
      });
      if (!res.ok) throw new Error("Falha ao carregar configuração");
      const data = await res.json();
      setPrompt(data.prompt ?? "");
      setModel(data.model ?? "gemini-3-flash-preview");
      setOriginalPrompt(data.prompt ?? "");
      setOriginalModel(data.model ?? "gemini-3-flash-preview");
    } catch {
      toast.error("Erro ao carregar configuração do agente");
    } finally {
      setLoading(false);
    }
  }

  async function saveConfig() {
    setSaving(true);
    try {
      const res = await fetch(`${AGENT_URL}/config`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-agent-key": AGENT_KEY,
        },
        body: JSON.stringify({ prompt, model }),
      });
      if (!res.ok) throw new Error("Falha ao salvar");
      setOriginalPrompt(prompt);
      setOriginalModel(model);
      toast.success("Agente atualizado com sucesso");
    } catch {
      toast.error("Erro ao salvar configuração");
    } finally {
      setSaving(false);
    }
  }

  function resetChanges() {
    setPrompt(originalPrompt);
    setModel(originalModel);
  }

  return (
    <AppShell>
      <div className="h-full overflow-y-auto">
        <div className="max-w-3xl mx-auto p-6 space-y-6">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <Bot className="w-6 h-6 text-primary" />
              Agente IA
            </h1>
            <p className="text-sm text-muted-foreground">
              Configure o comportamento e o modelo do agente de respostas automáticas
            </p>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <div className="space-y-3 rounded-lg border border-border p-4">
                <div className="space-y-1">
                  <h2 className="text-sm font-medium">Modelo</h2>
                  <p className="text-xs text-muted-foreground">
                    Modelo de IA usado para gerar as respostas
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="model">Modelo ativo</Label>
                  <Select value={model} onValueChange={setModel}>
                    <SelectTrigger id="model">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {AVAILABLE_MODELS.map((m) => (
                        <SelectItem key={m.value} value={m.value}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-3 rounded-lg border border-border p-4">
                <div className="space-y-1">
                  <h2 className="text-sm font-medium">Prompt do agente</h2>
                  <p className="text-xs text-muted-foreground">
                    Instruções de comportamento, persona e regras de resposta
                  </p>
                </div>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={24}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono resize-y focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Digite as instruções do agente..."
                  spellCheck={false}
                />
                <p className="text-xs text-muted-foreground">
                  {prompt.length} caracteres
                </p>
              </div>

              <div className="flex items-center gap-3">
                <Button onClick={saveConfig} disabled={saving || !hasChanges}>
                  {saving ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4 mr-2" />
                  )}
                  Salvar alterações
                </Button>
                {hasChanges && (
                  <Button variant="ghost" onClick={resetChanges}>
                    <RotateCcw className="w-4 h-4 mr-2" />
                    Descartar
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}

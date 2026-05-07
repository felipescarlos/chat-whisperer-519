import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Bot, Save, Loader2, RotateCcw, Sparkles, Send, CheckCheck } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

const PROMPT_REGEX = /<<<PROMPT_ATUALIZADO>>>([\s\S]*?)<<<FIM_PROMPT>>>/;

function AgentePage() {
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState("gemini-3-flash-preview");
  const [originalPrompt, setOriginalPrompt] = useState("");
  const [originalModel, setOriginalModel] = useState("gemini-3-flash-preview");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [chatMessages, setChatMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [suggestedPrompt, setSuggestedPrompt] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const hasChanges = prompt !== originalPrompt || model !== originalModel;

  useEffect(() => {
    fetchConfig();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, chatLoading]);

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

  async function sendChatMessage() {
    if (!chatInput.trim() || chatLoading) return;
    const userMsg = { role: "user" as const, content: chatInput.trim() };
    const updatedMessages = [...chatMessages, userMsg];
    setChatMessages(updatedMessages);
    setChatInput("");
    setChatLoading(true);
    try {
      const res = await fetch(`${AGENT_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-agent-key": AGENT_KEY },
        body: JSON.stringify({ messages: updatedMessages, currentPrompt: prompt }),
      });
      if (!res.ok) throw new Error("Erro na requisição");
      const data = await res.json();
      const reply = data.reply as string;

      const match = reply.match(PROMPT_REGEX);
      if (match) {
        setSuggestedPrompt(match[1].trim());
      }

      setChatMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch {
      toast.error("Erro ao enviar mensagem");
    } finally {
      setChatLoading(false);
    }
  }

  function applySuggestedPrompt() {
    if (!suggestedPrompt) return;
    setPrompt(suggestedPrompt);
    setSuggestedPrompt(null);
    toast.success("Prompt aplicado! Lembre-se de salvar.");
  }

  return (
    <AppShell>
      <div className="h-full overflow-y-auto">
        <div className="max-w-7xl mx-auto p-6 space-y-6">
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
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Coluna esquerda: editor */}
              <div className="space-y-6">
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
                    rows={20}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono resize-y focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder="Digite as instruções do agente..."
                    spellCheck={false}
                  />
                  <p className="text-xs text-muted-foreground">{prompt.length} caracteres</p>
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
              </div>

              {/* Coluna direita: chat */}
              <div className="rounded-lg border border-border flex flex-col h-[700px] overflow-hidden">
                <div className="border-b p-4 space-y-1">
                  <h2 className="text-sm font-medium flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-primary" />
                    Assistente de Prompt
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Peça melhorias, ajustes ou novas regras
                  </p>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {chatMessages.length === 0 && !chatLoading ? (
                    <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground gap-2">
                      <Sparkles className="w-8 h-8 opacity-50" />
                      <p className="text-sm">Descreva o que quer melhorar no agente</p>
                    </div>
                  ) : (
                    chatMessages.map((msg, i) => {
                      if (msg.role === "user") {
                        return (
                          <div key={i} className="flex justify-end">
                            <div className="bg-primary text-primary-foreground rounded-2xl rounded-tr-sm px-4 py-2 max-w-[85%] text-sm">
                              {msg.content}
                            </div>
                          </div>
                        );
                      }
                      const match = msg.content.match(PROMPT_REGEX);
                      const displayContent = match
                        ? msg.content.replace(PROMPT_REGEX, "").trim()
                        : msg.content;
                      const isLatestWithSuggestion =
                        match &&
                        suggestedPrompt &&
                        i === chatMessages.length - 1;
                      return (
                        <div key={i} className="flex flex-col items-start gap-2">
                          <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-2 max-w-[85%] text-sm whitespace-pre-wrap">
                            {displayContent}
                          </div>
                          {isLatestWithSuggestion && (
                            <Button size="sm" variant="outline" onClick={applySuggestedPrompt}>
                              <CheckCheck className="w-4 h-4 mr-2" />
                              Aplicar prompt sugerido
                            </Button>
                          )}
                        </div>
                      );
                    })
                  )}
                  {chatLoading && (
                    <div className="flex justify-start">
                      <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-2 text-sm">
                        <div className="flex gap-1">
                          <span className="w-2 h-2 bg-muted-foreground/60 rounded-full animate-pulse" />
                          <span className="w-2 h-2 bg-muted-foreground/60 rounded-full animate-pulse [animation-delay:150ms]" />
                          <span className="w-2 h-2 bg-muted-foreground/60 rounded-full animate-pulse [animation-delay:300ms]" />
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>

                <div className="border-t p-3 flex gap-2">
                  <Textarea
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        sendChatMessage();
                      }
                    }}
                    rows={2}
                    className="resize-none"
                    placeholder="Ex: deixa mais informal, adiciona regra para áudio..."
                  />
                  <Button
                    size="icon"
                    onClick={sendChatMessage}
                    disabled={chatLoading || !chatInput.trim()}
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

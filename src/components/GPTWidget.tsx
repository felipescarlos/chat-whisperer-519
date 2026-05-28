import { useEffect, useRef, useState } from "react";
import { Sparkles, X, Send, Loader2, ChevronDown } from "lucide-react";
import { useLocation } from "@tanstack/react-router";

const CRM_BASE = "https://wpp.rodrigobernardo.com.br/agent/api";
const CRM_API_TOKEN = (import.meta.env.VITE_CRM_API_TOKEN as string | undefined) || "";

function crmHeaders() {
  return {
    "Content-Type": "application/json",
    ...(CRM_API_TOKEN ? { "x-api-token": CRM_API_TOKEN } : {}),
  };
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const PAGE_LABELS: Record<string, string> = {
  "/":              "Dashboard",
  "/disparos":      "Disparos",
  "/funnel":        "Funil",
  "/cadastros":     "Cadastros",
  "/banco-de-dados":"Banco de Dados",
  "/radar":         "Radar de Capturas",
  "/chips":         "Chips",
  "/historico":     "Histórico",
  "/agente":        "Agente",
  "/configuracoes": "Configurações",
};

export function GPTWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [unread, setUnread] = useState(0);
  const [context, setContext] = useState<Record<string, unknown> | null>(null);
  const [contextLoaded, setContextLoaded] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const location = useLocation();
  const currentPage = PAGE_LABELS[location.pathname] ?? location.pathname;

  // Fetch CRM context once on mount
  useEffect(() => {
    const load = async () => {
      try {
        const [stagesRes, campaignsRes, statsRes] = await Promise.all([
          fetch(`${CRM_BASE}/funnel/stats`, { headers: crmHeaders() }),
          fetch("https://wpp.rodrigobernardo.com.br/agent/campaigns"),
          fetch(`${CRM_BASE}/prospects/stats`, { headers: crmHeaders() }),
        ]);
        const [stages, campaigns, stats] = await Promise.all([
          stagesRes.ok ? stagesRes.json() : [],
          campaignsRes.ok ? campaignsRes.json() : [],
          statsRes.ok ? statsRes.json() : {},
        ]);
        const totalContacts = stages.reduce((acc: number, s: { _count?: { contacts?: number } }) => acc + (s._count?.contacts ?? 0), 0);
        setContext({
          stages,
          campaigns: Array.isArray(campaigns) ? campaigns.slice(0, 5) : [],
          stats: { totalContacts, totalProspects: stats.total ?? 0 },
          currentPage,
        });
        setContextLoaded(true);
      } catch {
        setContextLoaded(true);
      }
    };
    load();
  }, []);

  // Update currentPage in context when route changes
  useEffect(() => {
    setContext((c) => c ? { ...c, currentPage } : c);
  }, [currentPage]);

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Proactive greeting when first opened
  useEffect(() => {
    if (!open || messages.length > 0 || !contextLoaded) return;
    sendToGPT([], true);
  }, [open, contextLoaded]);

  // Focus input when opened
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  const sendToGPT = async (history: ChatMessage[], isGreeting = false) => {
    setLoading(true);
    try {
      const messagesPayload = isGreeting
        ? [{ role: "user" as const, content: `Olá! Dê-me um insight rápido sobre a situação atual do CRM. Página atual: ${currentPage}.` }]
        : history;

      const res = await fetch(`${CRM_BASE}/ai/chat`, {
        method: "POST",
        headers: crmHeaders(),
        body: JSON.stringify({ messages: messagesPayload, context }),
      });

      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      const reply: ChatMessage = { role: "assistant", content: data.content };

      if (isGreeting) {
        setMessages([reply]);
      } else {
        setMessages((prev) => [...prev, reply]);
      }

      if (!open) setUnread((n) => n + 1);
    } catch {
      const errMsg: ChatMessage = { role: "assistant", content: "Desculpe, tive um problema ao processar. Tente novamente." };
      setMessages((prev) => isGreeting ? [errMsg] : [...prev, errMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    const userMsg: ChatMessage = { role: "user", content: text };
    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    await sendToGPT(newHistory);
  };

  const handleOpen = () => {
    setOpen(true);
    setUnread(0);
  };

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-3">
      {/* Chat panel */}
      {open && (
        <div className="bg-card border border-border rounded-xl shadow-2xl flex flex-col w-80 h-[460px] overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-gradient-to-r from-primary/10 to-transparent shrink-0">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="font-semibold text-sm">Assistente IA</span>
              <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{currentPage}</span>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {messages.length === 0 && loading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Carregando contexto...
              </div>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground rounded-br-sm"
                    : "bg-muted text-foreground rounded-bl-sm"
                }`}>
                  {msg.role === "assistant" && (
                    <div className="flex items-center gap-1.5 mb-1">
                      <Sparkles className="h-3 w-3 text-primary" />
                      <span className="text-xs font-medium text-primary">IA</span>
                    </div>
                  )}
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                </div>
              </div>
            ))}
            {loading && messages.length > 0 && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-xl rounded-bl-sm px-3 py-2">
                  <div className="flex gap-1 items-center h-4">
                    <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:0ms]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:150ms]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:300ms]" />
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="p-3 border-t border-border shrink-0">
            <div className="flex gap-2 items-end">
              <textarea
                ref={inputRef}
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                placeholder="Pergunte algo..."
                className="flex-1 resize-none bg-input border border-border rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary max-h-24 overflow-y-auto"
                style={{ minHeight: "36px" }}
              />
              <button
                onClick={handleSend}
                disabled={loading || !input.trim()}
                className="h-9 w-9 rounded-lg bg-primary text-primary-foreground flex items-center justify-center shrink-0 hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground mt-1.5 text-center">
              Enter para enviar · Shift+Enter nova linha
            </p>
          </div>
        </div>
      )}

      {/* Toggle button */}
      <button
        onClick={open ? () => setOpen(false) : handleOpen}
        className="relative h-12 w-12 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-all hover:scale-105 active:scale-95 flex items-center justify-center"
      >
        {open ? <X className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}
        {!open && unread > 0 && (
          <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-destructive text-destructive-foreground text-xs font-bold flex items-center justify-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
    </div>
  );
}

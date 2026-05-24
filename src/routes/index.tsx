import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, Send, MessageCircle } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import {
  Chat,
  Instance,
  Message,
  fetchInstances,
  jidToNumber,
  getSendableNumber,
  formatPhoneNumber,
  getMessageTimestamp,
  getMessageText,
  getChatLastMessageText,
  isInstanceConnected,
  CRMContact,
  CRMStage,
  fetchCRMContacts,
  fetchCRMMessages,
  updateCRMContact,
  sendCRMMessage,
  fetchCRMStages,
} from "@/lib/evolution-api";

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>) => {
    return {
      chat: (search.chat as string) || undefined,
    };
  },
  head: () => ({
    meta: [
      { title: "Conversas — CRM WhatsApp" },
      { name: "description", content: "Painel de conversas e CRM integrado com IA." },
    ],
  }),
  component: ConversasPage,
});

interface ChatWithInstance extends Chat {
  __instance: string;
  __crmContact: CRMContact;
}

function formatTime(ts?: number) {
  if (!ts) return "";
  const d = new Date(ts);
  const now = new Date();
  const timeStr = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === now.toDateString()) {
    return timeStr;
  }
  const dateStr = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  return `${dateStr} ${timeStr}`;
}

function getChatRemoteJidAlt(c: Chat): string | null {
  if ((c as any).remoteJidAlt) return (c as any).remoteJidAlt as string;
  if (c.lastMessage?.key?.remoteJidAlt) return c.lastMessage.key.remoteJidAlt;
  return null;
}

function ConversasPage() {
  const navigate = useNavigate();
  const { chat: searchChatNum } = Route.useSearch();
  const [instances, setInstances] = useState<Instance[]>([]);
  const [stages, setStages] = useState<CRMStage[]>([]);
  const [contacts, setContacts] = useState<CRMContact[]>([]);
  const [filterInstance, setFilterInstance] = useState<string>("all");
  const [filterStage, setFilterStage] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [loadingChats, setLoadingChats] = useState(false);
  const [selected, setSelected] = useState<ChatWithInstance | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastMessageIdRef = useRef<string | null>(null);

  // Form CRM Sidebar States
  const [crmNotes, setCrmNotes] = useState("");
  const [crmStageId, setCrmStageId] = useState("");
  const [crmBotEnabled, setCrmBotEnabled] = useState(true);
  const [crmTags, setCrmTags] = useState("");
  const [crmName, setCrmName] = useState("");

  // Sync form inputs when selection changes
  useEffect(() => {
    if (selected?.__crmContact) {
      setCrmNotes(selected.__crmContact.notes || "");
      setCrmStageId(selected.__crmContact.stageId || "null");
      setCrmBotEnabled(selected.__crmContact.botEnabled);
      setCrmTags(selected.__crmContact.tags || "");
      setCrmName(selected.__crmContact.name || "");
    }
  }, [selected]);

  // Load instances + stages + CRM contacts
  const loadChats = useCallback(async (isBackground = false) => {
    if (!isBackground) setLoadingChats(true);
    try {
      // 1. Fetch CRM Stages
      const stagesList = await fetchCRMStages();
      setStages(stagesList);

      // 2. Fetch CRM Contacts
      const contactsList = await fetchCRMContacts(
        filterStage === "all" ? undefined : filterStage,
        search.trim() || undefined
      );
      setContacts(contactsList);

      // 3. Fetch connected instances from Evolution API
      const list = await fetchInstances();
      setInstances(list);
    } catch (e) {
      if (!isBackground) {
        console.error(e);
        toast.error("Falha ao carregar CRM");
      }
    } finally {
      if (!isBackground) setLoadingChats(false);
    }
  }, [filterStage, search]);

  useEffect(() => {
    loadChats();
    const interval = setInterval(() => loadChats(true), 5000);
    return () => clearInterval(interval);
  }, [loadChats]);

  // Map CRMContacts to ChatWithInstance for full backward compatibility
  const allChats = useMemo<ChatWithInstance[]>(() => {
    const list = contacts
      .filter((c) => {
        // Filter by instance (WhatsApp chip)
        if (filterInstance !== "all" && c.instance !== filterInstance) return false;
        return true;
      })
      .map((c) => {
        const lastMsg = c.messages && c.messages[0];
        return {
          id: c.id,
          remoteJid: `${c.number}@s.whatsapp.net`,
          pushName: c.name || formatPhoneNumber(c.number),
          profilePicUrl: null,
          updatedAt: c.updatedAt,
          __instance: c.instance || "vetooo",
          __crmContact: c,
          lastMessage: lastMsg
            ? {
                message: { conversation: lastMsg.text || getMessageText(lastMsg) || "" },
                messageTimestamp: lastMsg.messageTimestamp,
                key: { fromMe: lastMsg.fromMe !== undefined ? lastMsg.fromMe : !!lastMsg.key?.fromMe },
              }
            : null,
        } as ChatWithInstance;
      });

    // Sort by last message timestamp or updatedAt
    return list.sort((a, b) => {
      const tsA = a.lastMessage?.messageTimestamp
        ? Number(a.lastMessage.messageTimestamp) * 1000
        : new Date(a.updatedAt).getTime();
      const tsB = b.lastMessage?.messageTimestamp
        ? Number(b.lastMessage.messageTimestamp) * 1000
        : new Date(b.updatedAt).getTime();
      return tsB - tsA;
    });
  }, [contacts, filterInstance]);

  // Handle URL auto-select search param
  useEffect(() => {
    if (searchChatNum) {
      if (allChats.length > 0) {
        const match = allChats.find((c) => jidToNumber(c.remoteJid) === searchChatNum);
        if (match) {
          if (!selected || selected.remoteJid !== match.remoteJid) {
            setSelected(match);
          }
        }
      }
    } else {
      if (selected) {
        setSelected(null);
      }
    }
  }, [searchChatNum, allChats, selected]);

  // Load messages from CRM Backend local database
  const loadMessages = useCallback(async (isBackground = false) => {
    if (!selected) return;
    const currentJid = selected.remoteJid;
    const currentInstance = selected.__instance;
    if (!isBackground) setLoadingMsgs(true);
    try {
      const phoneNum = getSendableNumber(selected as Parameters<typeof getSendableNumber>[0]);
      const msgs = await fetchCRMMessages(phoneNum);

      // Verify that the selected contact hasn't changed while we were waiting for the API
      if (selected.remoteJid !== currentJid || selected.__instance !== currentInstance) {
        return;
      }

      const sorted = [...msgs].sort((a, b) => getMessageTimestamp(a) - getMessageTimestamp(b));

      // Deduplicate by ID
      const unique: Message[] = [];
      const ids = new Set();
      for (const m of sorted) {
        if (!ids.has(m.key.id)) {
          ids.add(m.key.id);
          unique.push(m);
        }
      }

      const latestId = unique[unique.length - 1]?.key?.id ?? null;
      if (isBackground && latestId === lastMessageIdRef.current) return;
      lastMessageIdRef.current = latestId;
      setMessages(unique);
    } catch (e) {
      if (!isBackground) {
        console.error(e);
        toast.error("Falha ao carregar mensagens");
      }
    } finally {
      if (!isBackground && selected.remoteJid === currentJid && selected.__instance === currentInstance) {
        setLoadingMsgs(false);
      }
    }
  }, [selected]);

  useEffect(() => {
    setMessages([]);
    lastMessageIdRef.current = null;
    loadMessages();
    const interval = setInterval(() => loadMessages(true), 1500);
    return () => clearInterval(interval);
  }, [loadMessages, selected]);

  useEffect(() => {
    if (scrollRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
      const isAtBottom = scrollHeight - scrollTop <= clientHeight + 150;
      if (isAtBottom || messages.length <= 1) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    }
  }, [messages]);

  // Handle manual update of contact metadata (CRM)
  const handleUpdateContact = async (updatedFields: {
    name?: string | null;
    notes?: string | null;
    tags?: string;
    botEnabled?: boolean;
    stageId?: string | null;
  }) => {
    if (!selected) return;
    try {
      const phoneNum = getSendableNumber(selected as any);
      const dataToUpdate = { ...updatedFields };
      if (dataToUpdate.stageId === "null") {
        dataToUpdate.stageId = null;
      }
      
      const updated = await updateCRMContact(phoneNum, dataToUpdate);
      
      // Update selected contact ref
      setSelected(prev => {
        if (!prev) return null;
        return {
          ...prev,
          pushName: updated.name || prev.pushName,
          __crmContact: updated
        };
      });
      
      // Refresh contact list in background
      loadChats(true);
      toast.success("CRM atualizado");
    } catch (e) {
      console.error(e);
      toast.error("Falha ao atualizar CRM");
    }
  };

  // Send message through manual API (automatically disables bot)
  const handleSend = async () => {
    if (!selected || !draft.trim()) return;
    setSending(true);
    const text = draft.trim();
    setDraft("");
    try {
      const phoneNum = getSendableNumber(selected as Parameters<typeof getSendableNumber>[0]);
      const res = await sendCRMMessage(selected.__instance, phoneNum, text);
      
      // Append message immediately
      setMessages((m) => [...m, res.message]);
      
      // Auto-update bot state UI locally
      setCrmBotEnabled(false);
      if (selected.__crmContact) {
        selected.__crmContact.botEnabled = false;
      }
      
      loadChats(true);
    } catch (e) {
      console.error(e);
      toast.error("Falha ao enviar mensagem");
      setDraft(text);
    } finally {
      setSending(false);
    }
  };

  return (
    <AppShell>
      <div className="flex h-full">
        {/* Lista */}
        <div className="w-full max-w-sm border-r border-border bg-panel flex flex-col">
          <div className="p-3 bg-panel-header border-b border-border space-y-2">
            <h1 className="text-lg font-semibold">Conversas</h1>
            <div className="grid grid-cols-2 gap-2">
              <Select value={filterInstance} onValueChange={setFilterInstance}>
                <SelectTrigger className="bg-input border-border h-8 text-xs">
                  <SelectValue placeholder="Chips" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos Chips</SelectItem>
                  {instances.map((i) => (
                    <SelectItem key={i.name} value={i.name}>
                      {i.profileName || i.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterStage} onValueChange={setFilterStage}>
                <SelectTrigger className="bg-input border-border h-8 text-xs">
                  <SelectValue placeholder="Estágios" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos Estágios</SelectItem>
                  {stages.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="relative">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar nome ou número"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 bg-input border-border"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loadingChats && (
              <div className="p-4 text-sm text-muted-foreground text-center">Carregando...</div>
            )}
            {!loadingChats && allChats.length === 0 && (
              <div className="p-6 text-sm text-muted-foreground text-center">
                Nenhuma conversa encontrada.
              </div>
            )}
            {allChats.map((c) => {
              const active =
                selected?.remoteJid === c.remoteJid && selected?.__instance === c.__instance;
              const ts = c.lastMessage?.messageTimestamp
                ? Number(c.lastMessage.messageTimestamp) * 1000
                : new Date(c.updatedAt).getTime();
              return (
                <button
                  key={`${c.__instance}-${c.remoteJid}`}
                  onClick={() => {
                    navigate({
                      to: "/",
                      search: { chat: jidToNumber(c.remoteJid) },
                    });
                  }}
                  className={`w-full flex gap-3 px-3 py-3 hover:bg-accent/50 border-b border-border/50 text-left transition-colors ${
                    active ? "bg-accent" : ""
                  }`}
                >
                  <Avatar className="h-12 w-12 shrink-0">
                    <AvatarImage src={c.profilePicUrl || undefined} />
                    <AvatarFallback className="bg-muted text-muted-foreground">
                      {(c.pushName || jidToNumber(c.remoteJid)).slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-baseline gap-2">
                      <span className="font-medium truncate text-sm">
                        {c.pushName}
                      </span>
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {formatTime(ts)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center gap-2 mt-0.5">
                      <p className="text-xs text-muted-foreground truncate">
                        {getChatLastMessageText(c) || formatPhoneNumber(jidToNumber(c.remoteJid))}
                      </p>
                      {c.__crmContact?.stage && (
                        <span
                          className="text-[9px] px-1.5 py-0.5 rounded text-white font-medium shrink-0"
                          style={{ backgroundColor: c.__crmContact.stage.color }}
                        >
                          {c.__crmContact.stage.name}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Conversa */}
        <div className="flex-1 flex flex-col min-w-0">
          {!selected ? (
            <div className="flex-1 flex items-center justify-center chat-pattern">
              <div className="text-center text-muted-foreground">
                <MessageCircle className="h-16 w-16 mx-auto mb-4 opacity-30" />
                <p>Selecione uma conversa para começar</p>
              </div>
            </div>
          ) : (
            <>
              <div className="p-4 border-b border-border flex items-center justify-between shrink-0 bg-panel-header">
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={selected.profilePicUrl || undefined} />
                    <AvatarFallback className="bg-muted">
                      {(selected.pushName || jidToNumber(selected.remoteJid))
                        .slice(0, 2)
                        .toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <h2 className="font-semibold text-foreground text-sm">
                      {selected.pushName}
                    </h2>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{formatPhoneNumber(getSendableNumber(selected as any))}</span>
                    </div>
                  </div>
                </div>
                <div className="text-xs bg-primary/20 text-primary px-2 py-1 rounded">
                  Chip: <span className="font-semibold">{selected.__instance}</span>
                </div>
              </div>
              <div ref={scrollRef} className="flex-1 overflow-y-auto chat-pattern p-4 space-y-2">
                {loadingMsgs && (
                  <div className="text-center text-sm text-muted-foreground">Carregando...</div>
                )}
                {!loadingMsgs && messages.length === 0 && (
                  <div className="text-center text-sm text-muted-foreground">
                    Sem mensagens ainda.
                  </div>
                )}
                {messages.map((m) => {
                  const fromMe = m.key?.fromMe ?? (m as any).fromMe;
                  const text = getMessageText(m) || (m as any).text || "";
                  const ts = getMessageTimestamp(m);
                  const msgId = m.key?.id ?? (m as any).messageId ?? (m as any).id;
                  return (
                    <div
                      key={msgId}
                      className={`flex ${fromMe ? "justify-end" : "justify-start"} mb-2`}
                    >
                      <div
                        className={`max-w-[70%] rounded-lg px-3.5 py-2 shadow-sm ${
                          fromMe
                            ? "bg-bubble-out text-white rounded-tr-none"
                            : "bg-bubble-in text-zinc-900 rounded-tl-none border border-border/30"
                        }`}
                      >
                        <p className="text-[14px] leading-relaxed whitespace-pre-wrap break-words">{text}</p>
                        <div className="flex justify-end items-center mt-1 -mr-1">
                          <span className={`text-[10px] select-none ${fromMe ? "text-white/70" : "text-muted-foreground"}`}>
                            {formatTime(ts)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="p-3 bg-panel-header border-t border-border flex gap-2">
                <Input
                  placeholder="Digite uma mensagem"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  className="bg-input border-border"
                  disabled={sending}
                />
                <Button onClick={handleSend} disabled={sending || !draft.trim()}>
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </>
          )}
        </div>

        {/* CRM Panel (Barra Lateral Direita) */}
        {selected && (
          <div className="w-80 border-l border-border bg-panel flex flex-col overflow-y-auto shrink-0 bg-panel-header">
            {/* Header */}
            <div className="p-4 border-b border-border bg-panel flex items-center justify-between">
              <h2 className="font-semibold text-foreground text-sm">Informações do CRM</h2>
            </div>
            
            {/* Content */}
            <div className="p-4 space-y-6">
              {/* Nome */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Nome no CRM</label>
                <div className="flex gap-1.5">
                  <Input
                    placeholder="Nome do contato"
                    value={crmName}
                    onChange={(e) => setCrmName(e.target.value)}
                    className="bg-input border-border h-8 text-sm"
                  />
                  <Button
                    onClick={() => handleUpdateContact({ name: crmName })}
                    size="sm"
                    className="h-8 text-xs px-2.5"
                  >
                    Salvar
                  </Button>
                </div>
              </div>

              {/* Agente IA (Bot Toggle) */}
              <div className="flex items-center justify-between bg-accent/25 p-3 rounded-lg border border-border/40">
                <div className="space-y-0.5">
                  <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    🤖 Agente de IA
                  </span>
                  <p className="text-[10px] text-muted-foreground">
                    {crmBotEnabled ? "IA respondendo cliente" : "Atendimento manual"}
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={crmBotEnabled}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setCrmBotEnabled(checked);
                    handleUpdateContact({ botEnabled: checked });
                  }}
                  className="w-9 h-5 bg-input rounded-full appearance-none checked:bg-primary relative before:absolute before:h-4 before:w-4 before:rounded-full before:bg-white before:top-0.5 before:left-0.5 checked:before:left-4.5 transition-all duration-200 cursor-pointer border border-border/40"
                />
              </div>

              {/* Estágio do Funil */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Estágio do Funil</label>
                <Select
                  value={crmStageId}
                  onValueChange={(val) => {
                    setCrmStageId(val);
                    handleUpdateContact({ stageId: val });
                  }}
                >
                  <SelectTrigger className="bg-input border-border h-9 text-sm">
                    <SelectValue placeholder="Sem estágio" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="null">Sem estágio</SelectItem>
                    {stages.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        <span className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                          {s.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Tags */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Tags (Etiquetas)</label>
                <div className="flex gap-1.5">
                  <Input
                    placeholder="tag1, tag2..."
                    value={crmTags}
                    onChange={(e) => setCrmTags(e.target.value)}
                    className="bg-input border-border h-8 text-sm"
                  />
                  <Button
                    onClick={() => handleUpdateContact({ tags: crmTags })}
                    size="sm"
                    className="h-8 text-xs px-2.5"
                  >
                    Salvar
                  </Button>
                </div>
                {crmTags.trim() && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {crmTags.split(",").map((t) => {
                      const label = t.trim();
                      if (!label) return null;
                      return (
                        <span
                          key={label}
                          className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded font-medium border border-primary/20"
                        >
                          {label}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Anotações */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Anotações do Contato</label>
                <textarea
                  placeholder="Digite observações importantes sobre o cliente..."
                  value={crmNotes}
                  onChange={(e) => setCrmNotes(e.target.value)}
                  className="w-full h-36 p-2 rounded-md bg-input border border-border text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
                />
                <Button
                  onClick={() => handleUpdateContact({ notes: crmNotes })}
                  size="sm"
                  className="w-full text-xs h-8"
                >
                  Salvar Anotações
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}

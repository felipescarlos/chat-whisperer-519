import { createFileRoute } from "@tanstack/react-router";
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
  findChats,
  findMessages,
  getChatLastMessageText,
  getMessageText,
  getMessageTimestamp,
  isInstanceConnected,
  jidToNumber,
  getSendableNumber,
  sendText,
  formatPhoneNumber,
} from "@/lib/evolution-api";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Conversas — WhatsApp Painel" },
      { name: "description", content: "Painel de conversas WhatsApp Business via Evolution API." },
    ],
  }),
  component: ConversasPage,
});

interface ChatWithInstance extends Chat {
  __instance: string;
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

function ConversasPage() {
  const [instances, setInstances] = useState<Instance[]>([]);
  const [filterInstance, setFilterInstance] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [chatsByInstance, setChatsByInstance] = useState<Record<string, Chat[]>>({});
  const [loadingChats, setLoadingChats] = useState(false);
  const [selected, setSelected] = useState<ChatWithInstance | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastMessageIdRef = useRef<string | null>(null);

  // Load instances + their chats
  const loadChats = useCallback(async (isBackground = false) => {
    if (!isBackground) setLoadingChats(true);
    try {
      const list = await fetchInstances();
      setInstances(list);
      const connected = list.filter(isInstanceConnected);
      const result: Record<string, Chat[]> = {};
      await Promise.all(
        connected.map(async (inst) => {
          try {
            const chats = await findChats(inst.name);
            result[inst.name] = Array.isArray(chats) ? chats : [];
          } catch (e) {
            console.error("findChats", inst.name, e);
            result[inst.name] = [];
          }
        }),
      );
      setChatsByInstance((prev) => {
        if (JSON.stringify(prev) === JSON.stringify(result)) return prev;
        return result;
      });
    } catch (e) {
      if (!isBackground) {
        console.error(e);
        toast.error("Falha ao carregar conversas");
      }
    } finally {
      if (!isBackground) setLoadingChats(false);
    }
  }, []);

  useEffect(() => {
    loadChats();
    const interval = setInterval(() => loadChats(true), 15000);
    return () => clearInterval(interval);
  }, [loadChats]);

  // Build a map: phone number → @lid JID, so we can include @lid variants
  // when loading messages for @s.whatsapp.net contacts (Evolution sometimes
  // stores messages under @lid even for contacts shown as @s.whatsapp.net).
  const phoneToLid = useMemo(() => {
    const map = new Map<string, string>();
    for (const chats of Object.values(chatsByInstance)) {
      for (const c of chats) {
        if (!c.remoteJid.includes("@lid")) continue;
        const alt = (c as any).remoteJidAlt as string | undefined | null;
        if (alt) {
          const phone = alt.replace(/@.*$/, "");
          if (phone) map.set(phone, c.remoteJid);
        }
      }
    }
    return map;
  }, [chatsByInstance]);

  const allChats = useMemo<ChatWithInstance[]>(() => {
    const list: ChatWithInstance[] = [];
    for (const [inst, chats] of Object.entries(chatsByInstance)) {
      if (filterInstance !== "all" && filterInstance !== inst) continue;
      for (const c of chats) {
        if (!c.remoteJid) continue;
        // Groups
        if (c.remoteJid.includes("@g.us")) continue;
        // Broadcast lists, status updates, newsletters
        if (
          c.remoteJid.includes("@broadcast") ||
          c.remoteJid.includes("@newsletter") ||
          c.remoteJid.startsWith("status@")
        ) continue;
        // @lid entries without remoteJidAlt cannot be mapped to a real phone
        // number — they are almost always duplicates of a @s.whatsapp.net entry.
        // Evolution's own manager skips them; we do the same.
        if (c.remoteJid.includes("@lid") && !((c as any).remoteJidAlt)) continue;
        list.push({ ...c, __instance: inst });
      }
    }

    // Deduplicate by phone number — keep the entry with the most recent
    // lastMessage. Prefer @s.whatsapp.net over @lid when timestamps are equal.
    const chatTs = (x: ChatWithInstance) =>
      x.lastMessage?.messageTimestamp
        ? Number(x.lastMessage.messageTimestamp)
        : x.updatedAt
          ? new Date(x.updatedAt).getTime() / 1000
          : 0;

    const byNumber = new Map<string, ChatWithInstance>();
    for (const c of list) {
      const phone = getSendableNumber(c as Parameters<typeof getSendableNumber>[0]);
      const key = phone || c.remoteJid;
      const existing = byNumber.get(key);
      if (!existing) {
        byNumber.set(key, c);
      } else {
        const newer = chatTs(c) > chatTs(existing);
        // Prefer @s.whatsapp.net over @lid on tie
        const preferThis =
          newer ||
          (!newer &&
            chatTs(c) === chatTs(existing) &&
            !c.remoteJid.includes("@lid") &&
            existing.remoteJid.includes("@lid"));
        if (preferThis) byNumber.set(key, c);
      }
    }
    const deduped = Array.from(byNumber.values());

    const q = search.trim().toLowerCase();
    const filtered = q
      ? deduped.filter((c) => {
          const name = (c.pushName || "").toLowerCase();
          const num = jidToNumber(c.remoteJid);
          return name.includes(q) || num.includes(q);
        })
      : deduped;
    return filtered.sort((a, b) => chatTs(b as ChatWithInstance) - chatTs(a as ChatWithInstance));
  }, [chatsByInstance, filterInstance, search]);

  // Load messages when select
  const loadMessages = useCallback(async (isBackground = false) => {
    if (!selected) return;
    if (!isBackground) setLoadingMsgs(true);
    try {
      // If the selected chat is a regular phone JID, also include any @lid
      // variant we know about — Evolution may have stored some messages under @lid.
      const explicitAlt = (selected as any).remoteJidAlt as string | null | undefined;
      const phoneNum = getSendableNumber(selected as Parameters<typeof getSendableNumber>[0]);
      const lidJid = explicitAlt ? null : (phoneToLid.get(phoneNum) ?? null);

      const msgs = await findMessages(
        selected.__instance,
        selected.remoteJid,
        explicitAlt || lidJid,
        isBackground ? 20 : 500,
      );
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
      if (!isBackground) setLoadingMsgs(false);
    }
  }, [selected, phoneToLid]);

  useEffect(() => {
    setMessages([]);
    lastMessageIdRef.current = null;
    loadMessages();
    const interval = setInterval(() => loadMessages(true), 5000);
    return () => clearInterval(interval);
  }, [loadMessages, selected]);

  useEffect(() => {
    if (scrollRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
      // If we are near the bottom (within 150px), or it's the first load, auto-scroll
      const isAtBottom = scrollHeight - scrollTop <= clientHeight + 150;
      if (isAtBottom || messages.length <= 1) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    }
  }, [messages]);

  const handleSend = async () => {
    if (!selected || !draft.trim()) return;
    setSending(true);
    const text = draft.trim();
    setDraft("");
    try {
      await sendText(
        selected.__instance,
        getSendableNumber(selected as Parameters<typeof getSendableNumber>[0]),
        text,
      );
      // Optimistic append
      setMessages((m) => [
        ...m,
        {
          key: { id: `local-${Date.now()}`, remoteJid: selected.remoteJid, fromMe: true },
          message: { conversation: text },
          messageTimestamp: Math.floor(Date.now() / 1000),
        } as Message,
      ]);
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
            <Select value={filterInstance} onValueChange={setFilterInstance}>
              <SelectTrigger className="bg-input border-border">
                <SelectValue placeholder="Todos os chips" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os chips</SelectItem>
                {instances.filter(isInstanceConnected).map((i) => (
                  <SelectItem key={i.name} value={i.name}>
                    {i.profileName || i.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
                : c.updatedAt
                  ? new Date(c.updatedAt).getTime()
                  : 0;
              return (
                <button
                  key={`${c.__instance}-${c.remoteJid}`}
                  onClick={() => setSelected(c)}
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
                      <span className="font-medium truncate">
                        {c.pushName || formatPhoneNumber(jidToNumber(c.remoteJid))}
                      </span>
                      <span className="text-[11px] text-muted-foreground shrink-0">
                        {formatTime(ts)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center gap-2">
                      <p className="text-xs text-muted-foreground truncate">
                        {getChatLastMessageText(c) || formatPhoneNumber(jidToNumber(c.remoteJid))}
                      </p>
                      <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground shrink-0">
                        {c.__instance}
                      </span>
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
                    <h2 className="font-semibold text-foreground">
                      {selected.pushName || formatPhoneNumber(jidToNumber(selected.remoteJid))}
                    </h2>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{formatPhoneNumber(getSendableNumber(selected as any))}</span>
                    </div>
                  </div>
                </div>
                <div className="text-xs bg-primary/20 text-primary px-2 py-1 rounded">
                  Respondendo via: <span className="font-semibold">{selected.__instance}</span>
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
                  const fromMe = m.key.fromMe;
                  const text = getMessageText(m);
                  const ts = getMessageTimestamp(m);
                  return (
                    <div
                      key={m.key.id}
                      className={`flex ${fromMe ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[70%] rounded-lg px-3 py-2 shadow ${
                          fromMe
                            ? "bg-bubble-out text-foreground rounded-tr-none"
                            : "bg-bubble-in text-foreground rounded-tl-none"
                        }`}
                      >
                        <p className="text-sm whitespace-pre-wrap break-words">{text}</p>
                        <p className="text-[10px] text-muted-foreground text-right mt-1">
                          {formatTime(ts)}
                        </p>
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
      </div>
    </AppShell>
  );
}

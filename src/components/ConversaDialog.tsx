import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, MessageCircle } from "lucide-react";
import {
  findMessages,
  formatPhoneNumber,
  getMessageText,
  getMessageTimestamp,
  Message,
} from "@/lib/evolution-api";

interface Props {
  number: string;
  chips: string[];
  open: boolean;
  onClose: () => void;
}

type MsgWithChip = Message & { chip: string };

export function ConversaDialog({ number, chips, open, onClose }: Props) {
  const [messages, setMessages] = useState<MsgWithChip[]>([]);
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !number) return;
    setMessages([]);

    const load = async () => {
      setLoading(true);
      try {
        const all: MsgWithChip[] = [];
        for (const chip of chips) {
          try {
            const msgs = await findMessages(chip, `${number}@s.whatsapp.net`);
            msgs.forEach((m) => all.push({ ...m, chip }));
          } catch {}
        }

        // Deduplica por ID e ordena por timestamp
        const seen = new Set<string>();
        const unique = all
          .filter((m) => {
            if (seen.has(m.key.id)) return false;
            seen.add(m.key.id);
            return true;
          })
          .sort((a, b) => getMessageTimestamp(a) - getMessageTimestamp(b));

        setMessages(unique);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [open, number]);

  // Scroll para o final quando as mensagens carregam
  useEffect(() => {
    if (!loading) {
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    }
  }, [loading, messages.length]);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg flex flex-col" style={{ maxHeight: "80vh" }}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-primary" />
            +{formatPhoneNumber(number)}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-1 py-2 space-y-2" style={{ minHeight: 0 }}>
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
              Nenhuma mensagem encontrada.
            </div>
          ) : (
            messages.map((msg, i) => {
              const text = getMessageText(msg);
              const ts = getMessageTimestamp(msg);
              const time = ts
                ? new Date(ts).toLocaleString("pt-BR", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "";
              const fromMe = msg.key.fromMe;

              return (
                <div key={i} className={`flex ${fromMe ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[78%] rounded-2xl px-4 py-2 text-sm shadow-sm ${
                      fromMe
                        ? "bg-primary text-primary-foreground rounded-tr-sm"
                        : "bg-muted rounded-tl-sm"
                    }`}
                  >
                    <p className="break-words">{text || "(sem texto)"}</p>
                    <p
                      className={`text-xs mt-1 ${
                        fromMe ? "text-primary-foreground/60 text-right" : "text-muted-foreground"
                      }`}
                    >
                      {time}
                      {fromMe && msg.chip && (
                        <span className="ml-1 opacity-70">· {msg.chip}</span>
                      )}
                    </p>
                  </div>
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

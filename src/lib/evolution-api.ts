// Evolution API v2 client
export const EVOLUTION_BASE_URL = "https://wpp.rodrigobernardo.com.br";
export const EVOLUTION_API_KEY = "Bp7UVb0Qg4bsDivvzNdOsjSZfRC07QGP";

const headers = {
  "Content-Type": "application/json",
  apikey: EVOLUTION_API_KEY,
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${EVOLUTION_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...headers,
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Evolution API ${res.status}: ${text || res.statusText}`);
  }
  // Some endpoints return empty body
  const text = await res.text();
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}

export interface Instance {
  id?: string;
  name: string;
  connectionStatus?: string; // "open" | "close" | "connecting"
  ownerJid?: string | null;
  profileName?: string | null;
  profilePicUrl?: string | null;
  number?: string | null;
  // raw fallback
  [k: string]: unknown;
}

export interface Chat {
  id?: string;
  remoteJid: string;
  pushName?: string | null;
  profilePicUrl?: string | null;
  updatedAt?: string;
  lastMessage?: {
    message?: {
      conversation?: string;
      extendedTextMessage?: { text?: string };
    };
    messageTimestamp?: number;
    key?: { fromMe?: boolean };
  } | null;
  unreadCount?: number;
  [k: string]: unknown;
}

export interface Message {
  key: {
    id: string;
    remoteJid: string;
    fromMe: boolean;
  };
  message?: {
    conversation?: string;
    extendedTextMessage?: { text?: string };
    imageMessage?: { caption?: string };
    [k: string]: unknown;
  };
  messageTimestamp: number | string;
  pushName?: string;
  [k: string]: unknown;
}

// Instances
export function fetchInstances() {
  return request<Instance[]>("/instance/fetchInstances");
}

export interface CreateInstanceResponse {
  instance?: { instanceName?: string; status?: string };
  hash?: string | { apikey?: string };
  qrcode?: { pairingCode?: string | null; code?: string; base64?: string };
  [k: string]: unknown;
}

export function createInstance(instanceName: string, number?: string) {
  const body: Record<string, unknown> = {
    instanceName,
    qrcode: true,
    integration: "WHATSAPP-BAILEYS",
  };
  if (number) body.number = number.replace(/\D/g, "");
  return request<CreateInstanceResponse>("/instance/create", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export interface ConnectResponse {
  pairingCode?: string | null;
  code?: string;
  base64?: string;
  count?: number;
  [k: string]: unknown;
}

export function connectInstance(instanceName: string, number?: string) {
  const qs = number ? `?number=${encodeURIComponent(number.replace(/\D/g, ""))}` : "";
  return request<ConnectResponse>(`/instance/connect/${encodeURIComponent(instanceName)}${qs}`);
}

export function deleteInstance(instanceName: string) {
  return request<unknown>(`/instance/delete/${encodeURIComponent(instanceName)}`, {
    method: "DELETE",
  });
}

export function logoutInstance(instanceName: string) {
  return request<unknown>(`/instance/logout/${encodeURIComponent(instanceName)}`, {
    method: "DELETE",
  });
}

export function instanceState(instanceName: string) {
  return request<{ instance?: { state?: string } }>(
    `/instance/connectionState/${encodeURIComponent(instanceName)}`,
  );
}

// Chats
export function findChats(instanceName: string) {
  return request<Chat[]>(`/chat/findChats/${encodeURIComponent(instanceName)}`, {
    method: "POST",
    body: JSON.stringify({}),
  }).catch(() =>
    // fallback to GET if POST not supported
    request<Chat[]>(`/chat/findChats/${encodeURIComponent(instanceName)}`),
  );
}

export async function findMessages(instanceName: string, remoteJid: string, remoteJidAlt?: string | null, limit = 500) {
  // Try multiple jid variants since Evolution v2 may store messages under
  // @s.whatsapp.net, @lid, or @c.us depending on the contact.
  const jids = new Set<string>();
  if (remoteJid) jids.add(remoteJid);
  if (remoteJidAlt) jids.add(remoteJidAlt);

  // Also derive plain number variant
  const num = (remoteJid || remoteJidAlt || "").replace(/@.*$/, "");
  if (num) {
    jids.add(`${num}@s.whatsapp.net`);
    jids.add(`${num}@c.us`);
  }

  const tryFetch = async (where: Record<string, unknown>) => {
    try {
      const r = await request<Message[] | { messages?: { records?: Message[] } }>(
        `/chat/findMessages/${encodeURIComponent(instanceName)}`,
        { method: "POST", body: JSON.stringify({ where, limit }) },
      );
      if (Array.isArray(r)) return r;
      return r?.messages?.records || [];
    } catch {
      return [] as Message[];
    }
  };

  // First try $in with all jids in a single call
  const jidArr = Array.from(jids);
  let results = await tryFetch({ key: { remoteJid: { $in: jidArr } } });
  if (results.length === 0) {
    results = await tryFetch({ "key.remoteJid": { $in: jidArr } });
  }
  if (results.length === 0) {
    // Fallback: query each individually and merge
    const all: Message[] = [];
    for (const jid of jidArr) {
      const part = await tryFetch({ key: { remoteJid: jid } });
      all.push(...part);
    }
    results = all;
  }
  return results;
}

export function sendText(instanceName: string, number: string, text: string) {
  return request<unknown>(`/message/sendText/${encodeURIComponent(instanceName)}`, {
    method: "POST",
    body: JSON.stringify({ number, text }),
  });
}

// Helpers
export function jidToNumber(jid: string): string {
  return jid.replace(/@.*$/, "");
}

export function formatPhoneNumber(numberStr: string): string {
  const digits = numberStr.replace(/\D/g, "");
  // Brazilian numbers with country code: 55 + 2 digits DDD + 8 or 9 digits number
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    const ddd = digits.slice(2, 4);
    const firstPart = digits.slice(4, digits.length - 4);
    const lastPart = digits.slice(digits.length - 4);
    return `+55 (${ddd}) ${firstPart}-${lastPart}`;
  }
  return numberStr; // fallback for non-brazilian or poorly formatted numbers
}

// For @lid JIDs, the real phone number is in remoteJidAlt. Pick the best
// sendable number from a chat or message key.
export function getSendableNumber(source: {
  remoteJid?: string;
  remoteJidAlt?: string | null;
  lastMessage?: { key?: { remoteJidAlt?: string | null; remoteJid?: string } } | null;
  key?: { remoteJidAlt?: string | null; remoteJid?: string };
}): string {
  const altTop = (source as Record<string, unknown>).remoteJidAlt as string | undefined | null;
  const altKey = source.lastMessage?.key?.remoteJidAlt || source.key?.remoteJidAlt;
  const jid = source.remoteJid || source.key?.remoteJid || "";
  const isLid = jid.includes("@lid");
  const alt = altTop || altKey || "";
  if (isLid && alt) return jidToNumber(alt);
  return jidToNumber(jid);
}

export function numberToJid(number: string): string {
  const clean = number.replace(/\D/g, "");
  return `${clean}@s.whatsapp.net`;
}

export function getMessageText(m: Message): string {
  let msg = m.message;
  if (!msg) return "";

  // Handle nested message objects if present
  if ((msg as any).message) {
    msg = (msg as any).message;
  }
  const m2: any = msg;

  // 1. Handle Revoked/Deleted
  if ((msg as any).protocolMessage) {
    const pm = (msg as any).protocolMessage;
    // Type 0 is REVOKE in Baileys
    if (pm.type === 0 || pm.type === "REVOKE") {
      return "🚫 Mensagem apagada";
    }
  }

  // 2. Handle Text
  if (m2.conversation) return m2.conversation;
  if (m2.extendedTextMessage?.text) return m2.extendedTextMessage.text;

  // 3. Handle Media
  if (m2.imageMessage?.caption) return `📷 ${m2.imageMessage.caption}`;
  if (m2.imageMessage) return "📷 Foto";
  if (m2.videoMessage?.caption) return `🎬 ${m2.videoMessage.caption}`;
  if (m2.videoMessage) return "🎬 Vídeo";
  if (m2.audioMessage) return "🎤 Áudio";
  if (m2.documentMessage?.caption) return `📄 ${m2.documentMessage.caption}`;
  if (m2.documentMessage) return "📄 Documento";
  if (m2.stickerMessage) return "Figurinha";
  
  // 4. Handle Reactions
  if ((msg as any).reactionMessage) {
    return `Reagiu ${(msg as any).reactionMessage.text || ""}`;
  }

  // 5. Handle View Once
  if ((msg as any).viewOnceMessage?.message) {
    return getMessageText({ ...m, message: (msg as any).viewOnceMessage.message });
  }
  if ((msg as any).viewOnceMessageV2?.message) {
    return getMessageText({ ...m, message: (msg as any).viewOnceMessageV2.message });
  }

  // 6. Generic Media/Document fallback
  if ((msg as any).stickerMessage) return "Figurinha";
  if ((msg as any).contactMessage || (msg as any).contactsArrayMessage) return "👤 Contato";
  if ((msg as any).locationMessage) return "📍 Localização";
  if ((msg as any).pollCreationMessage || (msg as any).pollCreationMessageV2 || (msg as any).pollCreationMessageV3) return "📊 Enquete";

  // Fallback for buttons/templates/interactive
  if ((msg as any).buttonsMessage) return "🔘 Botões";
  if ((msg as any).templateMessage) return "📋 Modelo";
  if ((msg as any).interactiveMessage) return "🔘 Interação";

  return "(Mensagem)"; 
}

export function getChatLastMessageText(c: Chat): string {
  if (!c.lastMessage) return "";
  return getMessageText(c.lastMessage as unknown as Message);
}

export function getMessageTimestamp(m: Message): number {
  const t = m.messageTimestamp;
  if (typeof t === "number") return t * 1000;
  if (typeof t === "string") {
    const n = Number(t);
    if (!isNaN(n)) return n * 1000;
    const d = new Date(t).getTime();
    return isNaN(d) ? 0 : d;
  }
  return 0;
}

export function isInstanceConnected(i: Instance): boolean {
  const s = (i.connectionStatus || (i as Record<string, unknown>).status || "")
    .toString()
    .toLowerCase();
  return s === "open" || s === "connected";
}

// Webhooks
export interface SetWebhookBody {
  webhook: {
    enabled: boolean;
    url: string;
    byEvents: boolean;
    base64: boolean;
    events: string[];
  };
}

export function setWebhook(instanceName: string, url: string, enabled: boolean = true) {
  const body: SetWebhookBody = {
    webhook: {
      enabled,
      url,
      byEvents: false,
      base64: false,
      events: ["MESSAGES_UPSERT"],
    },
  };
  return request<unknown>(`/webhook/set/${encodeURIComponent(instanceName)}`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export interface WebhookConfig {
  id?: string;
  url?: string;
  enabled?: boolean;
}

export function getWebhook(instanceName: string) {
  return request<WebhookConfig | null>(`/webhook/find/${encodeURIComponent(instanceName)}`)
    .catch(() => null);
}

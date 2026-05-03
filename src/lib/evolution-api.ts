// Evolution API v2 client
export const EVOLUTION_BASE_URL = "https://wpp.rodrigobernardo.com.br";
export const EVOLUTION_API_KEY = "d8018c4e57bf8f50316fa31214bb1048";

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

export function createInstance(instanceName: string) {
  return request<unknown>("/instance/create", {
    method: "POST",
    body: JSON.stringify({
      instanceName,
      qrcode: true,
      integration: "WHATSAPP-BAILEYS",
    }),
  });
}

export interface ConnectResponse {
  pairingCode?: string | null;
  code?: string;
  base64?: string;
  count?: number;
  [k: string]: unknown;
}

export function connectInstance(instanceName: string) {
  return request<ConnectResponse>(`/instance/connect/${encodeURIComponent(instanceName)}`);
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

export function findMessages(instanceName: string, remoteJid: string) {
  const body = {
    where: { key: { remoteJid } },
    limit: 100,
  };
  return request<Message[] | { messages?: { records?: Message[] } }>(
    `/chat/findMessages/${encodeURIComponent(instanceName)}`,
    { method: "POST", body: JSON.stringify(body) },
  ).then((r) => {
    if (Array.isArray(r)) return r;
    return r?.messages?.records || [];
  });
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
  const msg = m.message;
  if (!msg) return "";
  if (msg.conversation) return msg.conversation;
  if (msg.extendedTextMessage?.text) return msg.extendedTextMessage.text;
  if (msg.imageMessage?.caption) return `📷 ${msg.imageMessage.caption}`;
  if ((msg as Record<string, unknown>).imageMessage) return "📷 Foto";
  if ((msg as Record<string, unknown>).audioMessage) return "🎤 Áudio";
  if ((msg as Record<string, unknown>).videoMessage) return "🎬 Vídeo";
  if ((msg as Record<string, unknown>).documentMessage) return "📄 Documento";
  if ((msg as Record<string, unknown>).stickerMessage) return "Figurinha";
  return "Mensagem";
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

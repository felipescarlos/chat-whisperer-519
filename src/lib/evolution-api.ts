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

  // Derive @s.whatsapp.net / @c.us variants ONLY from real phone JIDs.
  // @lid JIDs are internal WhatsApp identifiers — extracting the numeric part
  // and treating it as a phone number matches completely unrelated contacts.
  // This rule applies to BOTH remoteJid AND remoteJidAlt.
  const addPhoneVariants = (jid: string) => {
    if (!jid) return;
    if (
      jid.includes("@lid") ||
      jid.includes("@g.us") ||
      jid.includes("@broadcast") ||
      jid.includes("@newsletter")
    ) return; // never derive phone variants from these
    const num = jid.replace(/@.*$/, "");
    if (num) {
      jids.add(`${num}@s.whatsapp.net`);
      jids.add(`${num}@c.us`);
    }
  };

  addPhoneVariants(remoteJid);
  if (remoteJidAlt) addPhoneVariants(remoteJidAlt);

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

// Proxy
export interface ProxyConfig {
  enabled: boolean;
  host?: string;
  port?: string | number;
  protocol?: string;
  username?: string | null;
  password?: string | null;
}

export function getProxy(instanceName: string) {
  return request<ProxyConfig | null>(`/proxy/find/${encodeURIComponent(instanceName)}`)
    .catch(() => null);
}

export function setProxy(instanceName: string, config: ProxyConfig) {
  return request<unknown>(`/proxy/set/${encodeURIComponent(instanceName)}`, {
    method: "POST",
    body: JSON.stringify(config),
  });
}

// ─── CRM API Client ──────────────────────────────────────────────────────────

export interface CRMContact {
  id: string;
  number: string;
  name: string | null;
  instance: string | null;
  notes: string | null;
  tags: string;
  botEnabled: boolean;
  stageId: string | null;
  stage: { id: string; name: string; color: string; orderIndex: number } | null;
  createdAt: string;
  updatedAt: string;
  messages?: Message[];
}

export interface CRMStage {
  id: string;
  name: string;
  color: string;
  orderIndex: number;
  _count?: { contacts: number };
}

async function crmRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${EVOLUTION_BASE_URL}/agent/api${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`CRM API ${res.status}: ${text || res.statusText}`);
  }
  const text = await res.text();
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}

// ─── Scraper API (container isolado na porta 3001) ────────────────────────────
async function scraperRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${EVOLUTION_BASE_URL}/scraper/api${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Scraper API ${res.status}: ${text || res.statusText}`);
  }
  const text = await res.text();
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}

export function mapDbMessageToEvolution(dbMsg: any): Message {
  if (!dbMsg) return {} as Message;
  // If it's already in Evolution format, return it
  if (dbMsg.key) {
    return {
      ...dbMsg,
      text: dbMsg.text || getMessageText(dbMsg),
      fromMe: dbMsg.fromMe !== undefined ? dbMsg.fromMe : !!dbMsg.key.fromMe,
      messageTimestamp: dbMsg.messageTimestamp,
      messageId: dbMsg.messageId || dbMsg.key.id,
    } as Message;
  }

  // If it is a flat database message, add nested properties
  return {
    ...dbMsg, // keep id, messageId, contactId, fromMe, text, messageTimestamp, createdAt
    key: {
      id: dbMsg.messageId || dbMsg.id || `msg-${Date.now()}`,
      remoteJid: dbMsg.contactId || "",
      fromMe: !!dbMsg.fromMe,
    },
    message: {
      conversation: dbMsg.text || "",
    },
  } as Message;
}

export async function fetchCRMContacts(stageId?: string, search?: string) {
  const qs = new URLSearchParams();
  if (stageId) qs.append("stageId", stageId);
  if (search) qs.append("search", search);
  const query = qs.toString();
  const list = await crmRequest<any[]>(`/contacts${query ? `?${query}` : ""}`);
  return list.map((c) => ({
    ...c,
    messages: c.messages ? c.messages.map(mapDbMessageToEvolution) : [],
  })) as CRMContact[];
}

export async function fetchCRMMessages(number: string) {
  const list = await crmRequest<any[]>(`/contacts/${encodeURIComponent(number)}/messages`);
  return list.map(mapDbMessageToEvolution);
}

export function updateCRMContact(number: string, data: {
  name?: string | null;
  notes?: string | null;
  tags?: string;
  botEnabled?: boolean;
  stageId?: string | null;
}) {
  return crmRequest<CRMContact>(`/contacts/${encodeURIComponent(number)}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function sendCRMMessage(instance: string, number: string, text: string) {
  const res = await crmRequest<{ success: boolean; message: any }>(`/message/send`, {
    method: "POST",
    body: JSON.stringify({ instance, number, text }),
  });
  return {
    success: res.success,
    message: mapDbMessageToEvolution(res.message),
  };
}

export function fetchCRMStages() {
  return crmRequest<CRMStage[]>("/stages");
}

export function createCRMStage(data: { name: string; color?: string; orderIndex?: number }) {
  return crmRequest<CRMStage>("/stages", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateCRMStage(id: string, data: { name?: string; color?: string; orderIndex?: number }) {
  return crmRequest<CRMStage>(`/stages/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export function deleteCRMStage(id: string) {
  return crmRequest<{ success: boolean }>(`/stages/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export function fetchFunnelStats() {
  return crmRequest<CRMStage[]>("/funnel/stats");
}

// ─── Radar de Prospects ───────────────────────────────────────────────────────

export interface ProspectCrmContact {
  id: string;
  botEnabled: boolean;
  stage: { name: string; color: string } | null;
  lastContactAt: number | null;
  messages: { text: string; messageTimestamp: number; fromMe: boolean }[];
}

export interface Prospect {
  id: string;
  name: string;
  whatsappE164: string | null;
  whatsappDisplay: string | null;
  city: string | null;
  state: string | null;
  sources: string[];
  sourceUrls: Record<string, string>;
  thumbUrl: string | null;
  importedContactId: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  crmContact: ProspectCrmContact | null;
}

export interface ProspectListResponse {
  total: number;
  page: number;
  limit: number;
  items: Prospect[];
}

export interface ProspectStats {
  total: number;
  withPhone: number;
  bySource: { fatalmodel: number; skokka: number; fotoacomp: number; picjob_site?: number };
  multiPortal: number;
  byState: { state: string; count: number }[];
  byStateCity?: { state: string; city: string; count: number }[];
}

export interface ScrapeActivityItem {
  ts: number;
  text: string;
}

export interface ScrapeJobState {
  status: "idle" | "running" | "stopping" | "stopped" | "done" | "error";
  startedAt: string | null;
  finishedAt: string | null;
  message: string;
  counts: { fatalmodel: number; skokka: number; fotoacomp: number; total: number; upserted: number };
  error: string | null;
  recentActivity?: ScrapeActivityItem[];
}

export function fetchProspects(params: {
  state?: string;
  city?: string;
  source?: string;
  search?: string;
  page?: number;
  limit?: number;
  withPhone?: boolean;
}) {
  const qs = new URLSearchParams();
  if (params.state) qs.append("state", params.state);
  if (params.city) qs.append("city", params.city);
  if (params.source) qs.append("source", params.source);
  if (params.search) qs.append("search", params.search);
  if (params.page) qs.append("page", String(params.page));
  if (params.limit) qs.append("limit", String(params.limit));
  if (params.withPhone) qs.append("withPhone", "true");
  return scraperRequest<ProspectListResponse>(`/prospects?${qs.toString()}`);
}

export function fetchProspectStats(tab?: string) {
  const qs = tab ? `?tab=${tab}` : "";
  return scraperRequest<ProspectStats>(`/prospects/stats${qs}`);
}

export function triggerScrape(states: string[], cities: string[] = [], sources?: string[]) {
  return scraperRequest<{ ok: boolean; message: string }>("/scrape", {
    method: "POST",
    body: JSON.stringify({ states, cities, sources }),
  });
}

export function fetchScrapeStatus() {
  return scraperRequest<ScrapeJobState>("/scrape/status");
}

export function stopScrape() {
  return scraperRequest<{ ok: boolean; message?: string }>("/scrape/stop", {
    method: "POST",
  });
}

export function clearProspects() {
  return scraperRequest<{ ok: boolean; deleted: number }>("/prospects", {
    method: "DELETE",
  });
}

export function deleteProspects(ids: string[]) {
  return scraperRequest<{ ok: boolean; deleted: number }>("/prospects/bulk", {
    method: "DELETE",
    body: JSON.stringify({ ids }),
  });
}

export interface MoveConflict {
  movedId: string;
  existingId: string;
  name: string;
  phone: string | null;
  phoneMatch: boolean;
  differentSources: boolean;
  movingSources: string[];
  existingSources: string[];
}

export function previewMoveProspects(data: {
  ids: string[];
  targetCity: string;
  targetState: string;
}) {
  return scraperRequest<{ conflicts: MoveConflict[]; safeCount: number }>(
    "/prospects/move/preview",
    { method: "POST", body: JSON.stringify(data) },
  );
}

export function moveProspects(data: {
  ids: string[];
  targetCity: string;
  targetState: string;
  conflictResolution: "replace" | "keep-both" | "skip" | "merge";
}) {
  return scraperRequest<{ ok: boolean; moved: number }>("/prospects/move", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export interface ProspectCrmInfo {
  contact: {
    id: string;
    number: string;
    name: string | null;
    botEnabled: boolean;
    notes: string | null;
    tags: string;
    stage: { id: string; name: string; color: string } | null;
    lastMessage: { text: string; fromMe: boolean; messageTimestamp: number } | null;
    createdAt: string;
  } | null;
}

export function fetchProspectCrmInfo(id: string) {
  return scraperRequest<ProspectCrmInfo>(`/prospects/${encodeURIComponent(id)}/crm-info`);
}

export interface ImportRow {
  name?: string;
  nome?: string;
  phone?: string;
  telefone?: string;
  whatsapp?: string;
  [k: string]: string | undefined;
}

export function importProspects(data: {
  rows: ImportRow[];
  targetCity: string;
  targetState: string;
}) {
  return scraperRequest<{ ok: boolean; created: number; updated: number; skipped: number }>(
    "/prospects/import",
    { method: "POST", body: JSON.stringify(data) },
  );
}

// ─── Rotinas de Captura Agendada ──────────────────────────────────────────────

export interface ProspectRoutine {
  id: string;
  name: string;
  state: string;
  cities: string[];
  cron: string;
  enabled: boolean;
  lastRun: string | null;
  createdAt: string;
  sources?: string[];
}

export function fetchRoutines() {
  return scraperRequest<ProspectRoutine[]>("/routines");
}

export function createRoutine(data: {
  name: string;
  state: string;
  cities: string[];
  cronExpr: string;
  sources: string[];
}) {
  return scraperRequest<ProspectRoutine>("/routines", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function toggleRoutine(id: string, enabled: boolean) {
  return scraperRequest<ProspectRoutine>(`/routines/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ enabled }),
  });
}

export function deleteRoutine(id: string) {
  return scraperRequest<{ success: boolean }>(`/routines/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}


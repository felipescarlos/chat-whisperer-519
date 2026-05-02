// Local storage for broadcast history
export interface BroadcastRecord {
  id: string;
  date: number;
  instances: string[];
  total: number;
  success: number;
  failed: number;
  message: string;
}

const KEY = "broadcast-history-v1";

export function loadHistory(): BroadcastRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    return JSON.parse(raw) as BroadcastRecord[];
  } catch {
    return [];
  }
}

export function saveHistory(records: BroadcastRecord[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(records));
}

export function appendHistory(record: BroadcastRecord) {
  const all = loadHistory();
  all.unshift(record);
  saveHistory(all.slice(0, 100));
}

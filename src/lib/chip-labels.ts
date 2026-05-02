
const KEY = "chip-labels-v1";

export function loadAllLabels(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function saveAllLabels(labels: Record<string, string>) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(labels));
}

export function getChipLabel(instanceName: string): string | null {
  const labels = loadAllLabels();
  return labels[instanceName] || null;
}

export function setChipLabel(instanceName: string, label: string) {
  const labels = loadAllLabels();
  if (!label.trim()) {
    delete labels[instanceName];
  } else {
    labels[instanceName] = label.trim();
  }
  saveAllLabels(labels);
}

export function getChipDisplayName(i: { name: string; profileName?: string | null }, labels: Record<string, string> = {}): string {
  const label = labels[i.name];
  if (label) return label;
  return i.profileName || i.name;
}

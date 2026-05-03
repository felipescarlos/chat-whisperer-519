export type BroadcastStatus = "pending" | "running" | "paused" | "stopped" | "completed";

export interface QueueNumber {
  number: string;
  status: "pending" | "sent" | "error";
  instance?: string;
  error_message?: string;
}

export interface LocalCampaign {
  id: string;
  created_at: number;
  status: BroadcastStatus;
  message: string;
  min_sec: number;
  max_sec: number;
  per_chip_limit: number;
  chips: string[];
  numbers: QueueNumber[];
}

const STORAGE_KEY = "chat-whisperer-campaigns-v1";

export function loadCampaigns(): LocalCampaign[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return [];
    return JSON.parse(data);
  } catch {
    return [];
  }
}

export function saveCampaigns(campaigns: LocalCampaign[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(campaigns));
}

export function createCampaign(campaign: Omit<LocalCampaign, "id" | "created_at" | "status">) {
  const campaigns = loadCampaigns();
  const newCampaign: LocalCampaign = {
    ...campaign,
    id: `camp_${Date.now()}`,
    created_at: Date.now(),
    status: "running", // Auto-start
  };
  campaigns.unshift(newCampaign);
  // Keep only the last 10 campaigns to avoid hitting localStorage limits (usually 5MB)
  if (campaigns.length > 10) {
    campaigns.pop();
  }
  saveCampaigns(campaigns);
  return newCampaign;
}

export function updateCampaignStatus(id: string, status: BroadcastStatus) {
  const campaigns = loadCampaigns();
  const camp = campaigns.find((c) => c.id === id);
  if (camp) {
    camp.status = status;
    saveCampaigns(campaigns);
  }
}

export function updateNumberStatus(
  campaignId: string,
  numberIdx: number,
  status: "sent" | "error",
  instance?: string,
  errorMessage?: string,
) {
  const campaigns = loadCampaigns();
  const camp = campaigns.find((c) => c.id === campaignId);
  if (camp && camp.numbers[numberIdx]) {
    camp.numbers[numberIdx].status = status;
    if (instance) camp.numbers[numberIdx].instance = instance;
    if (errorMessage) camp.numbers[numberIdx].error_message = errorMessage;
    saveCampaigns(campaigns);
  }
}

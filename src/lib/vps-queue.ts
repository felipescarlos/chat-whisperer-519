// Cliente para a fila de disparos rodando no VPS (picjob-agent)
const VPS_BASE = "https://wpp.rodrigobernardo.com.br/agent";

export type BroadcastStatus = "pending" | "running" | "paused" | "stopped" | "completed";

export interface QueueNumber {
  number: string;
  status: "pending" | "sent" | "error";
  instance?: string;
  error_message?: string;
}

export interface VPSCampaign {
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

export async function createVPSCampaign(
  data: Omit<VPSCampaign, "id" | "created_at" | "status">,
): Promise<VPSCampaign> {
  const res = await fetch(`${VPS_BASE}/campaigns`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Erro ao criar campanha: ${res.statusText}`);
  return res.json();
}

export async function fetchVPSCampaigns(): Promise<VPSCampaign[]> {
  const res = await fetch(`${VPS_BASE}/campaigns`);
  if (!res.ok) throw new Error(`Erro ao buscar campanhas: ${res.statusText}`);
  return res.json();
}

export async function updateVPSCampaignStatus(
  id: string,
  status: "running" | "paused" | "stopped",
): Promise<VPSCampaign> {
  const res = await fetch(`${VPS_BASE}/campaigns/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error(`Erro ao atualizar campanha: ${res.statusText}`);
  return res.json();
}

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
  name: string;
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

export async function retryVPSCampaignErrors(id: string): Promise<VPSCampaign> {
  const res = await fetch(`${VPS_BASE}/campaigns/${id}/retry`, {
    method: "POST",
  });
  if (!res.ok) throw new Error(`Erro ao retentar envios: ${res.statusText}`);
  return res.json();
}

// ── Tradução de erros da Evolution API ───────────────────────
export interface ErrorTranslation {
  title: string;
  explanation: string;
}

export function translateEvolutionError(raw: string): ErrorTranslation {
  const msg = raw.toLowerCase();

  if (msg.includes("429") || msg.includes("rate limit") || msg.includes("too many")) {
    return {
      title: "Limite de envios atingido (429)",
      explanation:
        "O WhatsApp bloqueou temporariamente o chip por excesso de mensagens em pouco tempo. Aumente o intervalo entre envios e aguarde alguns minutos antes de retentar.",
    };
  }
  if (msg.includes("500") || msg.includes("internal server error")) {
    return {
      title: "Erro interno do servidor (500)",
      explanation:
        "A Evolution API encontrou um problema inesperado — pode ser que o chip esteja instável ou com a sessão do WhatsApp corrompida. Tente reconectar o chip e retentar.",
    };
  }
  if (msg.includes("401") || msg.includes("unauthorized") || msg.includes("apikey")) {
    return {
      title: "Não autorizado (401)",
      explanation:
        "A chave de API está incorreta ou sem permissão para esta instância.",
    };
  }
  if (msg.includes("404") || msg.includes("not found")) {
    return {
      title: "Não encontrado (404)",
      explanation:
        "O chip (instância) não foi encontrado na Evolution API. Pode ter sido deletado ou o nome mudou.",
    };
  }
  if (msg.includes("400") || msg.includes("bad request")) {
    return {
      title: "Requisição inválida (400)",
      explanation:
        "O número está em formato incorreto, ou o WhatsApp rejeitou a mensagem. Verifique se o número tem o código do país (55 para Brasil).",
    };
  }
  if (msg.includes("not connected") || msg.includes("instance not") || msg.includes("closed")) {
    return {
      title: "Chip desconectado",
      explanation:
        "O chip estava desconectado do WhatsApp no momento do envio. Vá até a tela de Chips, reconecte o chip e retente os erros.",
    };
  }
  if (msg.includes("timeout") || msg.includes("408") || msg.includes("timed out")) {
    return {
      title: "Timeout (408)",
      explanation:
        "O chip demorou demais para responder. Pode ser instabilidade temporária no WhatsApp ou no servidor. Retente em alguns minutos.",
    };
  }
  if (msg.includes("invalid") && (msg.includes("phone") || msg.includes("number") || msg.includes("jid"))) {
    return {
      title: "Número inválido",
      explanation:
        "Este número não existe no WhatsApp, foi digitado em formato errado, ou pertence a uma linha fixa.",
    };
  }
  if (msg.includes("forbidden") || msg.includes("403")) {
    return {
      title: "Acesso negado (403)",
      explanation:
        "O chip não tem permissão para enviar mensagens para este número. Pode ser que o contato tenha bloqueado o chip.",
    };
  }

  return {
    title: "Erro desconhecido",
    explanation:
      "Não foi possível identificar a causa automaticamente. Veja a mensagem técnica abaixo para mais detalhes.",
  };
}

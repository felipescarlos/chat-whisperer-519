import { useCallback, useEffect, useState } from "react";
import { fetchVPSCampaigns, updateVPSCampaignStatus, VPSCampaign, BroadcastStatus } from "./vps-queue";

export function useBroadcastQueue() {
  const [campaigns, setCampaigns] = useState<VPSCampaign[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await fetchVPSCampaigns();
      setCampaigns(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar campanhas");
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 3000);
    return () => clearInterval(interval);
  }, [refresh]);

  return {
    campaigns,
    error,
    refresh,
    setStatus: async (id: string, status: BroadcastStatus) => {
      if (status === "running" || status === "paused" || status === "stopped") {
        await updateVPSCampaignStatus(id, status);
        await refresh();
      }
    },
  };
}

import { useEffect, useRef, useState } from "react";
import {
  LocalCampaign,
  loadCampaigns,
  updateCampaignStatus,
  updateNumberStatus,
} from "./local-queue";
import { expandVariations, randomBetween, sleep } from "./broadcast-utils";
import { sendText } from "./evolution-api";

export function useBroadcastQueue() {
  const [campaigns, setCampaigns] = useState<LocalCampaign[]>([]);
  const processingRef = useRef(false);

  const refresh = () => setCampaigns(loadCampaigns());

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 2000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (processingRef.current) return;

    // Find the first running campaign
    const activeCamp = campaigns.find((c) => c.status === "running");
    if (!activeCamp) return;

    // Find the first pending number in this campaign
    const pendingIdx = activeCamp.numbers.findIndex((n) => n.status === "pending");

    if (pendingIdx === -1) {
      // Finished
      updateCampaignStatus(activeCamp.id, "completed");
      refresh();
      return;
    }

    processingRef.current = true;

    const processNext = async () => {
      try {
        // Re-check status before sending in case it was paused
        const currentCamps = loadCampaigns();
        const currentCamp = currentCamps.find((c) => c.id === activeCamp.id);
        if (currentCamp?.status !== "running") {
          processingRef.current = false;
          return;
        }

        const numberRow = activeCamp.numbers[pendingIdx];
        const chips = activeCamp.chips;

        // Simple round-robin or random chip selection for local
        // In a real scenario we'd track limits strictly
        const selectedChip = chips[Math.floor(Math.random() * chips.length)];

        const textToSend = expandVariations(activeCamp.message);

        try {
          await sendText(selectedChip, numberRow.number, textToSend);
          updateNumberStatus(activeCamp.id, pendingIdx, "sent", selectedChip);
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          updateNumberStatus(activeCamp.id, pendingIdx, "error", selectedChip, errorMessage);
        }

        refresh();

        // Wait interval
        const waitTime = randomBetween(activeCamp.min_sec, activeCamp.max_sec) * 1000;
        await sleep(waitTime);
      } finally {
        processingRef.current = false;
      }
    };

    processNext();
  }, [campaigns]);

  return {
    campaigns,
    refresh,
    setStatus: (id: string, status: LocalCampaign["status"]) => {
      updateCampaignStatus(id, status);
      refresh();
    },
  };
}

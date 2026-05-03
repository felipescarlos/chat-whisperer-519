import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { sendText } from "./src/lib/evolution-api.js"; // Note: might need to adjust imports for standard Node
import { expandVariations, randomBetween, sleep } from "./src/lib/broadcast-utils.js";

// Carregar variáveis de ambiente (necessário criar um arquivo .env no VPS)
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || "";
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || "";

if (!supabaseUrl || !supabaseKey) {
  console.error("ERRO: Variáveis VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY não encontradas.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

console.log("Iniciando Worker de Disparos em Background...");

// Manter contagem de disparos por chip em memória
const perChipCount: Record<string, number> = {};

async function processQueue() {
  while (true) {
    try {
      // Buscar campanhas que estão "running"
      const { data: runningCampaigns, error: campErr } = await supabase
        .from("broadcasts")
        .select("*")
        .eq("status", "running")
        .order("created_at", { ascending: true });

      if (campErr) throw campErr;

      if (!runningCampaigns || runningCampaigns.length === 0) {
        // Nenhuma campanha rodando, aguarda um pouco e tenta de novo
        await sleep(5000);
        continue;
      }

      for (const campaign of runningCampaigns) {
        // Buscar o próximo número pendente desta campanha
        const { data: numbers, error: numErr } = await supabase
          .from("broadcast_numbers")
          .select("*")
          .eq("broadcast_id", campaign.id)
          .eq("status", "pending")
          .limit(1);

        if (numErr) throw numErr;

        if (!numbers || numbers.length === 0) {
          // Todos os números processados! Atualizar campanha para concluída
          await supabase.from("broadcasts").update({ status: "completed" }).eq("id", campaign.id);
          console.log(`[Campanha ${campaign.id}] Concluída!`);
          continue;
        }

        const numberRow = numbers[0];
        const chips: string[] = campaign.chips || [];

        // Inicializar contadores se não existirem
        chips.forEach((c) => {
          if (perChipCount[c] === undefined) perChipCount[c] = 0;
        });

        // Encontrar o chip com menos usos que não atingiu o limite
        let selectedChip: string | null = null;
        let lowestCount = Infinity;

        for (const chip of chips) {
          if (perChipCount[chip] < campaign.per_chip_limit && perChipCount[chip] < lowestCount) {
            lowestCount = perChipCount[chip];
            selectedChip = chip;
          }
        }

        if (!selectedChip) {
          // Limite atingido em todos os chips para essa campanha (na verdade a contagem é global no worker por enquanto,
          // o ideal seria limitar por campanha. Vamos considerar por campanha).
          console.log(
            `[Campanha ${campaign.id}] Limite de disparos por chip atingido. Pausando campanha.`,
          );
          await supabase.from("broadcasts").update({ status: "paused" }).eq("id", campaign.id);
          continue;
        }

        const textToSend = expandVariations(campaign.message);
        console.log(
          `[Campanha ${campaign.id}] Enviando para ${numberRow.number} via ${selectedChip}...`,
        );

        try {
          // Faz o disparo usando a função da Evolution API
          await sendText(selectedChip, numberRow.number, textToSend);
          perChipCount[selectedChip]++;

          // Atualiza banco de dados
          await supabase
            .from("broadcast_numbers")
            .update({
              status: "sent",
              instance: selectedChip,
              sent_at: new Date().toISOString(),
            })
            .eq("id", numberRow.id);

          // Atualiza contadores da campanha
          await supabase.rpc("increment_broadcast_stat", {
            row_id: campaign.id,
            stat_type: "sent",
          });
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error(
            `[Campanha ${campaign.id}] Erro ao enviar para ${numberRow.number}: ${errorMessage}`,
          );
          await supabase
            .from("broadcast_numbers")
            .update({
              status: "error",
              instance: selectedChip,
              error_message: errorMessage,
              sent_at: new Date().toISOString(),
            })
            .eq("id", numberRow.id);

          await supabase.rpc("increment_broadcast_stat", {
            row_id: campaign.id,
            stat_type: "errors",
          });
        }

        // Aguardar intervalo aleatório antes de processar a próxima mensagem dessa ou de outra campanha
        const waitTime = randomBetween(campaign.min_sec, campaign.max_sec) * 1000;
        console.log(`Aguardando ${waitTime / 1000}s...`);
        await sleep(waitTime);
      }
    } catch (err) {
      console.error("Erro no loop principal do worker:", err);
      await sleep(10000); // Aguardar em caso de erro no banco
    }
  }
}

// Iniciar o loop
processQueue();

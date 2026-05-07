// =============================================================
// FILA DE DISPAROS — VPS (picjob-agent)
// Salvar em: ~/picjob-agent/src/queue.js
// =============================================================

const fs = require("fs");
const path = require("path");
const axios = require("axios");
const express = require("express");

const CAMPAIGNS_FILE = path.join(__dirname, "../campaigns.json");
const EVOLUTION_BASE = "https://wpp.rodrigobernardo.com.br";
const EVOLUTION_API_KEY = "Bp7UVb0Qg4bsDivvzNdOsjSZfRC07QGP";

// ── Persistência ────────────────────────────────────────────
function loadCampaigns() {
  try {
    if (!fs.existsSync(CAMPAIGNS_FILE)) return [];
    return JSON.parse(fs.readFileSync(CAMPAIGNS_FILE, "utf8"));
  } catch {
    return [];
  }
}

function saveCampaigns(campaigns) {
  fs.writeFileSync(CAMPAIGNS_FILE, JSON.stringify(campaigns, null, 2));
}

// ── Helpers ─────────────────────────────────────────────────
function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Expande spintax: {opção1|opção2|opção3}
function expandVariations(text) {
  return text.replace(/\{([^}]+)\}/g, (_, opts) => {
    const options = opts.split("|");
    return options[Math.floor(Math.random() * options.length)];
  });
}

// ── Evolution API ────────────────────────────────────────────
async function sendText(instanceName, number, text) {
  await axios.post(
    `${EVOLUTION_BASE}/message/sendText/${encodeURIComponent(instanceName)}`,
    { number, text },
    { headers: { "Content-Type": "application/json", apikey: EVOLUTION_API_KEY } }
  );
}

// ── Processador de fila ──────────────────────────────────────
let processing = false;

async function processQueue() {
  if (processing) return;

  const campaigns = loadCampaigns();
  const active = campaigns.find((c) => c.status === "running");
  if (!active) return;

  const pendingIdx = active.numbers.findIndex((n) => n.status === "pending");

  if (pendingIdx === -1) {
    // Campanha concluída
    const updated = loadCampaigns();
    const camp = updated.find((c) => c.id === active.id);
    if (camp) {
      camp.status = "completed";
      saveCampaigns(updated);
    }
    return;
  }

  processing = true;

  try {
    // Re-lê do disco para pegar status mais recente (ex: pausado via API)
    const fresh = loadCampaigns();
    const freshCamp = fresh.find((c) => c.id === active.id);
    if (!freshCamp || freshCamp.status !== "running") return;

    const numberRow = freshCamp.numbers[pendingIdx];
    const selectedChip =
      freshCamp.chips[Math.floor(Math.random() * freshCamp.chips.length)];
    const text = expandVariations(freshCamp.message);

    try {
      await sendText(selectedChip, numberRow.number, text);
      numberRow.status = "sent";
      numberRow.instance = selectedChip;
      console.log(`[queue] ✓ ${numberRow.number} via ${selectedChip}`);
    } catch (err) {
      numberRow.status = "error";
      numberRow.instance = selectedChip;
      numberRow.error_message = err.message;
      console.error(`[queue] ✗ ${numberRow.number}:`, err.message);
    }

    saveCampaigns(fresh);

    // Aguarda intervalo aleatório antes do próximo envio
    const waitMs = randomBetween(freshCamp.min_sec, freshCamp.max_sec) * 1000;
    await sleep(waitMs);
  } finally {
    processing = false;
  }
}

// Verifica a fila a cada 2 segundos
setInterval(processQueue, 2000);
console.log("[queue] Processador de disparos iniciado.");

// ── Rotas Express ────────────────────────────────────────────
const router = express.Router();

// CORS — permite chamadas do frontend
router.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// POST /campaigns — cria campanha
router.post("/campaigns", (req, res) => {
  const { name, message, min_sec, max_sec, per_chip_limit, chips, numbers } = req.body;

  if (!message || !chips?.length || !numbers?.length) {
    return res
      .status(400)
      .json({ error: "message, chips e numbers são obrigatórios" });
  }

  const campaigns = loadCampaigns();
  const newCampaign = {
    id: `camp_${Date.now()}`,
    name: name || `Campanha ${new Date().toLocaleDateString("pt-BR")}`,
    created_at: Date.now(),
    status: "running",
    message,
    min_sec: min_sec || 10,
    max_sec: max_sec || 30,
    per_chip_limit: per_chip_limit || 50,
    chips,
    numbers: numbers.map((n) => ({
      number: typeof n === "string" ? n : n.number,
      status: "pending",
    })),
  };

  campaigns.unshift(newCampaign);
  if (campaigns.length > 20) campaigns.pop(); // mantém últimas 20
  saveCampaigns(campaigns);

  console.log(
    `[queue] Nova campanha ${newCampaign.id}: ${newCampaign.numbers.length} números`
  );
  res.status(201).json(newCampaign);
});

// GET /campaigns — lista campanhas
router.get("/campaigns", (req, res) => {
  res.json(loadCampaigns());
});

// POST /campaigns/:id/retry — reenfileira números com erro
router.post("/campaigns/:id/retry", (req, res) => {
  const campaigns = loadCampaigns();
  const camp = campaigns.find((c) => c.id === req.params.id);

  if (!camp) return res.status(404).json({ error: "Campanha não encontrada" });

  const errorNumbers = camp.numbers.filter((n) => n.status === "error");
  if (errorNumbers.length === 0) {
    return res.status(400).json({ error: "Nenhum número com erro para retentar" });
  }

  // Resetar números com erro de volta para pendente
  errorNumbers.forEach((n) => {
    n.status = "pending";
    delete n.error_message;
    delete n.instance;
  });

  // Retomar campanha
  camp.status = "running";
  saveCampaigns(campaigns);

  console.log(`[queue] Campanha ${camp.id}: ${errorNumbers.length} números reenfileirados`);
  res.json(camp);
});

// PATCH /campaigns/:id — pausa, retoma ou cancela
router.patch("/campaigns/:id", (req, res) => {
  const { status } = req.body;
  const validStatuses = ["running", "paused", "stopped"];

  if (!validStatuses.includes(status)) {
    return res
      .status(400)
      .json({ error: `status deve ser: ${validStatuses.join(", ")}` });
  }

  const campaigns = loadCampaigns();
  const camp = campaigns.find((c) => c.id === req.params.id);

  if (!camp) return res.status(404).json({ error: "Campanha não encontrada" });

  camp.status = status;
  saveCampaigns(campaigns);

  console.log(`[queue] Campanha ${camp.id} → ${status}`);
  res.json(camp);
});

module.exports = router;

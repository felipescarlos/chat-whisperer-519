const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const axios = require('axios');

// Load environment variables manually if not already defined (e.g., when running on host)
const envPath = '/root/picjob-agent/.env';
if (!process.env.DATABASE_URL && fs.existsSync(envPath)) {
  console.log('Carregando variáveis de ambiente do arquivo .env local...');
  const envFile = fs.readFileSync(envPath, 'utf8');
  envFile.split('\n').forEach(line => {
    const parts = line.split('=');
    if (parts.length >= 2) {
      const key = parts[0].trim();
      const value = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
      process.env[key] = value;
    }
  });
}

const EVOLUTION_URL = process.env.EVOLUTION_URL || 'http://evolution_api:8080';
const EVOLUTION_KEY = process.env.EVOLUTION_API_KEY;

if (!EVOLUTION_KEY) {
  console.error('Error: EVOLUTION_API_KEY is not defined in env');
  process.exit(1);
}

// Adjust Evolution URL if executing on the host versus inside the container
let targetUrl = EVOLUTION_URL;
if (!process.env.INIT_CWD) { 
  targetUrl = "https://wpp.rodrigobernardo.com.br";
}

const evolutionApi = axios.create({
  baseURL: targetUrl,
  headers: { apikey: EVOLUTION_KEY },
  timeout: 25000
});

const prisma = new PrismaClient();

function extractText(message) {
  if (!message) return null;
  // Handle nested messages if wrapped
  let msg = message;
  if (message.message) msg = message.message;
  return (
    msg.conversation ||
    msg.extendedTextMessage?.text ||
    msg.imageMessage?.caption ||
    msg.videoMessage?.caption ||
    null
  );
}

async function run() {
  console.log('=== INICIANDO IMPORTAÇÃO DE CONVERSAS E HISTÓRICO ===');
  console.log(`URL de Conexão Evolution: ${targetUrl}`);
  
  try {
    // 1. Descobrir todas as instâncias ativas na Evolution API
    console.log('Buscando instâncias registradas na Evolution API...');
    const instancesRes = await evolutionApi.get('/instance/fetchInstances');
    const activeInstances = instancesRes.data || [];
    console.log(`Encontradas ${activeInstances.length} instâncias.`);
    
    // Obter estágio padrão para novos contatos
    const defaultStage = await prisma.pipelineStage.findFirst({
      orderBy: { orderIndex: 'asc' }
    });
    
    // Loop pelas instâncias para importar conversas ativas
    for (const inst of activeInstances) {
      const instanceName = inst.name;
      const status = (inst.connectionStatus || inst.status || '').toString().toLowerCase();
      
      if (status !== 'open' && status !== 'connected') {
        console.log(`[${instanceName}] Instância não conectada (status: ${status}). Pulando importação de conversas.`);
        continue;
      }
      
      console.log(`[${instanceName}] Buscando conversas ativas no chip...`);
      try {
        const chatsRes = await evolutionApi.post(`/chat/findChats/${instanceName}`, {});
        const chats = chatsRes.data || [];
        console.log(`[${instanceName}] Encontradas ${chats.length} conversas.`);
        
        let newContactsCount = 0;
        for (const chat of chats) {
          const remoteJid = chat.remoteJid;
          if (!remoteJid || remoteJid.endsWith('@g.us') || remoteJid.endsWith('@broadcast') || remoteJid === 'status@broadcast') {
            continue; // Ignorar grupos, listas de transmissão e status
          }
          
          const number = remoteJid.split('@')[0];
          const pushName = chat.pushName || null;
          
          // Verificar se já existe no CRM
          let contact = await prisma.contact.findUnique({
            where: { number }
          });
          
          if (!contact) {
            contact = await prisma.contact.create({
              data: {
                number,
                name: pushName,
                instance: instanceName,
                stageId: defaultStage ? defaultStage.id : null
              }
            });
            newContactsCount++;
          } else {
            // Atualizar nome e instância se estiverem em branco
            const updateData = {};
            if (!contact.instance) updateData.instance = instanceName;
            if (pushName && !contact.name) updateData.name = pushName;
            if (Object.keys(updateData).length > 0) {
              await prisma.contact.update({
                where: { id: contact.id },
                data: updateData
              });
            }
          }
        }
        console.log(`[${instanceName}] Importação concluída. ${newContactsCount} novos contatos criados.`);
      } catch (err) {
        console.error(`[${instanceName}] Erro ao carregar chats do chip:`, err.message);
      }
    }
    
    // 2. Sincronizar o histórico de mensagens de todos os contatos no banco
    const contacts = await prisma.contact.findMany();
    console.log(`Iniciando reconciliação de mensagens para ${contacts.length} contatos...`);
    
    for (const contact of contacts) {
      if (!contact.instance) continue;
      
      const remoteJid = `${contact.number}@s.whatsapp.net`;
      try {
        const response = await evolutionApi.post(`/chat/findMessages/${contact.instance}`, {
          where: {
            key: {
              remoteJid: remoteJid
            }
          },
          limit: 150
        });
        
        let records = [];
        if (Array.isArray(response.data)) {
          records = response.data;
        } else if (response.data?.messages?.records) {
          records = response.data.messages.records;
        }
        
        let inserted = 0;
        const sortedRecords = [...records].sort((a, b) => {
          const tsA = a.messageTimestamp ? parseInt(a.messageTimestamp, 10) : 0;
          const tsB = b.messageTimestamp ? parseInt(b.messageTimestamp, 10) : 0;
          return tsA - tsB;
        });

        for (const record of sortedRecords) {
          const messageId = record.key?.id;
          if (!messageId) continue;
          
          const exists = await prisma.message.findUnique({
            where: { messageId }
          });
          
          if (!exists) {
            const fromMe = !!record.key?.fromMe;
            const text = extractText(record.message) || '';
            const timestamp = record.messageTimestamp ? parseInt(record.messageTimestamp, 10) : Math.floor(Date.now() / 1000);
            
            await prisma.message.create({
              data: {
                messageId,
                contactId: contact.id,
                fromMe,
                text,
                messageTimestamp: timestamp
              }
            });
            inserted++;
          }
        }
        if (inserted > 0) {
          console.log(`[${contact.number}] Sincronizadas ${inserted} novas mensagens.`);
        }
      } catch (err) {
        console.error(`[${contact.number}] Erro ao buscar histórico:`, err.message);
      }
    }
    
    console.log('=== SUCESSO: RECONCILIAÇÃO E IMPORTAÇÃO COMPLETAS ===');
  } catch (err) {
    console.error('Erro na execução da importação geral:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

run();

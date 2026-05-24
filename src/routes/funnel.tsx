import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { 
  Trello, 
  Search, 
  Plus, 
  Settings, 
  MessageCircle, 
  Bot, 
  ArrowLeft, 
  ArrowRight,
  Trash2,
  Pencil,
  PlusCircle,
  Save,
  Check,
  UserCheck
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogFooter
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { 
  CRMContact, 
  CRMStage, 
  fetchCRMStages, 
  fetchCRMContacts, 
  updateCRMContact,
  createCRMStage,
  updateCRMStage,
  deleteCRMStage,
  formatPhoneNumber
} from "@/lib/evolution-api";

export const Route = createFileRoute("/funnel")({
  head: () => ({
    meta: [
      { title: "Funil de Vendas — CRM WhatsApp" },
      { name: "description", content: "Gerencie suas negociações no funil Kanban com IA integrada." },
    ],
  }),
  component: FunnelPage,
});

// modern colors for pipeline stages
const PRESET_COLORS = [
  { name: "Azul", value: "#3b82f6" },
  { name: "Verde", value: "#10b981" },
  { name: "Roxo", value: "#8b5cf6" },
  { name: "Laranja", value: "#f97316" },
  { name: "Vermelho", value: "#ef4444" },
  { name: "Rosa", value: "#ec4899" },
  { name: "Ciano", value: "#06b6d4" },
  { name: "Cinza", value: "#64748b" },
];

function FunnelPage() {
  const navigate = useNavigate();
  const [stages, setStages] = useState<CRMStage[]>([]);
  const [contacts, setContacts] = useState<CRMContact[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [isManagerOpen, setIsManagerOpen] = useState(false);

  // New stage form state
  const [newStageName, setNewStageName] = useState("");
  const [newStageColor, setNewStageColor] = useState(PRESET_COLORS[0].value);
  const [creatingStage, setCreatingStage] = useState(false);

  // Edit stage state
  const [editingStageId, setEditingStageId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("");
  const [editOrderIndex, setEditOrderIndex] = useState(0);
  const [savingStage, setSavingStage] = useState(false);

  // Load CRM Data
  const loadCRMData = useCallback(async (isBackground = false) => {
    if (!isBackground) setLoading(true);
    try {
      const stagesList = await fetchCRMStages();
      // Sort by orderIndex ascending
      const sortedStages = [...stagesList].sort((a, b) => a.orderIndex - b.orderIndex);
      setStages(sortedStages);

      const contactsList = await fetchCRMContacts(undefined, search.trim() || undefined);
      setContacts(contactsList);
    } catch (e) {
      console.error(e);
      if (!isBackground) toast.error("Falha ao carregar dados do CRM");
    } finally {
      if (!isBackground) setLoading(false);
    }
  }, [search]);

  // Load initial data and poll updates
  useEffect(() => {
    loadCRMData();
    const interval = setInterval(() => loadCRMData(true), 15000);
    return () => clearInterval(interval);
  }, [loadCRMData]);

  // Change contact stage
  const handleMoveContact = async (contactNumber: string, newStageId: string | null) => {
    try {
      const targetId = newStageId === "null" ? null : newStageId;
      await updateCRMContact(contactNumber, { stageId: targetId });
      toast.success("Estágio do contato atualizado");
      
      // Update local state immediately
      setContacts(prev => prev.map(c => {
        if (c.number === contactNumber) {
          const matchedStage = stages.find(s => s.id === targetId);
          return {
            ...c,
            stageId: targetId,
            stage: matchedStage ? { id: matchedStage.id, name: matchedStage.name, color: matchedStage.color, orderIndex: matchedStage.orderIndex } : null
          };
        }
        return c;
      }));
    } catch (e) {
      console.error(e);
      toast.error("Erro ao alterar estágio");
    }
  };

  // Toggle Bot Enabled
  const handleToggleBot = async (contact: CRMContact) => {
    try {
      const nextState = !contact.botEnabled;
      await updateCRMContact(contact.number, { botEnabled: nextState });
      toast.success(`Agente IA ${nextState ? "ativado" : "desativado"}`);
      
      // Update local state immediately
      setContacts(prev => prev.map(c => {
        if (c.id === contact.id) {
          return { ...c, botEnabled: nextState };
        }
        return c;
      }));
    } catch (e) {
      console.error(e);
      toast.error("Erro ao alterar estado do bot");
    }
  };

  // Create Stage
  const handleCreateStage = async () => {
    if (!newStageName.trim()) {
      toast.error("Digite o nome da etapa");
      return;
    }
    setCreatingStage(true);
    try {
      const nextOrder = stages.length > 0 ? Math.max(...stages.map(s => s.orderIndex)) + 1 : 0;
      await createCRMStage({
        name: newStageName.trim(),
        color: newStageColor,
        orderIndex: nextOrder
      });
      toast.success("Etapa criada com sucesso");
      setNewStageName("");
      loadCRMData();
    } catch (e) {
      console.error(e);
      toast.error("Erro ao criar etapa");
    } finally {
      setCreatingStage(false);
    }
  };

  // Edit Stage Save
  const handleSaveStageEdit = async (stageId: string) => {
    if (!editName.trim()) {
      toast.error("O nome da etapa não pode ser vazio");
      return;
    }
    setSavingStage(true);
    try {
      await updateCRMStage(stageId, {
        name: editName.trim(),
        color: editColor,
        orderIndex: editOrderIndex
      });
      toast.success("Etapa atualizada");
      setEditingStageId(null);
      loadCRMData();
    } catch (e) {
      console.error(e);
      toast.error("Erro ao atualizar etapa");
    } finally {
      setSavingStage(false);
    }
  };

  // Delete Stage
  const handleDeleteStage = async (stageId: string) => {
    const hasContacts = contacts.some(c => c.stageId === stageId);
    const confirmMsg = hasContacts 
      ? "Esta etapa possui contatos associados. Eles ficarão sem estágio. Confirma a exclusão?" 
      : "Confirma a exclusão desta etapa?";
    
    if (!confirm(confirmMsg)) return;

    try {
      await deleteCRMStage(stageId);
      toast.success("Etapa excluída");
      loadCRMData();
    } catch (e) {
      console.error(e);
      toast.error("Erro ao excluir etapa");
    }
  };

  // Move stage up or down in list
  const handleReorderStage = async (stage: CRMStage, direction: "up" | "down") => {
    const index = stages.findIndex(s => s.id === stage.id);
    if (index === -1) return;
    
    const swapWithIndex = direction === "up" ? index - 1 : index + 1;
    if (swapWithIndex < 0 || swapWithIndex >= stages.length) return;

    const otherStage = stages[swapWithIndex];
    try {
      // Swap orderIndex
      await updateCRMStage(stage.id, { orderIndex: otherStage.orderIndex });
      await updateCRMStage(otherStage.id, { orderIndex: stage.orderIndex });
      loadCRMData();
    } catch (e) {
      console.error(e);
      toast.error("Falha ao reordenar etapas");
    }
  };

  // Group contacts by Stage ID
  const groupedContacts = useMemo(() => {
    const groups: Record<string, CRMContact[]> = {
      unassigned: [] // for stageId = null
    };
    
    stages.forEach(s => {
      groups[s.id] = [];
    });

    contacts.forEach(c => {
      if (c.stageId && groups[c.stageId]) {
        groups[c.stageId].push(c);
      } else {
        groups.unassigned.push(c);
      }
    });

    return groups;
  }, [stages, contacts]);

  return (
    <AppShell>
      <div className="flex flex-col h-full overflow-hidden">
        {/* Header da Página */}
        <header className="p-4 border-b border-border bg-panel-header shrink-0 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Trello className="h-5 w-5 text-primary" />
              Funil de Vendas (CRM)
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Organize seus contatos por etapas de atendimento, ative IA ou direcione para o chat manual.
            </p>
          </div>
          
          <div className="flex items-center gap-3 shrink-0">
            {/* Search Input */}
            <div className="relative w-64">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar cliente ou telefone..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9 bg-input border-border text-sm"
              />
            </div>

            {/* Gerenciador de Estágios Button */}
            <Dialog open={isManagerOpen} onOpenChange={setIsManagerOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 gap-1.5 border-border">
                  <Settings className="h-4 w-4" />
                  Gerenciar Etapas
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-xl max-h-[85vh] flex flex-col p-6">
                <DialogHeader>
                  <DialogTitle className="text-lg font-bold">Configuração de Etapas do Funil</DialogTitle>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto pr-1 py-4 space-y-6">
                  {/* Create Stage Panel */}
                  <div className="p-4 rounded-xl border border-border bg-accent/20 space-y-4">
                    <h3 className="text-sm font-semibold flex items-center gap-1.5 text-foreground">
                      <PlusCircle className="w-4.5 h-4.5 text-primary" />
                      Criar Nova Etapa
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="sm:col-span-2">
                        <Input
                          placeholder="Nome da etapa (ex: Negociação)"
                          value={newStageName}
                          onChange={(e) => setNewStageName(e.target.value)}
                          className="bg-input border-border h-9"
                        />
                      </div>
                      <div>
                        <Select value={newStageColor} onValueChange={setNewStageColor}>
                          <SelectTrigger className="bg-input border-border h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {PRESET_COLORS.map(c => (
                              <SelectItem key={c.value} value={c.value}>
                                <div className="flex items-center gap-2">
                                  <span className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: c.value }} />
                                  <span>{c.name}</span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <Button 
                      onClick={handleCreateStage} 
                      disabled={creatingStage || !newStageName.trim()} 
                      className="w-full h-9 text-sm"
                    >
                      {creatingStage ? "Criando..." : "Criar e Adicionar Etapa"}
                    </Button>
                  </div>

                  {/* List of Stages */}
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-muted-foreground">Etapas Cadastradas ({stages.length})</h3>
                    {stages.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-4">Nenhuma etapa configurada. Crie uma acima.</p>
                    ) : (
                      <div className="space-y-2">
                        {stages.map((stage, idx) => {
                          const isEditing = editingStageId === stage.id;
                          return (
                            <div 
                              key={stage.id} 
                              className="flex items-center justify-between p-3 rounded-lg border border-border/60 bg-panel hover:bg-accent/15 transition-colors gap-3"
                            >
                              {isEditing ? (
                                <div className="flex-1 flex gap-2 items-center">
                                  <Input
                                    value={editName}
                                    onChange={(e) => setEditName(e.target.value)}
                                    className="h-8 bg-input border-border text-sm flex-1"
                                  />
                                  <Select value={editColor} onValueChange={setEditColor}>
                                    <SelectTrigger className="h-8 bg-input border-border w-28 text-xs">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {PRESET_COLORS.map(c => (
                                        <SelectItem key={c.value} value={c.value}>
                                          <div className="flex items-center gap-1.5">
                                            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c.value }} />
                                            <span className="text-xs">{c.name}</span>
                                          </div>
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <Button 
                                    size="sm" 
                                    onClick={() => handleSaveStageEdit(stage.id)} 
                                    disabled={savingStage}
                                    className="h-8 px-2"
                                  >
                                    <Check className="h-4.5 w-4.5" />
                                  </Button>
                                  <Button 
                                    size="sm" 
                                    variant="outline" 
                                    onClick={() => setEditingStageId(null)}
                                    className="h-8 px-2 border-border"
                                  >
                                    Cancelar
                                  </Button>
                                </div>
                              ) : (
                                <>
                                  <div className="flex items-center gap-3">
                                    <span className="w-3.5 h-3.5 rounded-full shrink-0" style={{ backgroundColor: stage.color }} />
                                    <div>
                                      <p className="text-sm font-medium text-foreground">{stage.name}</p>
                                      <p className="text-[10px] text-muted-foreground">Ordem: {stage.orderIndex}</p>
                                    </div>
                                  </div>
                                  
                                  <div className="flex items-center gap-1 shrink-0">
                                    {/* Reordering */}
                                    <Button 
                                      size="sm" 
                                      variant="ghost" 
                                      className="h-7 w-7 p-0" 
                                      disabled={idx === 0}
                                      onClick={() => handleReorderStage(stage, "up")}
                                    >
                                      <ArrowLeft className="h-3.5 w-3.5 rotate-90" />
                                    </Button>
                                    <Button 
                                      size="sm" 
                                      variant="ghost" 
                                      className="h-7 w-7 p-0" 
                                      disabled={idx === stages.length - 1}
                                      onClick={() => handleReorderStage(stage, "down")}
                                    >
                                      <ArrowRight className="h-3.5 w-3.5 rotate-90" />
                                    </Button>
                                    
                                    {/* Edit */}
                                    <Button 
                                      size="sm" 
                                      variant="ghost" 
                                      className="h-7 w-7 p-0 hover:text-primary"
                                      onClick={() => {
                                        setEditingStageId(stage.id);
                                        setEditName(stage.name);
                                        setEditColor(stage.color);
                                        setEditOrderIndex(stage.orderIndex);
                                      }}
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                    </Button>

                                    {/* Delete */}
                                    <Button 
                                      size="sm" 
                                      variant="ghost" 
                                      className="h-7 w-7 p-0 text-destructive/80 hover:text-destructive hover:bg-destructive/10"
                                      onClick={() => handleDeleteStage(stage.id)}
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </div>
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                <DialogFooter className="border-t border-border pt-3">
                  <Button variant="outline" onClick={() => setIsManagerOpen(false)} className="border-border">
                    Fechar
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Button variant="outline" size="sm" className="h-9 border-border" onClick={() => loadCRMData()}>
              Recarregar
            </Button>
          </div>
        </header>

        {/* Quadro Kanban */}
        <div className="flex-1 overflow-x-auto overflow-y-hidden bg-background chat-pattern p-4 fluid-scroll">
          <div className="flex gap-4 h-full items-start" style={{ minWidth: `${(stages.length + 1) * 280}px` }}>
            
            {/* Coluna 1: Sem Estágio (Se tiver algum contato nessa condição) */}
            {groupedContacts.unassigned.length > 0 && (
              <div className="w-[280px] shrink-0 bg-panel/75 backdrop-blur-md rounded-xl border border-border flex flex-col max-h-full glass shadow-panel">
                {/* Cabeçalho da coluna */}
                <div className="p-3 border-b border-border flex items-center justify-between bg-panel-header/80 rounded-t-xl">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-slate-400" />
                    <span className="font-semibold text-sm">Sem Estágio</span>
                  </div>
                  <Badge variant="secondary" className="text-[10px] bg-slate-200 text-slate-800 font-bold">
                    {groupedContacts.unassigned.length}
                  </Badge>
                </div>
                
                {/* Lista de Contatos */}
                <div className="flex-1 overflow-y-auto p-2 space-y-2.5 fluid-scroll">
                  {groupedContacts.unassigned.map(contact => (
                    <ContactCard 
                      key={contact.id} 
                      contact={contact} 
                      stages={stages} 
                      onMove={handleMoveContact}
                      onToggleBot={handleToggleBot}
                      onNavigate={(num) => navigate({ to: "/", search: { chat: num } })}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Colunas Dinâmicas dos Estágios */}
            {stages.map(stage => {
              const items = groupedContacts[stage.id] || [];
              return (
                <div 
                  key={stage.id} 
                  className="w-[280px] shrink-0 bg-panel/75 backdrop-blur-md rounded-xl border border-border flex flex-col max-h-full glass shadow-panel"
                >
                  {/* Cabeçalho do Estágio */}
                  <div className="p-3 border-b border-border flex items-center justify-between bg-panel-header/80 rounded-t-xl">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: stage.color }} />
                      <span className="font-semibold text-sm truncate" title={stage.name}>
                        {stage.name}
                      </span>
                    </div>
                    <Badge 
                      className="text-[10px] text-white font-bold shrink-0"
                      style={{ backgroundColor: stage.color }}
                    >
                      {items.length}
                    </Badge>
                  </div>

                  {/* Lista de Cartões de Contato */}
                  <div className="flex-1 overflow-y-auto p-2 space-y-2.5 fluid-scroll">
                    {items.length === 0 ? (
                      <div className="h-24 flex items-center justify-center border border-dashed border-border/50 rounded-lg">
                        <span className="text-[11px] text-muted-foreground">Nenhum cliente aqui</span>
                      </div>
                    ) : (
                      items.map(contact => (
                        <ContactCard 
                          key={contact.id} 
                          contact={contact} 
                          stages={stages} 
                          onMove={handleMoveContact}
                          onToggleBot={handleToggleBot}
                          onNavigate={(num) => navigate({ to: "/", search: { chat: num } })}
                        />
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

// ─── Contact Card Component ──────────────────────────────────────────────────
interface ContactCardProps {
  contact: CRMContact;
  stages: CRMStage[];
  onMove: (num: string, stageId: string | null) => void;
  onToggleBot: (contact: CRMContact) => void;
  onNavigate: (num: string) => void;
}

function ContactCard({ contact, stages, onMove, onToggleBot, onNavigate }: ContactCardProps) {
  const lastMsg = contact.messages && contact.messages[0];
  const lastMsgText = lastMsg ? lastMsg.text : "";
  const lastMsgTime = lastMsg ? lastMsg.messageTimestamp : null;

  // Format short timestamp
  const shortTime = useMemo(() => {
    if (!lastMsgTime) return "";
    const d = new Date(lastMsgTime * 1000);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    }
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  }, [lastMsgTime]);

  const tagList = useMemo(() => {
    if (!contact.tags) return [];
    return contact.tags.split(",").map(t => t.trim()).filter(Boolean);
  }, [contact.tags]);

  return (
    <div className="p-3 bg-card border border-border/70 rounded-lg hover:shadow-elevated transition-all flex flex-col gap-2 group relative">
      
      {/* Header do card: Nome / Tempo */}
      <div className="flex justify-between items-start gap-1">
        <div className="min-w-0">
          <h4 className="font-semibold text-xs text-foreground truncate max-w-[170px]" title={contact.name || contact.number}>
            {contact.name || formatPhoneNumber(contact.number)}
          </h4>
          <span className="text-[9px] text-muted-foreground block select-all">
            {formatPhoneNumber(contact.number)}
          </span>
        </div>
        {shortTime && (
          <span className="text-[9px] text-muted-foreground shrink-0">{shortTime}</span>
        )}
      </div>

      {/* Snippet da Última Mensagem */}
      {lastMsgText && (
        <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed whitespace-pre-wrap break-words bg-muted/40 p-1.5 rounded border border-border/30">
          {lastMsg.fromMe && <span className="font-medium text-primary mr-1">Você:</span>}
          {lastMsgText}
        </p>
      )}

      {/* Tags badges */}
      {tagList.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {tagList.map(t => (
            <span 
              key={t} 
              className="text-[9px] px-1.5 py-0.5 rounded font-medium bg-primary/10 text-primary border border-primary/25"
            >
              {t}
            </span>
          ))}
        </div>
      )}

      {/* Divider */}
      <div className="border-t border-border/50 my-1" />

      {/* Footer do Card: Controles de Estágio e Bot */}
      <div className="flex items-center justify-between gap-2 mt-1">
        
        {/* Toggle do Bot */}
        <button 
          onClick={() => onToggleBot(contact)}
          className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-medium border transition-colors ${
            contact.botEnabled 
              ? "bg-primary/10 text-primary border-primary/25 hover:bg-primary/20"
              : "bg-muted text-muted-foreground border-border hover:bg-accent/40"
          }`}
          title={contact.botEnabled ? "IA Ativa (Mudar para Manual)" : "Manual (Mudar para IA)"}
        >
          <Bot className="h-3 w-3" />
          <span>{contact.botEnabled ? "IA Ativa" : "Manual"}</span>
        </button>

        {/* Ações Rápidas */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Seletor de Estágio rápido */}
          <Select 
            value={contact.stageId || "null"} 
            onValueChange={(val) => onMove(contact.number, val === "null" ? null : val)}
          >
            <SelectTrigger className="h-6 w-24 text-[10px] py-0 px-1.5 bg-input border-border shrink-0">
              <SelectValue placeholder="Mover..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="null">Sem etapa</SelectItem>
              {stages.map(s => (
                <SelectItem key={s.id} value={s.id}>
                  <div className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                    <span className="truncate text-xs">{s.name}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Botão de abrir conversa */}
          <Button 
            size="sm" 
            variant="ghost" 
            className="h-6 w-6 p-0 hover:bg-primary hover:text-white"
            onClick={() => onNavigate(contact.number)}
            title="Abrir Chat"
          >
            <MessageCircle className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Search, RefreshCw, MessageCircle, ExternalLink, X,
  SlidersHorizontal, ChevronDown, ArrowUpDown, ChevronUp, Users,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Prospect, ProspectStats, ProspectCrmInfo,
  fetchProspects, fetchProspectStats, fetchProspectCrmInfo,
} from "@/lib/evolution-api";

export const Route = createFileRoute("/cadastros")({
  head: () => ({
    meta: [
      { title: "Cadastros — CRM PicJob" },
      { name: "description", content: "Usuários cadastrados no site PicJob." },
    ],
  }),
  component: CadastrosPage,
});

function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "agora";
  if (mins < 60) return `há ${mins}min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `há ${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `há ${days}d`;
  const months = Math.floor(days / 30);
  if (months < 12) return `há ${months}m`;
  return `há ${Math.floor(months / 12)}a`;
}

const AD_STATUS: Record<number, { label: string; cls: string }> = {
  1: { label: "Ativo",      cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  0: { label: "Rascunho",   cls: "bg-muted/40 text-muted-foreground border-border" },
  2: { label: "Em análise", cls: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30" },
  3: { label: "Reprovado",  cls: "bg-red-500/15 text-red-400 border-red-500/30" },
  7: { label: "Desativado", cls: "bg-orange-500/15 text-orange-400 border-orange-500/30" },
};

function AdStatusBadge({ status }: { status: number | null | undefined }) {
  if (status == null) return <span className="text-xs text-muted-foreground/30">–</span>;
  const s = AD_STATUS[status] ?? { label: `Status ${status}`, cls: "bg-muted/40 text-muted-foreground border-border" };
  return (
    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border whitespace-nowrap ${s.cls}`}>
      {s.label}
    </span>
  );
}

// Cadastros com firstSeenAt anterior a Mariana Silva Rodrigues são pré-CRM (origem desconhecida)
const PRE_CRM_CUTOFF = new Date("2026-05-22T11:47:45.000Z");

function OriginBadge({ hasCrm, firstSeenAt }: { hasCrm: boolean; firstSeenAt: string }) {
  if (hasCrm) {
    return (
      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border whitespace-nowrap bg-violet-500/15 text-violet-400 border-violet-500/30">
        Via WhatsApp
      </span>
    );
  }
  if (new Date(firstSeenAt) < PRE_CRM_CUTOFF) {
    return (
      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border whitespace-nowrap bg-zinc-500/15 text-zinc-400 border-zinc-500/30">
        Pré-CRM
      </span>
    );
  }
  return (
    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border whitespace-nowrap bg-teal-500/15 text-teal-400 border-teal-500/30">
      Orgânico
    </span>
  );
}

function ContactPopup({ prospect, onClose }: { prospect: Prospect; onClose: () => void }) {
  const [crmInfo, setCrmInfo] = useState<ProspectCrmInfo | null>(null);
  const [crmLoading, setCrmLoading] = useState(true);

  useEffect(() => {
    fetchProspectCrmInfo(prospect.id)
      .then((data) => setCrmInfo(data))
      .catch(() => setCrmInfo(null))
      .finally(() => setCrmLoading(false));
  }, [prospect.id]);

  const phone = prospect.whatsappE164 || prospect.whatsappDisplay;
  const waUrl = phone ? `https://wa.me/${phone.replace(/\D/g, "")}` : null;
  const initials = prospect.name.slice(0, 2).toUpperCase();
  const contact = crmInfo?.contact;
  const stageColor = contact?.stage?.color;
  const adUrls = Object.entries(prospect.sourceUrls || {}).filter(([, u]) => !!u);
  const hasAd = prospect.adStatus === 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative z-10 w-full max-w-2xl bg-card border border-border rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative flex-shrink-0">
          {prospect.thumbUrl ? (
            <img src={prospect.thumbUrl} alt={prospect.name} className="w-full h-44 object-cover" />
          ) : (
            <div
              className="w-full h-28 flex items-center justify-center"
              style={stageColor
                ? { background: `linear-gradient(135deg, ${stageColor}30 0%, ${stageColor}10 100%)` }
                : { background: "linear-gradient(135deg, hsl(var(--muted)) 0%, transparent 100%)" }
              }
            >
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold"
                style={stageColor
                  ? { backgroundColor: stageColor + "30", color: stageColor }
                  : { backgroundColor: "hsl(var(--muted))", color: "hsl(var(--muted-foreground))" }
                }
              >
                {initials}
              </div>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-card via-card/30 to-transparent" />
          <button
            onClick={onClose}
            className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white/70 hover:text-white transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="absolute bottom-3 left-5 right-16">
            <div className="flex items-end gap-3">
              <div>
                <h2 className="font-bold text-xl leading-tight">{prospect.name}</h2>
                <p className="text-xs text-muted-foreground font-mono mt-0.5 opacity-60">{prospect.id}</p>
              </div>
              {contact?.stage && (
                <span
                  className="mb-0.5 text-xs font-semibold px-2.5 py-1 rounded-full border flex-shrink-0"
                  style={{ backgroundColor: stageColor + "30", color: stageColor, borderColor: stageColor + "50" }}
                >
                  {contact.stage.name}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1">
          <div className="p-5 space-y-5">
            <div className="grid grid-cols-2 gap-3">
              {/* Coluna esquerda */}
              <div className="space-y-3">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Contato</p>
                <div className="space-y-2">
                  <div className="flex items-center justify-between bg-muted/30 border border-border/60 rounded-lg px-3 py-2">
                    <div>
                      <p className="text-[10px] text-muted-foreground">WhatsApp</p>
                      <p className="text-sm font-mono font-medium">{prospect.whatsappDisplay || prospect.whatsappE164 || "–"}</p>
                      {prospect.whatsappE164 && prospect.whatsappDisplay && (
                        <p className="text-[10px] text-muted-foreground/60 font-mono">{prospect.whatsappE164}</p>
                      )}
                    </div>
                    {waUrl && (
                      <a href={waUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
                        className="w-8 h-8 rounded-full bg-[#25D366]/20 border border-[#25D366]/30 flex items-center justify-center text-[#25D366] hover:bg-[#25D366]/30 transition-colors flex-shrink-0">
                        <MessageCircle className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                  <div className="bg-muted/30 border border-border/60 rounded-lg px-3 py-2">
                    <p className="text-[10px] text-muted-foreground">Localização</p>
                    <p className="text-sm font-medium">
                      {prospect.city && prospect.state ? `${prospect.city} · ${prospect.state}`
                        : prospect.city || prospect.state || <span className="text-muted-foreground/40 italic">Não informado</span>}
                    </p>
                  </div>
                  {prospect.email && (
                    <div className="bg-muted/30 border border-border/60 rounded-lg px-3 py-2">
                      <p className="text-[10px] text-muted-foreground">Email</p>
                      <p className="text-sm font-medium break-all">{prospect.email}</p>
                    </div>
                  )}
                  {prospect.importedContactId && (
                    <div className="bg-muted/30 border border-border/60 rounded-lg px-3 py-2">
                      <p className="text-[10px] text-muted-foreground">ID no site</p>
                      <p className="text-sm font-mono font-medium">#{prospect.importedContactId}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Coluna direita — origem e datas */}
              <div className="space-y-3">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Origem</p>
                <div className="space-y-2">
                  <div className="bg-muted/30 border border-border/60 rounded-lg px-3 py-2 flex items-center justify-between">
                    <div>
                      <p className="text-[10px] text-muted-foreground">Canal de entrada</p>
                      <p className="text-sm font-medium mt-0.5">
                        {contact ? "Via WhatsApp" : new Date(prospect.firstSeenAt) < PRE_CRM_CUTOFF ? "Pré-CRM" : "Orgânico"}
                      </p>
                      <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                        {contact ? "Abordado pelo CRM" : new Date(prospect.firstSeenAt) < PRE_CRM_CUTOFF ? "Cadastrado antes do CRM existir" : "Provavelmente via Google"}
                      </p>
                    </div>
                    <OriginBadge hasCrm={!!contact} firstSeenAt={prospect.firstSeenAt} />
                  </div>
                  <div className="bg-muted/30 border border-border/60 rounded-lg px-3 py-2">
                    <p className="text-[10px] text-muted-foreground">Cadastrado em</p>
                    <p className="text-sm font-medium">{new Date(prospect.firstSeenAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</p>
                    <p className="text-[10px] text-muted-foreground/60">{timeAgo(new Date(prospect.firstSeenAt).getTime())}</p>
                  </div>
                  <div className="bg-muted/30 border border-border/60 rounded-lg px-3 py-2">
                    <p className="text-[10px] text-muted-foreground">Última atualização</p>
                    <p className="text-sm font-medium">{new Date(prospect.lastSeenAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</p>
                    <p className="text-[10px] text-muted-foreground/60">{timeAgo(new Date(prospect.lastSeenAt).getTime())}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Situação no site */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Situação no site</p>
                <AdStatusBadge status={prospect.adStatus} />
              </div>
              {adUrls.length > 0 ? (
                <div className="space-y-1.5">
                  {adUrls.map(([source, url]) => (
                    <a
                      key={source}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className={`flex items-center gap-2 rounded-lg px-3 py-2 transition-colors group border ${hasAd ? "bg-emerald-500/5 border-emerald-500/20 hover:bg-emerald-500/10" : "bg-muted/30 border-border/60 hover:bg-muted/50"}`}
                    >
                      <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${hasAd ? "bg-emerald-400" : "bg-muted-foreground/40"}`} />
                      <div className="flex-1 min-w-0">
                        <p className={`text-[10px] font-medium uppercase ${hasAd ? "text-emerald-400" : "text-muted-foreground"}`}>{source}</p>
                        <p className="text-xs text-muted-foreground truncate">{url}</p>
                        {!hasAd && <p className="text-[10px] text-amber-400 mt-0.5">Link gerado mas anúncio não está ativo</p>}
                      </div>
                      <ExternalLink className={`h-3 w-3 flex-shrink-0 transition-colors ${hasAd ? "text-muted-foreground/40 group-hover:text-emerald-400" : "text-muted-foreground/30"}`} />
                    </a>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-2 bg-amber-500/5 border border-amber-500/20 rounded-lg px-3 py-2.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                  <p className="text-xs text-amber-400">Sem anúncio criado</p>
                </div>
              )}
            </div>

            {/* CRM */}
            <div className="space-y-2">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">CRM</p>
              {crmLoading ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground animate-pulse bg-muted/30 border border-border/60 rounded-lg px-3 py-3">
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Verificando…
                </div>
              ) : contact ? (
                <div className="grid grid-cols-2 gap-2">
                  {contact.stage && (
                    <div className="bg-muted/30 border border-border/60 rounded-lg px-3 py-2">
                      <p className="text-[10px] text-muted-foreground">Etapa do funil</p>
                      <span
                        className="text-xs font-semibold px-2 py-0.5 rounded-full border mt-1 inline-block"
                        style={{ backgroundColor: stageColor + "22", color: stageColor, borderColor: stageColor + "44" }}
                      >
                        {contact.stage.name}
                      </span>
                    </div>
                  )}
                  <div className="bg-muted/30 border border-border/60 rounded-lg px-3 py-2">
                    <p className="text-[10px] text-muted-foreground">Bot</p>
                    <p className={`text-sm font-medium mt-0.5 ${contact.botEnabled ? "text-emerald-400" : "text-muted-foreground"}`}>
                      {contact.botEnabled ? "Ativo" : "Inativo"}
                    </p>
                  </div>
                  {contact.tags && contact.tags !== "" && (
                    <div className="bg-muted/30 border border-border/60 rounded-lg px-3 py-2 col-span-2">
                      <p className="text-[10px] text-muted-foreground">Tags</p>
                      <p className="text-sm font-medium mt-0.5">{contact.tags}</p>
                    </div>
                  )}
                  {contact.lastMessage && (
                    <div className="bg-muted/30 border border-border/60 rounded-lg px-3 py-2 col-span-2">
                      <p className="text-[10px] text-muted-foreground">Última mensagem · {contact.lastMessage.fromMe ? "Você" : "Contato"} · {timeAgo(contact.lastMessage.messageTimestamp * 1000)}</p>
                      <p className="text-sm mt-0.5 line-clamp-2">{contact.lastMessage.text}</p>
                    </div>
                  )}
                  {contact.notes && (
                    <div className="bg-muted/30 border border-border/60 rounded-lg px-3 py-2 col-span-2">
                      <p className="text-[10px] text-muted-foreground">Notas</p>
                      <p className="text-sm mt-0.5 text-muted-foreground italic">{contact.notes}</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col gap-2 bg-muted/20 border border-border/40 rounded-lg px-3 py-3">
                  <p className="text-xs text-muted-foreground italic">Ainda não está no CRM.</p>
                  {waUrl && (
                    <a
                      href={waUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-lg bg-[#25D366]/15 border border-[#25D366]/30 text-[#25D366] text-xs font-medium hover:bg-[#25D366]/25 transition-colors self-start"
                    >
                      <MessageCircle className="h-3.5 w-3.5" /> Iniciar conversa no WhatsApp
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 flex gap-2 p-4 border-t border-border/60 bg-card">
          {waUrl && (
            <a
              href={waUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-lg bg-[#25D366] hover:bg-[#1ebe5d] text-white text-sm font-medium transition-colors"
            >
              <MessageCircle className="h-4 w-4" /> WhatsApp
            </a>
          )}
          {contact && (
            <a
              href={`/?chat=${contact.number}`}
              className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium transition-colors"
            >
              <ExternalLink className="h-4 w-4" /> Abrir no CRM
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

const LIMIT = 2000;

function CadastrosPage() {
  const [items, setItems] = useState<Prospect[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [stats, setStats] = useState<ProspectStats | null>(null);
  const [popupProspect, setPopupProspect] = useState<Prospect | null>(null);

  const [showFilters, setShowFilters] = useState(false);
  const [filterStates, setFilterStates] = useState<string[]>([]);
  const [filterStages, setFilterStages] = useState<string[]>([]);
  const [filterHasPhone, setFilterHasPhone] = useState(false);
  const [filterHasCrm, setFilterHasCrm] = useState(false);
  const [filterHasAd, setFilterHasAd] = useState<"yes" | "no" | null>(null);
  const [filterOrigin, setFilterOrigin] = useState<"organic" | "whatsapp" | "pre-crm" | null>(null);
  const lastStateIdx = useRef(-1);
  const lastStageIdx = useRef(-1);

  const [sortBy, setSortBy] = useState<"name" | "lastContactAt" | "firstSeenAt" | "adStatus">("firstSeenAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const handleSort = (col: typeof sortBy) => {
    if (sortBy === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortBy(col); setSortDir(col === "name" ? "asc" : "desc"); }
  };

  const load = useCallback(async (p = 1, q = "") => {
    setLoading(true);
    try {
      const data = await fetchProspects({ source: "picjob_site", search: q, page: p, limit: LIMIT });
      if (p === 1) setItems(data.items || []);
      else setItems((prev) => [...prev, ...(data.items || [])]);
      setTotal(data.total || 0);
      setPage(p);
    } catch (err) {
      console.error(err);
      toast.error("Falha ao carregar cadastros");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(1, "");
    fetchProspectStats("cadastros").then(setStats).catch(() => {});
  }, [load]);

  const availableStates = useMemo(() =>
    [...new Set(items.map(p => p.state).filter((s): s is string => !!s))].sort(),
    [items]
  );
  const availableStages = useMemo(() =>
    [...new Set(items.map(p => p.crmContact?.stage?.name).filter((s): s is string => !!s))].sort(),
    [items]
  );

  const filtered = useMemo(() => {
    const f = items.filter(p => {
      if (filterStates.length > 0 && !filterStates.includes(p.state || "")) return false;
      if (filterStages.length > 0 && !filterStages.includes(p.crmContact?.stage?.name || "")) return false;
      if (filterHasPhone && !p.whatsappE164) return false;
      if (filterHasCrm && !p.crmContact) return false;
      if (filterHasAd === "yes" && p.adStatus !== 1) return false;
      if (filterHasAd === "no" && p.adStatus === 1) return false;
      if (filterOrigin === "organic" && (p.crmContact || new Date(p.firstSeenAt) < PRE_CRM_CUTOFF)) return false;
      if (filterOrigin === "whatsapp" && !p.crmContact) return false;
      if (filterOrigin === "pre-crm" && (p.crmContact || new Date(p.firstSeenAt) >= PRE_CRM_CUTOFF)) return false;
      return true;
    });
    return [...f].sort((a, b) => {
      let cmp = 0;
      if (sortBy === "name") cmp = (a.name || "").localeCompare(b.name || "", "pt-BR");
      else if (sortBy === "lastContactAt") cmp = (a.crmContact?.lastContactAt ?? 0) - (b.crmContact?.lastContactAt ?? 0);
      else if (sortBy === "adStatus") cmp = (a.adStatus ?? -1) - (b.adStatus ?? -1);
      else cmp = new Date(a.firstSeenAt).getTime() - new Date(b.firstSeenAt).getTime();
      return sortDir === "desc" ? -cmp : cmp;
    });
  }, [items, filterStates, filterStages, filterHasPhone, filterHasCrm, filterHasAd, filterOrigin, sortBy, sortDir]);

  const activeFilterCount =
    filterStates.length + filterStages.length +
    (filterHasPhone ? 1 : 0) + (filterHasCrm ? 1 : 0) +
    (filterHasAd ? 1 : 0) + (filterOrigin ? 1 : 0);

  const toggleMultiFilter = (
    value: string,
    options: string[],
    selected: string[],
    setSelected: React.Dispatch<React.SetStateAction<string[]>>,
    lastIdxRef: React.MutableRefObject<number>,
    e: React.MouseEvent
  ) => {
    const idx = options.indexOf(value);
    if (e.shiftKey && lastIdxRef.current >= 0) {
      const from = Math.min(lastIdxRef.current, idx);
      const to = Math.max(lastIdxRef.current, idx);
      setSelected(prev => [...new Set([...prev, ...options.slice(from, to + 1)])]);
    } else {
      setSelected(prev => prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]);
      lastIdxRef.current = idx;
    }
  };

  const clearFilters = () => {
    setFilterStates([]); setFilterStages([]);
    setFilterHasPhone(false); setFilterHasCrm(false);
    setFilterHasAd(null); setFilterOrigin(null);
    lastStateIdx.current = -1; lastStageIdx.current = -1;
  };

  return (
    <AppShell>
      <div className="h-full overflow-y-auto">
        <div className="w-full px-6 py-6 space-y-6">

          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Users className="h-5 w-5 text-primary" />
                <h1 className="text-2xl font-bold">Cadastros</h1>
              </div>
              <p className="text-sm text-muted-foreground">
                Usuários registrados no site PicJob
              </p>
            </div>
          </div>

          {/* Header bar */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-4 text-sm">
              <span className="text-muted-foreground">
                {filtered.length !== items.length
                  ? <><span className="font-semibold text-foreground">{filtered.length.toLocaleString("pt-BR")}</span> de {total.toLocaleString("pt-BR")} cadastros</>
                  : <><span className="font-semibold text-foreground">{total.toLocaleString("pt-BR")}</span> cadastros</>}
              </span>
              <span className="text-muted-foreground/40">·</span>
              <span className="text-muted-foreground"><span className="font-semibold text-emerald-400">{(stats?.withPhone || 0).toLocaleString("pt-BR")}</span> com WhatsApp</span>
            </div>
            <div className="flex gap-2 ml-auto">
              <Button
                variant={showFilters ? "default" : "outline"}
                size="sm"
                className={`h-9 gap-1.5 ${showFilters ? "bg-blue-600 hover:bg-blue-700 text-white border-blue-600" : ""}`}
                onClick={() => setShowFilters(v => !v)}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                Filtros
                {activeFilterCount > 0 && (
                  <span className="bg-white/20 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full ml-0.5">{activeFilterCount}</span>
                )}
                <ChevronDown className={`h-3 w-3 transition-transform ${showFilters ? "rotate-180" : ""}`} />
              </Button>
              <form onSubmit={(e) => { e.preventDefault(); load(1, search); }} className="flex gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder="Buscar por nome ou telefone…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9 h-9 w-56"
                  />
                </div>
                <Button type="submit" size="sm" className="h-9">Buscar</Button>
                {search && (
                  <Button type="button" variant="outline" size="sm" className="h-9" onClick={() => { setSearch(""); load(1, ""); }}>
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </form>
            </div>
          </div>

          {/* Filter panel */}
          {showFilters && (
            <div className="bg-card/60 border border-border rounded-xl p-4 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Filtros ativos</span>
                {activeFilterCount > 0 && (
                  <button onClick={clearFilters} className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
                    <X className="h-3 w-3" /> Limpar todos
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => setFilterHasPhone(v => !v)} className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${filterHasPhone ? "bg-emerald-500/15 border-emerald-500/50 text-emerald-400" : "border-border text-muted-foreground hover:border-foreground/30"}`}>Com WhatsApp</button>
                <button onClick={() => setFilterHasCrm(v => !v)} className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${filterHasCrm ? "bg-violet-500/15 border-violet-500/50 text-violet-400" : "border-border text-muted-foreground hover:border-foreground/30"}`}>No CRM</button>
                <button onClick={() => setFilterHasAd(v => v === "yes" ? null : "yes")} className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${filterHasAd === "yes" ? "bg-emerald-500/15 border-emerald-500/50 text-emerald-400" : "border-border text-muted-foreground hover:border-foreground/30"}`}>Com anúncio ativo</button>
                <button onClick={() => setFilterHasAd(v => v === "no" ? null : "no")} className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${filterHasAd === "no" ? "bg-amber-500/15 border-amber-500/50 text-amber-400" : "border-border text-muted-foreground hover:border-foreground/30"}`}>Sem anúncio</button>
                <button onClick={() => setFilterOrigin(v => v === "organic" ? null : "organic")} className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${filterOrigin === "organic" ? "bg-teal-500/15 border-teal-500/50 text-teal-400" : "border-border text-muted-foreground hover:border-foreground/30"}`}>Orgânicos</button>
                <button onClick={() => setFilterOrigin(v => v === "whatsapp" ? null : "whatsapp")} className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${filterOrigin === "whatsapp" ? "bg-violet-500/15 border-violet-500/50 text-violet-400" : "border-border text-muted-foreground hover:border-foreground/30"}`}>Via WhatsApp</button>
                <button onClick={() => setFilterOrigin(v => v === "pre-crm" ? null : "pre-crm")} className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${filterOrigin === "pre-crm" ? "bg-zinc-500/15 border-zinc-500/50 text-zinc-400" : "border-border text-muted-foreground hover:border-foreground/30"}`}>Pré-CRM</button>
              </div>
              {availableStates.length > 0 && (
                <div className="space-y-2">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Estado <span className="text-muted-foreground/40 font-normal normal-case">(shift+clique p/ selecionar intervalo)</span></span>
                  <div className="flex flex-wrap gap-1.5">
                    {availableStates.map((st) => (
                      <button key={st} onClick={(e) => toggleMultiFilter(st, availableStates, filterStates, setFilterStates, lastStateIdx, e)}
                        className={`text-xs px-2.5 py-1 rounded-full border font-medium transition-colors select-none ${filterStates.includes(st) ? "bg-blue-500/15 border-blue-500/50 text-blue-300" : "border-border text-muted-foreground hover:border-foreground/30"}`}>
                        {st}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {availableStages.length > 0 && (
                <div className="space-y-2">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Etapa do Funil <span className="text-muted-foreground/40 font-normal normal-case">(shift+clique p/ selecionar intervalo)</span></span>
                  <div className="flex flex-wrap gap-1.5">
                    {availableStages.map((sg) => {
                      const color = items.find(p => p.crmContact?.stage?.name === sg)?.crmContact?.stage?.color;
                      return (
                        <button key={sg} onClick={(e) => toggleMultiFilter(sg, availableStages, filterStages, setFilterStages, lastStageIdx, e)}
                          className="text-xs px-2.5 py-1 rounded-full border font-medium transition-colors select-none"
                          style={filterStages.includes(sg)
                            ? { backgroundColor: (color || "#3b82f6") + "22", borderColor: (color || "#3b82f6") + "66", color: color || "#3b82f6" }
                            : undefined}>
                          {!filterStages.includes(sg) && <span className="text-muted-foreground">{sg}</span>}
                          {filterStages.includes(sg) && sg}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Table */}
          {loading && items.length === 0 ? (
            <div className="space-y-2 py-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-14 bg-card/50 border border-border animate-pulse rounded-lg" />
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                    <th className="text-left px-3 py-2.5 font-medium w-9" />
                    <th className="text-left px-3 py-2.5 font-medium cursor-pointer hover:text-foreground select-none" onClick={() => handleSort("name")}>
                      <span className="flex items-center gap-1">Nome {sortBy === "name" ? (sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-30" />}</span>
                    </th>
                    <th className="text-left px-3 py-2.5 font-medium hidden sm:table-cell">Telefone</th>
                    <th className="text-left px-3 py-2.5 font-medium hidden md:table-cell">Localização</th>
                    <th className="text-left px-3 py-2.5 font-medium hidden lg:table-cell">Funil</th>
                    <th className="text-left px-3 py-2.5 font-medium hidden xl:table-cell">Bot</th>
                    <th className="text-left px-3 py-2.5 font-medium hidden lg:table-cell">Origem</th>
                    <th className="text-left px-3 py-2.5 font-medium hidden lg:table-cell cursor-pointer hover:text-foreground select-none" onClick={() => handleSort("adStatus")}>
                      <span className="flex items-center gap-1">Situação no site {sortBy === "adStatus" ? (sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-30" />}</span>
                    </th>
                    <th className="text-left px-3 py-2.5 font-medium hidden xl:table-cell cursor-pointer hover:text-foreground select-none" onClick={() => handleSort("lastContactAt")}>
                      <span className="flex items-center gap-1">Último contato {sortBy === "lastContactAt" ? (sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-30" />}</span>
                    </th>
                    <th className="text-left px-3 py-2.5 font-medium hidden lg:table-cell cursor-pointer hover:text-foreground select-none" onClick={() => handleSort("firstSeenAt")}>
                      <span className="flex items-center gap-1">Cadastro {sortBy === "firstSeenAt" ? (sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-30" />}</span>
                    </th>
                    <th className="w-9 px-3 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((prospect) => {
                    const phone = prospect.whatsappE164 || prospect.whatsappDisplay;
                    const waUrl = phone ? `https://wa.me/${phone.replace(/\D/g, "")}` : null;
                    const initials = prospect.name.slice(0, 2).toUpperCase();
                    const stage = prospect.crmContact?.stage;
                    const stageColor = stage?.color || undefined;
                    const lastContactAt = prospect.crmContact?.lastContactAt;
                    const botEnabled = prospect.crmContact?.botEnabled;
                    const hasCrm = !!prospect.crmContact;

                    return (
                      <tr
                        key={prospect.id}
                        onClick={() => setPopupProspect(prospect)}
                        className="border-b border-border/50 last:border-0 cursor-pointer transition-colors hover:bg-muted/20"
                        style={stageColor ? { borderLeft: `3px solid ${stageColor}40` } : { borderLeft: "3px solid transparent" }}
                      >
                        <td className="px-3 py-2.5">
                          {prospect.thumbUrl ? (
                            <img src={prospect.thumbUrl} alt="" className="w-8 h-8 rounded-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                          ) : (
                            <div className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold"
                              style={stageColor ? { backgroundColor: stageColor + "22", color: stageColor } : { backgroundColor: "hsl(var(--muted))", color: "hsl(var(--muted-foreground))" }}>
                              {initials}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2.5 max-w-[200px]">
                          <span className="font-medium truncate block">{prospect.name}</span>
                        </td>
                        <td className="px-3 py-2.5 hidden sm:table-cell">
                          {phone ? (
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-mono text-foreground/80">{phone}</span>
                              <a href={waUrl!} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
                                className="text-[#25D366] hover:text-[#1ebe5d] transition-colors flex-shrink-0" title="Abrir no WhatsApp">
                                <MessageCircle className="h-3.5 w-3.5" />
                              </a>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground/40 italic">Sem telefone</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 hidden md:table-cell">
                          {prospect.city || prospect.state ? (
                            <div className="flex flex-col gap-0.5">
                              {prospect.city && <span className="text-xs text-foreground/80 truncate max-w-[120px]">{prospect.city}</span>}
                              {prospect.state && <span className="text-[10px] font-mono text-muted-foreground">{prospect.state}</span>}
                            </div>
                          ) : <span className="text-xs text-muted-foreground/40 italic">–</span>}
                        </td>
                        <td className="px-3 py-2.5 hidden lg:table-cell">
                          {stage ? (
                            <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full border whitespace-nowrap"
                              style={{ backgroundColor: stageColor + "22", color: stageColor, borderColor: stageColor + "44" }}>
                              {stage.name}
                            </span>
                          ) : <span className="text-[11px] text-muted-foreground/30 italic">–</span>}
                        </td>
                        <td className="px-3 py-2.5 hidden xl:table-cell">
                          {hasCrm ? (
                            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${botEnabled ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" : "bg-muted/40 text-muted-foreground border-border"}`}>
                              {botEnabled ? "Bot ativo" : "Bot off"}
                            </span>
                          ) : <span className="text-xs text-muted-foreground/30">–</span>}
                        </td>
                        <td className="px-3 py-2.5 hidden lg:table-cell">
                          <OriginBadge hasCrm={hasCrm} firstSeenAt={prospect.firstSeenAt} />
                        </td>
                        <td className="px-3 py-2.5 hidden lg:table-cell">
                          <AdStatusBadge status={prospect.adStatus} />
                        </td>
                        <td className="px-3 py-2.5 hidden xl:table-cell">
                          {lastContactAt ? (
                            <span className="text-xs text-muted-foreground" title={new Date(lastContactAt * 1000).toLocaleString("pt-BR")}>
                              {timeAgo(lastContactAt * 1000)}
                            </span>
                          ) : <span className="text-xs text-muted-foreground/30">–</span>}
                        </td>
                        <td className="px-3 py-2.5 hidden lg:table-cell">
                          <span className="text-xs text-muted-foreground" title={new Date(prospect.firstSeenAt).toLocaleString("pt-BR")}>
                            {timeAgo(new Date(prospect.firstSeenAt).getTime())}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <button onClick={(e) => { e.stopPropagation(); setPopupProspect(prospect); }}
                            className="text-muted-foreground/30 hover:text-foreground transition-colors">
                            <ExternalLink className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {filtered.length === 0 && !loading && (
                    <tr>
                      <td colSpan={11} className="px-3 py-12 text-center text-muted-foreground">
                        {activeFilterCount > 0 ? "Nenhum cadastro corresponde aos filtros selecionados." : "Nenhum cadastro encontrado."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {items.length < total && (
            <div className="flex justify-center pt-2">
              <Button variant="outline" size="sm" onClick={() => load(page + 1, search)} disabled={loading} className="gap-2">
                {loading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : null}
                Carregar mais ({(total - items.length).toLocaleString("pt-BR")} restantes)
              </Button>
            </div>
          )}

        </div>
      </div>

      {popupProspect && (
        <ContactPopup prospect={popupProspect} onClose={() => setPopupProspect(null)} />
      )}
    </AppShell>
  );
}

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Search, RefreshCw, Trash2, ChevronLeft, ChevronRight, ChevronDown,
  Radio, Database, Wifi, Send, SlidersHorizontal, X, Check,
  Building2, Globe,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Prospect, ProspectStats, ScrapeJobState,
  fetchProspects, fetchProspectStats, fetchScrapeStatus,
  triggerScrape, clearProspects,
} from "@/lib/evolution-api";

export const Route = createFileRoute("/radar")({
  head: () => ({
    meta: [
      { title: "Radar — CRM PicJob" },
      { name: "description", content: "Mapeamento de leads dos portais concorrentes." },
    ],
  }),
  component: RadarPage,
});

const SOURCES_LABELS: Record<string, string> = {
  fatalmodel: "Fatal Model",
  skokka: "Skokka",
  fotoacomp: "PhotoAcomp",
};

const STATES = [
  { code: "RN", label: "Rio Grande do Norte" },
  { code: "CE", label: "Ceará" },
  { code: "PB", label: "Paraíba" },
  { code: "PE", label: "Pernambuco" },
  { code: "AL", label: "Alagoas" },
  { code: "BA", label: "Bahia" },
  { code: "SP", label: "São Paulo" },
  { code: "RJ", label: "Rio de Janeiro" },
  { code: "MG", label: "Minas Gerais" },
  { code: "PR", label: "Paraná" },
  { code: "SC", label: "Santa Catarina" },
  { code: "RS", label: "Rio Grande do Sul" },
];

function SourceBadge({ source }: { source: string }) {
  const colors: Record<string, string> = {
    fatalmodel: "bg-rose-500/20 text-rose-300 border-rose-500/30",
    skokka: "bg-orange-500/20 text-orange-300 border-orange-500/30",
    fotoacomp: "bg-violet-500/20 text-violet-300 border-violet-500/30",
  };
  return (
    <span
      className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${colors[source] || "bg-muted text-muted-foreground border-border"}`}
    >
      {SOURCES_LABELS[source] || source}
    </span>
  );
}

function ProspectCard({
  prospect,
  selected,
  onToggle,
}: {
  prospect: Prospect;
  selected: boolean;
  onToggle: (p: Prospect) => void;
}) {
  const initials = prospect.name.slice(0, 2).toUpperCase();

  return (
    <div
      onClick={() => onToggle(prospect)}
      className={`group relative bg-card border rounded-xl overflow-hidden cursor-pointer transition-all duration-200 hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5 ${
        selected
          ? "border-primary ring-2 ring-primary/30 shadow-md shadow-primary/10"
          : "border-border"
      }`}
    >
      {/* Checkbox */}
      <div
        className={`absolute top-2 right-2 z-10 h-5 w-5 rounded-full border-2 flex items-center justify-center transition-all ${
          selected
            ? "bg-primary border-primary"
            : "bg-black/40 border-white/30 group-hover:border-white/60"
        }`}
      >
        {selected && <Check className="h-3 w-3 text-white" />}
      </div>

      {/* Thumbnail */}
      <div className="aspect-[4/5] bg-muted relative overflow-hidden">
        {prospect.thumbUrl ? (
          <img
            src={prospect.thumbUrl}
            alt={prospect.name}
            className="w-full h-full object-cover"
            loading="lazy"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        ) : null}
        {/* Fallback / gradient overlay */}
        <div className="absolute inset-0 flex items-end">
          <div className="w-full bg-gradient-to-t from-black/80 via-black/20 to-transparent p-2">
            {!prospect.thumbUrl && (
              <span className="block text-center text-2xl font-bold text-white/40 mb-1">
                {initials}
              </span>
            )}
          </div>
        </div>
        {/* Multi-portal badge */}
        {prospect.sources.length >= 2 && (
          <div className="absolute top-2 left-2 bg-primary text-primary-foreground text-[9px] font-bold px-1.5 py-0.5 rounded">
            {prospect.sources.length}×
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3 space-y-2">
        <p className="font-semibold text-sm truncate">{prospect.name}</p>
        {prospect.city && (
          <p className="text-[11px] text-muted-foreground flex items-center gap-1">
            <Building2 className="h-3 w-3 shrink-0" />
            <span className="truncate">{prospect.city}</span>
          </p>
        )}
        {prospect.whatsappDisplay && (
          <p className="text-[11px] text-emerald-400 font-mono">
            {prospect.whatsappDisplay}
          </p>
        )}
        {!prospect.whatsappDisplay && (
          <p className="text-[11px] text-muted-foreground/50 italic">Sem WhatsApp</p>
        )}
        <div className="flex flex-wrap gap-1 pt-0.5">
          {prospect.sources.map((s) => (
            <SourceBadge key={s} source={s} />
          ))}
        </div>
      </div>
    </div>
  );
}

function ScrapeStatusBanner({ jobState }: { jobState: ScrapeJobState | null }) {
  if (!jobState || jobState.status === "idle") return null;

  const colors = {
    running: "border-primary/40 bg-primary/5 text-primary",
    done: "border-emerald-500/40 bg-emerald-500/5 text-emerald-400",
    error: "border-destructive/40 bg-destructive/5 text-destructive",
  };

  const color = colors[jobState.status as keyof typeof colors] || colors.done;

  return (
    <div className={`border rounded-lg px-4 py-3 text-sm flex items-center gap-3 ${color}`}>
      {jobState.status === "running" && (
        <RefreshCw className="h-4 w-4 animate-spin shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <span className="font-medium capitalize">{jobState.status}</span>
        {" — "}
        <span className="opacity-80">{jobState.message}</span>
        {jobState.status === "running" && (
          <span className="text-[11px] opacity-60 ml-2">
            FM: {jobState.counts.fatalmodel} · SK: {jobState.counts.skokka} · PA: {jobState.counts.fotoacomp}
          </span>
        )}
      </div>
      {jobState.status === "done" && (
        <span className="text-[11px] opacity-70 shrink-0">
          {jobState.counts.upserted} salvos
        </span>
      )}
    </div>
  );
}

function RadarPage() {
  const navigate = useNavigate();

  // Data
  const [stats, setStats] = useState<ProspectStats | null>(null);
  const [items, setItems] = useState<Prospect[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [jobState, setJobState] = useState<ScrapeJobState | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [filterState, setFilterState] = useState("RN");
  const [filterCity, setFilterCity] = useState("");
  const [filterSource, setFilterSource] = useState("");
  const [filterPhone, setFilterPhone] = useState(false);
  const [page, setPage] = useState(1);
  const LIMIT = 50;

  // Tree UI state
  const [expandedStates, setExpandedStates] = useState<Set<string>>(new Set(["RN"]));

  // Selection
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Scrape modal
  const [showScrapeModal, setShowScrapeModal] = useState(false);
  const [scrapeStates, setScrapeStates] = useState<string[]>(["rn"]);
  const [scrapeMode, setScrapeMode] = useState<"state" | "city">("state");
  const [scrapeCitiesText, setScrapeCitiesText] = useState("");
  const [singleScrapeState, setSingleScrapeState] = useState("rn");
  const [scraping, setScraping] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load prospects
  const loadProspects = useCallback(
    async (isBackground = false) => {
      if (!isBackground) setLoading(true);
      try {
        const res = await fetchProspects({
          state: filterState || undefined,
          city: filterCity || undefined,
          source: filterSource || undefined,
          search: search.trim() || undefined,
          page,
          limit: LIMIT,
          withPhone: filterPhone || undefined,
        });
        setItems(res.items);
        setTotal(res.total);
      } catch (e) {
        if (!isBackground) {
          console.error(e);
          toast.error("Falha ao carregar prospects");
        }
      } finally {
        if (!isBackground) setLoading(false);
      }
    },
    [filterState, filterCity, filterSource, search, page, filterPhone]
  );

  const loadStats = useCallback(async () => {
    try {
      const s = await fetchProspectStats();
      setStats(s);
    } catch {
      /* silencia */
    }
  }, []);

  const checkJobStatus = useCallback(async () => {
    try {
      const state = await fetchScrapeStatus();
      setJobState(state);
      if (state.status === "done" || state.status === "error") {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = null;
        setScraping(false);
        if (state.status === "done") {
          toast.success(`Scraping concluído! ${state.counts.upserted} leads salvos.`);
          loadProspects();
          loadStats();
        } else {
          toast.error(`Erro no scraping: ${state.error}`);
        }
      }
    } catch {
      /* silencia */
    }
  }, [loadProspects, loadStats]);

  useEffect(() => {
    loadProspects();
  }, [loadProspects]);

  useEffect(() => {
    loadStats();
    checkJobStatus();
  }, []);

  // Poll while running
  useEffect(() => {
    if (scraping) {
      pollRef.current = setInterval(checkJobStatus, 3000);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [scraping, checkJobStatus]);

  // Reset page on filter change
  useEffect(() => {
    setPage(1);
  }, [filterState, filterCity, filterSource, search, filterPhone]);

  // Handlers
  const handleToggle = (p: Prospect) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(p.id)) next.delete(p.id);
      else next.add(p.id);
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selected.size === items.length && items.length > 0) {
      setSelected(new Set());
    } else {
      setSelected(new Set(items.map((p) => p.id)));
    }
  };

  const handleSendToDisparos = () => {
    const selectedItems = items.filter((p) => selected.has(p.id));
    const withPhone = selectedItems.filter((p) => p.whatsappE164);
    if (withPhone.length === 0) {
      toast.error("Nenhum prospect selecionado tem WhatsApp");
      return;
    }
    const numbers = withPhone.map((p) => p.whatsappE164!).join("\n");
    // Salva no sessionStorage para a tela de Disparos carregar
    sessionStorage.setItem("radar_numbers", numbers);
    toast.success(`${withPhone.length} números enviados para Disparos`);
    navigate({ to: "/disparos" });
  };

  const handleStartScrape = async () => {
    setScraping(true);
    setShowScrapeModal(false);
    try {
      if (scrapeMode === "city") {
        const parsedCities = scrapeCitiesText
          .split(",")
          .map((c) => c.trim())
          .filter((c) => c.length > 0);
        await triggerScrape([singleScrapeState], parsedCities);
      } else {
        await triggerScrape(scrapeStates, []);
      }
      // Inicia polling
      pollRef.current = setInterval(checkJobStatus, 3000);
      await checkJobStatus();
    } catch (e: any) {
      setScraping(false);
      toast.error(e.message || "Falha ao iniciar scraping");
    }
  };

  const handleClear = async () => {
    if (!confirm("Limpar TODOS os prospects do banco? Isso não pode ser desfeito.")) return;
    try {
      const res = await clearProspects();
      toast.success(`${res.deleted} prospects removidos`);
      loadProspects();
      loadStats();
    } catch {
      toast.error("Falha ao limpar prospects");
    }
  };

  const toggleStateExpanded = (stateCode: string) => {
    setExpandedStates((prev) => {
      const next = new Set(prev);
      if (next.has(stateCode)) next.delete(stateCode);
      else next.add(stateCode);
      return next;
    });
  };

  const totalPages = Math.ceil(total / LIMIT);
  const selectedItems = items.filter((p) => selected.has(p.id));
  const selectedWithPhone = selectedItems.filter((p) => p.whatsappE164);

  // Group stats for the sidebar tree
  const groupedStats = stats?.byStateCity?.reduce((acc, curr) => {
    const state = curr.state || "N/A";
    if (!acc[state]) {
      acc[state] = {
        total: 0,
        cities: [] as { city: string; count: number }[],
      };
    }
    acc[state].total += curr.count;
    if (curr.city) {
      acc[state].cities.push({ city: curr.city, count: curr.count });
    }
    return acc;
  }, {} as Record<string, { total: number; cities: { city: string; count: number }[] }>);

  // Sort states by count descending, and cities descending
  const sortedGroupedStats = groupedStats
    ? Object.entries(groupedStats)
        .sort((a, b) => b[1].total - a[1].total)
        .map(([stateCode, data]) => {
          const sortedCities = [...data.cities].sort((a, b) => b.count - a.count);
          return [stateCode, { ...data, cities: sortedCities }] as const;
        })
    : [];

  return (
    <AppShell>
      <div className="h-full overflow-y-auto">
        <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Radio className="h-5 w-5 text-primary" />
                <h1 className="text-2xl font-bold">Radar de Prospects</h1>
              </div>
              <p className="text-sm text-muted-foreground">
                Leads captados dos portais concorrentes — use como lista nos Disparos
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowScrapeModal(true)}
                disabled={scraping}
                className="gap-2"
              >
                {scraping ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Globe className="h-4 w-4" />
                )}
                {scraping ? "Raspando..." : "Atualizar Radar"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClear}
                className="gap-2 text-destructive hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
                Limpar
              </Button>
            </div>
          </div>

          {/* Status banner */}
          <ScrapeStatusBanner jobState={jobState} />

          {/* Stats */}
          {stats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: "Total de Leads", value: stats.total, icon: Database },
                { label: "Com WhatsApp", value: stats.withPhone, icon: Wifi, accent: true },
                { label: "Em 2+ Portais", value: stats.multiPortal, icon: Globe },
                {
                  label: "Sem WhatsApp",
                  value: stats.total - stats.withPhone,
                  icon: Database,
                },
              ].map((s) => (
                <div
                  key={s.label}
                  className="bg-card border border-border rounded-xl p-4 flex flex-col gap-1"
                >
                  <s.icon
                    className={`h-4 w-4 ${s.accent ? "text-emerald-400" : "text-muted-foreground"}`}
                  />
                  <span
                    className={`text-3xl font-bold tracking-tight ${s.accent ? "text-emerald-400" : ""}`}
                  >
                    {s.value.toLocaleString("pt-BR")}
                  </span>
                  <span className="text-xs text-muted-foreground">{s.label}</span>
                </div>
              ))}
            </div>
          )}

          {/* Por portal */}
          {stats && (
            <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
              <span>
                Fontes:{" "}
                <strong className="text-rose-400">
                  {stats.bySource.fatalmodel} Fatal Model
                </strong>{" "}
                ·{" "}
                <strong className="text-orange-400">
                  {stats.bySource.skokka} Skokka
                </strong>{" "}
                ·{" "}
                <strong className="text-violet-400">
                  {stats.bySource.fotoacomp} PhotoAcomp
                </strong>
              </span>
            </div>
          )}

          {/* Layout Split: Tree Sidebar + Main Content */}
          <div className="flex flex-col lg:flex-row gap-6 items-start">
            {/* Left Sidebar Tree */}
            <div className="w-full lg:w-64 shrink-0 bg-card border border-border rounded-xl p-4 space-y-4 shadow-sm">
              <div>
                <h3 className="font-semibold text-xs text-muted-foreground uppercase tracking-wider mb-3">
                  Localização
                </h3>
                <div className="space-y-1">
                  {/* Todos os Leads button */}
                  <button
                    onClick={() => {
                      setFilterState("");
                      setFilterCity("");
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      !filterState && !filterCity
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Globe className="h-4 w-4 shrink-0" />
                      <span>Todos os Leads</span>
                    </div>
                    <span className="text-[10px] bg-muted px-2 py-0.5 rounded-full font-mono font-semibold">
                      {stats?.total || 0}
                    </span>
                  </button>

                  <div className="pt-2 space-y-1 border-t border-border/50 mt-2">
                    {sortedGroupedStats.map(([stateCode, data]) => {
                      const isExpanded = expandedStates.has(stateCode);
                      const isSelected = filterState === stateCode && !filterCity;
                      const stateLabel =
                        STATES.find((s) => s.code === stateCode)?.label || stateCode;

                      return (
                        <div key={stateCode} className="space-y-0.5">
                          <div className="flex items-center w-full group gap-0.5">
                            <button
                              onClick={() => toggleStateExpanded(stateCode)}
                              className="p-1 hover:bg-accent rounded text-muted-foreground hover:text-foreground transition-colors shrink-0"
                            >
                              {isExpanded ? (
                                <ChevronDown className="h-3.5 w-3.5" />
                              ) : (
                                <ChevronRight className="h-3.5 w-3.5" />
                              )}
                            </button>

                            <button
                              onClick={() => {
                                setFilterState(stateCode);
                                setFilterCity("");
                              }}
                              className={`flex-1 flex items-center justify-between px-2.5 py-1 rounded-md text-sm font-medium text-left transition-colors truncate ${
                                isSelected
                                  ? "bg-primary/10 text-primary font-semibold"
                                  : "text-foreground hover:bg-accent/60"
                              }`}
                            >
                              <span className="truncate" title={`${stateCode} — ${stateLabel}`}>
                                {stateCode} — {stateLabel}
                              </span>
                              <span className="text-[10px] bg-muted px-1.5 py-0.25 rounded-full font-mono shrink-0 ml-1">
                                {data.total}
                              </span>
                            </button>
                          </div>

                          {isExpanded && (
                            <div className="pl-5 space-y-0.5 border-l border-border/50 ml-3.5 mt-0.5">
                              {data.cities.length === 0 ? (
                                <span className="block px-2.5 py-1 text-xs text-muted-foreground/60 italic">
                                  Sem cidades
                                </span>
                              ) : (
                                data.cities.map(({ city, count }) => {
                                  const isCitySelected =
                                    filterState === stateCode && filterCity === city;
                                  return (
                                    <button
                                      key={city}
                                      onClick={() => {
                                        setFilterState(stateCode);
                                        setFilterCity(city);
                                      }}
                                      className={`w-full flex items-center justify-between px-2.5 py-1 rounded-md text-xs font-medium text-left transition-colors truncate ${
                                        isCitySelected
                                          ? "bg-primary/10 text-primary font-semibold"
                                          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                                      }`}
                                    >
                                      <span className="truncate" title={city}>
                                        {city}
                                      </span>
                                      <span className="text-[9px] opacity-75 font-mono shrink-0 ml-1">
                                        {count}
                                      </span>
                                    </button>
                                  );
                                })
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 w-full space-y-6">
              {/* Toolbar: filtros + seleção */}
              <div className="flex flex-wrap gap-2 items-center">
                {/* Busca */}
                <div className="relative flex-1 min-w-48 max-w-72">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por nome..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9 bg-input border-border h-9 text-sm"
                  />
                  {search && (
                    <button
                      onClick={() => setSearch("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {/* State sync dropdown (mostly for visual/manual fallback) */}
                <select
                  value={filterState}
                  onChange={(e) => {
                    setFilterState(e.target.value);
                    setFilterCity("");
                  }}
                  className="h-9 px-2 text-sm bg-input border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
                >
                  <option value="">Todos os estados</option>
                  {STATES.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.code} — {s.label}
                    </option>
                  ))}
                </select>

                {/* Fonte */}
                <select
                  value={filterSource}
                  onChange={(e) => setFilterSource(e.target.value)}
                  className="h-9 px-2 text-sm bg-input border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
                >
                  <option value="">Todos os portais</option>
                  <option value="fatalmodel">Fatal Model</option>
                  <option value="skokka">Skokka</option>
                  <option value="fotoacomp">PhotoAcomp</option>
                </select>

                {/* Filtro WhatsApp */}
                <button
                  onClick={() => setFilterPhone((v) => !v)}
                  className={`h-9 px-3 text-sm rounded-md border transition-colors flex items-center gap-1.5 ${
                    filterPhone
                      ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-400"
                      : "bg-input border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Wifi className="h-3.5 w-3.5" />
                  Com WhatsApp
                </button>

                <div className="ml-auto flex items-center gap-2">
                  {/* Seleção */}
                  {items.length > 0 && (
                    <button
                      onClick={handleSelectAll}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {selected.size === items.length
                        ? "Desselecionar todos"
                        : `Selecionar ${items.length}`}
                    </button>
                  )}

                  {/* Enviar para Disparos */}
                  {selected.size > 0 && (
                    <Button
                      size="sm"
                      onClick={handleSendToDisparos}
                      className="gap-2 bg-emerald-600 hover:bg-emerald-500 text-white"
                    >
                      <Send className="h-3.5 w-3.5" />
                      Usar em Disparos ({selectedWithPhone.length} com WhatsApp)
                    </Button>
                  )}
                </div>
              </div>

              {/* Active Filter Badges */}
              {(filterState || filterCity || filterSource || filterPhone || search) && (
                <div className="flex flex-wrap gap-1.5 items-center bg-muted/20 border border-border/50 p-2 rounded-lg">
                  <span className="text-xs text-muted-foreground mr-1">Filtros ativos:</span>
                  {filterState && (
                    <span className="text-xs bg-primary/10 border border-primary/20 text-primary px-2 py-0.5 rounded-full flex items-center gap-1">
                      Estado: {filterState}
                      <button
                        onClick={() => {
                          setFilterState("");
                          setFilterCity("");
                        }}
                        className="hover:text-foreground font-bold"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  )}
                  {filterCity && (
                    <span className="text-xs bg-primary/10 border border-primary/20 text-primary px-2 py-0.5 rounded-full flex items-center gap-1">
                      Cidade: {filterCity}
                      <button
                        onClick={() => setFilterCity("")}
                        className="hover:text-foreground font-bold"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  )}
                  {filterSource && (
                    <span className="text-xs bg-primary/10 border border-primary/20 text-primary px-2 py-0.5 rounded-full flex items-center gap-1">
                      Portal: {SOURCES_LABELS[filterSource] || filterSource}
                      <button onClick={() => setFilterSource("")} className="hover:text-foreground font-bold">
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  )}
                  {filterPhone && (
                    <span className="text-xs bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full flex items-center gap-1">
                      Com WhatsApp
                      <button onClick={() => setFilterPhone(false)} className="hover:text-foreground font-bold">
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  )}
                  {search && (
                    <span className="text-xs bg-primary/10 border border-primary/20 text-primary px-2 py-0.5 rounded-full flex items-center gap-1">
                      Busca: "{search}"
                      <button onClick={() => setSearch("")} className="hover:text-foreground font-bold">
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  )}
                  <button
                    onClick={() => {
                      setFilterState("");
                      setFilterCity("");
                      setFilterSource("");
                      setFilterPhone(false);
                      setSearch("");
                    }}
                    className="text-xs text-muted-foreground hover:text-foreground underline ml-auto pl-2"
                  >
                    Limpar tudo
                  </button>
                </div>
              )}

              {/* Contagem */}
              <div className="text-xs text-muted-foreground flex justify-between items-center">
                <span>
                  {total.toLocaleString("pt-BR")} prospects encontrados
                  {selected.size > 0 && (
                    <span className="text-primary ml-2 font-medium">
                      · {selected.size} selecionados
                    </span>
                  )}
                </span>
                {filterCity && (
                  <span className="font-semibold text-primary">
                    Mostrando resultados para {filterCity} — {filterState}
                  </span>
                )}
              </div>

              {/* Grid de cards */}
              {loading ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                  {Array.from({ length: 12 }).map((_, i) => (
                    <div key={i} className="bg-card border border-border rounded-xl overflow-hidden animate-pulse">
                      <div className="aspect-[4/5] bg-muted" />
                      <div className="p-3 space-y-2">
                        <div className="h-3 bg-muted rounded w-3/4" />
                        <div className="h-2.5 bg-muted rounded w-1/2" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : items.length === 0 ? (
                <div className="text-center py-20 text-muted-foreground border border-dashed border-border rounded-xl">
                  <Radio className="h-12 w-12 mx-auto mb-3 opacity-20" />
                  <p className="font-medium">Nenhum prospect encontrado</p>
                  <p className="text-sm mt-1">
                    {total === 0
                      ? 'Clique em "Atualizar Radar" para raspar os portais'
                      : "Tente ajustar os filtros"}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                  {items.map((p) => (
                    <ProspectCard
                      key={p.id}
                      prospect={p}
                      selected={selected.has(p.id)}
                      onToggle={handleToggle}
                    />
                  ))}
                </div>
              )}

              {/* Paginação */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-3 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Página {page} de {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modal de Scraping */}
      {showScrapeModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Globe className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h2 className="font-semibold text-lg">Atualizar Radar</h2>
                  <p className="text-xs text-muted-foreground">
                    Escolha o modo de captura de prospects
                  </p>
                </div>
              </div>

              {/* Mode Toggle */}
              <div className="flex bg-muted p-1 rounded-lg">
                <button
                  type="button"
                  onClick={() => setScrapeMode("state")}
                  className={`flex-1 text-xs py-1.5 rounded-md font-medium transition-colors ${
                    scrapeMode === "state"
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Estado Inteiro
                </button>
                <button
                  type="button"
                  onClick={() => setScrapeMode("city")}
                  className={`flex-1 text-xs py-1.5 rounded-md font-medium transition-colors ${
                    scrapeMode === "city"
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Cidades Específicas
                </button>
              </div>

              {scrapeMode === "state" ? (
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {STATES.map((s) => {
                    const code = s.code.toLowerCase();
                    const checked = scrapeStates.includes(code);
                    return (
                      <label
                        key={s.code}
                        className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-accent/55 cursor-pointer transition-colors"
                      >
                        <div
                          className={`h-4 w-4 rounded border-2 flex items-center justify-center transition-colors ${
                            checked
                              ? "bg-primary border-primary"
                              : "border-border"
                          }`}
                        >
                          {checked && <Check className="h-2.5 w-2.5 text-white" />}
                        </div>
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={checked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setScrapeStates((prev) => [...prev, code]);
                            } else {
                              setScrapeStates((prev) =>
                                prev.filter((c) => c !== code)
                              );
                            }
                          }}
                        />
                        <span className="text-sm">
                          <strong>{s.code}</strong>{" "}
                          <span className="text-muted-foreground">— {s.label}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground">Estado Alvo</label>
                    <select
                      value={singleScrapeState}
                      onChange={(e) => setSingleScrapeState(e.target.value)}
                      className="w-full h-9 px-2 text-sm bg-input border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
                    >
                      {STATES.map((s) => (
                        <option key={s.code} value={s.code.toLowerCase()}>
                          {s.code} — {s.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground flex justify-between">
                      <span>Cidades (separadas por vírgula)</span>
                      <span className="text-[10px] text-muted-foreground/60 italic font-normal">Ex: Natal, Mossoró</span>
                    </label>
                    <textarea
                      placeholder="Natal, Mossoró, Caicó..."
                      value={scrapeCitiesText}
                      onChange={(e) => setScrapeCitiesText(e.target.value)}
                      rows={3}
                      className="w-full p-2 text-sm bg-input border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary text-foreground placeholder:text-muted-foreground/50 resize-none"
                    />
                  </div>
                </div>
              )}

              <div className="p-3 bg-muted/30 rounded-lg text-[11px] text-muted-foreground space-y-1">
                <p>⏱ Tempo estimado: ~5–15 min por estado/cidade</p>
                <p>🔄 Roda em background (pode fechar esta janela)</p>
                <p>📊 Portais: Fatal Model, Skokka (cidades específicas) e PhotoAcomp</p>
              </div>

              <div className="flex gap-3 pt-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setShowScrapeModal(false)}
                >
                  Cancelar
                </Button>
                <Button
                  className="flex-1 gap-2"
                  disabled={scrapeMode === "state" ? scrapeStates.length === 0 : !scrapeCitiesText.trim()}
                  onClick={handleStartScrape}
                >
                  <Globe className="h-4 w-4" />
                  Iniciar
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

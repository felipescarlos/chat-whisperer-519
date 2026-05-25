import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Folder, FolderOpen, ChevronRight, Search,
  Database, Wifi, Building2, Globe, ArrowLeft, Home, FileSpreadsheet,
  RefreshCw, MessageCircle, MapPin
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Prospect, ProspectStats,
  fetchProspects, fetchProspectStats,
  triggerScrape, fetchScrapeStatus,
} from "@/lib/evolution-api";

export const Route = createFileRoute("/banco-de-dados")({
  head: () => ({
    meta: [
      { title: "Banco de Dados — CRM PicJob" },
      { name: "description", content: "Organização e exportação de leads capturados." },
    ],
  }),
  component: BancoDeDadosPage,
});

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

const SOURCES_LABELS: Record<string, string> = {
  fatalmodel: "Fatal Model",
  skokka: "Skokka",
  fotoacomp: "PhotoAcomp",
};

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

const LIMIT = 32;

function BancoDeDadosPage() {
  // Navigation Path: "" (Root/States) -> "STATE_CODE" (Cities) -> "STATE_CODE/CITY" (Leads)
  const [filterState, setFilterState] = useState("");
  const [filterCity, setFilterCity] = useState("");

  // Data
  const [stats, setStats] = useState<ProspectStats | null>(null);
  const [items, setItems] = useState<Prospect[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);

  // Load stats
  const loadStats = useCallback(async () => {
    try {
      const res = await fetchProspectStats();
      setStats(res);
    } catch (err) {
      console.error(err);
      toast.error("Falha ao carregar estatísticas do banco");
    }
  }, []);

  // Load prospects for a city
  const loadProspects = useCallback(async () => {
    if (!filterState || !filterCity) return;
    setLoading(true);
    try {
      const data = await fetchProspects({
        state: filterState,
        city: filterCity,
        search: searchQuery,
        page,
        limit: LIMIT,
      });
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch (err) {
      console.error(err);
      toast.error("Falha ao carregar leads");
    } finally {
      setLoading(false);
    }
  }, [filterState, filterCity, searchQuery, page]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  useEffect(() => {
    if (filterState && filterCity) {
      setPage(1);
      loadProspects();
    } else {
      setItems([]);
      setTotal(0);
    }
  }, [filterState, filterCity, loadProspects]);

  // Load prospects when page changes or search query changes (debounced/triggered manually)
  useEffect(() => {
    if (filterState && filterCity) {
      loadProspects();
    }
  }, [page, loadProspects]);

  // Trigger search on Enter or Button click
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    loadProspects();
  };

  // Refresh state for city folders
  const [refreshingCity, setRefreshingCity] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleRefreshCity = useCallback(async (city: string, stateCode: string, e: React.MouseEvent) => {
    e.stopPropagation(); // não navega para a cidade ao clicar no botão
    if (refreshingCity) return;
    setRefreshingCity(city);

    try {
      // Conta quantos existem ANTES do scrape
      const before = await fetchProspects({ state: stateCode, city, limit: 1 });
      const beforeCount = before.total;

      // Normaliza o nome da cidade para o scraper (minúsculo, sem acento)
      const citySlug = city.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, "-");

      await triggerScrape([stateCode.toLowerCase()], [citySlug], ["fatalmodel", "skokka", "photoacomp"]);

      // Aguarda o job terminar (polling a cada 5s)
      await new Promise<void>((resolve) => {
        pollRef.current = setInterval(async () => {
          try {
            const status = await fetchScrapeStatus();
            if (status.status !== "running") {
              clearInterval(pollRef.current!);
              resolve();
            }
          } catch {
            clearInterval(pollRef.current!);
            resolve();
          }
        }, 5000);
      });

      // Conta quantos existem DEPOIS
      const after = await fetchProspects({ state: stateCode, city, limit: 1 });
      const afterCount = after.total;
      const newLeads = afterCount - beforeCount;
      const alreadyInDB = afterCount - newLeads;

      const status = await fetchScrapeStatus();
      const found = status.counts?.total ?? afterCount;

      toast.success(
        `${city}: ${found} encontrados — ${newLeads} novos, ${alreadyInDB} já estavam no banco.`,
        { duration: 8000 }
      );

      loadStats();
      if (filterCity === city) loadProspects();
    } catch (err) {
      console.error(err);
      toast.error(`Erro ao atualizar ${city}`);
    } finally {
      setRefreshingCity(null);
    }
  }, [refreshingCity, filterCity, loadStats, loadProspects]);

  // Group stats for folder view
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

  // Sort states by count descending
  const sortedStates = groupedStats
    ? Object.entries(groupedStats)
        .sort((a, b) => b[1].total - a[1].total)
        .map(([stateCode, data]) => {
          const sortedCities = [...data.cities].sort((a, b) => b.count - a.count);
          return [stateCode, { ...data, cities: sortedCities }] as const;
        })
    : [];

  const handleExportCSV = async () => {
    if (!filterState || !filterCity) return;
    try {
      toast.info("Preparando planilha para download...");
      const data = await fetchProspects({
        state: filterState,
        city: filterCity,
        limit: 5000,
      });
      
      if (!data.items || data.items.length === 0) {
        toast.error("Nenhum prospect encontrado nesta cidade.");
        return;
      }

      // Headers for CSV
      const headers = ["Nome do Anúncio", "WhatsApp", "Cidade", "Estado", "Portais"];
      const rows = data.items.map(p => {
        const portals = p.sources ? p.sources.map(s => SOURCES_LABELS[s] || s).join(", ") : "";
        return [
          p.name,
          p.whatsappE164 || "Sem WhatsApp",
          p.city || "",
          p.state || "",
          portals
        ];
      });

      // UTF-8 CSV with semicolon separators (excellent Excel compatibility)
      const csvContent = [
        headers.join(";"),
        ...rows.map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(";"))
      ].join("\n");

      const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `leads_${filterState.toLowerCase()}_${filterCity.toLowerCase().replace(/\s+/g, "_")}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success("Planilha baixada com sucesso!");
    } catch (err) {
      console.error(err);
      toast.error("Falha ao exportar planilha.");
    }
  };

  const currentStateData = sortedStates.find(([code]) => code === filterState)?.[1];
  const currentCityCount = currentStateData?.cities.find((c) => c.city === filterCity)?.count || 0;
  const stateLabel = STATES.find((s) => s.code === filterState)?.label || filterState;

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <AppShell>
      <div className="h-full overflow-y-auto">
        <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Database className="h-5 w-5 text-primary" />
                <h1 className="text-2xl font-bold">Banco de Dados</h1>
              </div>
              <p className="text-sm text-muted-foreground">
                Navegue pelos leads captados organizados por estado e cidade
              </p>
            </div>
          </div>

          {/* Stats Cards Banner */}
          {stats && !filterState && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "Total de Leads", value: stats.total, icon: Database, color: "text-blue-400 bg-blue-500/10 border-blue-500/20" },
                { label: "Com WhatsApp", value: stats.withPhone, icon: Wifi, color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
                { label: "Fatal Model", value: stats.bySource.fatalmodel, icon: Globe, color: "text-rose-400 bg-rose-500/10 border-rose-500/20" },
                { label: "Skokka", value: stats.bySource.skokka, icon: Globe, color: "text-orange-400 bg-orange-500/10 border-orange-500/20" },
              ].map((s) => (
                <div
                  key={s.label}
                  className="bg-card border border-border rounded-xl p-4 flex flex-col gap-1 shadow-sm relative overflow-hidden"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{s.label}</span>
                    <s.icon className={`h-4 w-4 ${s.color.split(" ")[0]}`} />
                  </div>
                  <span className="text-2xl font-bold tracking-tight mt-1">
                    {s.value.toLocaleString("pt-BR")}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Breadcrumbs Navigation */}
          <div className="bg-card/30 backdrop-blur-md border border-border/50 rounded-xl p-3 flex items-center gap-2 text-sm">
            <button
              onClick={() => {
                setFilterState("");
                setFilterCity("");
              }}
              className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors font-medium"
            >
              <Home className="h-4 w-4" />
              <span>Banco de Dados</span>
            </button>

            {filterState && (
              <>
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60" />
                <button
                  onClick={() => setFilterCity("")}
                  className="text-muted-foreground hover:text-foreground transition-colors font-medium"
                >
                  {filterState}
                </button>
              </>
            )}

            {filterCity && (
              <>
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60" />
                <span className="text-foreground font-semibold">{filterCity}</span>
              </>
            )}
          </div>

          {/* Root Level: Show States Folders */}
          {!filterState && (
            <div className="space-y-4">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Pastas de Estados
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {sortedStates.map(([stateCode, data]) => {
                  const label = STATES.find((s) => s.code === stateCode)?.label || stateCode;
                  return (
                    <button
                      key={stateCode}
                      onClick={() => setFilterState(stateCode)}
                      className="group flex flex-col items-center justify-center p-5 bg-card/40 hover:bg-card border border-border hover:border-violet-500/40 rounded-2xl transition-all duration-200 shadow-sm relative overflow-hidden active:scale-95"
                    >
                      <div className="absolute inset-0 bg-gradient-to-br from-violet-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                      <div className="w-12 h-12 rounded-full bg-violet-500/10 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                        <Folder className="h-6 w-6 text-violet-400 group-hover:hidden" />
                        <FolderOpen className="h-6 w-6 text-violet-400 hidden group-hover:block" />
                      </div>
                      <span className="font-bold text-base text-foreground group-hover:text-violet-400 transition-colors">
                        {stateCode}
                      </span>
                      <span className="text-[10px] text-muted-foreground mt-1 text-center line-clamp-1 max-w-full px-1">
                        {label}
                      </span>
                      <span className="text-[11px] font-mono bg-muted/60 border border-border px-2 py-0.5 rounded-full mt-3 text-muted-foreground">
                        {data.total} leads
                      </span>
                    </button>
                  );
                })}

                {sortedStates.length === 0 && (
                  <div className="col-span-full py-12 text-center text-muted-foreground bg-card/25 border border-dashed border-border rounded-xl">
                    Nenhum dado encontrado no banco. Execute uma captura no Radar.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Level 2: Show Cities Folders inside State */}
          {filterState && !filterCity && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setFilterState("")}
                  className="h-8 w-8 rounded-lg"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  Cidades em {stateLabel} ({filterState})
                </h2>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {currentStateData?.cities.map(({ city, count }) => {
                  const isRefreshing = refreshingCity === city;
                  return (
                    <div
                      key={city}
                      className="group relative flex flex-col items-center justify-center p-5 bg-card/40 hover:bg-card border border-border hover:border-emerald-500/40 rounded-2xl transition-all duration-200 shadow-sm overflow-hidden cursor-pointer active:scale-95"
                      onClick={() => setFilterCity(city)}
                    >
                      <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                      {/* Botão de atualizar — canto superior direito */}
                      <button
                        onClick={(e) => handleRefreshCity(city, filterState, e)}
                        disabled={!!refreshingCity}
                        title={`Atualizar ${city}`}
                        className="absolute top-2 right-2 z-10 p-1 rounded-lg bg-muted/50 hover:bg-emerald-500/20 text-muted-foreground hover:text-emerald-400 transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-30"
                      >
                        <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
                      </button>

                      <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                        <Folder className="h-6 w-6 text-emerald-400 group-hover:hidden" />
                        <FolderOpen className="h-6 w-6 text-emerald-400 hidden group-hover:block" />
                      </div>
                      <span className="font-bold text-base text-foreground group-hover:text-emerald-400 transition-colors text-center line-clamp-1 max-w-full px-1">
                        {city}
                      </span>
                      <span className="text-[11px] font-mono bg-muted/60 border border-border px-2 py-0.5 rounded-full mt-3 text-muted-foreground">
                        {isRefreshing ? "Atualizando..." : `${count} leads`}
                      </span>
                    </div>
                  );
                })}

                {(!currentStateData || currentStateData.cities.length === 0) && (
                  <div className="col-span-full py-12 text-center text-muted-foreground bg-card/25 border border-dashed border-border rounded-xl">
                    Nenhuma cidade encontrada para este estado.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Level 3: Show Prospects list/grid inside City */}
          {filterState && filterCity && (
            <div className="space-y-4">
              {/* Search & Export Toolbar */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setFilterCity("")}
                    className="h-9 w-9 rounded-lg"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <div>
                    <h2 className="text-lg font-bold flex items-center gap-2">
                      <Building2 className="h-5 w-5 text-emerald-400" />
                      {filterCity}
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      {stateLabel} ({filterState}) · {total} prospects
                    </p>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
                  <form onSubmit={handleSearchSubmit} className="flex gap-2 min-w-[240px]">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        type="text"
                        placeholder="Buscar nesta cidade..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9 h-9"
                      />
                    </div>
                    <Button type="submit" size="sm" className="h-9">
                      Buscar
                    </Button>
                  </form>

                  <Button
                    variant="default"
                    size="sm"
                    onClick={handleExportCSV}
                    className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium h-9"
                  >
                    <FileSpreadsheet className="h-4 w-4" />
                    Exportar Planilha (CSV)
                  </Button>
                </div>
              </div>

              {/* Grid of Leads */}
              {loading ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-8 gap-4 py-8">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="aspect-[4/5] bg-card/50 border border-border animate-pulse rounded-xl" />
                  ))}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-8 gap-4">
                    {items.map((prospect) => {
                      const initials = prospect.name.slice(0, 2).toUpperCase();
                      const phone = prospect.whatsappE164 || prospect.whatsappDisplay;
                      const waUrl = phone ? `https://wa.me/${phone}` : null;
                      return (
                        <div
                          key={prospect.id}
                          className="group relative bg-card border border-border rounded-xl overflow-hidden shadow-sm transition-all duration-200 hover:border-emerald-500/40 hover:shadow-lg hover:shadow-emerald-500/5"
                        >
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
                            {/* Gradient overlay */}
                            <div className="absolute inset-0 flex items-end">
                              <div className="w-full bg-gradient-to-t from-black/80 via-black/20 to-transparent p-2">
                                {!prospect.thumbUrl && (
                                  <span className="block text-center text-xl font-bold text-white/40 mb-1">
                                    {initials}
                                  </span>
                                )}
                              </div>
                            </div>
                            {/* Multi-portal badge */}
                            {prospect.sources.length >= 2 && (
                              <div className="absolute top-2 left-2 bg-primary text-primary-foreground text-[8px] font-bold px-1 rounded">
                                {prospect.sources.length}×
                              </div>
                            )}
                            {/* Botão WhatsApp — aparece no hover, canto inferior direito */}
                            {waUrl && (
                              <a
                                href={waUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                title={`Convidar ${prospect.name} pelo WhatsApp`}
                                className="absolute bottom-2 right-2 z-10 w-7 h-7 rounded-full bg-[#25D366] flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 transition-all duration-200 hover:scale-110 hover:bg-[#1ebe5d]"
                              >
                                <MessageCircle className="h-3.5 w-3.5 text-white" />
                              </a>
                            )}
                          </div>

                          {/* Info */}
                          <div className="p-2.5 space-y-1">
                            <p className="font-semibold text-xs truncate" title={prospect.name}>
                              {prospect.name}
                            </p>
                            {phone ? (
                              <p className="text-[10px] text-emerald-400 font-mono font-medium truncate">
                                {phone}
                              </p>
                            ) : (
                              <p className="text-[10px] text-muted-foreground/50 italic truncate">Sem WhatsApp</p>
                            )}
                            {/* Cidade */}
                            {prospect.city && (
                              <p className="text-[10px] text-muted-foreground/70 flex items-center gap-0.5 truncate">
                                <MapPin className="h-2.5 w-2.5 shrink-0" />
                                {prospect.city}
                              </p>
                            )}
                            <div className="flex flex-wrap gap-0.5 pt-0.5">
                              {prospect.sources.map((s) => (
                                <SourceBadge key={s} source={s} />
                              ))}
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {items.length === 0 && (
                      <div className="col-span-full py-16 text-center text-muted-foreground bg-card/25 border border-dashed border-border rounded-2xl">
                        Nenhum prospect encontrado nesta cidade.
                      </div>
                    )}
                  </div>

                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-center gap-2 pt-6">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page === 1}
                      >
                        Anterior
                      </Button>
                      <span className="text-xs text-muted-foreground">
                        Página {page} de {totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages}
                      >
                        Próxima
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

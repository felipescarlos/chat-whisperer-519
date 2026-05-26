import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Search, RefreshCw, Trash2, ChevronLeft, ChevronRight, ChevronDown,
  Radio, Database, Wifi, SlidersHorizontal, X, Check,
  Building2, Globe, Clock, Plus, Calendar, Play,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  ProspectStats, ScrapeJobState, ProspectRoutine,
  fetchProspectStats, fetchScrapeStatus,
  triggerScrape, clearProspects, fetchRoutines, createRoutine,
  toggleRoutine, deleteRoutine,
} from "@/lib/evolution-api";

export const Route = createFileRoute("/radar")({
  head: () => ({
    meta: [
      { title: "Radar de Capturas — CRM PicJob" },
      { name: "description", content: "Gerenciamento e automação de varredura de prospects." },
    ],
  }),
  component: RadarPage,
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
        <span className="font-medium capitalize">
          {jobState.status === "running" ? "Executando" : jobState.status === "done" ? "Concluído" : "Erro"}
        </span>
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

function getCronDescription(cronStr: string): string {
  const parts = cronStr.split(" ");
  if (parts.length < 5) return cronStr;
  const [min, hour, dayOfMonth, month, dayOfWeek] = parts;

  if (min === "0" && hour === "*" && dayOfMonth === "*" && month === "*" && dayOfWeek === "*") {
    return "A cada hora (no minuto 0)";
  }

  const formatTime = (h: string, m: string) => {
    const pad = (s: string) => s.padStart(2, "0");
    return `${pad(h)}:${pad(m)}`;
  };

  if (dayOfMonth === "*" && month === "*" && dayOfWeek === "*") {
    return `Todo dia às ${formatTime(hour, min)}`;
  }

  if (dayOfMonth === "*" && month === "*" && dayOfWeek !== "*") {
    const days: Record<string, string> = {
      "0": "Domingo",
      "1": "Segunda-feira",
      "2": "Terça-feira",
      "3": "Quarta-feira",
      "4": "Quinta-feira",
      "5": "Sexta-feira",
      "6": "Sábado",
    };
    return `Toda ${days[dayOfWeek] || `dia ${dayOfWeek}`} às ${formatTime(hour, min)}`;
  }

  return `Cron: ${cronStr}`;
}

function RadarPage() {
  const [stats, setStats] = useState<ProspectStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [jobState, setJobState] = useState<ScrapeJobState | null>(null);

  // Routines state
  const [routines, setRoutines] = useState<ProspectRoutine[]>([]);
  const [loadingRoutines, setLoadingRoutines] = useState(false);

  // Routine Modal
  const [showRoutineModal, setShowRoutineModal] = useState(false);
  const [routineName, setRoutineName] = useState("");
  const [routineState, setRoutineState] = useState("rn");
  const [routineCities, setRoutineCities] = useState("");
  const [routineFrequency, setRoutineFrequency] = useState("daily"); // "daily" | "weekly" | "hourly"
  const [routineHour, setRoutineHour] = useState("03:00");
  const [routineDayOfWeek, setRoutineDayOfWeek] = useState("1");
  const [routinePlatforms, setRoutinePlatforms] = useState<string[]>(["fatalmodel", "skokka", "fotoacomp"]);
  const [savingRoutine, setSavingRoutine] = useState(false);

  // Scrape modal
  const [showScrapeModal, setShowScrapeModal] = useState(false);
  const [scrapeStates, setScrapeStates] = useState<string[]>(["rn"]);
  const [scrapeMode, setScrapeMode] = useState<"state" | "city">("state");
  const [scrapeCitiesText, setScrapeCitiesText] = useState("");
  const [singleScrapeState, setSingleScrapeState] = useState("rn");
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(["fatalmodel", "skokka", "fotoacomp"]);
  const [scraping, setScraping] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadStats = useCallback(async () => {
    try {
      const s = await fetchProspectStats();
      setStats(s);
    } catch {
      /* silencia */
    }
  }, []);

  const loadRoutines = useCallback(async () => {
    setLoadingRoutines(true);
    try {
      const r = await fetchRoutines();
      setRoutines(r);
    } catch {
      toast.error("Falha ao carregar rotinas");
    } finally {
      setLoadingRoutines(false);
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
          loadStats();
        } else {
          toast.error(`Erro no scraping: ${state.error}`);
        }
      } else if (state.status === "running") {
        setScraping(true);
      }
    } catch {
      /* silencia */
    }
  }, [loadStats]);

  useEffect(() => {
    loadStats();
    loadRoutines();
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

  // Handlers
  const handleStartScrape = async () => {
    if (selectedPlatforms.length === 0) {
      toast.error("Por favor, selecione ao menos uma plataforma.");
      return;
    }
    setScraping(true);
    setShowScrapeModal(false);
    try {
      if (scrapeMode === "city") {
        const parsedCities = scrapeCitiesText
          .split(",")
          .map((c) => c.trim())
          .filter((c) => c.length > 0);
        await triggerScrape([singleScrapeState], parsedCities, selectedPlatforms);
      } else {
        await triggerScrape(scrapeStates, [], selectedPlatforms);
      }
      // Inicia polling
      pollRef.current = setInterval(checkJobStatus, 3000);
      await checkJobStatus();
    } catch (e: any) {
      setScraping(false);
      toast.error(e.message || "Falha ao iniciar scraping");
    }
  };

  const handleCreateRoutine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!routineName.trim()) {
      toast.error("Por favor, digite um nome para a rotina");
      return;
    }
    if (routinePlatforms.length === 0) {
      toast.error("Por favor, selecione ao menos uma plataforma.");
      return;
    }

    setSavingRoutine(true);
    try {
      // Calcula a expressão cron
      let cronExpr = "0 * * * *"; // hourly default
      if (routineFrequency === "daily") {
        const [hour, min] = routineHour.split(":");
        cronExpr = `${parseInt(min, 10)} ${parseInt(hour, 10)} * * *`;
      } else if (routineFrequency === "weekly") {
        const [hour, min] = routineHour.split(":");
        cronExpr = `${parseInt(min, 10)} ${parseInt(hour, 10)} * * ${routineDayOfWeek}`;
      }

      const citiesArr = routineCities
        .split(",")
        .map((c) => c.trim())
        .filter((c) => c.length > 0);

      await createRoutine({
        name: routineName,
        state: routineState,
        cities: citiesArr,
        cronExpr,
        sources: routinePlatforms,
      });

      toast.success("Rotina agendada com sucesso!");
      setShowRoutineModal(false);
      
      // Reset form
      setRoutineName("");
      setRoutineCities("");
      setRoutineFrequency("daily");
      setRoutineHour("03:00");
      setRoutineDayOfWeek("1");
      setRoutinePlatforms(["fatalmodel", "skokka", "fotoacomp"]);

      loadRoutines();
    } catch (err: any) {
      toast.error(err.message || "Falha ao criar rotina");
    } finally {
      setSavingRoutine(false);
    }
  };

  const handleToggleRoutine = async (id: string, currentEnabled: boolean) => {
    try {
      await toggleRoutine(id, !currentEnabled);
      toast.success(`Rotina ${!currentEnabled ? "ativada" : "desativada"} com sucesso`);
      loadRoutines();
    } catch (err: any) {
      toast.error(err.message || "Falha ao atualizar rotina");
    }
  };

  const handleDeleteRoutine = async (id: string) => {
    if (!confirm("Deseja realmente remover esta rotina de agendamento?")) return;
    try {
      await deleteRoutine(id);
      toast.success("Rotina removida com sucesso");
      loadRoutines();
    } catch (err: any) {
      toast.error(err.message || "Falha ao remover rotina");
    }
  };

  const [runningRoutineId, setRunningRoutineId] = useState<string | null>(null);

  const handleRunNow = async (r: ProspectRoutine) => {
    if (runningRoutineId) return;
    setRunningRoutineId(r.id);
    try {
      const cities = r.cities.map(c =>
        c.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, "-")
      );
      await triggerScrape([r.state], cities, r.sources);
      toast.success(`Rotina "${r.name}" iniciada!`);
    } catch (err: any) {
      toast.error(err.message || "Falha ao executar rotina");
    } finally {
      setRunningRoutineId(null);
    }
  };

  const handleClear = async () => {
    if (!confirm("Limpar TODOS os prospects do banco? Isso não pode ser desfeito.")) return;
    try {
      const res = await clearProspects();
      toast.success(`${res.deleted} prospects removidos`);
      loadStats();
    } catch {
      toast.error("Falha ao limpar prospects");
    }
  };

  return (
    <AppShell>
      <div className="h-full overflow-y-auto">
        <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Radio className="h-5 w-5 text-primary" />
                <h1 className="text-2xl font-bold">Radar de Capturas</h1>
              </div>
              <p className="text-sm text-muted-foreground">
                Automatize e gerencie o mapeamento de leads dos portais concorrentes
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowScrapeModal(true)}
                disabled={scraping}
                className="gap-2 border-primary/20 hover:border-primary/50"
              >
                {scraping ? (
                  <RefreshCw className="h-4 w-4 animate-spin text-primary" />
                ) : (
                  <Globe className="h-4 w-4" />
                )}
                {scraping ? "Raspando..." : "Atualizar Radar"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClear}
                className="gap-2 text-destructive hover:text-destructive/80"
              >
                <Trash2 className="h-4 w-4" />
                Limpar Banco
              </Button>
            </div>
          </div>

          {/* Status banner */}
          <ScrapeStatusBanner jobState={jobState} />

          {/* Stats Summary */}
          {stats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "Total Mapeado", value: stats.total, icon: Database, color: "text-blue-400" },
                { label: "Fatal Model", value: stats.bySource.fatalmodel, icon: Globe, color: "text-rose-400" },
                { label: "Skokka", value: stats.bySource.skokka, icon: Globe, color: "text-orange-400" },
                { label: "PhotoAcomp", value: stats.bySource.fotoacomp, icon: Globe, color: "text-violet-400" },
              ].map((s) => (
                <div
                  key={s.label}
                  className="bg-card border border-border rounded-xl p-4 flex flex-col gap-1 shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{s.label}</span>
                    <s.icon className={`h-4 w-4 ${s.color}`} />
                  </div>
                  <span className="text-2xl font-bold tracking-tight mt-1">
                    {s.value.toLocaleString("pt-BR")}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Routines Section */}
          <div className="space-y-4">
            <div className="flex justify-between items-center bg-card border border-border p-4 rounded-xl shadow-sm">
              <div>
                <h3 className="font-semibold text-sm">Agendamentos Recorrentes</h3>
                <p className="text-xs text-muted-foreground">
                  Configure rotinas automáticas de scraping por estado ou cidade
                </p>
              </div>
              <Button
                size="sm"
                onClick={() => setShowRoutineModal(true)}
                className="gap-1.5"
              >
                <Plus className="h-4 w-4" />
                Agendar Rotina
              </Button>
            </div>

            {loadingRoutines ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-24 bg-card border border-border rounded-xl animate-pulse" />
                ))}
              </div>
            ) : routines.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground border border-dashed border-border rounded-xl bg-card/20">
                <Clock className="h-12 w-12 mx-auto mb-3 opacity-20" />
                <p className="font-medium">Nenhuma rotina agendada ainda</p>
                <p className="text-sm mt-1 mb-4 max-w-md mx-auto">
                  Automatize a busca de novos prospects programando varreduras diárias ou semanais por cidade.
                </p>
                <Button size="sm" onClick={() => setShowRoutineModal(true)} className="gap-1.5">
                  <Plus className="h-4 w-4" />
                  Agendar Primeira Rotina
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {routines.map((r) => {
                  const formattedDate = (dStr: string | null) => {
                    if (!dStr) return "Nunca executado";
                    return new Date(dStr).toLocaleString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    });
                  };

                  return (
                    <div
                      key={r.id}
                      className="bg-card border border-border rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:shadow hover:border-primary/30 transition-all duration-200"
                    >
                      <div className="space-y-1.5 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-semibold text-sm truncate">{r.name}</h4>
                          <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-mono font-bold uppercase shrink-0">
                            {r.state}
                          </span>
                          {r.cities.length > 0 ? (
                            <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded truncate max-w-48 font-medium">
                              {r.cities.join(", ")}
                            </span>
                          ) : (
                            <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded font-medium">
                              Estado Inteiro
                            </span>
                          )}
                          
                          {/* Platform tags */}
                          {r.sources && r.sources.length > 0 && (
                            <div className="flex gap-1 shrink-0">
                              {r.sources.map((src) => (
                                <span key={src} className="text-[9px] bg-muted/80 text-muted-foreground border border-border/50 px-1 py-0.25 rounded font-mono font-bold uppercase">
                                  {src === "fatalmodel" ? "FM" : src === "skokka" ? "SK" : "PA"}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5 text-primary/75" />
                            {getCronDescription(r.cron)}
                          </span>
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3.5 w-3.5" />
                            Última execução: {formattedDate(r.lastRun)}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                        {/* Toggle Switch */}
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground font-medium">
                            {r.enabled ? "Ativo" : "Inativo"}
                          </span>
                          <button
                            onClick={() => handleToggleRoutine(r.id, r.enabled)}
                            className={`w-9 h-5 rounded-full p-0.5 transition-colors duration-200 focus:outline-none ${
                              r.enabled ? "bg-primary" : "bg-muted"
                            }`}
                          >
                            <div
                              className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
                                r.enabled ? "translate-x-4" : "translate-x-0"
                              }`}
                            />
                          </button>
                        </div>

                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => handleRunNow(r)}
                          disabled={!!runningRoutineId}
                          title="Executar agora"
                          className="h-8 w-8 rounded-lg text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10 hover:border-emerald-500/60"
                        >
                          {runningRoutineId === r.id
                            ? <RefreshCw className="h-4 w-4 animate-spin" />
                            : <Play className="h-4 w-4 fill-current" />}
                        </Button>

                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteRoutine(r.id)}
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive h-8 w-8 rounded-lg"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal de Scraping Manual */}
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
                    Escolha as localizações para captura manual
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

              {/* Portais/Plataformas */}
              <div className="space-y-2 border-t border-border/50 pt-3">
                <label className="text-xs font-semibold text-muted-foreground block">Portais para Capturar</label>
                <div className="flex flex-col gap-2">
                  {[
                    { id: "fatalmodel", label: "Fatal Model" },
                    { id: "skokka", label: "Skokka" },
                    { id: "fotoacomp", label: "Photo Acompanhantes" },
                  ].map((platform) => {
                    const checked = selectedPlatforms.includes(platform.id);
                    return (
                      <label
                        key={platform.id}
                        className="flex items-center gap-3 py-1 cursor-pointer transition-colors"
                      >
                        <div
                          className={`h-4 w-4 rounded border-2 flex items-center justify-center transition-colors ${
                            checked ? "bg-primary border-primary" : "border-border"
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
                              setSelectedPlatforms((prev) => [...prev, platform.id]);
                            } else {
                              setSelectedPlatforms((prev) => prev.filter((p) => p !== platform.id));
                            }
                          }}
                        />
                        <span className="text-xs font-medium">{platform.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="p-3 bg-muted/30 rounded-lg text-[11px] text-muted-foreground space-y-1">
                <p>⏱ Tempo estimado: ~5–15 min por estado/cidade</p>
                <p>🔄 Roda em background (pode fechar esta janela)</p>
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
                  disabled={
                    (scrapeMode === "state" ? scrapeStates.length === 0 : !scrapeCitiesText.trim()) ||
                    selectedPlatforms.length === 0
                  }
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

      {/* Modal de Nova Rotina */}
      {showRoutineModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateRoutine}
            className="bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl overflow-hidden"
          >
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Clock className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h2 className="font-semibold text-lg">Agendar Rotina de Captura</h2>
                  <p className="text-xs text-muted-foreground">
                    Programe varreduras automáticas recorrentes
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                {/* Nome */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Nome da Rotina</label>
                  <Input
                    placeholder="Ex: Varredura Diária de Natal"
                    value={routineName}
                    onChange={(e) => setRoutineName(e.target.value)}
                    required
                    className="h-9 text-sm bg-input border-border"
                  />
                </div>

                {/* Estado */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Estado Alvo</label>
                  <select
                    value={routineState}
                    onChange={(e) => setRoutineState(e.target.value)}
                    className="w-full h-9 px-2 text-sm bg-input border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
                  >
                    {STATES.map((s) => (
                      <option key={s.code} value={s.code.toLowerCase()}>
                        {s.code} — {s.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Cidades */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground flex justify-between">
                    <span>Cidades (opcional, vazia = estado inteiro)</span>
                    <span className="text-[10px] text-muted-foreground/60 italic font-normal">Separadas por vírgula</span>
                  </label>
                  <Input
                    placeholder="Ex: Natal, Mossoró"
                    value={routineCities}
                    onChange={(e) => setRoutineCities(e.target.value)}
                    className="h-9 text-sm bg-input border-border"
                  />
                </div>

                {/* Recorrência */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground">Recorrência</label>
                    <select
                      value={routineFrequency}
                      onChange={(e) => setRoutineFrequency(e.target.value)}
                      className="w-full h-9 px-2 text-sm bg-input border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
                    >
                      <option value="hourly">De hora em hora</option>
                      <option value="daily">Diário</option>
                      <option value="weekly">Semanal</option>
                    </select>
                  </div>

                  {routineFrequency !== "hourly" && (
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-muted-foreground">Horário</label>
                      <Input
                        type="time"
                        value={routineHour}
                        onChange={(e) => setRoutineHour(e.target.value)}
                        required
                        className="h-9 text-sm bg-input border-border"
                      />
                    </div>
                  )}
                </div>

                {routineFrequency === "weekly" && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground">Dia da Semana</label>
                    <select
                      value={routineDayOfWeek}
                      onChange={(e) => setRoutineDayOfWeek(e.target.value)}
                      className="w-full h-9 px-2 text-sm bg-input border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
                    >
                      <option value="1">Segunda-feira</option>
                      <option value="2">Terça-feira</option>
                      <option value="3">Quarta-feira</option>
                      <option value="4">Quinta-feira</option>
                      <option value="5">Sexta-feira</option>
                      <option value="6">Sábado</option>
                      <option value="0">Domingo</option>
                    </select>
                  </div>
                )}

                {/* Portais/Plataformas */}
                <div className="space-y-2 border-t border-border/50 pt-3">
                  <label className="text-xs font-semibold text-muted-foreground block">Portais para Capturar</label>
                  <div className="flex flex-col gap-2">
                    {[
                      { id: "fatalmodel", label: "Fatal Model" },
                      { id: "skokka", label: "Skokka" },
                      { id: "fotoacomp", label: "Photo Acompanhantes" },
                    ].map((platform) => {
                      const checked = routinePlatforms.includes(platform.id);
                      return (
                        <label
                          key={platform.id}
                          className="flex items-center gap-3 py-1 cursor-pointer transition-colors"
                        >
                          <div
                            className={`h-4 w-4 rounded border-2 flex items-center justify-center transition-colors ${
                              checked ? "bg-primary border-primary" : "border-border"
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
                                setRoutinePlatforms((prev) => [...prev, platform.id]);
                              } else {
                                setRoutinePlatforms((prev) => prev.filter((p) => p !== platform.id));
                              }
                            }}
                          />
                          <span className="text-xs font-medium">{platform.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => setShowRoutineModal(false)}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={savingRoutine || routinePlatforms.length === 0}
                  className="flex-1"
                >
                  {savingRoutine ? "Agendando..." : "Criar Agendamento"}
                </Button>
              </div>
            </div>
          </form>
        </div>
      )}
    </AppShell>
  );
}

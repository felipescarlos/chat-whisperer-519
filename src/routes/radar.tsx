import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  RefreshCw, Trash2, Check, Clock, Plus, Calendar, Play,
  Server, Monitor, MousePointer, Radio, Database, Globe,
  Wifi, WifiOff, Zap, ChevronRight, X,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { ScrapeLiveFeed } from "@/components/ScrapeLiveFeed";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  ProspectStats, ScrapeJobState, ProspectRoutine, ExtensionJob, ExtensionStatus,
  fetchProspectStats, fetchScrapeStatus, triggerScrape, clearProspects,
  fetchRoutines, createRoutine, toggleRoutine, deleteRoutine,
  fetchExtensionStatus, fetchExtensionJobs, createExtensionJob, deleteExtensionJob,
} from "@/lib/evolution-api";
import { STATES } from "@/lib/states";

export const Route = createFileRoute("/radar")({
  head: () => ({
    meta: [
      { title: "Radar de Capturas — CRM PicJob" },
      { name: "description", content: "Gerenciamento e automação de varredura de prospects." },
    ],
  }),
  component: RadarPage,
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function getCronDescription(cronStr: string): string {
  const parts = cronStr.split(" ");
  if (parts.length < 5) return cronStr;
  const [min, hour, , , dayOfWeek] = parts;
  const pad = (s: string) => s.padStart(2, "0");
  const time = `${pad(hour)}:${pad(min)}`;
  if (dayOfWeek === "*") return `Todo dia às ${time}`;
  const days: Record<string, string> = { "0":"Dom","1":"Seg","2":"Ter","3":"Qua","4":"Qui","5":"Sex","6":"Sáb" };
  return `Toda ${days[dayOfWeek] || `dia ${dayOfWeek}`} às ${time}`;
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("pt-BR", { day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit" });
}

// ── Status Banner (VPS) ───────────────────────────────────────────────────────
function ScrapeStatusBanner({ jobState }: { jobState: ScrapeJobState | null }) {
  if (!jobState || jobState.status === "idle") return null;
  const isActive = ["running", "stopping"].includes(jobState.status);
  const colors: Record<string, string> = {
    running: "border-primary/40 bg-primary/5 text-primary",
    stopping: "border-yellow-500/40 bg-yellow-500/5 text-yellow-400",
    done: "border-emerald-500/40 bg-emerald-500/5 text-emerald-400",
    stopped: "border-muted/40 bg-muted/5 text-muted-foreground",
    error: "border-destructive/40 bg-destructive/5 text-destructive",
  };
  const labels: Record<string, string> = { running:"Executando", stopping:"Parando", done:"Concluído", stopped:"Interrompido", error:"Erro" };
  return (
    <div className={`border rounded-lg px-4 py-3 text-sm flex items-center gap-3 ${colors[jobState.status] ?? colors.done}`}>
      {isActive && <RefreshCw className="h-4 w-4 animate-spin shrink-0" />}
      <div className="flex-1 min-w-0">
        <span className="font-medium">{labels[jobState.status] ?? jobState.status}</span>{" — "}
        <span className="opacity-80">{jobState.message}</span>
        {isActive && (
          <span className="text-[11px] opacity-60 ml-2">
            FM:{jobState.counts?.fatalmodel??0} · SK:{jobState.counts?.skokka??0} · PA:{jobState.counts?.fotoacomp??0} · {jobState.counts?.upserted??0} salvos
          </span>
        )}
      </div>
    </div>
  );
}

// ── Section Header ────────────────────────────────────────────────────────────
function SectionHeader({
  icon: Icon, title, description, badge, badgeColor, action,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  badge: string;
  badgeColor: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 mb-4">
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${badgeColor} bg-opacity-10`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <h2 className="font-bold text-base">{title}</h2>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${badgeColor} border-current/30 bg-current/5`}>
              {badge}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      {action}
    </div>
  );
}

// ── Platform toggle ───────────────────────────────────────────────────────────
function PlatformPicker({ selected, onChange }: { selected: string[]; onChange: (v: string[]) => void }) {
  const platforms = [
    { id: "fatalmodel", label: "Fatal Model" },
    { id: "skokka", label: "Skokka" },
    { id: "fotoacomp", label: "PhotoAcomp" },
  ];
  return (
    <div className="flex flex-col gap-2">
      {platforms.map((p) => {
        const checked = selected.includes(p.id);
        return (
          <label key={p.id} className="flex items-center gap-3 cursor-pointer">
            <div className={`h-4 w-4 rounded border-2 flex items-center justify-center transition-colors ${checked ? "bg-primary border-primary" : "border-border"}`}>
              {checked && <Check className="h-2.5 w-2.5 text-white" />}
            </div>
            <input type="checkbox" className="sr-only" checked={checked}
              onChange={(e) => onChange(e.target.checked ? [...selected, p.id] : selected.filter((x) => x !== p.id))}
            />
            <span className="text-xs font-medium">{p.label}</span>
          </label>
        );
      })}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
function RadarPage() {
  const [stats, setStats] = useState<ProspectStats | null>(null);
  const [jobState, setJobState] = useState<ScrapeJobState | null>(null);
  const [scraping, setScraping] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isInitialMount = useRef(true);

  // VPS routines
  const [routines, setRoutines] = useState<ProspectRoutine[]>([]);
  const [loadingRoutines, setLoadingRoutines] = useState(false);
  const [showRoutineModal, setShowRoutineModal] = useState(false);
  const [runningRoutineId, setRunningRoutineId] = useState<string | null>(null);

  // Routine form
  const [routineName, setRoutineName] = useState("");
  const [routineState, setRoutineState] = useState("rn");
  const [routineCities, setRoutineCities] = useState("");
  const [routineFrequency, setRoutineFrequency] = useState("daily");
  const [routineHour, setRoutineHour] = useState("11:00");
  const [routineDayOfWeek, setRoutineDayOfWeek] = useState("1");
  const [routinePlatforms, setRoutinePlatforms] = useState<string[]>(["fatalmodel", "skokka", "fotoacomp"]);
  const [savingRoutine, setSavingRoutine] = useState(false);

  // Manual scrape modal
  const [showScrapeModal, setShowScrapeModal] = useState(false);
  const [scrapeMode, setScrapeMode] = useState<"state" | "city">("city");
  const [scrapeStates, setScrapeStates] = useState<string[]>(["rn"]);
  const [scrapeCitiesText, setScrapeCitiesText] = useState("");
  const [singleScrapeState, setSingleScrapeState] = useState("rn");
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(["fatalmodel", "skokka", "fotoacomp"]);

  // Extension jobs
  const [extStatus, setExtStatus] = useState<ExtensionStatus | null>(null);
  const [extJobs, setExtJobs] = useState<ExtensionJob[]>([]);
  const [showExtModal, setShowExtModal] = useState(false);
  const [extJobState, setExtJobState] = useState("rn");
  const [extJobCities, setExtJobCities] = useState("");
  const [extJobPageFrom, setExtJobPageFrom] = useState(1);
  const [extJobPageTo, setExtJobPageTo] = useState(5);
  const [extJobSources, setExtJobSources] = useState<string[]>(["skokka"]);
  const [savingExtJob, setSavingExtJob] = useState(false);

  const loadStats = useCallback(async () => {
    try { setStats(await fetchProspectStats()); } catch { /**/ }
  }, []);

  const loadRoutines = useCallback(async () => {
    setLoadingRoutines(true);
    try { setRoutines(await fetchRoutines()); } catch { toast.error("Falha ao carregar rotinas"); }
    finally { setLoadingRoutines(false); }
  }, []);

  const loadExtension = useCallback(async () => {
    try {
      const [status, jobs] = await Promise.all([fetchExtensionStatus(), fetchExtensionJobs()]);
      setExtStatus(status);
      setExtJobs(jobs);
    } catch { /**/ }
  }, []);

  const checkJobStatus = useCallback(async () => {
    try {
      const state = await fetchScrapeStatus();
      setJobState(state);
      if (["done", "error", "stopped"].includes(state.status)) {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = null;
        setScraping(false);
        if (!isInitialMount.current) {
          if (state.status === "done") { toast.success(`Concluído! ${state.counts.upserted} salvos.`); loadStats(); }
          else if (state.status === "stopped") toast.info("Raspagem interrompida.");
          else toast.error(`Erro: ${state.error}`);
        }
      } else if (["running", "stopping"].includes(state.status)) {
        setScraping(true);
      }
      isInitialMount.current = false;
    } catch { /**/ }
  }, [loadStats]);

  useEffect(() => {
    loadStats(); loadRoutines(); checkJobStatus(); loadExtension();
    const extPoll = setInterval(loadExtension, 30000);
    return () => clearInterval(extPoll);
  }, []);

  useEffect(() => {
    if (scraping) { pollRef.current = setInterval(checkJobStatus, 3000); }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [scraping, checkJobStatus]);

  // ── Handlers VPS ────────────────────────────────────────────────────────────
  const handleStartScrape = async () => {
    if (!selectedPlatforms.length) { toast.error("Selecione ao menos uma plataforma."); return; }
    setScraping(true); setShowScrapeModal(false);
    try {
      if (scrapeMode === "city") {
        const cities = scrapeCitiesText.split(",").map(c => c.trim()).filter(Boolean);
        await triggerScrape([singleScrapeState], cities, selectedPlatforms);
      } else {
        await triggerScrape(scrapeStates, [], selectedPlatforms);
      }
      await checkJobStatus();
    } catch (e: any) { setScraping(false); toast.error(e.message); }
  };

  const handleCreateRoutine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!routineName.trim()) { toast.error("Digite um nome."); return; }
    if (!routinePlatforms.length) { toast.error("Selecione ao menos uma plataforma."); return; }
    setSavingRoutine(true);
    try {
      let cronExpr = "0 * * * *";
      if (routineFrequency === "daily") {
        const [h, m] = routineHour.split(":");
        cronExpr = `${parseInt(m)} ${parseInt(h)} * * *`;
      } else if (routineFrequency === "weekly") {
        const [h, m] = routineHour.split(":");
        cronExpr = `${parseInt(m)} ${parseInt(h)} * * ${routineDayOfWeek}`;
      }
      const cities = routineCities.split(",").map(c => c.trim()).filter(Boolean);
      await createRoutine({ name: routineName, state: routineState, cities, cronExpr, sources: routinePlatforms });
      toast.success("Rotina agendada!");
      setShowRoutineModal(false);
      setRoutineName(""); setRoutineCities("");
      setRoutineFrequency("daily"); setRoutineHour("11:00");
      setRoutinePlatforms(["fatalmodel", "skokka", "fotoacomp"]);
      loadRoutines();
    } catch (err: any) { toast.error(err.message || "Falha ao criar rotina"); }
    finally { setSavingRoutine(false); }
  };

  const handleRunNow = async (r: ProspectRoutine) => {
    if (runningRoutineId || scraping) return;
    setRunningRoutineId(r.id); setScraping(true);
    try {
      const cities = r.cities.map(c => c.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, "-"));
      await triggerScrape([r.state], cities, r.sources);
      toast.success(`"${r.name}" iniciada!`);
      await checkJobStatus();
    } catch (err: any) { setScraping(false); toast.error(err.message); }
    finally { setRunningRoutineId(null); }
  };

  // ── Handlers Extension ───────────────────────────────────────────────────────
  const handleCreateExtJob = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!extJobSources.length) { toast.error("Selecione ao menos uma plataforma."); return; }
    setSavingExtJob(true);
    try {
      const cities = extJobCities.split(",").map(c => c.trim()).filter(Boolean);
      const name = extJobState.toUpperCase() + (cities.length ? ` — ${cities.join(", ")} (pág. ${extJobPageFrom}–${extJobPageTo})` : ` (pág. ${extJobPageFrom}–${extJobPageTo})`);
      await createExtensionJob({ name, state: extJobState, cities, sources: extJobSources, pageFrom: extJobPageFrom, pageTo: extJobPageTo });
      toast.success("Job enfileirado! Extensão vai captar em até 5 min.");
      setShowExtModal(false);
      setExtJobCities(""); setExtJobPageFrom(1); setExtJobPageTo(5);
      loadExtension();
    } catch (err: any) { toast.error(err.message || "Falha ao criar job"); }
    finally { setSavingExtJob(false); }
  };

  const handleDeleteExtJob = async (id: string) => {
    try { await deleteExtensionJob(id); loadExtension(); } catch { toast.error("Falha ao remover"); }
  };

  const handleClear = async () => {
    if (!confirm("Limpar TODOS os prospects?")) return;
    try { const r = await clearProspects(); toast.success(`${r.deleted} removidos`); loadStats(); }
    catch { toast.error("Falha ao limpar"); }
  };

  const extOnline = extStatus?.online;

  return (
    <AppShell>
      <div className="h-full overflow-y-auto">
        <div className="max-w-5xl mx-auto px-6 py-6 space-y-8">

          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Radio className="h-5 w-5 text-primary" />
                <h1 className="text-2xl font-bold">Radar de Capturas</h1>
              </div>
              <p className="text-sm text-muted-foreground">Três formas de capturar leads dos portais concorrentes</p>
            </div>
            <Button variant="ghost" size="sm" onClick={handleClear} className="gap-2 text-destructive hover:text-destructive/80">
              <Trash2 className="h-4 w-4" /> Limpar Banco
            </Button>
          </div>

          {/* Stats */}
          {stats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "Total Mapeado", value: stats.total, icon: Database, color: "text-blue-400" },
                { label: "Fatal Model",   value: stats.bySource.fatalmodel, icon: Globe, color: "text-rose-400" },
                { label: "Skokka",        value: stats.bySource.skokka,     icon: Globe, color: "text-orange-400" },
                { label: "PhotoAcomp",    value: stats.bySource.fotoacomp,  icon: Globe, color: "text-violet-400" },
              ].map((s) => (
                <div key={s.label} className="bg-card border border-border rounded-xl p-4 flex flex-col gap-1 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{s.label}</span>
                    <s.icon className={`h-4 w-4 ${s.color}`} />
                  </div>
                  <span className="text-2xl font-bold tracking-tight mt-1">{s.value.toLocaleString("pt-BR")}</span>
                </div>
              ))}
            </div>
          )}

          <ScrapeStatusBanner jobState={jobState} />
          <ScrapeLiveFeed jobState={jobState} />

          {/* ═══ SEÇÃO 1: RADAR SERVIDOR ═══════════════════════════════════════ */}
          <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
            <SectionHeader
              icon={Server}
              title="Radar Servidor"
              description="Roda no servidor, 24h por dia. Independe de computador ligado. Skokka via FlareSolverr (mais lento)."
              badge="24h · Autônomo"
              badgeColor="text-blue-400"
              action={
                <div className="flex gap-2 shrink-0">
                  <Button size="sm" variant="outline" onClick={() => setShowScrapeModal(true)} disabled={scraping} className="gap-1.5 text-xs border-blue-500/30 text-blue-400 hover:bg-blue-500/10">
                    {scraping ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5 fill-current" />}
                    {scraping ? "Raspando..." : "Raspar Agora"}
                  </Button>
                  <Button size="sm" onClick={() => setShowRoutineModal(true)} className="gap-1.5 text-xs bg-blue-600 hover:bg-blue-700">
                    <Plus className="h-3.5 w-3.5" /> Agendar Rotina
                  </Button>
                </div>
              }
            />

            {loadingRoutines ? (
              <div className="space-y-2">{[1,2].map(i => <div key={i} className="h-16 bg-muted/30 rounded-lg animate-pulse" />)}</div>
            ) : routines.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground border border-dashed border-border rounded-xl bg-muted/10">
                <Clock className="h-8 w-8 mx-auto mb-2 opacity-20" />
                <p className="text-sm font-medium">Nenhuma rotina agendada</p>
                <p className="text-xs mt-1">Automatize varreduras diárias ou semanais por cidade.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {routines.map((r) => (
                  <div key={r.id} className="bg-muted/20 border border-border/60 rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-blue-500/30 transition-all">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm truncate">{r.name}</span>
                        <span className="text-[10px] bg-blue-500/10 text-blue-400 px-1.5 py-0.5 rounded font-mono font-bold uppercase">{r.state}</span>
                        {r.cities.length > 0
                          ? <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded">{r.cities.join(", ")}</span>
                          : <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded">Estado inteiro</span>
                        }
                        {r.sources?.map(src => (
                          <span key={src} className="text-[9px] bg-muted/80 text-muted-foreground border border-border/50 px-1 py-0.5 rounded font-mono font-bold uppercase">
                            {src === "fatalmodel" ? "FM" : src === "skokka" ? "SK" : "PA"}
                          </span>
                        ))}
                      </div>
                      <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
                        <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{getCronDescription(r.cron)}</span>
                        <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />Última: {r.lastRun ? fmtDate(r.lastRun) : "Nunca"}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-muted-foreground">{r.enabled ? "Ativo" : "Inativo"}</span>
                      <button onClick={() => toggleRoutine(r.id, !r.enabled).then(() => { toast.success("Atualizado"); loadRoutines(); })}
                        className={`w-9 h-5 rounded-full p-0.5 transition-colors ${r.enabled ? "bg-blue-600" : "bg-muted"}`}>
                        <div className={`bg-white w-4 h-4 rounded-full shadow transition-transform ${r.enabled ? "translate-x-4" : "translate-x-0"}`} />
                      </button>
                      <Button variant="outline" size="icon" onClick={() => handleRunNow(r)} disabled={!!runningRoutineId}
                        className="h-7 w-7 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10">
                        {runningRoutineId === r.id ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5 fill-current" />}
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => deleteRoutine(r.id).then(() => { toast.success("Removido"); loadRoutines(); })}
                        className="h-7 w-7 text-destructive hover:bg-destructive/10">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ═══ SEÇÃO 2: EXTENSÃO AUTOMÁTICA ══════════════════════════════════ */}
          <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
            <SectionHeader
              icon={Monitor}
              title="Extensão Automática"
              description="Usa o Chrome real — passa pelo Cloudflare sem fricção. Muito mais rápido. Chrome precisa estar aberto (qualquer computador)."
              badge="Chrome aberto"
              badgeColor="text-orange-400"
              action={
                <div className="flex items-center gap-3 shrink-0">
                  {/* Status da extensão */}
                  <div className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${
                    extOnline
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                      : "border-muted/40 bg-muted/10 text-muted-foreground"
                  }`}>
                    {extOnline
                      ? <><Wifi className="h-3 w-3" /> Extensão online</>
                      : <><WifiOff className="h-3 w-3" /> Extensão offline</>
                    }
                  </div>
                  <Button size="sm" onClick={() => setShowExtModal(true)}
                    className="gap-1.5 text-xs bg-orange-600 hover:bg-orange-700">
                    <Plus className="h-3.5 w-3.5" /> Enfileirar Job
                  </Button>
                </div>
              }
            />

            {/* Aviso quando offline */}
            {!extOnline && (
              <div className="mb-4 flex items-start gap-3 bg-amber-500/5 border border-amber-500/20 rounded-xl px-4 py-3 text-xs text-amber-400">
                <Zap className="h-4 w-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold mb-0.5">Extensão não detectada</p>
                  <p className="text-amber-400/70">Instale a extensão Skokka Scraper no Chrome e abra qualquer página. Os jobs criados ficam na fila e serão executados em até 1 minuto assim que a extensão ficar online.</p>
                </div>
              </div>
            )}

            {/* Lista de jobs */}
            {extJobs.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground border border-dashed border-border rounded-xl bg-muted/10">
                <Monitor className="h-8 w-8 mx-auto mb-2 opacity-20" />
                <p className="text-sm font-medium">Nenhum job na fila</p>
                <p className="text-xs mt-1">Clique em "Enfileirar Job" — a extensão executa automaticamente quando o Chrome estiver aberto.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {extJobs.map((j) => {
                  const statusConfig: Record<string, { label: string; color: string }> = {
                    pending: { label: "Aguardando", color: "text-yellow-400 bg-yellow-500/10 border-yellow-500/30" },
                    running: { label: "Executando", color: "text-blue-400 bg-blue-500/10 border-blue-500/30" },
                    done:    { label: "Concluído",  color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" },
                    failed:  { label: "Falhou",     color: "text-red-400 bg-red-500/10 border-red-500/30" },
                  };
                  const sc = statusConfig[j.status] ?? statusConfig.pending;
                  return (
                    <div key={j.id} className="bg-muted/20 border border-border/60 rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-orange-500/30 transition-all">
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm truncate">{j.name}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded border font-bold ${sc.color}`}>{sc.label}</span>
                          {j.status === "running" && <RefreshCw className="h-3 w-3 text-blue-400 animate-spin" />}
                        </div>
                        <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
                          <span>Págs. {j.pageFrom}–{j.pageTo}</span>
                          <span>Criado: {fmtDate(j.createdAt)}</span>
                          {j.completedAt && <span>Fim: {fmtDate(j.completedAt)}</span>}
                          {j.result && !j.result.error && (
                            <span className="text-emerald-400 font-medium">{j.result.created ?? 0} criados · {j.result.updated ?? 0} atualizados</span>
                          )}
                          {j.result?.error && <span className="text-red-400">{j.result.error}</span>}
                        </div>
                      </div>
                      {["pending", "failed", "done"].includes(j.status) && (
                        <Button variant="ghost" size="icon" onClick={() => handleDeleteExtJob(j.id)}
                          className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0">
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ═══ SEÇÃO 3: EXTENSÃO MANUAL ══════════════════════════════════════ */}
          <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
            <SectionHeader
              icon={MousePointer}
              title="Extensão Manual"
              description="Você controla quando e quais páginas raspar. Abra o Skokka no Chrome e use a extensão para capturar em segundos."
              badge="Manual"
              badgeColor="text-violet-400"
            />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { step: "1", title: "Instale a extensão", desc: "Carregue a pasta da extensão no Chrome (modo desenvolvedor)." },
                { step: "2", title: "Abra o Skokka", desc: "Navegue até a listagem da cidade que deseja capturar." },
                { step: "3", title: "Clique Iniciar", desc: "Escolha as páginas e inicie. Resultados vão pro CRM em tempo real." },
              ].map((s) => (
                <div key={s.step} className="flex items-start gap-3 bg-muted/20 border border-border/60 rounded-xl p-4">
                  <div className="h-6 w-6 rounded-full bg-violet-500/20 text-violet-400 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">{s.step}</div>
                  <div>
                    <p className="text-sm font-semibold mb-0.5">{s.title}</p>
                    <p className="text-xs text-muted-foreground">{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>

      {/* ── Modal: Raspar Agora (VPS) ─────────────────────────────────────────── */}
      {showScrapeModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl">
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                  <Server className="h-5 w-5 text-blue-400" />
                </div>
                <div>
                  <h2 className="font-semibold text-lg">Raspar Agora — Servidor</h2>
                  <p className="text-xs text-muted-foreground">Disparo manual no VPS</p>
                </div>
              </div>
              <div className="flex bg-muted p-1 rounded-lg">
                {["city","state"].map(m => (
                  <button key={m} type="button" onClick={() => setScrapeMode(m as any)}
                    className={`flex-1 text-xs py-1.5 rounded-md font-medium transition-colors ${scrapeMode === m ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}>
                    {m === "city" ? "Cidades específicas" : "Estado inteiro"}
                  </button>
                ))}
              </div>
              {scrapeMode === "city" ? (
                <div className="space-y-3">
                  <select value={singleScrapeState} onChange={e => setSingleScrapeState(e.target.value)}
                    className="w-full h-9 px-2 text-sm bg-input border border-border rounded-md text-foreground">
                    {STATES.map(s => <option key={s.code} value={s.code.toLowerCase()}>{s.code} — {s.label}</option>)}
                  </select>
                  <textarea placeholder="Natal, Mossoró..." value={scrapeCitiesText} onChange={e => setScrapeCitiesText(e.target.value)} rows={2}
                    className="w-full p-2 text-sm bg-input border border-border rounded-md text-foreground placeholder:text-muted-foreground/50 resize-none" />
                </div>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {STATES.map(s => {
                    const code = s.code.toLowerCase();
                    const checked = scrapeStates.includes(code);
                    return (
                      <label key={s.code} className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent/40 cursor-pointer">
                        <div className={`h-4 w-4 rounded border-2 flex items-center justify-center ${checked ? "bg-primary border-primary" : "border-border"}`}>
                          {checked && <Check className="h-2.5 w-2.5 text-white" />}
                        </div>
                        <input type="checkbox" className="sr-only" checked={checked}
                          onChange={e => setScrapeStates(prev => e.target.checked ? [...prev, code] : prev.filter(c => c !== code))} />
                        <span className="text-sm"><strong>{s.code}</strong> <span className="text-muted-foreground">— {s.label}</span></span>
                      </label>
                    );
                  })}
                </div>
              )}
              <div className="border-t border-border/50 pt-3">
                <p className="text-xs font-semibold text-muted-foreground mb-2">Portais</p>
                <PlatformPicker selected={selectedPlatforms} onChange={setSelectedPlatforms} />
              </div>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setShowScrapeModal(false)}>Cancelar</Button>
                <Button className="flex-1 bg-blue-600 hover:bg-blue-700" onClick={handleStartScrape}
                  disabled={selectedPlatforms.length === 0 || (scrapeMode === "city" && !scrapeCitiesText.trim())}>
                  Iniciar
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Agendar Rotina VPS ────────────────────────────────────────── */}
      {showRoutineModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form onSubmit={handleCreateRoutine} className="bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl">
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                  <Clock className="h-5 w-5 text-blue-400" />
                </div>
                <div>
                  <h2 className="font-semibold text-lg">Agendar Rotina — Servidor</h2>
                  <p className="text-xs text-muted-foreground">Varredura automática recorrente no VPS</p>
                </div>
              </div>
              <div className="space-y-3">
                <Input placeholder="Ex: Varredura Natal" value={routineName} onChange={e => setRoutineName(e.target.value)} required className="h-9 text-sm" />
                <select value={routineState} onChange={e => setRoutineState(e.target.value)}
                  className="w-full h-9 px-2 text-sm bg-input border border-border rounded-md text-foreground">
                  {STATES.map(s => <option key={s.code} value={s.code.toLowerCase()}>{s.code} — {s.label}</option>)}
                </select>
                <Input placeholder="Cidades (opcional, ex: Natal, Mossoró)" value={routineCities} onChange={e => setRoutineCities(e.target.value)} className="h-9 text-sm" />
                <div className="grid grid-cols-2 gap-3">
                  <select value={routineFrequency} onChange={e => setRoutineFrequency(e.target.value)}
                    className="w-full h-9 px-2 text-sm bg-input border border-border rounded-md text-foreground">
                    <option value="hourly">De hora em hora</option>
                    <option value="daily">Diário</option>
                    <option value="weekly">Semanal</option>
                  </select>
                  {routineFrequency !== "hourly" && (
                    <Input type="time" value={routineHour} onChange={e => setRoutineHour(e.target.value)} required className="h-9 text-sm" />
                  )}
                </div>
                {routineFrequency === "weekly" && (
                  <select value={routineDayOfWeek} onChange={e => setRoutineDayOfWeek(e.target.value)}
                    className="w-full h-9 px-2 text-sm bg-input border border-border rounded-md text-foreground">
                    {["Segunda","Terça","Quarta","Quinta","Sexta","Sábado","Domingo"].map((d, i) => (
                      <option key={i} value={i === 6 ? "0" : String(i + 1)}>{d}</option>
                    ))}
                  </select>
                )}
                <div className="border-t border-border/50 pt-2">
                  <p className="text-xs font-semibold text-muted-foreground mb-2">Portais</p>
                  <PlatformPicker selected={routinePlatforms} onChange={setRoutinePlatforms} />
                </div>
              </div>
              <div className="flex gap-3">
                <Button type="button" variant="outline" className="flex-1" onClick={() => setShowRoutineModal(false)}>Cancelar</Button>
                <Button type="submit" disabled={savingRoutine || !routinePlatforms.length} className="flex-1 bg-blue-600 hover:bg-blue-700">
                  {savingRoutine ? "Agendando..." : "Criar Rotina"}
                </Button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* ── Modal: Enfileirar Job Extensão ───────────────────────────────────── */}
      {showExtModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form onSubmit={handleCreateExtJob} className="bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl">
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-orange-500/10 flex items-center justify-center">
                  <Monitor className="h-5 w-5 text-orange-400" />
                </div>
                <div>
                  <h2 className="font-semibold text-lg">Enfileirar Job — Extensão</h2>
                  <p className="text-xs text-muted-foreground">Executado automaticamente pelo Chrome</p>
                </div>
              </div>
              <div className="space-y-3">
                <select value={extJobState} onChange={e => setExtJobState(e.target.value)}
                  className="w-full h-9 px-2 text-sm bg-input border border-border rounded-md text-foreground">
                  {STATES.map(s => <option key={s.code} value={s.code.toLowerCase()}>{s.code} — {s.label}</option>)}
                </select>
                <Input placeholder="Cidades (ex: Natal, Mossoró)" value={extJobCities} onChange={e => setExtJobCities(e.target.value)} className="h-9 text-sm" />
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[10px] text-muted-foreground mb-1">Página inicial</p>
                    <Input type="number" min={1} value={extJobPageFrom} onChange={e => setExtJobPageFrom(Number(e.target.value))} className="h-9 text-sm text-center" />
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground mb-1">Página final</p>
                    <Input type="number" min={1} value={extJobPageTo} onChange={e => setExtJobPageTo(Number(e.target.value))} className="h-9 text-sm text-center" />
                  </div>
                </div>
                <div className="border-t border-border/50 pt-2">
                  <p className="text-xs font-semibold text-muted-foreground mb-2">Portais</p>
                  <PlatformPicker selected={extJobSources} onChange={setExtJobSources} />
                </div>
                <div className="flex items-start gap-2 bg-orange-500/5 border border-orange-500/20 rounded-lg p-3 text-xs text-orange-400/80">
                  <ChevronRight className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>O job fica na fila e é executado em até 1 minuto quando o Chrome estiver aberto com a extensão instalada.</span>
                </div>
              </div>
              <div className="flex gap-3">
                <Button type="button" variant="outline" className="flex-1" onClick={() => setShowExtModal(false)}>Cancelar</Button>
                <Button type="submit" disabled={savingExtJob || !extJobSources.length} className="flex-1 bg-orange-600 hover:bg-orange-700">
                  {savingExtJob ? "Enfileirando..." : "Enfileirar Job"}
                </Button>
              </div>
            </div>
          </form>
        </div>
      )}
    </AppShell>
  );
}

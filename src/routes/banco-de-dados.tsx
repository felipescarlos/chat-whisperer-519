import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";
import {
  Folder, FolderOpen, ChevronRight, Search,
  Database, Wifi, Building2, Globe, ArrowLeft, Home, FileSpreadsheet,
  RefreshCw, MessageCircle, MapPin, Square, Trash2, CheckSquare,
  FolderInput, AlertTriangle, X, LayoutList, LayoutGrid, Upload,
  FolderPlus, Bot, Tag, Calendar, ExternalLink, UserCircle2, Phone,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Prospect, ProspectStats, ScrapeJobState, MoveConflict,
  ProspectCrmInfo, ImportRow,
  fetchProspects, fetchProspectStats,
  triggerScrape, fetchScrapeStatus, stopScrape,
  deleteProspects, previewMoveProspects, moveProspects,
  fetchProspectCrmInfo, importProspects,
} from "@/lib/evolution-api";
import { ScrapeLiveFeed } from "@/components/ScrapeLiveFeed";

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
  { code: "AC", label: "Acre" },
  { code: "AL", label: "Alagoas" },
  { code: "AP", label: "Amapá" },
  { code: "AM", label: "Amazonas" },
  { code: "BA", label: "Bahia" },
  { code: "CE", label: "Ceará" },
  { code: "DF", label: "Distrito Federal" },
  { code: "ES", label: "Espírito Santo" },
  { code: "GO", label: "Goiás" },
  { code: "MA", label: "Maranhão" },
  { code: "MT", label: "Mato Grosso" },
  { code: "MS", label: "Mato Grosso do Sul" },
  { code: "MG", label: "Minas Gerais" },
  { code: "PA", label: "Pará" },
  { code: "PB", label: "Paraíba" },
  { code: "PR", label: "Paraná" },
  { code: "PE", label: "Pernambuco" },
  { code: "PI", label: "Piauí" },
  { code: "RJ", label: "Rio de Janeiro" },
  { code: "RN", label: "Rio Grande do Norte" },
  { code: "RS", label: "Rio Grande do Sul" },
  { code: "RO", label: "Rondônia" },
  { code: "RR", label: "Roraima" },
  { code: "SC", label: "Santa Catarina" },
  { code: "SP", label: "São Paulo" },
  { code: "SE", label: "Sergipe" },
  { code: "TO", label: "Tocantins" },
];

const SOURCES_LABELS: Record<string, string> = {
  fatalmodel: "Fatal Model",
  skokka: "Skokka",
  fotoacomp: "PhotoAcomp",
  picjob_site: "PicJob Site",
};

function SourceBadge({ source, href }: { source: string; href?: string }) {
  const colors: Record<string, string> = {
    fatalmodel: "bg-rose-500/20 text-rose-300 border-rose-500/30",
    skokka: "bg-orange-500/20 text-orange-300 border-orange-500/30",
    fotoacomp: "bg-violet-500/20 text-violet-300 border-violet-500/30",
    picjob_site: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  };
  const cls = `text-[10px] px-1.5 py-0.5 rounded border font-medium transition-opacity ${colors[source] || "bg-muted text-muted-foreground border-border"}`;
  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        title={`Ver anúncio no ${SOURCES_LABELS[source] || source}`}
        className={`${cls} hover:opacity-70 cursor-pointer`}
      >
        {SOURCES_LABELS[source] || source}
      </a>
    );
  }
  return (
    <span className={cls}>
      {SOURCES_LABELS[source] || source}
    </span>
  );
}

// ─── Brazilian cities autocomplete list (major cities per state) ──────────
const BR_CITIES: { state: string; cities: string[] }[] = [
  { state: "RN", cities: ["Natal","Mossoró","Parnamirim","Caicó","Açu","Currais Novos","São Gonçalo do Amarante","Macaíba"] },
  { state: "CE", cities: ["Fortaleza","Caucaia","Juazeiro do Norte","Maracanaú","Sobral","Crato","Itapipoca","Maranguape","Iguatu"] },
  { state: "PB", cities: ["João Pessoa","Campina Grande","Santa Rita","Patos","Bayeux","Sousa","Cajazeiras","Guarabira"] },
  { state: "PE", cities: ["Recife","Olinda","Caruaru","Petrolina","Jaboatão dos Guararapes","Paulista","Cabo de Santo Agostinho","Caruaru"] },
  { state: "AL", cities: ["Maceió","Arapiraca","Rio Largo","Palmeira dos Índios","União dos Palmares","Penedo"] },
  { state: "BA", cities: ["Salvador","Feira de Santana","Vitória da Conquista","Camaçari","Itabuna","Juazeiro","Ilhéus","Lauro de Freitas"] },
  { state: "SP", cities: ["São Paulo","Campinas","Santos","Guarulhos","São Bernardo do Campo","Santo André","Osasco","Ribeirão Preto","São José dos Campos","Sorocaba","São José do Rio Preto","Mauá","São Caetano do Sul","Bauru","Jundiaí"] },
  { state: "RJ", cities: ["Rio de Janeiro","Niterói","Duque de Caxias","Nova Iguaçu","Belford Roxo","São João de Meriti","Campos dos Goytacazes","Petrópolis","Volta Redonda","Macaé"] },
  { state: "MG", cities: ["Belo Horizonte","Uberlândia","Contagem","Juiz de Fora","Betim","Montes Claros","Ribeirão das Neves","Uberaba","Governador Valadares"] },
  { state: "PR", cities: ["Curitiba","Londrina","Maringá","Ponta Grossa","Cascavel","São José dos Pinhais","Foz do Iguaçu","Colombo","Guarapuava"] },
  { state: "SC", cities: ["Florianópolis","Joinville","Blumenau","São José","Chapecó","Itajaí","Criciúma","Jaraguá do Sul","Palhoça"] },
  { state: "RS", cities: ["Porto Alegre","Caxias do Sul","Canoas","Pelotas","Santa Maria","Gravataí","Viamão","Novo Hamburgo","São Leopoldo"] },
];

// ─── Contact Popup ────────────────────────────────────────────────────────

function ContactPopup({
  prospect,
  onClose,
}: {
  prospect: Prospect;
  onClose: () => void;
}) {
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

  const stageColors: Record<string, string> = {
    "#3b82f6": "bg-blue-500/20 text-blue-300 border-blue-500/30",
    "#10b981": "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
    "#f59e0b": "bg-amber-500/20 text-amber-300 border-amber-500/30",
    "#ef4444": "bg-red-500/20 text-red-300 border-red-500/30",
    "#8b5cf6": "bg-violet-500/20 text-violet-300 border-violet-500/30",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-sm bg-card border border-border rounded-2xl shadow-2xl overflow-hidden">
        {/* Header with photo */}
        <div className="relative">
          {prospect.thumbUrl ? (
            <img src={prospect.thumbUrl} alt={prospect.name} className="w-full h-40 object-cover" />
          ) : (
            <div className="w-full h-32 bg-gradient-to-br from-violet-500/20 to-emerald-500/10 flex items-center justify-center">
              <span className="text-4xl font-bold text-white/30">{initials}</span>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-card via-card/20 to-transparent" />
          <button
            onClick={onClose}
            className="absolute top-3 right-3 w-7 h-7 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white/70 hover:text-white transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="absolute bottom-3 left-4">
            <h2 className="font-bold text-lg leading-tight">{prospect.name}</h2>
            {phone && <p className="text-xs text-emerald-400 font-mono">{phone}</p>}
          </div>
        </div>

        {/* Body */}
        <div className="p-4 space-y-3">
          {/* Basic info row */}
          <div className="flex flex-wrap gap-2 text-xs">
            {prospect.city && (
              <span className="flex items-center gap-1 text-muted-foreground">
                <MapPin className="h-3 w-3" /> {prospect.city}{prospect.state ? ` / ${prospect.state}` : ""}
              </span>
            )}
            <span className="flex items-center gap-1 text-muted-foreground">
              <Calendar className="h-3 w-3" /> {new Date(prospect.firstSeenAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
            </span>
          </div>

          <div className="flex flex-wrap gap-1">
            {prospect.sources.map((s) => (
              <SourceBadge key={s} source={s} href={prospect.sourceUrls?.[s]} />
            ))}
          </div>

          <div className="border-t border-border/60 pt-3">
            {crmLoading ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground animate-pulse">
                <RefreshCw className="h-3 w-3 animate-spin" /> Verificando CRM…
              </div>
            ) : contact ? (
              <div className="space-y-2.5">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">No CRM</p>
                {contact.stage && (
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${stageColors[contact.stage.color] || "bg-muted text-muted-foreground border-border"}`}>
                      {contact.stage.name}
                    </span>
                  </div>
                )}
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Bot className="h-3 w-3" /> Bot {contact.botEnabled ? "ativo" : "inativo"}
                  </span>
                  {contact.tags && contact.tags !== "" && (
                    <span className="flex items-center gap-1">
                      <Tag className="h-3 w-3" /> {contact.tags}
                    </span>
                  )}
                </div>
                {contact.lastMessage && (
                  <div className="bg-muted/40 border border-border rounded-lg px-3 py-2 text-xs">
                    <p className="text-muted-foreground text-[10px] mb-0.5">
                      Última msg · {contact.lastMessage.fromMe ? "Você" : "Contato"}
                    </p>
                    <p className="truncate">{contact.lastMessage.text}</p>
                  </div>
                )}
                {contact.notes && (
                  <p className="text-xs text-muted-foreground italic line-clamp-2">{contact.notes}</p>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">Ainda não está no CRM.</p>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            {waUrl && (
              <a
                href={waUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-lg bg-[#25D366] hover:bg-[#1ebe5d] text-white text-sm font-medium transition-colors"
              >
                <MessageCircle className="h-4 w-4" /> WhatsApp
              </a>
            )}
            {contact && (
              <a
                href="/crm"
                className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium transition-colors"
              >
                <ExternalLink className="h-4 w-4" /> Abrir no CRM
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Import Modal ─────────────────────────────────────────────────────────

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const delim = lines[0].includes(";") ? ";" : ",";
  const headers = lines[0].split(delim).map((h) => h.replace(/^"|"$/g, "").trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const vals = line.split(delim).map((v) => v.replace(/^"|"$/g, "").trim());
    return Object.fromEntries(headers.map((h, i) => [h, vals[i] || ""]));
  });
}

function ImportModal({
  onClose,
  onImported,
  allCities,
  currentState,
  currentCity,
}: {
  onClose: () => void;
  onImported: (created: number, updated: number) => void;
  allCities: { state: string; city: string }[];
  currentState: string;
  currentCity: string;
}) {
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [targetState, setTargetState] = useState(currentState);
  const [targetCity, setTargetCity] = useState(currentCity);
  const [cityInput, setCityInput] = useState(currentCity);
  const [importing, setImporting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const citySuggestions = [
    ...new Set([
      ...allCities.filter((c) => c.state === targetState).map((c) => c.city),
      ...(BR_CITIES.find((s) => s.state === targetState)?.cities || []),
    ]),
  ].sort();

  const processFile = (file: File) => {
    setFileName(file.name);
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext === "xlsx" || ext === "xls") {
      const reader = new FileReader();
      reader.onload = (e) => {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json<ImportRow>(ws, { defval: "" });
        setRows(json.slice(0, 2000));
      };
      reader.readAsArrayBuffer(file);
    } else {
      const reader = new FileReader();
      reader.onload = (e) => setRows(parseCSV(e.target?.result as string).slice(0, 2000));
      reader.readAsText(file, "utf-8");
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  };

  const handleConfirm = async () => {
    if (!targetState || !targetCity || rows.length === 0) return;
    setImporting(true);
    try {
      const res = await importProspects({ rows, targetCity, targetState });
      onImported(res.created, res.updated);
    } catch {
      toast.error("Erro ao importar contatos");
    } finally {
      setImporting(false);
    }
  };

  const previewCols = rows[0] ? Object.keys(rows[0]).slice(0, 5) : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-2xl bg-card border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-emerald-400" />
            <h2 className="font-semibold text-base">Importar contatos</h2>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
          {/* Drop zone */}
          {rows.length === 0 ? (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-10 flex flex-col items-center gap-3 cursor-pointer transition-colors ${dragOver ? "border-emerald-500 bg-emerald-500/5" : "border-border hover:border-emerald-500/50 hover:bg-muted/20"}`}
            >
              <Upload className="h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground text-center">
                Arraste um arquivo <span className="font-semibold text-foreground">.CSV</span> ou <span className="font-semibold text-foreground">.XLSX</span> aqui<br />
                <span className="text-xs">ou clique para selecionar</span>
              </p>
              <p className="text-[10px] text-muted-foreground/60 text-center">Colunas reconhecidas: nome / name, telefone / phone / whatsapp</p>
              <input
                ref={inputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) processFile(f); }}
              />
            </div>
          ) : (
            <>
              {/* File info + reset */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm">
                  <FileSpreadsheet className="h-4 w-4 text-emerald-400" />
                  <span className="font-medium">{fileName}</span>
                  <span className="text-muted-foreground">· {rows.length} linhas</span>
                </div>
                <button
                  onClick={() => { setRows([]); setFileName(""); }}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Trocar arquivo
                </button>
              </div>

              {/* Preview table */}
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-muted/40">
                      {previewCols.map((col) => (
                        <th key={col} className="text-left px-3 py-2 font-medium text-muted-foreground">{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 5).map((row, i) => (
                      <tr key={i} className="border-b border-border/50 last:border-0">
                        {previewCols.map((col) => (
                          <td key={col} className="px-3 py-1.5 truncate max-w-[140px]">{String(row[col] ?? "")}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rows.length > 5 && (
                  <p className="text-[10px] text-muted-foreground px-3 py-1.5 bg-muted/20">
                    … e mais {rows.length - 5} linhas
                  </p>
                )}
              </div>
            </>
          )}

          {/* Destination */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Estado destino</label>
              <select
                value={targetState}
                onChange={(e) => { setTargetState(e.target.value); setCityInput(""); setTargetCity(""); }}
                className="w-full h-10 rounded-lg border border-border bg-muted/40 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              >
                <option value="">Selecione…</option>
                {["RN","CE","PB","PE","AL","BA","SP","RJ","MG","PR","SC","RS"].map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Pasta (cidade)</label>
              <div className="relative">
                <input
                  list="city-suggestions"
                  value={cityInput}
                  onChange={(e) => { setCityInput(e.target.value); setTargetCity(e.target.value); }}
                  placeholder="Ex: Natal"
                  disabled={!targetState}
                  className="w-full h-10 rounded-lg border border-border bg-muted/40 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 disabled:opacity-50"
                />
                <datalist id="city-suggestions">
                  {citySuggestions.map((c) => <option key={c} value={c} />)}
                </datalist>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex justify-end gap-2 shrink-0">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancelar</Button>
          <Button
            size="sm"
            disabled={rows.length === 0 || !targetState || !targetCity || importing}
            onClick={handleConfirm}
            className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {importing
              ? <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Importando…</>
              : <><Upload className="h-3.5 w-3.5" /> Importar {rows.length} contato{rows.length !== 1 ? "s" : ""}</>
            }
          </Button>
        </div>
      </div>
    </div>
  );
}

const LIMIT = 2000;

function BancoDeDadosPage() {
  // Active tab
  const [activeTab, setActiveTab] = useState<"scraper" | "cadastros" | "conversoes">("scraper");

  // Navigation Path: "" (Root/States) -> "STATE_CODE" (Cities) -> "STATE_CODE/CITY" (Leads)
  const [filterState, setFilterState] = useState("");
  const [filterCity, setFilterCity] = useState("");

  // Data
  const [stats, setStats] = useState<ProspectStats | null>(null);
  const [items, setItems] = useState<Prospect[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"firstSeenAt" | "name" | "lastSeenAt">("firstSeenAt");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const lastClickedIndexRef = useRef<number>(-1);

  // View mode: persisted in localStorage
  const [viewMode, setViewMode] = useState<"list" | "grid">(() => {
    try { return (localStorage.getItem("db-view-mode") as "list" | "grid") || "list"; } catch { return "list"; }
  });
  const setAndPersistViewMode = (mode: "list" | "grid") => {
    setViewMode(mode);
    try { localStorage.setItem("db-view-mode", mode); } catch {}
  };

  // Source filter
  const [filterSource, setFilterSource] = useState("");

  // Contact popup
  const [popupProspect, setPopupProspect] = useState<Prospect | null>(null);

  // Import modal
  const [showImportModal, setShowImportModal] = useState(false);

  // Move modal state
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [moveTargetState, setMoveTargetState] = useState("");
  const [moveTargetCity, setMoveTargetCity] = useState("");
  const [moveConflicts, setMoveConflicts] = useState<MoveConflict[] | null>(null);
  const [moveConflictResolution, setMoveConflictResolution] = useState<"replace" | "keep-both" | "skip" | "merge">("skip");
  const [moving, setMoving] = useState(false);

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
      const tabSource = activeTab === "cadastros" ? "picjob_site" : (filterSource || undefined);
      const data = await fetchProspects({
        state: filterState === "SEM_ESTADO" ? "" : filterState,
        city: filterCity === "Sem cidade" ? "" : filterCity,
        search: searchQuery,
        source: tabSource,
        page: 1,
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
  }, [filterState, filterCity, searchQuery, filterSource, activeTab]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  useEffect(() => {
    if (filterState && filterCity) {
      loadProspects();
    } else {
      setItems([]);
      setTotal(0);
    }
    setSelectionMode(false);
    setSelectedIds(new Set());
    setFilterSource("");
  }, [filterState, filterCity, loadProspects]);

  // Trigger search on Enter or Button click
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadProspects();
  };

  // Refresh state: "city|source" key enquanto scraping
  const [refreshingKey, setRefreshingKey] = useState<string | null>(null);
  const [isStopping, setIsStopping] = useState(false);
  const [showSourcePicker, setShowSourcePicker] = useState(false);
  const [scrapeJobState, setScrapeJobState] = useState<ScrapeJobState | null>(null);
  const [globalScraping, setGlobalScraping] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const globalPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Poll global scrape status (para mostrar botão Stop mesmo quando iniciado pelo Radar)
  useEffect(() => {
    const check = async () => {
      try {
        const s = await fetchScrapeStatus();
        const running = ["running", "stopping"].includes(s.status);
        setGlobalScraping(running);
        if (running) setScrapeJobState(s);
        else if (!refreshingKey) setScrapeJobState(null);
      } catch { /* silencia */ }
    };
    check();
    globalPollRef.current = setInterval(check, 5000);
    return () => { if (globalPollRef.current) clearInterval(globalPollRef.current); };
  }, [refreshingKey]);

  const handleStop = useCallback(async () => {
    setIsStopping(true);
    try {
      await stopScrape();
      toast.info("Parando raspagem… aguarde o perfil atual terminar.");
    } catch {
      toast.error("Erro ao parar raspagem");
    } finally {
      setIsStopping(false);
    }
  }, []);

  const SCRAPE_SOURCES = [
    { id: "fatalmodel", label: "FM",    title: "Fatal Model",    color: "hover:bg-rose-500/20 hover:text-rose-400 hover:border-rose-500/40" },
    { id: "fotoacomp",  label: "PA",    title: "PhotoAcomp",     color: "hover:bg-violet-500/20 hover:text-violet-400 hover:border-violet-500/40" },
    { id: "skokka",     label: "SK",    title: "Skokka",         color: "hover:bg-orange-500/20 hover:text-orange-400 hover:border-orange-500/40" },
  ] as const;

  const handleRefreshCity = useCallback(async (city: string, stateCode: string, source: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const key = `${city}|${source}`;
    if (refreshingKey) return;
    setRefreshingKey(key);

    try {
      const before = await fetchProspects({ state: stateCode, city, limit: 1 });
      const beforeCount = before.total;

      const citySlug = city.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, "-");
      await triggerScrape([stateCode.toLowerCase()], [citySlug], [source]);

      await new Promise<void>((resolve) => {
        pollRef.current = setInterval(async () => {
          try {
            const status = await fetchScrapeStatus();
            setScrapeJobState(status);
            if (!["running", "stopping"].includes(status.status)) {
              clearInterval(pollRef.current!);
              resolve();
            }
          } catch {
            clearInterval(pollRef.current!);
            resolve();
          }
        }, 3000);
      });

      const [after, finalStatus] = await Promise.all([
        fetchProspects({ state: stateCode, city, limit: 1 }),
        fetchScrapeStatus(),
      ]);
      const newLeads = after.total - beforeCount;
      const found = finalStatus.counts?.total ?? after.total;
      const alreadyInDB = found - newLeads;

      toast.success(
        `${city} / ${SCRAPE_SOURCES.find(s => s.id === source)?.title}: ${found} encontrados — ${newLeads} novos, ${alreadyInDB} já estavam no banco.`,
        { duration: 8000 }
      );

      loadStats();
      if (filterCity === city) loadProspects();
    } catch (err) {
      console.error(err);
      toast.error(`Erro ao atualizar ${city}`);
    } finally {
      setRefreshingKey(null);
      setScrapeJobState(null);
    }
  }, [refreshingKey, filterCity, loadStats, loadProspects]);

  // Group stats for folder view
  const groupedStats = stats?.byStateCity?.reduce((acc, curr) => {
    const state = curr.state || "SEM_ESTADO";
    if (!acc[state]) {
      acc[state] = {
        total: 0,
        cities: [] as { city: string; count: number }[],
      };
    }
    acc[state].total += curr.count;
    const city = curr.city || "Sem cidade";
    acc[state].cities.push({ city, count: curr.count });
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

  const handleDeleteSelected = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    try {
      await deleteProspects(ids);
      setItems((prev) => prev.filter((p) => !selectedIds.has(p.id)));
      setTotal((prev) => prev - ids.length);
      setSelectedIds(new Set());
      setSelectionMode(false);
      toast.success(`${ids.length} contato${ids.length > 1 ? "s" : ""} apagado${ids.length > 1 ? "s" : ""}`);
      loadStats();
    } catch (err) {
      console.error(err);
      toast.error("Erro ao apagar contatos");
    }
  };

  const openMoveModal = () => {
    setMoveTargetState("");
    setMoveTargetCity("");
    setMoveConflicts(null);
    setMoveConflictResolution("skip");
    setShowMoveModal(true);
  };

  const closeMoveModal = () => {
    setShowMoveModal(false);
    setMoveConflicts(null);
  };

  const handleMoveCheck = async () => {
    if (!moveTargetState || !moveTargetCity) return;
    setMoving(true);
    try {
      const ids = Array.from(selectedIds);
      const preview = await previewMoveProspects({ ids, targetCity: moveTargetCity, targetState: moveTargetState });
      if (preview.conflicts.length === 0) {
        await executeMoveProspects("keep-both");
      } else {
        // Se todos os conflitos são mesmo telefone com plataformas diferentes → sugere merge
        const allMergeable = preview.conflicts.every(c => c.phoneMatch && c.differentSources);
        setMoveConflictResolution(allMergeable ? "merge" : "skip");
        setMoveConflicts(preview.conflicts);
      }
    } catch (err) {
      console.error(err);
      toast.error("Erro ao verificar destino");
    } finally {
      setMoving(false);
    }
  };

  const executeMoveProspects = async (resolution: "replace" | "keep-both" | "skip") => {
    setMoving(true);
    const originCity = filterCity;
    const originState = filterState;
    try {
      const ids = Array.from(selectedIds);
      const res = await moveProspects({ ids, targetCity: moveTargetCity, targetState: moveTargetState, conflictResolution: resolution });
      setItems((prev) => prev.filter((p) => !selectedIds.has(p.id)));
      setTotal((prev) => prev - res.moved);
      setSelectedIds(new Set());
      setSelectionMode(false);
      closeMoveModal();
      loadStats();

      const movedIds = [...ids];
      const destCity = moveTargetCity;
      const destState = moveTargetState;
      toast.success(
        `${res.moved} contato${res.moved > 1 ? "s" : ""} movido${res.moved > 1 ? "s" : ""} para ${destCity}`,
        {
          duration: 10000,
          action: {
            label: "Desfazer",
            onClick: async () => {
              try {
                const undo = await moveProspects({
                  ids: movedIds,
                  targetCity: originCity,
                  targetState: originState,
                  conflictResolution: "keep-both",
                });
                if (filterCity === originCity && filterState === originState) loadProspects();
                loadStats();
                toast.success(`Movimentação desfeita — ${undo.moved} contato${undo.moved > 1 ? "s" : ""} restaurado${undo.moved > 1 ? "s" : ""} em ${originCity}`);
              } catch {
                toast.error("Erro ao desfazer movimentação");
              }
            },
          },
        },
      );
    } catch (err) {
      console.error(err);
      toast.error("Erro ao mover contatos");
    } finally {
      setMoving(false);
    }
  };

  const currentStateData = sortedStates.find(([code]) => code === filterState)?.[1];
  const currentCityCount = currentStateData?.cities.find((c) => c.city === filterCity)?.count || 0;
  const stateLabel = filterState === "SEM_ESTADO" ? "Sem localização" : (STATES.find((s) => s.code === filterState)?.label || filterState);


  // Flat list of all cities in DB for import autocomplete
  const allCities = sortedStates.flatMap(([state, data]) =>
    data.cities.map(({ city }) => ({ state, city }))
  );

  // Reset navigation on tab change
  const handleTabChange = (tab: "scraper" | "cadastros" | "conversoes") => {
    setActiveTab(tab);
    setFilterState("");
    setFilterCity("");
    setFilterSource("");
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  // Client-side sort + tab filter
  const sortedItems = [...items].filter((p) => {
    if (activeTab === "scraper") return !p.sources.includes("picjob_site");
    if (activeTab === "cadastros") return p.sources.includes("picjob_site");
    return true;
  }).sort((a, b) => {
    let cmp = 0;
    if (sortBy === "name") {
      cmp = (a.name || "").localeCompare(b.name || "", "pt-BR");
    } else {
      const da = new Date(sortBy === "firstSeenAt" ? a.firstSeenAt : a.lastSeenAt).getTime();
      const db2 = new Date(sortBy === "firstSeenAt" ? b.firstSeenAt : b.lastSeenAt).getTime();
      cmp = da - db2;
    }
    return sortDir === "desc" ? -cmp : cmp;
  });

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

          {/* Tabs */}
          <div className="flex gap-1 bg-muted/40 border border-border rounded-xl p-1">
            {([
              { id: "scraper",    label: "Scraper",    desc: "Leads raspados" },
              { id: "cadastros",  label: "Cadastros",  desc: "Site PicJob" },
              { id: "conversoes", label: "Conversões", desc: "Cruzamento" },
            ] as const).map((tab) => (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={`flex-1 flex flex-col items-center py-2.5 px-4 rounded-lg text-sm font-medium transition-all ${
                  activeTab === tab.id
                    ? tab.id === "scraper"
                      ? "bg-card border border-border shadow-sm text-foreground"
                      : tab.id === "cadastros"
                      ? "bg-blue-500/10 border border-blue-500/30 text-blue-300"
                      : "bg-emerald-500/10 border border-emerald-500/30 text-emerald-300"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <span>{tab.label}</span>
                <span className="text-[10px] font-normal opacity-60">{tab.desc}</span>
              </button>
            ))}
          </div>

          {/* Stats Cards Banner */}
          {stats && !filterState && activeTab !== "conversoes" && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {(activeTab === "scraper" ? [
                { label: "Total Scraper", value: (stats.bySource.fatalmodel || 0) + (stats.bySource.fotoacomp || 0) + (stats.bySource.skokka || 0), icon: Database, color: "text-violet-400 bg-violet-500/10 border-violet-500/20" },
                { label: "Com WhatsApp", value: stats.withPhone, icon: Wifi, color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
                { label: "Fatal Model", value: stats.bySource.fatalmodel || 0, icon: Globe, color: "text-rose-400 bg-rose-500/10 border-rose-500/20" },
                { label: "Skokka", value: stats.bySource.skokka || 0, icon: Globe, color: "text-orange-400 bg-orange-500/10 border-orange-500/20" },
              ] : [
                { label: "Total Cadastros", value: stats.bySource.picjob_site || 0, icon: Database, color: "text-blue-400 bg-blue-500/10 border-blue-500/20" },
                { label: "Com WhatsApp", value: stats.withPhone, icon: Wifi, color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
                { label: "Fatal Model", value: stats.bySource.fatalmodel || 0, icon: Globe, color: "text-rose-400 bg-rose-500/10 border-rose-500/20" },
                { label: "PhotoAcomp", value: stats.bySource.fotoacomp || 0, icon: Globe, color: "text-violet-400 bg-violet-500/10 border-violet-500/20" },
              ]).map((s) => (

                <div key={s.label} className="bg-card border border-border rounded-xl p-4 flex flex-col gap-1 shadow-sm">
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

          {/* Conversões Tab Content */}
          {activeTab === "conversoes" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-card border border-border rounded-xl p-5 space-y-1">
                  <span className="text-xs text-muted-foreground">Leads raspados</span>
                  <p className="text-3xl font-bold text-violet-400">
                    {((stats?.bySource.fatalmodel || 0) + (stats?.bySource.fotoacomp || 0) + (stats?.bySource.skokka || 0)).toLocaleString("pt-BR")}
                  </p>
                  <span className="text-xs text-muted-foreground">FatalModel + PhotoAcomp + Skokka</span>
                </div>
                <div className="bg-card border border-border rounded-xl p-5 space-y-1">
                  <span className="text-xs text-muted-foreground">Cadastros no site</span>
                  <p className="text-3xl font-bold text-blue-400">
                    {(stats?.bySource.picjob_site || 0).toLocaleString("pt-BR")}
                  </p>
                  <span className="text-xs text-muted-foreground">Usuários registrados no PicJob</span>
                </div>
                <div className="bg-card border border-border rounded-xl p-5 space-y-1">
                  <span className="text-xs text-muted-foreground">Taxa de conversão estimada</span>
                  <p className="text-3xl font-bold text-emerald-400">
                    {stats && (stats.bySource.fatalmodel + stats.bySource.fotoacomp + stats.bySource.skokka) > 0
                      ? (((stats.bySource.picjob_site || 0) / (stats.bySource.fatalmodel + stats.bySource.fotoacomp + stats.bySource.skokka)) * 100).toFixed(1) + "%"
                      : "–"}
                  </p>
                  <span className="text-xs text-muted-foreground">Cadastros / leads raspados</span>
                </div>
              </div>
              <div className="bg-card border border-border/60 border-dashed rounded-xl p-8 text-center space-y-2">
                <UserCircle2 className="h-10 w-10 text-muted-foreground/30 mx-auto" />
                <p className="text-sm font-medium text-muted-foreground">Cruzamento individual em breve</p>
                <p className="text-xs text-muted-foreground/60">Vai mostrar quais números do scraper se cadastraram no PicJob, com data e funil completo.</p>
              </div>
            </div>
          )}

          {/* Breadcrumbs Navigation */}
          {activeTab !== "conversoes" && <div className="bg-card/30 backdrop-blur-md border border-border/50 rounded-xl p-3 flex items-center gap-2 text-sm">
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
          </div>}

          {/* Root Level: Show States Folders */}
          {activeTab !== "conversoes" && !filterState && (
            <div className="space-y-4">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Pastas de Estados
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {sortedStates.map(([stateCode, data]) => {
                  const label = stateCode === "SEM_ESTADO" ? "Sem localização" : (STATES.find((s) => s.code === stateCode)?.label || stateCode);
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
          {activeTab !== "conversoes" && filterState && !filterCity && (
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

                <div className="ml-auto flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowImportModal(true)}
                    className="h-7 px-3 text-xs gap-1.5"
                  >
                    <FolderPlus className="h-3.5 w-3.5" />
                    Nova pasta
                  </Button>

                  {/* Botão Stop — aparece sempre que houver scraping em andamento */}
                  {(refreshingKey || globalScraping) && (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={handleStop}
                      disabled={isStopping}
                      className="h-7 px-3 text-xs gap-1.5"
                    >
                      {isStopping
                        ? <RefreshCw className="h-3 w-3 animate-spin" />
                        : <Square className="h-3 w-3 fill-current" />}
                      {isStopping ? "Parando…" : "Parar raspagem"}
                    </Button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {currentStateData?.cities.map(({ city, count }) => {
                  const anyRefreshing = SCRAPE_SOURCES.some(s => refreshingKey === `${city}|${s.id}`);
                  const activeSource = SCRAPE_SOURCES.find(s => refreshingKey === `${city}|${s.id}`);
                  return (
                    <div
                      key={city}
                      className="group relative flex flex-col items-center justify-center p-5 bg-card/40 hover:bg-card border border-border hover:border-emerald-500/40 rounded-2xl transition-all duration-200 shadow-sm overflow-hidden cursor-pointer active:scale-95"
                      onClick={() => setFilterCity(city)}
                    >
                      <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                      {/* Botões FM / PA / SK — canto superior direito, aparecem no hover */}
                      <div
                        className="absolute top-2 right-2 z-10 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {SCRAPE_SOURCES.map((src) => {
                          const isThis = refreshingKey === `${city}|${src.id}`;
                          return (
                            <button
                              key={src.id}
                              onClick={(e) => handleRefreshCity(city, filterState, src.id, e)}
                              disabled={!!refreshingKey}
                              title={`Atualizar ${city} via ${src.title}`}
                              className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold border bg-muted/60 text-muted-foreground border-border transition-colors disabled:opacity-30 ${src.color}`}
                            >
                              {isThis
                                ? <RefreshCw className="h-2.5 w-2.5 animate-spin" />
                                : src.label}
                            </button>
                          );
                        })}
                      </div>

                      <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                        <Folder className="h-6 w-6 text-emerald-400 group-hover:hidden" />
                        <FolderOpen className="h-6 w-6 text-emerald-400 hidden group-hover:block" />
                      </div>
                      <span className="font-bold text-sm text-foreground group-hover:text-emerald-400 transition-colors text-center line-clamp-2 leading-tight max-w-full px-1 break-words">
                        {city}
                      </span>
                      <span className="text-[11px] font-mono bg-muted/60 border border-border px-2 py-0.5 rounded-full mt-3 text-muted-foreground">
                        {anyRefreshing ? `Buscando ${activeSource?.label ?? ""}…` : `${count} leads`}
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
          {/* (activeTab guard handled by breadcrumb/folder guards above) */}
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

                  {/* Botão Atualizar com popup de plataforma */}
                  <div className="relative">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowSourcePicker(v => !v)}
                      disabled={!!refreshingKey}
                      className="gap-2 h-9"
                    >
                      <RefreshCw className={`h-4 w-4 ${refreshingKey ? 'animate-spin' : ''}`} />
                      {refreshingKey ? 'Atualizando…' : 'Atualizar'}
                    </Button>

                    {showSourcePicker && !refreshingKey && (
                      <>
                      <div className="fixed inset-0 z-10" onClick={() => setShowSourcePicker(false)} />
                      <div className="absolute right-0 top-full mt-1 z-20 bg-card border border-border rounded-xl shadow-xl p-3 flex flex-col gap-1.5 min-w-[140px]">
                        <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider px-1 mb-0.5">Plataforma</p>
                        {SCRAPE_SOURCES.map((src) => (
                          <button
                            key={src.id}
                            onClick={(e) => {
                              setShowSourcePicker(false);
                              handleRefreshCity(filterCity, filterState, src.id, e);
                            }}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium border bg-muted/40 text-muted-foreground border-border hover:bg-muted transition-colors ${src.color}`}
                          >
                            <span className="text-[10px] font-bold">{src.label}</span>
                            {src.title}
                          </button>
                        ))}
                      </div>
                      </>
                    )}
                  </div>

                  <Button
                    variant="default"
                    size="sm"
                    onClick={handleExportCSV}
                    className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium h-9"
                  >
                    <FileSpreadsheet className="h-4 w-4" />
                    Exportar Planilha (CSV)
                  </Button>

                  <Button
                    variant={selectionMode ? "default" : "outline"}
                    size="sm"
                    onClick={() => { setSelectionMode(v => !v); setSelectedIds(new Set()); lastClickedIndexRef.current = -1; }}
                    className={`gap-2 h-9 ${selectionMode ? "bg-violet-600 hover:bg-violet-700 text-white border-violet-600" : ""}`}
                  >
                    <CheckSquare className="h-4 w-4" />
                    {selectionMode ? "Cancelar" : "Selecionar"}
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowImportModal(true)}
                    className="gap-2 h-9"
                  >
                    <Upload className="h-4 w-4" />
                    Importar
                  </Button>

                  {/* View mode toggle */}
                  <div className="flex border border-border rounded-lg overflow-hidden h-9">
                    <button
                      onClick={() => setAndPersistViewMode("list")}
                      title="Visualização lista"
                      className={`px-2.5 flex items-center transition-colors ${viewMode === "list" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      <LayoutList className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setAndPersistViewMode("grid")}
                      title="Visualização grade"
                      className={`px-2.5 flex items-center transition-colors border-l border-border ${viewMode === "grid" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      <LayoutGrid className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Source filter chips */}
              <div className="flex items-center gap-2 flex-wrap">
                {[
                  { id: "",            label: "Todos",        color: "border-border text-muted-foreground hover:border-foreground/40" },
                  { id: "fatalmodel",  label: "Fatal Model",  color: "border-rose-500/40 text-rose-400 hover:bg-rose-500/10" },
                  { id: "fotoacomp",   label: "PhotoAcomp",   color: "border-violet-500/40 text-violet-400 hover:bg-violet-500/10" },
                  { id: "skokka",      label: "Skokka",       color: "border-orange-500/40 text-orange-400 hover:bg-orange-500/10" },
                  { id: "picjob_site", label: "PicJob Site",  color: "border-blue-500/40 text-blue-400 hover:bg-blue-500/10" },
                ].map((src) => (
                  <button
                    key={src.id}
                    onClick={() => { setFilterSource(src.id); }}
                    className={`px-3 py-1 rounded-full border text-xs font-medium transition-colors ${
                      filterSource === src.id
                        ? src.id === ""
                          ? "bg-muted border-foreground/30 text-foreground"
                          : src.id === "fatalmodel"
                          ? "bg-rose-500/15 border-rose-500/60 text-rose-300"
                          : src.id === "fotoacomp"
                          ? "bg-violet-500/15 border-violet-500/60 text-violet-300"
                          : src.id === "picjob_site"
                          ? "bg-blue-500/15 border-blue-500/60 text-blue-300"
                          : "bg-orange-500/15 border-orange-500/60 text-orange-300"
                        : src.color
                    }`}
                  >
                    {src.label}
                  </button>
                ))}
              </div>

              {/* Sort controls */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-muted-foreground">Ordenar:</span>
                {([
                  { id: "firstSeenAt",  label: "Data de captura" },
                  { id: "lastSeenAt", label: "Última vez visto" },
                  { id: "name",       label: "Nome" },
                ] as const).map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => {
                      if (sortBy === opt.id) setSortDir(d => d === "desc" ? "asc" : "desc");
                      else { setSortBy(opt.id); setSortDir(opt.id === "name" ? "asc" : "desc"); }
                    }}
                    className={`px-3 py-1 rounded-full border text-xs font-medium transition-colors flex items-center gap-1 ${
                      sortBy === opt.id
                        ? "bg-muted border-foreground/30 text-foreground"
                        : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground"
                    }`}
                  >
                    {opt.label}
                    {sortBy === opt.id && (
                      <span className="text-[10px]">{sortDir === "desc" ? "↓" : "↑"}</span>
                    )}
                  </button>
                ))}
              </div>

              {/* Live activity feed — só aparece durante raspagem desta cidade */}
              <ScrapeLiveFeed jobState={scrapeJobState} city={filterCity} />

              {/* Leads — list or grid */}
              {loading ? (
                <div className={viewMode === "grid" ? "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-8 gap-4 py-8" : "space-y-2 py-4"}>
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className={viewMode === "grid" ? "aspect-[4/5] bg-card/50 border border-border animate-pulse rounded-xl" : "h-12 bg-card/50 border border-border animate-pulse rounded-lg"} />
                  ))}
                </div>
              ) : (
                <>
                  {/* ── List view ── */}
                  {viewMode === "list" && (
                    <div className="rounded-xl border border-border overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                            {selectionMode && <th className="w-9 px-3 py-2.5" />}
                            <th className="text-left px-3 py-2.5 font-medium w-8" />
                            <th className="text-left px-3 py-2.5 font-medium">Nome</th>
                            <th className="text-left px-3 py-2.5 font-medium hidden sm:table-cell">Telefone</th>
                            <th className="text-left px-3 py-2.5 font-medium hidden md:table-cell">Portais</th>
                            <th className="text-left px-3 py-2.5 font-medium hidden lg:table-cell">Capturado em</th>
                            <th className="w-9 px-3 py-2.5" />
                          </tr>
                        </thead>
                        <tbody>
                          {sortedItems.map((prospect) => {
                            const phone = prospect.whatsappE164 || prospect.whatsappDisplay;
                            const waUrl = phone ? `https://wa.me/${phone.replace(/\D/g, "")}` : null;
                            const isSelected = selectedIds.has(prospect.id);
                            const initials = prospect.name.slice(0, 2).toUpperCase();
                            const idx = sortedItems.indexOf(prospect);
                            const toggleSelect = (e: React.MouseEvent) => {
                              if (e.shiftKey && lastClickedIndexRef.current >= 0) {
                                const from = Math.min(lastClickedIndexRef.current, idx);
                                const to = Math.max(lastClickedIndexRef.current, idx);
                                setSelectedIds((prev) => {
                                  const next = new Set(prev);
                                  for (let i = from; i <= to; i++) next.add(sortedItems[i].id);
                                  return next;
                                });
                              } else {
                                setSelectedIds((prev) => {
                                  const next = new Set(prev);
                                  next.has(prospect.id) ? next.delete(prospect.id) : next.add(prospect.id);
                                  return next;
                                });
                                lastClickedIndexRef.current = idx;
                              }
                            };
                            return (
                              <tr
                                key={prospect.id}
                                onClick={selectionMode ? toggleSelect : () => setPopupProspect(prospect)}
                                className={`border-b border-border/50 last:border-0 cursor-pointer transition-colors ${
                                  isSelected && selectionMode ? "bg-violet-500/10" : "hover:bg-muted/30"
                                }`}
                              >
                                {selectionMode && (
                                  <td className="px-3 py-2">
                                    <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${isSelected ? "bg-violet-500 border-violet-500" : "border-muted-foreground/40"}`}>
                                      {isSelected && <CheckSquare className="h-3 w-3 text-white" />}
                                    </div>
                                  </td>
                                )}
                                <td className="px-3 py-2">
                                  {prospect.thumbUrl ? (
                                    <img src={prospect.thumbUrl} alt="" className="w-7 h-7 rounded-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                                  ) : (
                                    <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold text-muted-foreground">{initials}</div>
                                  )}
                                </td>
                                <td className="px-3 py-2">
                                  <span className="font-medium truncate block max-w-[180px]">{prospect.name}</span>
                                  {prospect.crmContact?.stage && (
                                    <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: prospect.crmContact.stage.color + "33", color: prospect.crmContact.stage.color }}>
                                      {prospect.crmContact.stage.name}
                                    </span>
                                  )}
                                </td>
                                <td className="px-3 py-2 hidden sm:table-cell">
                                  {phone ? (
                                    <span className="text-xs text-emerald-400 font-mono">{phone}</span>
                                  ) : (
                                    <span className="text-xs text-muted-foreground/40 italic">–</span>
                                  )}
                                </td>
                                <td className="px-3 py-2 hidden md:table-cell">
                                  <div className="flex flex-wrap gap-0.5 items-center">
                                    {prospect.sources.map((s) => (
                                      <SourceBadge key={s} source={s} href={prospect.sourceUrls?.[s]} />
                                    ))}
                                    {prospect.crmContact && (
                                      <span className="text-[10px] px-1.5 py-0.5 rounded border font-medium bg-emerald-500/15 text-emerald-400 border-emerald-500/30">
                                        Contatado
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="px-3 py-2 hidden lg:table-cell text-xs text-muted-foreground whitespace-nowrap">
                                  {prospect.crmContact?.messages?.[0] ? (
                                    <span className="truncate block max-w-[160px]" title={prospect.crmContact.messages[0].text}>
                                      {prospect.crmContact.messages[0].fromMe ? "↗ " : "↙ "}
                                      {prospect.crmContact.messages[0].text.slice(0, 40)}{prospect.crmContact.messages[0].text.length > 40 ? "…" : ""}
                                    </span>
                                  ) : (
                                    <span className="text-muted-foreground/40">
                                      {new Date(prospect.firstSeenAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                                    </span>
                                  )}
                                </td>
                                <td className="px-3 py-2">
                                  {waUrl && !selectionMode && (
                                    <a
                                      href={waUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={(e) => e.stopPropagation()}
                                      className="w-7 h-7 rounded-full bg-[#25D366] hover:bg-[#1ebe5d] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                      <MessageCircle className="h-3.5 w-3.5 text-white" />
                                    </a>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      {sortedItems.length === 0 && (
                        <div className="py-16 text-center text-muted-foreground">Nenhum prospect encontrado nesta cidade.</div>
                      )}
                    </div>
                  )}

                  {/* ── Grid view ── */}
                  {viewMode === "grid" && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-8 gap-4">
                    {sortedItems.map((prospect) => {
                      const initials = prospect.name.slice(0, 2).toUpperCase();
                      const phone = prospect.whatsappE164 || prospect.whatsappDisplay;
                      const waUrl = phone ? `https://wa.me/${phone}` : null;
                      const isSelected = selectedIds.has(prospect.id);
                      const idx = sortedItems.indexOf(prospect);
                      return (
                        <div
                          key={prospect.id}
                          onClick={selectionMode ? (e: React.MouseEvent) => {
                            if (e.shiftKey && lastClickedIndexRef.current >= 0) {
                              const from = Math.min(lastClickedIndexRef.current, idx);
                              const to = Math.max(lastClickedIndexRef.current, idx);
                              setSelectedIds((prev) => {
                                const next = new Set(prev);
                                for (let i = from; i <= to; i++) next.add(sortedItems[i].id);
                                return next;
                              });
                            } else {
                              setSelectedIds((prev) => {
                                const next = new Set(prev);
                                if (next.has(prospect.id)) next.delete(prospect.id);
                                else next.add(prospect.id);
                                return next;
                              });
                              lastClickedIndexRef.current = idx;
                            }
                          } : () => setPopupProspect(prospect)}
                          className={`group relative bg-card rounded-xl overflow-hidden shadow-sm transition-all duration-200 border cursor-pointer ${
                            selectionMode
                              ? isSelected
                                ? "border-violet-500 ring-2 ring-violet-500/30"
                                : "border-border hover:border-violet-400/50"
                              : "border-border hover:border-emerald-500/40 hover:shadow-lg hover:shadow-emerald-500/5"
                          }`}
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
                            {prospect.sources.length >= 2 && !selectionMode && (
                              <div className="absolute top-2 left-2 bg-primary text-primary-foreground text-[8px] font-bold px-1 rounded">
                                {prospect.sources.length}×
                              </div>
                            )}
                            {/* Selection overlay */}
                            {selectionMode && (
                              <div className={`absolute inset-0 z-10 transition-colors ${isSelected ? "bg-violet-500/25" : ""}`}>
                                <div className={`absolute top-2 left-2 w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${isSelected ? "bg-violet-500 border-violet-500" : "bg-black/40 border-white/60"}`}>
                                  {isSelected && <CheckSquare className="h-3.5 w-3.5 text-white" />}
                                </div>
                              </div>
                            )}

                            {/* Botão WhatsApp — aparece no hover, canto inferior direito */}
                            {waUrl && !selectionMode && (
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
                                <SourceBadge key={s} source={s} href={prospect.sourceUrls?.[s]} />
                              ))}
                              {prospect.crmContact && (
                                <span className="text-[9px] px-1 py-0.5 rounded border font-semibold bg-emerald-500/15 text-emerald-400 border-emerald-500/30">✓</span>
                              )}
                            </div>
                            {prospect.crmContact?.stage && (
                              <p className="text-[9px] font-semibold truncate mt-0.5" style={{ color: prospect.crmContact.stage.color }}>
                                {prospect.crmContact.stage.name}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {sortedItems.length === 0 && (
                      <div className="col-span-full py-16 text-center text-muted-foreground bg-card/25 border border-dashed border-border rounded-2xl">
                        Nenhum prospect encontrado nesta cidade.
                      </div>
                    )}
                  </div>
                  )} {/* end grid view */}

                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Floating action bar — bulk delete */}
      {selectionMode && selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-card border border-border shadow-2xl rounded-2xl px-5 py-3 animate-in slide-in-from-bottom-4 duration-200">
          <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">
            {selectedIds.size} selecionado{selectedIds.size > 1 ? "s" : ""}
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setSelectedIds(new Set(sortedItems.map((p) => p.id)))}
            className="h-8 text-xs whitespace-nowrap"
          >
            Selecionar todos
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={openMoveModal}
            className="h-8 text-xs gap-1.5 border-violet-500/50 text-violet-400 hover:bg-violet-500/10"
          >
            <FolderInput className="h-3.5 w-3.5" />
            Mover para…
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={handleDeleteSelected}
            className="h-8 text-xs gap-1.5"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Apagar
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => { setSelectionMode(false); setSelectedIds(new Set()); }}
            className="h-8 text-xs"
          >
            Cancelar
          </Button>
        </div>
      )}

      {/* Move modal */}
      {showMoveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={closeMoveModal} />
          <div className="relative z-10 w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div className="flex items-center gap-2">
                <FolderInput className="h-5 w-5 text-violet-400" />
                <h2 className="font-semibold text-base">
                  {moveConflicts ? "Conflitos encontrados" : `Mover ${selectedIds.size} contato${selectedIds.size > 1 ? "s" : ""} para…`}
                </h2>
              </div>
              <button onClick={closeMoveModal} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Body — Step 1: Destination Picker */}
            {!moveConflicts && (
              <div className="px-6 py-5 space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Estado</label>
                  <select
                    value={moveTargetState}
                    onChange={(e) => { setMoveTargetState(e.target.value); setMoveTargetCity(""); }}
                    className="w-full h-10 rounded-lg border border-border bg-muted/40 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/40"
                  >
                    <option value="">Selecione um estado…</option>
                    {sortedStates
                      .filter(([code]) => code !== filterState || true)
                      .map(([code]) => (
                        <option key={code} value={code}>
                          {STATES.find((s) => s.code === code)?.label || code} ({code})
                        </option>
                      ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Cidade</label>
                  <select
                    value={moveTargetCity}
                    onChange={(e) => setMoveTargetCity(e.target.value)}
                    disabled={!moveTargetState}
                    className="w-full h-10 rounded-lg border border-border bg-muted/40 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/40 disabled:opacity-50"
                  >
                    <option value="">Selecione uma cidade…</option>
                    {sortedStates
                      .find(([code]) => code === moveTargetState)?.[1]
                      .cities.filter((c) => !(moveTargetState === filterState && c.city === filterCity))
                      .map(({ city }) => (
                        <option key={city} value={city}>{city}</option>
                      ))}
                  </select>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="ghost" size="sm" onClick={closeMoveModal}>Cancelar</Button>
                  <Button
                    size="sm"
                    disabled={!moveTargetState || !moveTargetCity || moving}
                    onClick={handleMoveCheck}
                    className="gap-1.5 bg-violet-600 hover:bg-violet-700 text-white"
                  >
                    {moving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <FolderInput className="h-3.5 w-3.5" />}
                    {moving ? "Verificando…" : "Verificar e mover"}
                  </Button>
                </div>
              </div>
            )}

            {/* Body — Step 2: Conflict Resolution */}
            {moveConflicts && (
              <div className="px-6 py-5 space-y-4">
                <div className="flex items-start gap-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                  <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
                  <p className="text-sm text-amber-300">
                    <span className="font-semibold">{moveConflicts.length} de {selectedIds.size} contato{selectedIds.size > 1 ? "s" : ""}</span>
                    {" "}já existe{moveConflicts.length > 1 ? "m" : ""} em{" "}
                    <span className="font-semibold">{moveTargetCity} / {moveTargetState}</span>.
                  </p>
                </div>

                {/* Conflict list */}
                <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
                  {moveConflicts.map((c) => (
                    <div key={c.movedId} className="flex items-center gap-2 px-3 py-2 bg-muted/40 border border-border rounded-lg text-xs">
                      <span className="font-medium truncate flex-1">{c.name}</span>
                      {c.differentSources && (
                        <div className="flex items-center gap-0.5 shrink-0">
                          {c.movingSources.map(s => <SourceBadge key={s} source={s} />)}
                          <span className="text-muted-foreground mx-0.5">+</span>
                          {c.existingSources.filter(s => !c.movingSources.includes(s)).map(s => <SourceBadge key={s} source={s} />)}
                        </div>
                      )}
                      <span className="text-muted-foreground font-mono shrink-0">
                        {c.phone ? c.phone.replace(/^55(\d{2})(\d{4,5})(\d{4})$/, "($1) $2-$3") : "Sem telefone"}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Resolution options */}
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Como resolver os conflitos?</p>
                  {([
                    ...(moveConflicts.some(c => c.phoneMatch && c.differentSources) ? [{
                      value: "merge" as const,
                      label: "Mesclar origens",
                      desc: "Mantém o existente e adiciona as etiquetas de plataforma do selecionado",
                    }] : []),
                    { value: "skip" as const,      label: "Pular duplicatas",  desc: "Move apenas os sem conflito" },
                    { value: "keep-both" as const, label: "Manter ambos",      desc: "Move tudo, ambos ficam na pasta" },
                    { value: "replace" as const,   label: "Substituir",        desc: "Apaga o existente e move o selecionado" },
                  ]).map((opt) => (
                    <label
                      key={opt.value}
                      className={`flex items-start gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition-colors ${
                        moveConflictResolution === opt.value
                          ? opt.value === "merge"
                            ? "border-emerald-500/60 bg-emerald-500/10"
                            : "border-violet-500/60 bg-violet-500/10"
                          : "border-border hover:border-border/80 hover:bg-muted/30"
                      }`}
                    >
                      <input
                        type="radio"
                        name="conflictResolution"
                        value={opt.value}
                        checked={moveConflictResolution === opt.value}
                        onChange={() => setMoveConflictResolution(opt.value)}
                        className="mt-0.5 accent-violet-500"
                      />
                      <div>
                        <p className="text-sm font-medium">{opt.label}</p>
                        <p className="text-xs text-muted-foreground">{opt.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  <Button variant="ghost" size="sm" onClick={closeMoveModal}>Cancelar</Button>
                  <Button
                    size="sm"
                    disabled={moving}
                    onClick={() => executeMoveProspects(moveConflictResolution)}
                    className={`gap-1.5 ${moveConflictResolution === "replace" ? "bg-red-600 hover:bg-red-700" : "bg-violet-600 hover:bg-violet-700"} text-white`}
                  >
                    {moving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <FolderInput className="h-3.5 w-3.5" />}
                    {moving ? "Movendo…" : "Confirmar"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Contact popup */}
      {popupProspect && (
        <ContactPopup
          prospect={popupProspect}
          onClose={() => setPopupProspect(null)}
        />
      )}

      {/* Import modal */}
      {showImportModal && (
        <ImportModal
          onClose={() => setShowImportModal(false)}
          onImported={(created, updated) => {
            setShowImportModal(false);
            toast.success(`Importação concluída: ${created} novo${created !== 1 ? "s" : ""}, ${updated} atualizado${updated !== 1 ? "s" : ""}`);
            loadStats();
            if (filterState && filterCity) loadProspects();
          }}
          allCities={allCities}
          currentState={filterState}
          currentCity={filterCity}
        />
      )}
    </AppShell>
  );
}

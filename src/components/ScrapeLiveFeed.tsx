'use client';

import { ScrapeJobState } from "@/lib/evolution-api";

interface Props {
  jobState: ScrapeJobState | null;
  /** Se definido, filtra atividade por cidade */
  city?: string;
  className?: string;
}

export function ScrapeLiveFeed({ jobState, city, className = "" }: Props) {
  if (!jobState) return null;

  const isActive = ["running", "stopping"].includes(jobState.status);
  const activity = jobState.recentActivity ?? [];

  // Filtra por cidade se especificado
  const filtered = city
    ? activity.filter(a => a.text.toLowerCase().includes(city.toLowerCase()))
    : activity;

  if (!isActive && filtered.length === 0) return null;

  return (
    <div className={`rounded-xl border border-border bg-card/60 overflow-hidden ${className}`}>
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border/60 bg-muted/30">
        {isActive && (
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
        )}
        <span className="text-xs font-medium text-muted-foreground">
          {isActive ? jobState.message : "Última raspagem concluída"}
        </span>
        {isActive && jobState.counts && (
          <span className="ml-auto text-[11px] text-muted-foreground/60 font-mono">
            {jobState.counts.upserted} salvos
          </span>
        )}
      </div>

      {/* Feed de atividade */}
      {filtered.length > 0 ? (
        <ul className="divide-y divide-border/40 max-h-48 overflow-y-auto">
          {filtered.map((item, i) => (
            <li
              key={item.ts + i}
              className={`px-4 py-2 text-xs flex items-center gap-2 transition-colors ${
                i === 0 && isActive ? "bg-emerald-500/5 text-foreground" : "text-muted-foreground"
              }`}
            >
              <span className="text-emerald-500 shrink-0">✓</span>
              <span className="truncate">{item.text}</span>
              <span className="ml-auto text-[10px] opacity-40 shrink-0 tabular-nums">
                {new Date(item.ts).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </span>
            </li>
          ))}
        </ul>
      ) : isActive ? (
        <div className="px-4 py-3 text-xs text-muted-foreground/60 italic">
          Aguardando primeiros resultados…
        </div>
      ) : null}
    </div>
  );
}

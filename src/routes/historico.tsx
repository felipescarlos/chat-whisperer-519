import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { History, Trash2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { BroadcastRecord, loadHistory, saveHistory } from "@/lib/broadcast-history";

export const Route = createFileRoute("/historico")({
  head: () => ({
    meta: [
      { title: "Histórico — WhatsApp Painel" },
      { name: "description", content: "Histórico de disparos." },
    ],
  }),
  component: HistoricoPage,
});

function HistoricoPage() {
  const [records, setRecords] = useState<BroadcastRecord[]>([]);

  useEffect(() => {
    setRecords(loadHistory());
  }, []);

  const clear = () => {
    if (!confirm("Limpar todo o histórico?")) return;
    saveHistory([]);
    setRecords([]);
  };

  return (
    <AppShell>
      <div className="h-full overflow-y-auto p-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold">Histórico</h1>
              <p className="text-sm text-muted-foreground">Disparos anteriores.</p>
            </div>
            {records.length > 0 && (
              <Button variant="outline" onClick={clear}>
                <Trash2 className="h-4 w-4 mr-2" /> Limpar
              </Button>
            )}
          </div>

          {records.length === 0 ? (
            <div className="text-center text-muted-foreground py-12">
              <History className="h-12 w-12 mx-auto mb-3 opacity-40" />
              Nenhum disparo registrado ainda.
            </div>
          ) : (
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-panel-header text-muted-foreground">
                  <tr>
                    <th className="text-left p-3">Data</th>
                    <th className="text-left p-3">Chips</th>
                    <th className="text-right p-3">Total</th>
                    <th className="text-right p-3">Sucessos</th>
                    <th className="text-right p-3">Falhas</th>
                    <th className="text-left p-3">Mensagem</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((r) => (
                    <tr key={r.id} className="border-t border-border">
                      <td className="p-3 whitespace-nowrap">
                        {new Date(r.date).toLocaleString("pt-BR")}
                      </td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-1">
                          {r.instances.map((i) => (
                            <span
                              key={i}
                              className="text-xs bg-muted px-1.5 py-0.5 rounded"
                            >
                              {i}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="p-3 text-right">{r.total}</td>
                      <td className="p-3 text-right text-success">{r.success}</td>
                      <td className="p-3 text-right text-destructive">{r.failed}</td>
                      <td className="p-3 max-w-xs">
                        <div className="truncate text-muted-foreground" title={r.message}>
                          {r.message}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

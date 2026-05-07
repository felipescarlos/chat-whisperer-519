import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { AlertCircle, RefreshCw } from "lucide-react";
import { createVPSCampaign, VPSCampaign } from "@/lib/vps-queue";

interface Props {
  campaign: VPSCampaign;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function RetentarDialog({ campaign, open, onClose, onSuccess }: Props) {
  const errorNumbers = campaign.numbers.filter((n) => n.status === "error");

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [edited, setEdited] = useState<Record<string, string>>({});
  const [minSec, setMinSec] = useState(campaign.min_sec);
  const [maxSec, setMaxSec] = useState(campaign.max_sec);
  const [loading, setLoading] = useState(false);

  // Reinicia estado toda vez que abrir com uma campanha diferente
  useEffect(() => {
    if (open) {
      setSelected(new Set(errorNumbers.map((n) => n.number)));
      setEdited({});
      setMinSec(campaign.min_sec);
      setMaxSec(campaign.max_sec);
    }
  }, [open, campaign.id]);

  const allSelected = selected.size === errorNumbers.length;

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(errorNumbers.map((n) => n.number)));
  };

  const toggle = (number: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(number)) next.delete(number);
      else next.add(number);
      return next;
    });
  };

  const handleSubmit = async () => {
    if (selected.size === 0) return toast.error("Selecione ao menos 1 número");
    if (minSec > maxSec) return toast.error("Intervalo mínimo não pode ser maior que o máximo");

    setLoading(true);
    try {
      const numbers = Array.from(selected).map((n) => ({
        number: (edited[n] ?? n).replace(/\D/g, ""),
        status: "pending" as const,
      }));

      await createVPSCampaign({
        name: `${campaign.name} — Retentativa`,
        parentId: campaign.id,
        message: campaign.message,
        min_sec: minSec,
        max_sec: maxSec,
        per_chip_limit: campaign.per_chip_limit,
        chips: campaign.chips,
        numbers,
      });

      toast.success(`Subcampanha criada com ${numbers.length} número${numbers.length !== 1 ? "s" : ""}!`);
      onSuccess();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao criar subcampanha");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg flex flex-col" style={{ maxHeight: "85vh" }}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-warning">
            <RefreshCw className="h-5 w-5" />
            Retentar erros — {campaign.name}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-5 py-1" style={{ minHeight: 0 }}>
          {/* Lista de números com erro */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>
                Números com erro{" "}
                <span className="text-muted-foreground font-normal">({errorNumbers.length})</span>
              </Label>
              <Button variant="ghost" size="sm" className="text-xs h-7" onClick={toggleAll}>
                {allSelected ? "Desmarcar todos" : "Selecionar todos"}
              </Button>
            </div>

            <div className="border border-border rounded-md divide-y divide-border overflow-hidden max-h-56 overflow-y-auto">
              {errorNumbers.map((n, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-3 px-3 py-2 transition-opacity ${
                    !selected.has(n.number) ? "opacity-40" : ""
                  }`}
                >
                  <Checkbox
                    checked={selected.has(n.number)}
                    onCheckedChange={() => toggle(n.number)}
                  />
                  <Input
                    value={edited[n.number] ?? n.number}
                    onChange={(e) =>
                      setEdited((prev) => ({ ...prev, [n.number]: e.target.value }))
                    }
                    className="h-7 font-mono text-xs flex-1 border-0 bg-transparent focus-visible:ring-0 px-0"
                    placeholder={n.number}
                  />
                  <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
                </div>
              ))}
            </div>

            <p className="text-xs text-muted-foreground mt-1">
              {selected.size} de {errorNumbers.length} selecionados · Edite os números diretamente
              para corrigir formato
            </p>
          </div>

          {/* Configuração de intervalo */}
          <div>
            <Label className="mb-3 block">Intervalo entre envios</Label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Mínimo (s)</Label>
                <Input
                  type="number"
                  min={1}
                  value={minSec}
                  onChange={(e) => setMinSec(Number(e.target.value) || 1)}
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Máximo (s)</Label>
                <Input
                  type="number"
                  min={1}
                  value={maxSec}
                  onChange={(e) => setMaxSec(Number(e.target.value) || 1)}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="pt-4 border-t border-border">
          <Button
            onClick={handleSubmit}
            disabled={loading || selected.size === 0}
            className="w-full"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            {loading
              ? "Criando subcampanha..."
              : `Retentar ${selected.size} número${selected.size !== 1 ? "s" : ""}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

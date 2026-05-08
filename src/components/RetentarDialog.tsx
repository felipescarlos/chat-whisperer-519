import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { RefreshCw, AlertTriangle, Shuffle } from "lucide-react";
import { createVPSCampaign, VPSCampaign, translateEvolutionError } from "@/lib/vps-queue";

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
  const [selectedChips, setSelectedChips] = useState<Set<string>>(new Set(campaign.chips));
  const [minSec, setMinSec] = useState(campaign.min_sec);
  const [maxSec, setMaxSec] = useState(campaign.max_sec);
  const [perChipLimit, setPerChipLimit] = useState(campaign.per_chip_limit);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setSelected(new Set(errorNumbers.map((n) => n.number)));
      setEdited({});
      setSelectedChips(new Set(campaign.chips));
      setMinSec(campaign.min_sec);
      setMaxSec(campaign.max_sec);
      setPerChipLimit(campaign.per_chip_limit);
    }
  }, [open, campaign.id]);

  const allNumbersSelected = selected.size === errorNumbers.length;
  const allChipsSelected = selectedChips.size === campaign.chips.length;

  const toggleAllNumbers = () => {
    setSelected(
      allNumbersSelected ? new Set() : new Set(errorNumbers.map((n) => n.number))
    );
  };

  const toggleNumber = (number: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(number)) next.delete(number);
      else next.add(number);
      return next;
    });
  };

  const toggleChip = (chip: string) => {
    setSelectedChips((prev) => {
      if (prev.has(chip) && prev.size === 1) return prev; // manter pelo menos 1
      const next = new Set(prev);
      if (next.has(chip)) next.delete(chip);
      else next.add(chip);
      return next;
    });
  };

  const handleSubmit = async () => {
    if (selected.size === 0) return toast.error("Selecione ao menos 1 número");
    if (selectedChips.size === 0) return toast.error("Selecione ao menos 1 chip");
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
        per_chip_limit: perChipLimit,
        chips: Array.from(selectedChips),
        numbers,
      });

      toast.success(
        `Subcampanha criada com ${numbers.length} número${numbers.length !== 1 ? "s" : ""}!`
      );
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
      <DialogContent
        className="flex flex-col"
        style={{ maxWidth: "1020px", width: "95vw", maxHeight: "92vh" }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-warning">
            <RefreshCw className="h-5 w-5" />
            Retentar erros — {campaign.name}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-6 py-1" style={{ minHeight: 0 }}>
          {/* ── Tabela de números ── */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>
                Números com erro{" "}
                <span className="text-muted-foreground font-normal">
                  ({errorNumbers.length})
                </span>
              </Label>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-7"
                onClick={toggleAllNumbers}
              >
                {allNumbersSelected ? "Desmarcar todos" : "Selecionar todos"}
              </Button>
            </div>

            <div className="border border-border rounded-md overflow-hidden">
              {/* Cabeçalho */}
              <div
                className="grid bg-muted/50 border-b border-border px-3 py-1.5"
                style={{ gridTemplateColumns: "32px 180px 160px 1fr" }}
              >
                <span />
                <span className="text-xs font-medium text-muted-foreground">Número</span>
                <span className="text-xs font-medium text-muted-foreground">Chip utilizado</span>
                <span className="text-xs font-medium text-muted-foreground">Motivo do erro</span>
              </div>

              {/* Linhas */}
              <div
                className="divide-y divide-border overflow-y-auto"
                style={{ maxHeight: "340px" }}
              >
                {errorNumbers.map((n, i) => {
                  const translated = n.error_message
                    ? translateEvolutionError(n.error_message)
                    : null;
                  const isSelected = selected.has(n.number);

                  return (
                    <div
                      key={i}
                      className={`grid items-start px-3 py-2.5 transition-opacity ${
                        !isSelected ? "opacity-35" : ""
                      }`}
                      style={{ gridTemplateColumns: "32px 180px 160px 1fr" }}
                    >
                      {/* Checkbox */}
                      <div className="pt-0.5">
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleNumber(n.number)}
                        />
                      </div>

                      {/* Número editável */}
                      <div className="pr-4">
                        <Input
                          value={edited[n.number] ?? n.number}
                          onChange={(e) =>
                            setEdited((prev) => ({ ...prev, [n.number]: e.target.value }))
                          }
                          className="h-7 font-mono text-xs border-0 bg-transparent focus-visible:ring-1 focus-visible:ring-border px-0"
                          placeholder={n.number}
                        />
                      </div>

                      {/* Chip */}
                      <div className="pr-4 pt-1">
                        {n.instance ? (
                          <span className="text-xs text-muted-foreground truncate block">
                            {n.instance}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground/40">—</span>
                        )}
                      </div>

                      {/* Erro traduzido */}
                      <div className="pt-0.5">
                        {translated ? (
                          <div className="flex items-start gap-1.5">
                            <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
                            <div>
                              <p className="text-xs font-medium text-destructive leading-tight">
                                {translated.title}
                              </p>
                              <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">
                                {translated.explanation}
                              </p>
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground/40">—</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <p className="text-xs text-muted-foreground mt-1">
              {selected.size} de {errorNumbers.length} selecionados · Edite os números
              diretamente para corrigir formato
            </p>
          </div>

          {/* ── Chips para reenvio ── */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Chips para reenvio</Label>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-7 gap-1.5"
                onClick={() => setSelectedChips(new Set(campaign.chips))}
                disabled={allChipsSelected}
              >
                <Shuffle className="h-3 w-3" />
                Todos (aleatório)
              </Button>
            </div>

            <div className="flex flex-wrap gap-2 p-3 border border-border rounded-md bg-muted/20">
              {campaign.chips.map((chip) => {
                const active = selectedChips.has(chip);
                return (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => toggleChip(chip)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                      active
                        ? "bg-primary text-primary-foreground border-primary shadow-sm"
                        : "bg-transparent text-muted-foreground border-border hover:border-primary/60 hover:text-foreground"
                    }`}
                  >
                    {chip}
                  </button>
                );
              })}
            </div>

            <p className="text-xs text-muted-foreground mt-1">
              {allChipsSelected
                ? "Chip escolhido aleatoriamente a cada envio"
                : `${selectedChips.size} de ${campaign.chips.length} chip${campaign.chips.length !== 1 ? "s" : ""} selecionado${selectedChips.size !== 1 ? "s" : ""} — envios distribuídos entre eles`}
            </p>
          </div>

          {/* ── Configurações de envio ── */}
          <div>
            <Label className="mb-3 block">Configurações de envio</Label>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">
                  Intervalo mínimo (s)
                </Label>
                <Input
                  type="number"
                  min={1}
                  value={minSec}
                  onChange={(e) => setMinSec(Number(e.target.value) || 1)}
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">
                  Intervalo máximo (s)
                </Label>
                <Input
                  type="number"
                  min={1}
                  value={maxSec}
                  onChange={(e) => setMaxSec(Number(e.target.value) || 1)}
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">
                  Limite por chip
                </Label>
                <Input
                  type="number"
                  min={1}
                  value={perChipLimit}
                  onChange={(e) => setPerChipLimit(Number(e.target.value) || 1)}
                />
              </div>
            </div>
          </div>
        </div>

        {/* ── Rodapé ── */}
        <div className="pt-4 border-t border-border">
          <Button
            onClick={handleSubmit}
            disabled={loading || selected.size === 0}
            className="w-full"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            {loading
              ? "Criando subcampanha..."
              : `Retentar ${selected.size} número${selected.size !== 1 ? "s" : ""} via ${
                  allChipsSelected
                    ? "chip aleatório"
                    : `${selectedChips.size} chip${selectedChips.size !== 1 ? "s" : ""} selecionado${selectedChips.size !== 1 ? "s" : ""}`
                }`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

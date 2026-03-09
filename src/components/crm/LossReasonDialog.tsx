import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const LOSS_REASONS = [
  { value: "preco", label: "Preço" },
  { value: "cliente_desistiu", label: "Cliente desistiu" },
  { value: "concorrencia", label: "Concorrência" },
  { value: "sem_resposta", label: "Sem resposta" },
  { value: "outro", label: "Outro" },
];

interface LossReasonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string, notes: string) => void;
}

export function LossReasonDialog({ open, onOpenChange, onConfirm }: LossReasonDialogProps) {
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");

  const handleConfirm = () => {
    if (!reason) return;
    onConfirm(reason, notes);
    setReason("");
    setNotes("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Motivo da Perda</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Motivo *</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger><SelectValue placeholder="Selecione o motivo" /></SelectTrigger>
              <SelectContent>{LOSS_REASONS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Observações</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Detalhes adicionais..." rows={3} />
          </div>
          <Button onClick={handleConfirm} className="w-full" disabled={!reason}>Confirmar Perda</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

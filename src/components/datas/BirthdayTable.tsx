import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MessageSquare } from "lucide-react";

interface BirthdayRow {
  id: string;
  name: string;
  birthDate: string;
  phone: string | null;
  lastPurchase: string | null;
  ticketMedio: number | null;
  sent: boolean;
}

interface BirthdayTableProps {
  data: BirthdayRow[];
  onSendWhatsApp: (id: string) => void;
}

export function BirthdayTable({ data, onSendWhatsApp }: BirthdayTableProps) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nome</TableHead>
            <TableHead>Data</TableHead>
            <TableHead>Telefone</TableHead>
            <TableHead>Última Compra</TableHead>
            <TableHead>Ticket Médio</TableHead>
            <TableHead>Status</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.length === 0 ? (
            <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhum aniversariante neste mês</TableCell></TableRow>
          ) : data.map((row) => {
            const date = new Date(row.birthDate + "T12:00:00");
            return (
              <TableRow key={row.id}>
                <TableCell className="font-medium">{row.name}</TableCell>
                <TableCell>{date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}</TableCell>
                <TableCell className="text-muted-foreground">{row.phone || "—"}</TableCell>
                <TableCell className="text-muted-foreground">
                  {row.lastPurchase ? new Date(row.lastPurchase).toLocaleDateString("pt-BR") : "—"}
                </TableCell>
                <TableCell>
                  {row.ticketMedio ? `R$ ${row.ticketMedio.toLocaleString("pt-BR")}` : "—"}
                </TableCell>
                <TableCell>
                  {row.sent ? (
                    <Badge variant="secondary" className="bg-accent/20 text-accent border-0 text-[10px]">Enviado ✓</Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px]">Pendente</Badge>
                  )}
                </TableCell>
                <TableCell>
                  {!row.sent && row.phone && (
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => onSendWhatsApp(row.id)}>
                      <MessageSquare className="h-3 w-3" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

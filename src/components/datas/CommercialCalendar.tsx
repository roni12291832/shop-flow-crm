import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trash2, Edit2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface SpecialDate {
  id: string;
  name: string;
  date: string;
  active: boolean;
  segment_tags: string[];
}

interface CommercialCalendarProps {
  dates: SpecialDate[];
  selectedDate: Date | undefined;
  onSelectDate: (d: Date | undefined) => void;
  onEdit: (d: SpecialDate) => void;
  onDelete: (id: string) => void;
  onToggle: (id: string, active: boolean) => void;
}

export function CommercialCalendar({ dates, selectedDate, onSelectDate, onEdit, onDelete, onToggle }: CommercialCalendarProps) {
  const markedDays = dates.map(d => new Date(d.date + "T12:00:00"));

  const sortedDates = [...dates].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-6">
      <div className="bg-card border border-border rounded-xl p-4">
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={onSelectDate}
          className="p-3 pointer-events-auto"
          modifiers={{ marked: markedDays }}
          modifiersClassNames={{ marked: "bg-primary/20 text-primary font-bold" }}
        />
      </div>

      <div className="space-y-3">
        <div className="text-foreground font-bold text-sm mb-3">Campanhas Agendadas</div>
        {sortedDates.length === 0 ? (
          <div className="text-muted-foreground text-sm py-8 text-center">Nenhuma campanha cadastrada</div>
        ) : sortedDates.map(d => {
          const dateObj = new Date(d.date + "T12:00:00");
          const isPast = dateObj < new Date();
          return (
            <div key={d.id} className={cn("bg-card border border-border rounded-xl p-4 flex items-center gap-4", isPast && "opacity-60")}>
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex flex-col items-center justify-center shrink-0">
                <span className="text-[10px] text-primary uppercase font-bold">
                  {dateObj.toLocaleDateString("pt-BR", { month: "short" })}
                </span>
                <span className="text-lg font-bold text-primary leading-none">{dateObj.getDate()}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-foreground font-semibold text-sm">{d.name}</div>
                <div className="flex gap-1 mt-1 flex-wrap">
                  {d.segment_tags?.map(tag => (
                    <Badge key={tag} variant="outline" className="text-[9px] py-0">{tag}</Badge>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Badge variant={d.active ? "default" : "secondary"} className={cn("text-[10px] cursor-pointer", d.active ? "bg-accent/20 text-accent border-0" : "")}
                  onClick={() => onToggle(d.id, !d.active)}>
                  {d.active ? "Ativa" : "Inativa"}
                </Badge>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => onEdit(d)}>
                  <Edit2 className="h-3 w-3" />
                </Button>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => onDelete(d.id)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

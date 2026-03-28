/**
 * stages.ts — Fonte única de verdade para os estágios do pipeline no frontend.
 * Importar em TODOS os componentes que referenciam estágios.
 */

export const STAGE_ORDER = [
  "lead_novo",
  "contato_iniciado",
  "interessado",
  "comprador",
  "perdido",
  "desqualificado",
] as const;

export type Stage = (typeof STAGE_ORDER)[number];

export const VALID_STAGES = new Set<string>(STAGE_ORDER);

export const STAGE_LABELS: Record<Stage, string> = {
  lead_novo:         "Lead Novo",
  contato_iniciado:  "Contato Iniciado",
  interessado:       "Interessado",
  comprador:         "Comprador",
  perdido:           "Perdido",
  desqualificado:    "Desqualificado",
};

export const TERMINAL_STAGES = new Set<Stage>(["perdido", "desqualificado"]);
export const ACTIVE_STAGES   = new Set<Stage>(["contato_iniciado", "interessado", "comprador"]);

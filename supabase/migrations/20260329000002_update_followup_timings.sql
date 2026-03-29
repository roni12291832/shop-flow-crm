-- Migration para atualizar as regras de automação de follow-up
-- Usuário solicitou as seguintes regras (D+1, D+3, D+6, D+9):
-- 'contato_iniciado' e 'interessado':
-- Step 1: 24h
-- Step 2: 72h
-- Step 3: 144h
-- Step 4: 216h + auto move para 'perdido'

BEGIN;

-- Atualiza 'contato_iniciado'
UPDATE public.stage_followup_steps SET delay_hours = 24,  delay_jitter_hours = 1 WHERE stage = 'contato_iniciado' AND step_number = 1;
UPDATE public.stage_followup_steps SET delay_hours = 72,  delay_jitter_hours = 2 WHERE stage = 'contato_iniciado' AND step_number = 2;
UPDATE public.stage_followup_steps SET delay_hours = 144, delay_jitter_hours = 4 WHERE stage = 'contato_iniciado' AND step_number = 3;
UPDATE public.stage_followup_steps SET delay_hours = 216, delay_jitter_hours = 6, auto_move_to = 'perdido' WHERE stage = 'contato_iniciado' AND step_number = 4;

-- Atualiza 'interessado'
UPDATE public.stage_followup_steps SET delay_hours = 24,  delay_jitter_hours = 1 WHERE stage = 'interessado' AND step_number = 1;
UPDATE public.stage_followup_steps SET delay_hours = 72,  delay_jitter_hours = 2 WHERE stage = 'interessado' AND step_number = 2;
UPDATE public.stage_followup_steps SET delay_hours = 144, delay_jitter_hours = 4 WHERE stage = 'interessado' AND step_number = 3;
UPDATE public.stage_followup_steps SET delay_hours = 216, delay_jitter_hours = 6, auto_move_to = NULL WHERE stage = 'interessado' AND step_number = 4;

-- Atualiza 'comprador' (1 dia após)
UPDATE public.stage_followup_steps SET delay_hours = 24, delay_jitter_hours = 1 WHERE stage = 'comprador' AND step_number = 1;

COMMIT;

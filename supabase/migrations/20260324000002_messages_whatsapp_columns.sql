-- Adiciona colunas usadas pelo microserviço Python ao processar webhooks do WhatsApp.
-- Sem essas colunas, todo INSERT de mensagem via webhook falhava silenciosamente.
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS channel text DEFAULT 'whatsapp',
  ADD COLUMN IF NOT EXISTS is_from_client boolean DEFAULT true;

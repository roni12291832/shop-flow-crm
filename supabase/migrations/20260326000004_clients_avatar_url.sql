-- Adiciona campo de foto de perfil do WhatsApp na tabela clients
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS avatar_url text DEFAULT NULL;

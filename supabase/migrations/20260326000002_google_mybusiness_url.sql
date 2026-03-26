-- Adiciona campo de link do Google Meu Negócio na tabela tenants
-- Usado pelo motor de follow-up para redirecionar compradores satisfeitos à avaliação
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS google_mybusiness_url text DEFAULT NULL;

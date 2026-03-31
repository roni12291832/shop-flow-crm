-- Migration: Expand client fields for full registration
-- Adds CPF/CNPJ and address details to the clients table

ALTER TABLE public.clients
ADD COLUMN IF NOT EXISTS cpf_cnpj TEXT,
ADD COLUMN IF NOT EXISTS zip_code TEXT,
ADD COLUMN IF NOT EXISTS address TEXT,
ADD COLUMN IF NOT EXISTS number TEXT,
ADD COLUMN IF NOT EXISTS neighborhood TEXT,
ADD COLUMN IF NOT EXISTS state TEXT,
ADD COLUMN IF NOT EXISTS complement TEXT;

-- Index for searching by CPF/CNPJ
CREATE INDEX IF NOT EXISTS idx_clients_cpf_cnpj ON public.clients(cpf_cnpj);

-- Add comments for documentation
COMMENT ON COLUMN public.clients.cpf_cnpj IS 'CPF ou CNPJ do cliente para cadastro completo';
COMMENT ON COLUMN public.clients.zip_code IS 'CEP do endereço do cliente';
COMMENT ON COLUMN public.clients.address IS 'Logradouro do endereço do cliente';
COMMENT ON COLUMN public.clients.number IS 'Número do endereço';
COMMENT ON COLUMN public.clients.neighborhood IS 'Bairro do endereço';
COMMENT ON COLUMN public.clients.state IS 'UF do endereço';
COMMENT ON COLUMN public.clients.complement IS 'Complemento do endereço (apartamento, bloco, etc)';

-- Adicionar coluna 'birthday' a tabela 'clients' se nao existir
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'clients' 
        AND column_name = 'birthday'
    ) THEN
        ALTER TABLE public.clients ADD COLUMN birthday DATE;
    END IF;
END $$;

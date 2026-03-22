"""
Cliente centralizado do Supabase para uso em todos os módulos.
Usa a Service Role Key para acesso total (bypass de RLS).
"""
from supabase import create_client, Client
from config import get_settings

_client: Client | None = None


def get_supabase() -> Client:
    global _client
    if _client is None:
        s = get_settings()
        _client = create_client(s.supabase_url, s.supabase_service_key)
    return _client

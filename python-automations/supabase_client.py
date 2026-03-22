from __future__ import annotations
"""
Cliente centralizado do Supabase para uso em todos os módulos.
Usa a Service Role Key para acesso total (bypass de RLS).
"""
from typing import Optional
from supabase import create_client, Client
from config import get_settings

_client: Optional[Client] = None


def get_supabase() -> Client:
    global _client
    if _client is None:
        s = get_settings()
        _client = create_client(s.supabase_url, s.supabase_service_key)
    return _client

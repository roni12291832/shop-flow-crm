from __future__ import annotations
"""
Configurações centrais do microserviço Python.
Carrega variáveis de ambiente do .env automaticamente.
"""
from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # Supabase
    supabase_url: str = ""
    supabase_service_key: str = ""

    # UAZAPI (WhatsApp)
    uazapi_base_url: str = "https://nexaflow.uazapi.com"
    uazapi_admin_token: str = ""

    # OpenAI (Jarvis IA)
    openai_api_key: str = ""

    # Configurações gerais
    admin_phone: str = ""    # Número do admin para receber relatórios
    report_hour: int = 18    # Hora do relatório diário
    report_minute: int = 0

    # URL pública deste serviço — usada para auto-configurar webhook no UAZAPI a cada startup
    webhook_url: str = ""    # Ex: https://artificial-vivian-ggenciaglobalnexus-d093d570.koyeb.app/webhook/uzapi

    # URL do frontend — usada para restringir CORS
    frontend_url: str = ""   # Ex: https://meucrm.vercel.app

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings() -> Settings:
    return Settings()

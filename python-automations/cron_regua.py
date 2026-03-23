import os
import sys
import asyncio
import logging
import random
from datetime import datetime, timedelta, date
from dotenv import load_dotenv
from supabase import create_client, Client

# Update module path to find config
sys.path.append(os.path.dirname(__file__))
from uazapi_client import uazapi

# Setup Logger
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("cron_regua")

# Load Env
dotenv_path = os.path.join(os.path.dirname(__file__), ".env")
load_dotenv(dotenv_path)

SUPABASE_URL = os.environ.get("VITE_SUPABASE_URL")
SUPABASE_KEY = os.environ.get("VITE_SUPABASE_ANON_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    logger.error("🚨 Supabase URL or Key not found in .env")
    sys.exit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)


def calculate_delays():
    """Retorna um delay aleatório de acordo com o pedido: 3s, 10s, 16s, 30s"""
    return random.choice([3, 10, 16, 22, 30])


async def process_rule(rule: dict, wp_config: dict):
    """Processa uma régua individual."""
    logger.info(f"👉 Processando regra: {rule['name']} | Tipo: {rule['trigger_event']}")
    
    today = date.today()
    target_date = today - timedelta(days=rule['delay_days'])

    eligible_clients = []

    # 1. Buscar os clientes elegíveis de acordo com a regra
    if rule['trigger_event'] == 'after_purchase':
        response = supabase.table('clients').select('*').not_.is_('last_purchase', 'null').execute()
        for c in response.data:
            lp = c.get('last_purchase')
            if lp:
                lp_date = datetime.fromisoformat(lp.split('T')[0]).date()
                if lp_date == target_date:
                    eligible_clients.append(c)

    elif rule['trigger_event'] == 'no_purchase':
        response = supabase.table('clients').select('*').execute()
        for c in response.data:
            lp = c.get('last_purchase')
            if lp:
                lp_date = datetime.fromisoformat(lp.split('T')[0]).date()
                if lp_date == target_date:
                    eligible_clients.append(c)

    elif rule['trigger_event'] == 'birthday':
        bday_target_date = today + timedelta(days=rule['delay_days'])
        
        response = supabase.table('clients').select('*').not_.is_('birth_date', 'null').execute()
        for c in response.data:
            bd = c.get('birth_date')
            if bd:
                try:
                    bd_date = datetime.fromisoformat(bd.split('T')[0]).date()
                    if bd_date.month == bday_target_date.month and bd_date.day == bday_target_date.day:
                        eligible_clients.append(c)
                except Exception as e:
                    pass

    elif rule['trigger_event'] == 'manual':
        return

    logger.info(f"👥 Encontrados {len(eligible_clients)} clientes elegíveis.")

    if not eligible_clients:
        return

    raw_message = rule.get('message_template', '')
    if not raw_message:
        return
        
    messages_list = [m.strip() for m in raw_message.split('|||') if m.strip()]
    
    if len(messages_list) < 15 and rule['channel'] == 'whatsapp':
        logger.warning(f"⚠️ ATENÇÃO: A regra '{rule['name']}' contém menos de 15 variações (tem {len(messages_list)}). "
                       f"Para segurança extrema Anti-Ban, a API exige 15. Disparo ABORTADO para evitar banimento!")
        return

    if rule['channel'] == 'whatsapp':
        logger.info(f"🚀 Iniciando Campanha WhatsApp para '{rule['name']}'...")
        
        results = {"sent": 0, "failed": 0, "errors": []}
        random.shuffle(eligible_clients)

        for i, client in enumerate(eligible_clients):
            try:
                exec_check = supabase.table('relationship_executions').select('id') \
                                .eq('rule_id', rule['id']) \
                                .eq('customer_id', client['id']) \
                                .gte('created_at', str(today)) \
                                .execute()
                                
                if exec_check.data and len(exec_check.data) > 0:
                    logger.info(f"🔄 Cliente {client['name']} já recebeu o disparo hoje.")
                    continue
            except Exception as e:
                pass


            phone = client.get("phone", "")
            if not phone:
                continue

            msg_template = random.choice(messages_list)
            personalized_msg = uazapi._personalize_message(msg_template, client)

            resp = await uazapi.send_text(
                api_url=wp_config['api_url'], 
                api_token=wp_config['api_token'], 
                instance_name=wp_config['instance_name'], 
                phone=phone, 
                message=personalized_msg
            )
            
            status = 'sucesso'
            if "error" in resp:
                status = 'falha'
                results["failed"] += 1
                logger.error(f"❌ Erro para {phone}: {resp['error']}")
            else:
                results["sent"] += 1
                
            try:
                supabase.table('relationship_executions').insert({
                    "rule_id": rule['id'],
                    "customer_id": client['id'],
                    "scheduled_for": str(datetime.now()),
                    "sent_at": str(datetime.now()) if status == 'sucesso' else None,
                    "status": "concluido" if status == 'sucesso' else "falhou",
                    "message_sent": personalized_msg
                }).execute()
            except Exception as e:
                logger.error(f"Erro ao salvar log de execução: {e}")

            if i < len(eligible_clients) - 1:
                delay = calculate_delays()
                logger.info(f"⏳ Aguardando {delay}s antes do próximo envio (Anti-Ban)...")
                await asyncio.sleep(delay)

        logger.info(f"✅ Disparos concluídos para Regra {rule['name']}. Sucesso: {results['sent']}, Falhas: {results['failed']}")


async def main():
    logger.info("🕒 Iniciando Validação do Cron de Regras de Relacionamento")
    
    wp_res = supabase.table("whatsapp_instances").select("*").eq("status", "connected").limit(1).execute()
    
    if not wp_res.data:
        logger.error("❌ Nenhuma instância conectada no Banco. Abortando disparos.")
        return
        
    wp_config = wp_res.data[0]
    
    rules_res = supabase.table('relationship_rules').select('*').eq('active', True).execute()
    active_rules = rules_res.data
    
    if not active_rules:
        logger.info("🤷 Nenhuma régua de relacionamento ATIVA.")
        return
        
    logger.info(f"📋 Encontradas {len(active_rules)} réguas ativas.")
    
    for rule in active_rules:
        try:
            await process_rule(rule, wp_config)
        except Exception as e:
            logger.error(f"💥 Erro fatal ao rodar regra '{rule['name']}': {e}")


if __name__ == "__main__":
    asyncio.run(main())

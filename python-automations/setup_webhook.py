import asyncio
import os
import sys
from dotenv import load_dotenv

# Path to the .env inside python-automations
load_dotenv('.env')

# Re-using the logic from the system
from supabase import create_client
from uazapi_client import uazapi

async def setup():
    url = os.environ.get('SUPABASE_URL')
    key = os.environ.get('SUPABASE_SERVICE_KEY')
    if not url or not key:
        print("❌ Supabase URL/Key Missing")
        return

    supabase = create_client(url, key)
    res = supabase.table('whatsapp_instances').select('*').limit(1).execute()
    if not res.data:
        print("❌ No instances found")
        return

    inst = res.data[0]
    api_url = inst['api_url']
    api_token = inst['api_token']
    instance_name = inst['instance_name']
    
    webhook_url = 'https://shop-flow-crm-noleto.onrender.com/webhook/uzapi'
    
    print(f"🚀 Setting Webhook to {webhook_url} for instance '{instance_name}'...")
    r = await uazapi.set_webhook(api_url, api_token, instance_name, webhook_url)
    print(f"✅ Result: {r}")

if __name__ == "__main__":
    asyncio.run(setup())

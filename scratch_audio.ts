import { createClient } from 'npm:@supabase/supabase-js'

const SUPABASE_URL = 'https://pwlzkykrbzbwadwiszow.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB3bHpreWtyYnpid2Fkd2lzem93Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjE3NTAxMiwiZXhwIjoyMDkxNzUxMDEyfQ.t8vx96okUtPBnTM3EHmyHLocavOgAWHZxcH-1kZ70M4'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

async function test() {
  const { data: tenants, error: tenantsError } = await supabase.from('tenants').select('id, name, elevenlabs_api_key')
  console.log('Tenants:', tenants, tenantsError)

  const { data: agents, error: agentsError } = await supabase.from('ai_agents').select('id, tenant_id, name, audio_response_enabled, voice_id')
  console.log('Agents:', agents, agentsError)
}

test()

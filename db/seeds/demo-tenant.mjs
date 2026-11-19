// Seed do tenant de demonstração (slug "demonstracao") — usado nos vídeos de treinamento.
// Dados 100% fictícios. Idempotente: apaga e recria SOMENTE o tenant "demonstracao".
//
//   DATABASE_URL=... DEMO_PASSWORD=... node db/seeds/demo-tenant.mjs
//
// O tenant não tem instância Evolution (evolution_api_url/key nulos), então o cron de
// check-connections o ignora; os agendamentos já nascem com os lembretes marcados como enviados.
import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'

const require = createRequire(new URL('../../apps/web/package.json', import.meta.url))
const pg = require('pg')
const bcrypt = require('bcryptjs')

const DATABASE_URL = process.env.DATABASE_URL
const DEMO_EMAIL = process.env.DEMO_EMAIL ?? 'demo@satori.ia.br'
const DEMO_PASSWORD = process.env.DEMO_PASSWORD
if (!DATABASE_URL || !DEMO_PASSWORD) throw new Error('Defina DATABASE_URL e DEMO_PASSWORD')

const SLUG = 'demonstracao'
const CLOUD = 'https://res.cloudinary.com/demo/image/upload'
const img = (id, tr = '') => ({
  alt: '',
  url: `${CLOUD}/${tr ? tr + '/' : ''}${id}`,
  thumbnailUrl: `${CLOUD}/w_400,h_400,c_fill,q_auto,f_auto${tr ? ',' + tr : ''}/${id}`,
})

const agora = Date.now()
const min = (n) => new Date(agora - n * 60_000)
const dia = (offset) => { const d = new Date(); d.setDate(d.getDate() + offset); return d.toISOString().slice(0, 10) }

// ── Produtos ─────────────────────────────────────────────────────────────────
const PRODUTOS = [
  { n: 'Tênis Urban Run Roxo', p: 289.9, c: 'Calçados', i: img('samples/ecommerce/shoes.png'), f: true, ch: ['Cor: Roxo', 'Numeração: 36 ao 44', 'Solado: Borracha antiderrapante'], d: 'Tênis leve e confortável para o dia a dia e para caminhadas.' },
  { n: 'Tênis Urban Run Verde', p: 289.9, c: 'Calçados', i: img('samples/ecommerce/shoes.png', 'e_hue:120'), ch: ['Cor: Verde', 'Numeração: 36 ao 44'], d: 'O mesmo Urban Run, na cor verde.' },
  { n: 'Tênis Casual Branco', p: 249.9, c: 'Calçados', i: img('cld-sample-5.jpg'), ch: ['Cor: Branco', 'Numeração: 37 ao 43'], d: 'Tênis casual branco, combina com qualquer look.' },
  { n: 'Maleta Executiva em Couro', p: 459, c: 'Bolsas', i: img('samples/ecommerce/leather-bag-gray.jpg'), f: true, ch: ['Material: Couro legítimo', 'Cor: Caramelo', 'Compartimento para notebook 14"'], d: 'Maleta executiva em couro, ideal para o trabalho.' },
  { n: 'Maleta Executiva Verde', p: 459, c: 'Bolsas', i: img('samples/ecommerce/leather-bag-gray.jpg', 'e_hue:40'), ad: true, ch: ['Material: Couro legítimo', 'Cor: Verde'], d: 'A maleta executiva na cor verde.' },
  { n: 'Relógio Cronógrafo Couro', p: 349.9, c: 'Relógios', i: img('samples/ecommerce/analog-classic.jpg'), f: true, ch: ['Caixa: 42 mm', 'Pulseira: Couro', 'Resistente à água: 30 m'], d: 'Relógio cronógrafo de design atemporal.' },
  { n: 'Relógio Cronógrafo Verde', p: 369.9, c: 'Relógios', i: img('samples/ecommerce/analog-classic.jpg', 'e_hue:30'), ch: ['Caixa: 42 mm', 'Pulseira: Verde'], d: 'Cronógrafo com pulseira verde.' },
  { n: 'Kit Acessórios Urbano', p: 199.9, c: 'Acessórios', i: img('samples/ecommerce/accessories-bag.jpg'), ch: ['Itens: bolsa, lenço, óculos e carteira'], d: 'Kit com acessórios para completar o look.' },
  { n: 'Bicicleta Urbana Vermelha Aro 26', p: 1290, c: 'Bicicletas', i: img('samples/bike.jpg'), ch: ['Aro: 26', 'Câmbio: 21 marchas', 'Quadro: Alumínio'], d: 'Bicicleta urbana para o dia a dia.' },
  { n: 'Volante Clássico de Madeira', p: 289, c: 'Acessórios', i: img('samples/ecommerce/car-interior-design.jpg'), off: true, ch: ['Material: Madeira e metal', 'Diâmetro: 38 cm'], d: 'Volante clássico em madeira para carros de coleção.' },
]

// Horário comercial padrão (seg–sáb 9h–18h; domingo fechado)
const dias = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat']
const HORARIO = { ...Object.fromEntries(dias.map((d) => [d, { start: '09:00', end: '18:00', enabled: true }])), sun: { start: '09:00', end: '13:00', enabled: false } }

// ── Contatos e conversas ─────────────────────────────────────────────────────
const CONTATOS = [
  ['Mariana Costa', 'ia_atendendo'], ['João Pedro Almeida', 'ia_atendendo'], ['Fernanda Ribeiro', 'aguardando_humano'],
  ['Lucas Martins', 'aguardando_humano'], ['Camila Nogueira', 'em_atendimento'], ['Rodrigo Teixeira', 'em_atendimento'],
  ['Patrícia Gomes', 'agendado'], ['Bruno Carvalho', 'novo_lead'], ['Juliana Freitas', 'finalizado'], ['Thiago Barros', null],
]
const status = { ia_atendendo: 'ai_handling', novo_lead: 'ai_handling', agendado: 'ai_handling', aguardando_humano: 'waiting_human', em_atendimento: 'human_handling', finalizado: 'closed' }

// [remetente, texto, minutos atrás]
const PAPO = {
  'Mariana Costa': [['c', 'Oi! Vocês têm o tênis Urban Run no 38?', 42], ['a', 'Olá, Mariana! Temos sim, o Urban Run roxo está disponível do 36 ao 44. Quer ver a foto?', 41], ['c', 'Quero!', 40], ['a', 'Aqui está! Ele custa R$ 289,90. Posso reservar o seu 38?', 39]],
  'João Pedro Almeida': [['c', 'Boa tarde, quanto é a maleta executiva?', 25], ['a', 'Boa tarde, João Pedro! A Maleta Executiva em Couro custa R$ 459,00 e cabe notebook de até 14 polegadas.', 24]],
  'Fernanda Ribeiro': [['c', 'Gostei do relógio cronógrafo verde, mas queria negociar o valor', 70], ['a', 'Que bom, Fernanda! Vou chamar um de nossos atendentes para conversar com você sobre as condições.', 69], ['s', 'Conversa escalada para um atendente humano.', 69]],
  'Lucas Martins': [['c', 'Vocês parcelam a bicicleta em quantas vezes?', 55], ['a', 'Boa pergunta, Lucas! Vou passar para um atendente confirmar o parcelamento certinho para você.', 54]],
  'Camila Nogueira': [['c', 'Oi, meu pedido já saiu para entrega?', 130], ['a', 'Oi, Camila! Vou chamar um atendente para consultar o seu pedido agora.', 129], ['h', 'Oi, Camila! Aqui é o Rafael. Seu pedido saiu hoje de manhã e chega até o fim do dia.', 120], ['c', 'Perfeito, obrigada!', 118]],
  'Rodrigo Teixeira': [['c', 'Queria trocar o tênis, ficou apertado', 200], ['a', 'Sem problema, Rodrigo! Vou chamar um atendente para combinar a troca.', 199], ['h', 'Oi, Rodrigo! É a Bianca. Pode trazer na loja que trocamos pelo tamanho certo.', 185]],
  'Patrícia Gomes': [['c', 'Quero experimentar a maleta executiva verde', 300], ['a', 'Claro, Patrícia! Posso agendar um horário na loja. Que dia fica bom para você?', 299], ['c', 'Sexta de manhã', 295], ['a', 'Agendado para sexta às 10:30. Te esperamos!', 294]],
  'Bruno Carvalho': [['c', 'Olá, vi o anúncio de vocês. Ainda tem?', 6], ['a', 'Olá, Bruno! Tudo bem? Temos várias opções em calçados, bolsas e relógios. O que você procura?', 5]],
  'Juliana Freitas': [['c', 'Retirei o relógio hoje, adorei!', 1500], ['a', 'Que ótimo, Juliana! Obrigado pela compra e volte sempre!', 1499]],
}

// ── Agenda: [contato, dia(offset vs hoje), início, fim, status, título, [serviços]] ─
const AGENDA = [
  ['Juliana Freitas', -3, '10:00', '10:30', 'completed', 'Retirada de pedido', [['Relógio Cronógrafo Couro', 349.9]]],
  ['Juliana Freitas', -40, '15:00', '15:30', 'completed', 'Experimentação de calçados', [['Tênis Urban Run Roxo', 289.9]]],
  ['Juliana Freitas', -75, '11:00', '11:30', 'completed', 'Retirada de pedido', [['Kit Acessórios Urbano', 219.9]]],
  ['Camila Nogueira', -2, '15:00', '15:30', 'completed', 'Retirada de pedido', [['Maleta Executiva em Couro', 459]]],
  ['Camila Nogueira', -30, '09:30', '10:00', 'completed', 'Experimentação de calçados', [['Tênis Casual Branco', 249.9]]],
  ['Camila Nogueira', -55, '16:00', '16:30', 'completed', 'Retirada de pedido', [['Relógio Cronógrafo Verde', 389.9]]],
  ['Camila Nogueira', -80, '14:00', '14:30', 'completed', 'Retirada de pedido', [['Bicicleta Urbana Vermelha Aro 26', 1290]]],
  ['Rodrigo Teixeira', -1, '11:00', '11:30', 'completed', 'Experimentação de calçados', [['Tênis Urban Run Roxo', 289.9]]],
  ['Rodrigo Teixeira', -45, '10:30', '11:00', 'no_show', 'Retirada de pedido', []],
  ['Patrícia Gomes', 1, '10:30', '11:00', 'confirmed', 'Experimentação de maletas', []],
  ['Mariana Costa', 1, '16:00', '16:30', 'confirmed', 'Experimentação de calçados', []],
  ['Fernanda Ribeiro', 2, '09:30', '10:00', 'pending', 'Retirada de pedido', []],
  ['Lucas Martins', 4, '14:00', '14:30', 'confirmed', 'Consultoria de presentes', []],
  ['Thiago Barros', 0, '17:00', '17:30', 'confirmed', 'Experimentação de relógios', []],
]

const url = DATABASE_URL.replace(/^["']|["']$/g, '')
// TLS segue o que a própria URL pedir (sslmode); sem desligar verificação de certificado
const db = new pg.Client({ connectionString: url })
await db.connect()
const q = (s, p) => db.query(s, p)

// A URL de cada imagem precisa responder 200 (inclui as variações de cor por transformação)
for (const pr of PRODUTOS) {
  const r = await fetch(pr.i.thumbnailUrl, { method: 'HEAD' })
  if (!r.ok) throw new Error(`Imagem indisponível (${r.status}): ${pr.i.thumbnailUrl}`)
}

try {
  await q('BEGIN')
  // limpa só o que é da demonstração
  await q(`delete from tenants where slug = $1`, [SLUG])
  await q(`delete from auth_users where email = any($1)`, [[DEMO_EMAIL, 'rafael@demonstracao.example', 'bianca@demonstracao.example']])

  const tenantId = randomUUID()
  await q(
    `insert into tenants (id, name, slug, business_segment, business_description, owner_name, owner_email, owner_phone, city, state,
        plan, status, onboarding_completed_at, whatsapp_number, whatsapp_connection_type, whatsapp_connected, business_hours,
        appointment_duration_minutes, appointment_slot_interval_minutes, timezone, max_messages_month, max_products, max_operators,
        business_model, ai_sales_mode, active)
     values ($1,'Loja Demonstração',$2,'loja','Loja fictícia usada nos vídeos de treinamento do Satori: calçados, bolsas, relógios e bicicletas.',
        'Marina Duarte',$3,'5511999990000','São Paulo','SP','pro','active',now(),'5511999990000','baileys',true,
        $4::jsonb,30,30,'America/Sao_Paulo',5000,100,5,'product','auto',true)`,
    [tenantId, SLUG, DEMO_EMAIL, JSON.stringify(HORARIO)],
  )

  // Usuários (dono + 2 vendedores). Só o dono tem senha — os outros não conseguem logar.
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10)
  const usuarios = [
    ['owner', 'Marina Duarte', DEMO_EMAIL, hash],
    ['operator', 'Rafael Lima', 'rafael@demonstracao.example', null],
    ['operator', 'Bianca Alves', 'bianca@demonstracao.example', null],
  ]
  const uid = {}
  for (const [role, nome, email, h] of usuarios) {
    const id = randomUUID(); uid[nome.split(' ')[0]] = id
    await q(`insert into auth_users (id, email, password_hash, full_name, email_verified) values ($1,$2,$3,$4,now())`, [id, email, h, nome])
    await q(`insert into users (id, tenant_id, full_name, email, role) values ($1,$2,$3,$4,$5)`, [id, tenantId, nome, email, role])
  }

  // Colunas do kanban: um trigger do banco já cria as padrão ao inserir o tenant; garante as que faltarem
  const stages = [['Novo Lead', 'novo_lead', '#6366f1', true, false], ['IA Atendendo', 'ia_atendendo', '#3b82f6', false, false],
    ['Aguardando Humano', 'aguardando_humano', '#f59e0b', false, false], ['Em Atendimento', 'em_atendimento', '#10b981', false, false],
    ['Agendado', 'agendado', '#8b5cf6', false, false], ['Finalizado', 'finalizado', '#6b7280', false, true]]
  for (const [i, [nome, slug, cor, def, closed]] of stages.entries())
    await q(`insert into kanban_stages (tenant_id, name, slug, color, position, is_default, is_closed) values ($1,$2,$3,$4,$5,$6,$7)
             on conflict (tenant_id, slug) do nothing`, [tenantId, nome, slug, cor, i, def, closed])
  const stageId = Object.fromEntries((await q(`select slug, id from kanban_stages where tenant_id = $1`, [tenantId])).rows.map((r) => [r.slug, r.id]))

  // Agente de IA
  const ag = await q(
    `insert into ai_agents (tenant_id, name, slug, type, is_active, is_default, model, temperature, language, llm_provider, system_prompt, personality,
        greeting_message, out_of_hours_message, can_search_products, can_book_appointments, can_send_images, can_escalate, can_collect_lead_info,
        follow_up_enabled, audio_response_enabled)
     values ($1,'Sofia','sdr-vendedor','sdr',true,true,'claude-haiku-4-5-20251001',0.7,'pt-BR','anthropic',$2,$3,$4,$5,true,true,true,true,true,false,false) returning id`,
    [tenantId,
      `## Modelo atual do negócio\nEsta empresa é uma LOJA de calçados, bolsas, relógios e bicicletas. Consulte os produtos antes de afirmar preço ou disponibilidade.\n\n## Identidade\nVocê é a Sofia, assistente virtual da Loja Demonstração. Atenda com simpatia, seja objetiva e conduza o cliente até a compra ou o agendamento de uma visita.\n\n## Regras\n- Nunca invente preço, prazo ou condição de pagamento: se não souber, chame um atendente.\n- Horário de atendimento: segunda a sábado, das 9h às 18h.`,
      'Simpática, objetiva e profissional.', 'Olá! 👋 Bem-vindo(a) à Loja Demonstração! Sou a Sofia, assistente virtual. Como posso te ajudar hoje?',
      'No momento estamos fora do horário de atendimento (segunda a sábado, das 9h às 18h). Deixe sua mensagem que retornamos assim que possível!'],
  )
  const agentId = ag.rows[0].id

  // Categorias e produtos
  for (const [i, c] of ['Calçados', 'Bolsas', 'Relógios', 'Bicicletas', 'Acessórios'].entries())
    await q(`insert into product_categories (tenant_id, name, position) values ($1,$2,$3)`, [tenantId, c, i])
  const prodId = {}
  for (const p of PRODUTOS) {
    const r = await q(
      `insert into products (tenant_id, name, description, short_description, price, price_display, category, characteristics, images, is_available, is_featured, is_running_ad)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning id`,
      [tenantId, p.n, p.d, p.d.slice(0, 120), p.p, p.p.toLocaleString('pt-BR', { minimumFractionDigits: 2 }), p.c, p.ch, JSON.stringify([p.i]), !p.off, !!p.f, !!p.ad])
    prodId[p.n] = r.rows[0].id
  }

  // Contatos + conversas + mensagens
  const cid = {}, convId = {}
  for (const [i, [nome, stage]] of CONTATOS.entries()) {
    const tel = `55119999${String(9000 + i + 1)}`
    const r = await q(`insert into contacts (tenant_id, whatsapp_number, whatsapp_name, custom_name, phone, tags, first_contact_at, last_contact_at)
                       values ($1,$2,$3,$3,$2,$4,$5,$6) returning id`, [tenantId, tel, nome, i % 3 === 0 ? ['vip'] : [], min(60 * 24 * 30), min(PAPO[nome]?.at(-1)[2] ?? 4000)])
    cid[nome] = r.rows[0].id
    if (!stage) continue
    const msgs = PAPO[nome]
    const ultimo = Math.min(...msgs.map((m) => m[2]))
    const assign = stage === 'em_atendimento' ? uid[nome === 'Camila Nogueira' ? 'Rafael' : 'Bianca'] : null
    const resumo = status[stage] === 'waiting_human' ? `${nome.split(' ')[0]} pediu atendimento humano. Contexto: ${msgs[0][1]}` : null
    const cv = await q(
      `insert into conversations (tenant_id, contact_id, ai_agent_id, kanban_stage_id, assigned_to, status, ai_summary, priority, started_at, last_message_at, closed_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning id`,
      [tenantId, cid[nome], agentId, stageId[stage], assign, status[stage], resumo, status[stage] === 'waiting_human' ? 'high' : 'normal',
        min(Math.max(...msgs.map((m) => m[2]))), min(ultimo), stage === 'finalizado' ? min(ultimo) : null])
    convId[nome] = cv.rows[0].id
    for (const [quem, texto, ha] of [...msgs].sort((a, b) => b[2] - a[2])) {
      const tipo = { c: 'customer', a: 'ai', h: 'human', s: 'system' }[quem]
      await q(`insert into messages (tenant_id, conversation_id, contact_id, sender_type, sender_id, content, content_type, is_read, created_at)
               values ($1,$2,$3,$4,$5,$6,'text',true,$7)`, [tenantId, convId[nome], cid[nome], tipo, quem === 'h' ? assign : null, texto, min(ha)])
    }
  }

  // Agenda + histórico (serviços concluídos alimentam visitas/gasto/score)
  await q(`insert into client_score_rules (tenant_id) values ($1) on conflict (tenant_id) do nothing`, [tenantId])
  for (const [nome, off, ini, fim, st, titulo, servicos] of AGENDA) {
    const ap = await q(
      `insert into appointments (tenant_id, contact_id, assigned_to, title, date, start_time, end_time, status, reminder_24h_sent, reminder_1h_sent, whatsapp_reminder_sent)
       values ($1,$2,$3,$4,$5,$6,$7,$8,true,true,true) returning id`, [tenantId, cid[nome], uid.Rafael, titulo, dia(off), ini, fim, st])
    for (const [s, preco] of servicos)
      await q(`insert into appointment_services (tenant_id, appointment_id, product_id, service_name, price, professional_id) values ($1,$2,$3,$4,$5,$6)`,
        [tenantId, ap.rows[0].id, prodId[s] ?? null, s, preco, uid.Rafael])
  }

  // Uso do plano (os triggers de mensagem mexem no contador; fixa um número realista)
  await q(`update tenants set messages_used_month = 412 where id = $1`, [tenantId])
  await q('COMMIT')
  console.log('OK tenant', tenantId, '| produtos', PRODUTOS.length, '| contatos', CONTATOS.length, '| agenda', AGENDA.length)
} catch (e) {
  await q('ROLLBACK').catch(() => {})
  console.error('ERRO (nada foi gravado):', e.message)
  process.exitCode = 1
} finally {
  await db.end()
}

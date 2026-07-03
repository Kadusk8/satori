// Verificação do modelo de acesso RLS (Fases 1/2 da migração pro Neon).
// Não é um teste unitário do app — é um script que sobe/usa um Postgres com o
// neon/schema.sql aplicado e prova o isolamento por tenant end-to-end.
//
// Como rodar (a partir de apps/web, com um Postgres já com o schema + o role
// app_user membro de authenticated/service_role):
//   DATABASE_URL_TEST='postgres://app_user:app_pw@127.0.0.1:55432/zapai_test' \
//   node lib/db/__tests__/rls.mjs
//
// Reproduz o que lib/db/index.ts faz (SET LOCAL ROLE + set_config da GUC
// request.jwt.claims), mas com `pg` (TCP) porque o driver serverless do Neon
// não fala com Postgres local direto. O comportamento SQL é idêntico.
import pg from 'pg'

const conn = process.env.DATABASE_URL_TEST
  ?? 'postgres://app_user:app_pw@127.0.0.1:55432/zapai_test'
const pool = new pg.Pool({ connectionString: conn })

async function withRole(role, claims, fn) {
  const client = await pool.connect()
  try {
    await client.query('begin')
    await client.query(`set local role ${role}`)
    if (claims) await client.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)])
    const r = await fn(client)
    await client.query('commit')
    return r
  } catch (e) {
    await client.query('rollback')
    throw e
  } finally {
    client.release()
  }
}
const withAdmin = (fn) => withRole('service_role', null, fn)
const withClaims = (claims, fn) => withRole('authenticated', claims, fn)

function assert(cond, msg) {
  if (!cond) { console.error('❌ FALHOU:', msg); process.exitCode = 1 }
  else console.log('✅', msg)
}

const run = async () => {
  const { tenantA, tenantB, superId } = await withAdmin(async (c) => {
    const a = await c.query(`insert into tenants (name, slug, webhook_secret, business_hours) values ('Empresa A','emp-a','seca','{}') returning id`)
    const b = await c.query(`insert into tenants (name, slug, webhook_secret, business_hours) values ('Empresa B','emp-b','secb','{}') returning id`)
    const s = await c.query(`insert into super_admins (id, full_name, email) values (gen_random_uuid(),'Dono','dono@x.com') returning id`)
    await c.query(`insert into products (tenant_id, name) values ($1,'Produto A')`, [a.rows[0].id])
    await c.query(`insert into products (tenant_id, name) values ($1,'Produto B')`, [b.rows[0].id])
    await c.query(`insert into users (id, tenant_id, full_name, email, role) values (gen_random_uuid(), $1, 'Owner A', 'owner@a.com', 'owner')`, [a.rows[0].id])
    return { tenantA: a.rows[0].id, tenantB: b.rows[0].id, superId: s.rows[0].id }
  })

  const noClaims = await withClaims({ role: 'authenticated' }, (c) => c.query('select count(*)::int n from products'))
  assert(noClaims.rows[0].n === 0, 'authenticated sem tenant_id → 0 produtos')

  const asA = await withClaims({ sub: 'u1', role: 'authenticated', tenant_id: tenantA, user_role: 'owner', is_super_admin: false },
    (c) => c.query('select name from products'))
  assert(asA.rows.length === 1 && asA.rows[0].name === 'Produto A', 'tenant A vê só Produto A')

  const asB = await withClaims({ sub: 'u2', role: 'authenticated', tenant_id: tenantB, user_role: 'owner', is_super_admin: false },
    (c) => c.query('select name from products'))
  assert(asB.rows.length === 1 && asB.rows[0].name === 'Produto B', 'tenant B vê só Produto B')

  const asSuper = await withClaims({ sub: superId, role: 'service_role', is_super_admin: true },
    (c) => c.query('select count(*)::int n from products'))
  assert(asSuper.rows[0].n === 2, 'super admin vê os 2 produtos')

  let writeBlocked = false
  try {
    await withClaims({ sub: 'u2', role: 'authenticated', tenant_id: tenantB, user_role: 'owner' },
      (c) => c.query(`insert into products (tenant_id, name) values ($1, 'Invasor')`, [tenantA]))
  } catch { writeBlocked = true }
  assert(writeBlocked, 'tenant B NÃO insere produto no tenant A (RLS WITH CHECK)')

  const admin = await withAdmin((c) => c.query('select count(*)::int n from products'))
  assert(admin.rows[0].n === 2, 'withAdmin (service_role) vê todos os produtos')

  const ownerRow = await withAdmin((c) => c.query(`select id from users where email='owner@a.com'`))
  const gc = (await withAdmin((c) => c.query('select get_session_claims($1) as c', [ownerRow.rows[0].id]))).rows[0].c
  assert(gc.tenant_id === tenantA && gc.user_role === 'owner' && gc.is_super_admin === false,
    'get_session_claims(owner) → tenant_id + user_role=owner + is_super_admin=false')

  const sc = (await withAdmin((c) => c.query('select get_session_claims($1) as c', [superId]))).rows[0].c
  assert(sc.is_super_admin === true && sc.role === 'service_role',
    'get_session_claims(super) → is_super_admin=true, role=service_role')

  await pool.end()
}
run().catch((e) => { console.error(e); process.exit(1) })

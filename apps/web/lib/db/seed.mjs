// Seed de desenvolvimento: cria um super admin, um tenant e um owner, com
// hashes de senha bcrypt (mesmo algoritmo do Auth.js). Roda com service_role.
//
//   DATABASE_URL='postgres://app_user:devpw@127.0.0.1:55432/zapdev' \
//   node lib/db/seed.mjs
//
// Credenciais criadas:
//   super admin  → admin@zap.dev   / admin123
//   owner tenant → owner@demo.dev  / owner123
import pg from 'pg'
import bcrypt from 'bcryptjs'

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })

async function withAdmin(fn) {
  const c = await pool.connect()
  try {
    await c.query('begin')
    await c.query('set local role service_role')
    const r = await fn(c)
    await c.query('commit')
    return r
  } catch (e) { await c.query('rollback'); throw e } finally { c.release() }
}

const run = async () => {
  const adminHash = await bcrypt.hash('admin123', 10)
  const ownerHash = await bcrypt.hash('owner123', 10)

  await withAdmin(async (c) => {
    // Super admin
    const au = await c.query(
      `insert into auth_users (email, password_hash, full_name, email_verified)
       values ('admin@zap.dev', $1, 'Super Admin', now())
       on conflict (email) do update set password_hash = excluded.password_hash
       returning id`, [adminHash])
    const adminId = au.rows[0].id
    await c.query(
      `insert into super_admins (id, full_name, email)
       values ($1, 'Super Admin', 'admin@zap.dev')
       on conflict (id) do nothing`, [adminId])

    // Tenant demo
    const t = await c.query(
      `insert into tenants (name, slug, business_segment, status, webhook_secret, business_hours)
       values ('Empresa Demo', 'empresa-demo', 'loja', 'active', encode(gen_random_bytes(24),'hex'), '{}')
       on conflict (slug) do update set name = excluded.name
       returning id`)
    const tenantId = t.rows[0].id

    // Owner do tenant
    const ou = await c.query(
      `insert into auth_users (email, password_hash, full_name, email_verified)
       values ('owner@demo.dev', $1, 'Owner Demo', now())
       on conflict (email) do update set password_hash = excluded.password_hash
       returning id`, [ownerHash])
    const ownerId = ou.rows[0].id
    await c.query(
      `insert into users (id, tenant_id, full_name, email, role)
       values ($1, $2, 'Owner Demo', 'owner@demo.dev', 'owner')
       on conflict (id) do nothing`, [ownerId, tenantId])

    console.log('seed OK — super admin', adminId, '| tenant', tenantId, '| owner', ownerId)
  })
  await pool.end()
}
run().catch((e) => { console.error(e); process.exit(1) })

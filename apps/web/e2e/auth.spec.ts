import { test, expect } from '@playwright/test'

test.describe('Autenticação — smoke tests', () => {
  test('login renderiza os campos esperados', async ({ page }) => {
    await page.goto('/login')
    await expect(page.locator('#email')).toBeVisible()
    await expect(page.locator('#password')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible()
  })

  test('/dashboard sem sessão redireciona pro login', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/login/)
  })

  test('/admin/dashboard sem sessão redireciona pro login', async ({ page }) => {
    await page.goto('/admin/dashboard')
    await expect(page).toHaveURL(/\/login/)
  })

  test('/team sem sessão redireciona pro login', async ({ page }) => {
    await page.goto('/team')
    await expect(page).toHaveURL(/\/login/)
  })
})

// Os testes abaixo exigem contas de teste já existentes no Supabase do
// ambiente alvo. Ficam pulados automaticamente até essas variáveis serem
// configuradas (localmente ou como secrets do CI) — não bloqueiam o restante
// da suíte nem o pipeline de CI.
const hasTenantCreds = !!(process.env.E2E_TENANT_EMAIL && process.env.E2E_TENANT_PASSWORD)
const hasSuperAdminCreds = !!(process.env.E2E_SUPER_ADMIN_EMAIL && process.env.E2E_SUPER_ADMIN_PASSWORD)

test.describe('Login com conta de tenant (owner/admin/operator)', () => {
  test.skip(!hasTenantCreds, 'Requer E2E_TENANT_EMAIL / E2E_TENANT_PASSWORD')

  test('login válido leva ao /dashboard', async ({ page }) => {
    await page.goto('/login')
    await page.locator('#email').fill(process.env.E2E_TENANT_EMAIL!)
    await page.locator('#password').fill(process.env.E2E_TENANT_PASSWORD!)
    await page.getByRole('button', { name: 'Entrar' }).click()
    await expect(page).toHaveURL(/\/dashboard/)
  })
})

test.describe('Login com conta de super admin', () => {
  test.skip(!hasSuperAdminCreds, 'Requer E2E_SUPER_ADMIN_EMAIL / E2E_SUPER_ADMIN_PASSWORD')

  test('login válido leva ao /admin', async ({ page }) => {
    await page.goto('/login')
    await page.locator('#email').fill(process.env.E2E_SUPER_ADMIN_EMAIL!)
    await page.locator('#password').fill(process.env.E2E_SUPER_ADMIN_PASSWORD!)
    await page.getByRole('button', { name: 'Entrar' }).click()
    await expect(page).toHaveURL(/\/admin/)
  })
})

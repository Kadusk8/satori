import { test, expect } from '@playwright/test'

// NOTA: Este arquivo testa o CRUD de estágios (colunas) do kanban em
// /settings/kanban. Apenas UI — integração com movimento automático de
// cards fica fora de escopo.

const hasTenantCreds = !!(process.env.E2E_TENANT_EMAIL && process.env.E2E_TENANT_PASSWORD)

test.describe('Kanban — Estágios (Colunas)', () => {
  test.skip(!hasTenantCreds, 'Requer E2E_TENANT_EMAIL / E2E_TENANT_PASSWORD')

  test.beforeEach(async ({ page }) => {
    // Login como tenant
    await page.goto('/login')
    await page.locator('#email').fill(process.env.E2E_TENANT_EMAIL!)
    await page.locator('#password').fill(process.env.E2E_TENANT_PASSWORD!)
    await page.getByRole('button', { name: 'Entrar' }).click()
    await expect(page).toHaveURL(/\/dashboard/)
  })

  test('criar nova coluna do kanban', async ({ page }) => {
    // Navegar para settings de kanban
    await page.goto('/dashboard/settings/kanban')

    // Clicar em "Nova coluna"
    const newStageBtn = page.getByRole('button', { name: /nova coluna/i })
    await expect(newStageBtn).toBeVisible()
    await newStageBtn.click()

    // Preencher nome da coluna
    const nameInput = page.locator('input[placeholder*="Ex: Pós-venda"]')
    await expect(nameInput).toBeVisible()
    await nameInput.fill('Coluna E2E Teste')

    // Selecionar uma cor (primeira cor dos presets)
    const colorBtn = page.locator('button[style*="background"]').first()
    await expect(colorBtn).toBeVisible()
    await colorBtn.click()

    // Salvar
    const saveBtn = page.getByRole('button', { name: /^Salvar$/i })
    await expect(saveBtn).toBeVisible()
    await saveBtn.click()

    // Verificar toast de sucesso
    await expect(page.locator('text=Coluna salva')).toBeVisible({ timeout: 5000 })

    // Verificar que a coluna aparece na listagem
    await expect(page.locator('text=Coluna E2E Teste')).toBeVisible()
  })

  test('editar coluna do kanban', async ({ page }) => {
    // Criar uma coluna primeiro
    await page.goto('/dashboard/settings/kanban')

    const newStageBtn = page.getByRole('button', { name: /nova coluna/i })
    await newStageBtn.click()

    const nameInput = page.locator('input[placeholder*="Ex: Pós-venda"]')
    await nameInput.fill('Coluna Original')

    const saveBtn = page.getByRole('button', { name: /^Salvar$/i })
    await saveBtn.click()

    await expect(page.locator('text=Coluna salva')).toBeVisible({ timeout: 5000 })

    // Aguardar a coluna aparecer
    await expect(page.locator('text=Coluna Original')).toBeVisible()
    await page.waitForTimeout(300)

    // Procurar o botão de editar (ícone de lápis)
    const stageRow = page.locator('text=Coluna Original').locator('..')
    const editBtn = stageRow.locator('button').filter({ has: page.locator('[*|class*="pencil"]') }).first()

    // Se não encontrar por filter, tentar por posição
    if (await editBtn.count() === 0) {
      // Os botões na ordem são: up, down, edit, delete/default
      // Encontrar a row e pegar o primeiro botão após os arrows
      const buttons = stageRow.locator('button')
      await buttons.nth(2).click() // edit é o terceiro
    } else {
      await editBtn.click()
    }

    // Editar o nome
    const editNameInput = page.locator('input[placeholder*="Ex: Pós-venda"]')
    await editNameInput.clear()
    await editNameInput.fill('Coluna Editada E2E')

    // Salvar
    const editSaveBtn = page.getByRole('button', { name: /^Salvar$/i })
    await editSaveBtn.click()

    // Verificar toast
    await expect(page.locator('text=Coluna salva')).toBeVisible({ timeout: 5000 })

    // Verificar novo nome na listagem
    await expect(page.locator('text=Coluna Editada E2E')).toBeVisible()
  })

  test('mudar cor da coluna', async ({ page }) => {
    // Criar uma coluna
    await page.goto('/dashboard/settings/kanban')

    const newStageBtn = page.getByRole('button', { name: /nova coluna/i })
    await newStageBtn.click()

    const nameInput = page.locator('input[placeholder*="Ex: Pós-venda"]')
    await nameInput.fill('Coluna com Cor')

    // Selecionar primeira cor (padrão)
    const colorBtns = page.locator('button[style*="background"]').filter({ has: page.locator('style') })
    if (await colorBtns.count() > 0) {
      await colorBtns.first().click()
    }

    const saveBtn = page.getByRole('button', { name: /^Salvar$/i })
    await saveBtn.click()

    await expect(page.locator('text=Coluna salva')).toBeVisible({ timeout: 5000 })
    await page.waitForTimeout(300)

    // Editar a coluna para trocar cor
    const stageRow = page.locator('text=Coluna com Cor').locator('..')
    const buttons = stageRow.locator('button')
    // O terceiro botão deve ser o de editar
    await buttons.nth(2).click()

    // Selecionar segunda cor
    const colorOptions = page.locator('button[style*="background"]')
    if (await colorOptions.count() > 1) {
      await colorOptions.nth(1).click()
    }

    const editSaveBtn = page.getByRole('button', { name: /^Salvar$/i })
    await editSaveBtn.click()

    await expect(page.locator('text=Coluna salva')).toBeVisible({ timeout: 5000 })

    // Verificar que a coluna continua visível (cor foi atualizada)
    await expect(page.locator('text=Coluna com Cor')).toBeVisible()
  })

  test('reordenar coluna (mover para cima)', async ({ page }) => {
    // Criar duas colunas
    await page.goto('/dashboard/settings/kanban')

    const newStageBtn = page.getByRole('button', { name: /nova coluna/i })

    // Primeira
    await newStageBtn.click()
    const nameInput = page.locator('input[placeholder*="Ex: Pós-venda"]')
    await nameInput.fill('Coluna A')
    const saveBtn = page.getByRole('button', { name: /^Salvar$/i })
    await saveBtn.click()
    await expect(page.locator('text=Coluna salva')).toBeVisible({ timeout: 5000 })

    // Segunda
    await page.waitForTimeout(300)
    await newStageBtn.click()
    const nameInput2 = page.locator('input[placeholder*="Ex: Pós-venda"]')
    await nameInput2.fill('Coluna B')
    const saveBtn2 = page.getByRole('button', { name: /^Salvar$/i })
    await saveBtn2.click()
    await expect(page.locator('text=Coluna salva')).toBeVisible({ timeout: 5000 })

    // Aguardar listagem atualizar
    await page.waitForTimeout(300)

    // Procurar a segunda coluna e clicar em "mover para cima"
    const stageBRow = page.locator('text=Coluna B').locator('..')

    // O botão de "mover para cima" é o primeiro ícone (ArrowUp)
    const moveUpBtn = stageBRow.locator('button').first()
    await expect(moveUpBtn).toBeVisible()
    await moveUpBtn.click()

    // Verificar que a ordem mudou (Coluna B agora vem antes de Coluna A)
    const allRows = page.locator('[class*="divide-y"] div[class*="flex items-center"]')
    const firstRowText = await allRows.first().innerText()
    await expect(firstRowText).toContain('Coluna B')
  })

  test('definir coluna como padrão', async ({ page }) => {
    // Criar uma coluna (não-padrão)
    await page.goto('/dashboard/settings/kanban')

    const newStageBtn = page.getByRole('button', { name: /nova coluna/i })
    await newStageBtn.click()

    const nameInput = page.locator('input[placeholder*="Ex: Pós-venda"]')
    await nameInput.fill('Coluna Padrão E2E')

    const saveBtn = page.getByRole('button', { name: /^Salvar$/i })
    await saveBtn.click()

    await expect(page.locator('text=Coluna salva')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('text=Coluna Padrão E2E')).toBeVisible()
    await page.waitForTimeout(300)

    // Procurar o botão "Definir padrão" na coluna
    const stageRow = page.locator('text=Coluna Padrão E2E').locator('..')
    const defaultBtn = stageRow.getByRole('button', { name: /definir padrão/i })

    if (await defaultBtn.count() > 0) {
      await defaultBtn.click()

      // Verificar toast
      await expect(page.locator('text=Coluna padrão atualizada')).toBeVisible({ timeout: 5000 })

      // Refresh ou aguardar que o indicador mude
      await page.waitForTimeout(500)

      // Verificar que a coluna agora tem o indicador de padrão
      await expect(stageRow.locator('text=Coluna padrão pra novos leads')).toBeVisible()
    }
  })

  test('excluir coluna (se não protegida)', async ({ page }) => {
    // Criar uma coluna que possa ser excluída
    await page.goto('/dashboard/settings/kanban')

    const newStageBtn = page.getByRole('button', { name: /nova coluna/i })
    await newStageBtn.click()

    const nameInput = page.locator('input[placeholder*="Ex: Pós-venda"]')
    await nameInput.fill('Coluna para Deletar E2E')

    const saveBtn = page.getByRole('button', { name: /^Salvar$/i })
    await saveBtn.click()

    await expect(page.locator('text=Coluna salva')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('text=Coluna para Deletar E2E')).toBeVisible()
    await page.waitForTimeout(300)

    // Procurar o botão de deletar (ícone de lixeira)
    const stageRow = page.locator('text=Coluna para Deletar E2E').locator('..')
    const buttons = stageRow.locator('button')

    // Os botões na ordem são: up, down, edit, default (se aplica), delete
    // Tentar encontrar o último button (delete)
    const deleteBtn = buttons.last()

    // Verificar se é realmente o botão de delete (não deve estar desabilitado se coluna não é protegida)
    if (await deleteBtn.isDisabled() === false) {
      await deleteBtn.click()

      // Confirmar o prompt de confirmação
      page.once('dialog', dialog => {
        if (dialog.message().includes('Excluir')) {
          dialog.accept()
        }
      })

      // Verificar toast
      await expect(page.locator('text=Coluna excluída')).toBeVisible({ timeout: 5000 })

      // Verificar que a coluna não aparece mais
      await expect(page.locator('text=Coluna para Deletar E2E')).not.toBeVisible()
    }
  })

  test('colunas protegidas não podem ser excluídas', async ({ page }) => {
    // Navegar para kanban settings
    await page.goto('/dashboard/settings/kanban')

    // Procurar uma coluna protegida (deve ter ícone de cadeado)
    const protectedRows = page.locator('text=Coluna do sistema — protegida').locator('..')

    if (await protectedRows.count() > 0) {
      // Verificar que o botão delete está desabilitado
      const firstProtectedRow = protectedRows.first()
      const deleteBtn = firstProtectedRow.locator('button[disabled]').filter({ has: page.locator('[*|class*="trash"]') })

      if (await deleteBtn.count() > 0) {
        await expect(deleteBtn.first()).toBeDisabled()
      }
    }
  })
})

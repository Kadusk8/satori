import { test, expect } from '@playwright/test'

// NOTA: Este arquivo testa o CRUD de categorias de produto na página
// /settings/categories. Apenas UI e fluxos de navegação — sem integração
// com WhatsApp/IA.

const hasTenantCreds = !!(process.env.E2E_TENANT_EMAIL && process.env.E2E_TENANT_PASSWORD)

test.describe('Categorias de Produto — CRUD', () => {
  test.skip(!hasTenantCreds, 'Requer E2E_TENANT_EMAIL / E2E_TENANT_PASSWORD')

  test.beforeEach(async ({ page }) => {
    // Login como tenant
    await page.goto('/login')
    await page.locator('#email').fill(process.env.E2E_TENANT_EMAIL!)
    await page.locator('#password').fill(process.env.E2E_TENANT_PASSWORD!)
    await page.getByRole('button', { name: 'Entrar' }).click()
    await expect(page).toHaveURL(/\/dashboard/)
  })

  test('criar nova categoria', async ({ page }) => {
    // Navegar para settings de categorias
    await page.goto('/dashboard/settings/categories')

    // Clicar em "Nova categoria"
    const newCategoryBtn = page.getByRole('button', { name: /nova categoria/i })
    await expect(newCategoryBtn).toBeVisible()
    await newCategoryBtn.click()

    // Preencher o input
    const nameInput = page.locator('input[placeholder*="Ex: Roupas"]')
    await expect(nameInput).toBeVisible()
    await nameInput.fill('Categoria E2E Teste')

    // Salvar
    const saveBtn = page.getByRole('button', { name: /^Salvar$/i })
    await expect(saveBtn).toBeVisible()
    await saveBtn.click()

    // Verificar toast de sucesso
    await expect(page.locator('text=Categoria salva')).toBeVisible({ timeout: 5000 })

    // Verificar que a categoria aparece na listagem
    await expect(page.locator('text=Categoria E2E Teste')).toBeVisible()
  })

  test('renomear categoria', async ({ page }) => {
    // Criar uma categoria primeiro
    await page.goto('/dashboard/settings/categories')

    const newCategoryBtn = page.getByRole('button', { name: /nova categoria/i })
    await newCategoryBtn.click()

    const nameInput = page.locator('input[placeholder*="Ex: Roupas"]')
    await nameInput.fill('Categoria Original')

    const saveBtn = page.getByRole('button', { name: /^Salvar$/i })
    await saveBtn.click()

    await expect(page.locator('text=Categoria salva')).toBeVisible({ timeout: 5000 })

    // Aguardar a categoria aparecer
    await expect(page.locator('text=Categoria Original')).toBeVisible()
    await page.waitForTimeout(300)

    // Procurar o botão de editar (ícone de lápis)
    const categoryRow = page.locator('text=Categoria Original').locator('..')
    const editBtn = categoryRow.locator('button[title*="edit"], button:has-text("Pencil")').first()

    // Se não encontrar por title/text, tentar por estrutura CSS
    if (await editBtn.count() === 0) {
      // Procurar dentro da row
      const buttons = categoryRow.locator('button')
      await buttons.first().click()
    } else {
      await editBtn.click()
    }

    // Editar o nome
    const editNameInput = page.locator('input[placeholder*="Ex: Roupas"]')
    await editNameInput.clear()
    await editNameInput.fill('Categoria Renomeada E2E')

    // Salvar
    const editSaveBtn = page.getByRole('button', { name: /^Salvar$/i })
    await editSaveBtn.click()

    // Verificar toast
    await expect(page.locator('text=Categoria salva')).toBeVisible({ timeout: 5000 })

    // Verificar novo nome na listagem
    await expect(page.locator('text=Categoria Renomeada E2E')).toBeVisible()
  })

  test('reordenar categoria (mover para cima)', async ({ page }) => {
    // Criar duas categorias
    await page.goto('/dashboard/settings/categories')

    const newCategoryBtn = page.getByRole('button', { name: /nova categoria/i })

    // Primeira
    await newCategoryBtn.click()
    const nameInput = page.locator('input[placeholder*="Ex: Roupas"]')
    await nameInput.fill('Categoria A')
    const saveBtn = page.getByRole('button', { name: /^Salvar$/i })
    await saveBtn.click()
    await expect(page.locator('text=Categoria salva')).toBeVisible({ timeout: 5000 })

    // Segunda
    await page.waitForTimeout(300)
    await newCategoryBtn.click()
    const nameInput2 = page.locator('input[placeholder*="Ex: Roupas"]')
    await nameInput2.fill('Categoria B')
    const saveBtn2 = page.getByRole('button', { name: /^Salvar$/i })
    await saveBtn2.click()
    await expect(page.locator('text=Categoria salva')).toBeVisible({ timeout: 5000 })

    // Aguardar listagem atualizar
    await page.waitForTimeout(300)

    // Procurar a segunda categoria e clicar em "mover para cima"
    const categoryBRow = page.locator('text=Categoria B').locator('..')

    // O botão de "mover para cima" é o primeiro ícone na coluna de arrows
    const moveUpBtn = categoryBRow.locator('button').first()
    await expect(moveUpBtn).toBeVisible()
    await moveUpBtn.click()

    // Verificar que a ordem mudou (Categoria B agora vem antes de Categoria A)
    const allRows = page.locator('[class*="divide-y"] div[class*="flex items-center"]')
    const firstRowText = await allRows.first().innerText()
    await expect(firstRowText).toContain('Categoria B')
  })

  test('excluir categoria', async ({ page }) => {
    // Criar uma categoria
    await page.goto('/dashboard/settings/categories')

    const newCategoryBtn = page.getByRole('button', { name: /nova categoria/i })
    await newCategoryBtn.click()

    const nameInput = page.locator('input[placeholder*="Ex: Roupas"]')
    await nameInput.fill('Categoria para Deletar')

    const saveBtn = page.getByRole('button', { name: /^Salvar$/i })
    await saveBtn.click()

    await expect(page.locator('text=Categoria salva')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('text=Categoria para Deletar')).toBeVisible()
    await page.waitForTimeout(300)

    // Procurar o botão de deletar (ícone de lixeira, segundo botão na row)
    const categoryRow = page.locator('text=Categoria para Deletar').locator('..')
    const deleteBtn = categoryRow.locator('button').nth(1) // após o botão de editar

    await expect(deleteBtn).toBeVisible()
    await deleteBtn.click()

    // Confirmar o prompt de confirmação
    const isConfirmation = await page.evaluate(() => {
      return confirm('Excluir a categoria "Categoria para Deletar"? Produtos que já usam esse nome não são alterados.')
    }).catch(() => false)

    // Se houver um dialog nativo (confirm), Playwright pode capturar
    page.once('dialog', dialog => {
      if (dialog.message().includes('Excluir')) {
        dialog.accept()
      }
    })

    // Verificar toast
    await expect(page.locator('text=Categoria excluída')).toBeVisible({ timeout: 5000 })

    // Verificar que a categoria não aparece mais
    await expect(page.locator('text=Categoria para Deletar')).not.toBeVisible()
  })

  test('categoria aparece no autocomplete do formulário de produto', async ({ page }) => {
    // Criar uma categoria
    await page.goto('/dashboard/settings/categories')

    const newCategoryBtn = page.getByRole('button', { name: /nova categoria/i })
    await newCategoryBtn.click()

    const nameInput = page.locator('input[placeholder*="Ex: Roupas"]')
    const testCategory = 'Categoria Autocomplete E2E'
    await nameInput.fill(testCategory)

    const saveBtn = page.getByRole('button', { name: /^Salvar$/i })
    await saveBtn.click()

    await expect(page.locator('text=Categoria salva')).toBeVisible({ timeout: 5000 })

    // Navegar para criar um produto
    await page.goto('/dashboard/products')

    const newProductBtn = page.getByRole('button', { name: /novo produto/i })
    await newProductBtn.click()

    // Preencher nome do produto
    const productNameInput = page.locator('input[placeholder*="Ex: Camiseta"]')
    await productNameInput.fill('Produto com Categoria')

    // Clicar no input de categoria
    const categoryInput = page.locator('input[placeholder*="Ex: Roupas"]')
    await categoryInput.fill(testCategory.substring(0, 5)) // digitar parcialmente

    // Verificar que a categoria aparece como opção (datalist)
    const datalistOptions = page.locator('datalist#product-categories-list option')
    const hasOption = await datalistOptions.evaluate((list, searchText) => {
      return Array.from(list.querySelectorAll('option')).some(opt => opt.value === searchText)
    }, testCategory)

    // Verificar que pelo menos o elemento de datalist existe
    const datalist = page.locator('datalist#product-categories-list')
    await expect(datalist).toBeVisible()

    // Tipo na categoria field
    await categoryInput.clear()
    await categoryInput.fill(testCategory)

    // Verificar que aparece a opção
    await expect(datalist.locator(`option[value="${testCategory}"]`)).toBeVisible()
  })
})

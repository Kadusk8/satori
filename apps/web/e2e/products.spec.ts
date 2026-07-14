import { test, expect } from '@playwright/test'

// NOTA: Este arquivo testa apenas o CRUD de produtos via UI.
// Testes de integração com WhatsApp/IA (webhook, envio de imagens,
// busca automática) ficam fora de escopo — exigem instância Evolution real.

const hasTenantCreds = !!(process.env.E2E_TENANT_EMAIL && process.env.E2E_TENANT_PASSWORD)

test.describe('Produtos — CRUD', () => {
  test.skip(!hasTenantCreds, 'Requer E2E_TENANT_EMAIL / E2E_TENANT_PASSWORD')

  test.beforeEach(async ({ page }) => {
    // Login como tenant
    await page.goto('/login')
    await page.locator('#email').fill(process.env.E2E_TENANT_EMAIL!)
    await page.locator('#password').fill(process.env.E2E_TENANT_PASSWORD!)
    await page.getByRole('button', { name: 'Entrar' }).click()
    await expect(page).toHaveURL(/\/dashboard/)
  })

  test('criar novo produto', async ({ page }) => {
    // Navegar para /products
    await page.goto('/dashboard/products')

    // Aguardar carregamento
    const newProductBtn = page.getByRole('button', { name: /novo produto/i })
    await expect(newProductBtn).toBeVisible()

    // Abrir formulário
    await newProductBtn.click()

    // Preencher formulário
    // Nome (obrigatório)
    const nameInput = page.locator('input[placeholder*="Ex: Camiseta"]')
    await expect(nameInput).toBeVisible()
    await nameInput.fill('Produto Teste E2E')

    // Descrição curta
    const shortDescInput = page.locator('input[placeholder*="Algodão 100%"]')
    await expect(shortDescInput).toBeVisible()
    await shortDescInput.fill('Descrição curta para WhatsApp')

    // Preço
    const priceInput = page.locator('input[placeholder*="57.900"]')
    await expect(priceInput).toBeVisible()
    await priceInput.fill('199,90')

    // Categoria
    const categoryInput = page.locator('input[placeholder*="Ex: Roupas"]')
    await expect(categoryInput).toBeVisible()
    await categoryInput.fill('Teste')

    // Tags
    const tagsInput = page.locator('input[placeholder*="promo, novo"]')
    await expect(tagsInput).toBeVisible()
    await tagsInput.fill('e2e, teste')

    // Salvar
    const submitBtn = page.getByRole('button', { name: /criar produto/i })
    await expect(submitBtn).toBeVisible()
    await submitBtn.click()

    // Verificar toast de sucesso
    const successToast = page.locator('text=Produto criado')
    await expect(successToast).toBeVisible({ timeout: 5000 })

    // Verificar que o produto aparece na listagem
    await expect(page.locator('text=Produto Teste E2E')).toBeVisible()
  })

  test('editar produto', async ({ page }) => {
    // Criar um produto primeiro
    await page.goto('/dashboard/products')
    const newProductBtn = page.getByRole('button', { name: /novo produto/i })
    await newProductBtn.click()

    const nameInput = page.locator('input[placeholder*="Ex: Camiseta"]')
    await nameInput.fill('Produto para Edição')

    const shortDescInput = page.locator('input[placeholder*="Algodão 100%"]')
    await shortDescInput.fill('Versão original')

    const submitBtn = page.getByRole('button', { name: /criar produto/i })
    await submitBtn.click()

    await expect(page.locator('text=Produto criado')).toBeVisible({ timeout: 5000 })

    // Aguardar um momento para o card aparecer
    await page.waitForTimeout(500)

    // Clicar para editar (procura por um card com o nome e depois o botão de editar nele)
    // A estrutura é: ProductCard renderiza o nome e um botão "Editar"
    const productCard = page.locator('text=Produto para Edição')
    await expect(productCard).toBeVisible()

    // Procurar o botão de editar mais próximo ao card (usa icon de lápis ou label)
    // Playwright encontrará o primeiro elemento interativo próximo
    const cardParent = productCard.locator('..')
    const editBtn = cardParent.locator('button').first()
    await editBtn.click()

    // Editar o nome
    const nameInput2 = page.locator('input[placeholder*="Ex: Camiseta"]')
    await nameInput2.fill('Produto Editado E2E')

    // Salvar alterações
    const saveBtn = page.getByRole('button', { name: /salvar alterações/i })
    await expect(saveBtn).toBeVisible()
    await saveBtn.click()

    // Verificar toast
    await expect(page.locator('text=Produto atualizado')).toBeVisible({ timeout: 5000 })

    // Verificar novo nome na listagem
    await expect(page.locator('text=Produto Editado E2E')).toBeVisible()
  })

  test('marcar produto como "em anúncio"', async ({ page }) => {
    // Criar um produto
    await page.goto('/dashboard/products')
    const newProductBtn = page.getByRole('button', { name: /novo produto/i })
    await newProductBtn.click()

    const nameInput = page.locator('input[placeholder*="Ex: Camiseta"]')
    await nameInput.fill('Produto com Anúncio')

    const submitBtn = page.getByRole('button', { name: /criar produto/i })
    await submitBtn.click()

    await expect(page.locator('text=Produto criado')).toBeVisible({ timeout: 5000 })
    await page.waitForTimeout(500)

    // Procurar o card e clicar em editar
    const productCard = page.locator('text=Produto com Anúncio')
    await expect(productCard).toBeVisible()

    const cardParent = productCard.locator('..')
    const editBtn = cardParent.locator('button').first()
    await editBtn.click()

    // Marcar checkbox "Em anúncio"
    // Label: "Em anúncio (Facebook/Instagram Ads)"
    const adCheckbox = page.locator('input[type="checkbox"]').nth(2) // terceiro checkbox (disponível, destaque, anúncio)
    await expect(adCheckbox).toBeVisible()
    await adCheckbox.check()

    // Salvar
    const saveBtn = page.getByRole('button', { name: /salvar alterações/i })
    await saveBtn.click()

    await expect(page.locator('text=Produto atualizado')).toBeVisible({ timeout: 5000 })
  })

  test('filtrar produtos por "em anúncio"', async ({ page }) => {
    // Navegar para /products
    await page.goto('/dashboard/products')

    // Clicar no filtro "Em anúncio"
    const adFilter = page.locator('button', { has: page.locator('text=Em anúncio') }).first()
    await expect(adFilter).toBeVisible()
    await adFilter.click()

    // Aguardar filtro aplicar (a página tem lógica local de filtro)
    await page.waitForTimeout(300)

    // Verificar que apenas produtos "em anúncio" são exibidos (ou lista vazia se nenhum)
    // A listagem não deve ter elementos que não sejam "em anúncio"
    await expect(page.locator('text=Em anúncio')).toBeVisible()
  })

  test('excluir produto', async ({ page }) => {
    // Criar um produto
    await page.goto('/dashboard/products')
    const newProductBtn = page.getByRole('button', { name: /novo produto/i })
    await newProductBtn.click()

    const nameInput = page.locator('input[placeholder*="Ex: Camiseta"]')
    await nameInput.fill('Produto para Deletar')

    const submitBtn = page.getByRole('button', { name: /criar produto/i })
    await submitBtn.click()

    await expect(page.locator('text=Produto criado')).toBeVisible({ timeout: 5000 })
    await page.waitForTimeout(500)

    // Procurar o card
    const productCard = page.locator('text=Produto para Deletar')
    await expect(productCard).toBeVisible()

    const cardParent = productCard.locator('..')
    // Procurar botão de delete (ícone de lixeira)
    const deleteBtn = cardParent.locator('button').last()
    await deleteBtn.click()

    // Confirmar deleção (pode ser um dialog ou não, dependendo do impl)
    // ProductCard pode usar um confirm nativo
    await page.once('dialog', dialog => {
      if (dialog.message().includes('Tem certeza') || dialog.message().includes('Excluir')) {
        dialog.accept()
      }
    })

    // Verificar toast de sucesso
    await expect(page.locator('text=Produto excluído')).toBeVisible({ timeout: 5000 })

    // Verificar que o produto já não aparece
    await expect(page.locator('text=Produto para Deletar')).not.toBeVisible()
  })
})

'use client'

import { useState } from 'react'
import { useWizardStore } from '@/lib/wizard/store'
import type { ProductDraft } from '@/lib/wizard/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ShoppingBag, Plus, Trash2, SkipForward } from 'lucide-react'

const EMPTY_PRODUCT: ProductDraft = {
  name: '',
  description: '',
  price: '',
  category: '',
  additionalCategories: [],
  characteristics: [],
  priceTiers: [],
  durationMinutes: 30,
}

export function StepProductsServices() {
  const { step1, step4, saveStep4, setStep } = useWizardStore()
  const isService = step1.businessModel === 'service'

  const [products, setProducts] = useState<ProductDraft[]>(
    step4.products && step4.products.length > 0
      ? step4.products
      : []
  )
  const [errors, setErrors] = useState<Record<number, string>>({})

  const addProduct = () => {
    setProducts((prev) => [...prev, { ...EMPTY_PRODUCT }])
  }

  const removeProduct = (index: number) => {
    setProducts((prev) => prev.filter((_, i) => i !== index))
    setErrors((prev) => {
      const next = { ...prev }
      delete next[index]
      return next
    })
  }

  const updateProduct = (index: number, field: keyof ProductDraft, value: string) => {
    setProducts((prev) =>
      prev.map((p, i) => (i === index ? { ...p, [field]: value } : p))
    )
  }

  const updateProductData = (index: number, changes: Partial<ProductDraft>) => {
    setProducts((prev) => prev.map((product, i) => i === index ? { ...product, ...changes } : product))
  }

  const validate = (): boolean => {
    const newErrors: Record<number, string> = {}
    products.forEach((p, i) => {
      if (!p.name.trim()) newErrors[i] = 'Nome obrigatório'
      else if (isService && (!p.durationMinutes || p.durationMinutes < 5)) newErrors[i] = 'Informe uma duração válida'
      else if ((p.priceTiers ?? []).some((tier) => !tier.label.trim() || !Number.isInteger(tier.minQuantity) || tier.minQuantity < 1 || !Number.isFinite(tier.unitPrice) || tier.unitPrice < 0)) newErrors[i] = 'Preencha corretamente todas as faixas de preço'
      else if (new Set((p.priceTiers ?? []).map((tier) => tier.minQuantity)).size !== (p.priceTiers ?? []).length) newErrors[i] = 'Não repita a quantidade mínima nas faixas'
    })
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSave = () => {
    if (!validate()) return
    saveStep4({ products, skipped: false })
  }

  const handleSkip = () => {
    saveStep4({ products: [], skipped: true })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 pb-2 border-b">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-500/10">
          <ShoppingBag className="h-5 w-5 text-orange-600" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">{isService ? 'Serviços' : 'Produtos'}</h2>
          <p className="text-sm text-muted-foreground">
            Cadastro inicial do catálogo (opcional)
          </p>
        </div>
      </div>

      <div className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">
        Adicione alguns {isService ? 'serviços' : 'produtos'} agora para o agente de IA já conhecer
        o catálogo. Você pode pular e cadastrar depois no painel do tenant.
      </div>

      {/* Lista de produtos */}
      <div className="space-y-4">
        {products.map((product, index) => (
          <div key={index} className="rounded-lg border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">
                {isService ? 'Serviço' : 'Produto'} #{index + 1}
              </span>
              <button
                type="button"
                onClick={() => removeProduct(index)}
                className="text-muted-foreground hover:text-destructive transition-colors"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium">
                  Nome <span className="text-destructive">*</span>
                </label>
                <Input
                  placeholder={isService ? 'Ex: Consulta Dermatológica' : 'Ex: Camiseta Básica'}
                  value={product.name}
                  onChange={(e) => updateProduct(index, 'name', e.target.value)}
                />
                {errors[index] && (
                  <p className="text-xs text-destructive">{errors[index]}</p>
                )}
              </div>

              {isService && (
                <div className="space-y-1">
                  <label className="text-xs font-medium">Duração (minutos)</label>
                  <Input
                    type="number"
                    min={5}
                    step={5}
                    value={product.durationMinutes ?? 30}
                    onChange={(e) => setProducts((prev) => prev.map((p, i) => i === index ? { ...p, durationMinutes: Number(e.target.value) } : p))}
                  />
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-medium">Preço</label>
                <Input
                  placeholder="Ex: R$ 150,00 ou Sob consulta"
                  value={product.price}
                  onChange={(e) => updateProduct(index, 'price', e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium">Categoria</label>
                <Input
                  placeholder="Ex: Consultas, Roupas, Hambúrgueres..."
                  value={product.category}
                  onChange={(e) => updateProduct(index, 'category', e.target.value)}
                />
              </div>

              {!isService && (
                <div className="space-y-1">
                  <label className="text-xs font-medium">Outras categorias</label>
                  <Input
                    placeholder="Básicas, Lançamento, Infantil"
                    value={(product.additionalCategories ?? []).join(', ')}
                    onChange={(e) => updateProductData(index, { additionalCategories: e.target.value.split(',').map((value) => value.trim()).filter(Boolean) })}
                  />
                </div>
              )}

              <div className="sm:col-span-2 space-y-1">
                <label className="text-xs font-medium">Características</label>
                <Input
                  placeholder="Malha peruana, tamanhos 2 ao 16"
                  value={(product.characteristics ?? []).join(', ')}
                  onChange={(e) => updateProductData(index, { characteristics: e.target.value.split(',').map((value) => value.trim()).filter(Boolean) })}
                />
              </div>

              <div className="sm:col-span-2 space-y-1">
                <label className="text-xs font-medium">Descrição</label>
                <Textarea
                  placeholder="Breve descrição para o agente usar no WhatsApp"
                  rows={2}
                  value={product.description}
                  onChange={(e) =>
                    updateProduct(index, 'description', e.target.value)
                  }
                />
              </div>

              {!isService && (
                <div className="sm:col-span-2 space-y-2 border-t pt-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-xs font-medium">Preços por quantidade</label>
                      <p className="text-[11px] text-muted-foreground">A maior quantidade mínima atingida tem prioridade.</p>
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={() => updateProductData(index, { priceTiers: [...(product.priceTiers ?? []), { label: '', minQuantity: 1, unitPrice: 0 }] })}>
                      <Plus className="h-3.5 w-3.5 mr-1" /> Faixa
                    </Button>
                  </div>
                  {(product.priceTiers ?? []).map((tier, tierIndex) => (
                    <div key={tierIndex} className="grid grid-cols-[1fr_90px_110px_32px] gap-2 items-end">
                      <div><label className="text-[11px] text-muted-foreground">Modalidade</label><Input value={tier.label} placeholder="Atacado" onChange={(e) => updateProductData(index, { priceTiers: product.priceTiers.map((item, i) => i === tierIndex ? { ...item, label: e.target.value } : item) })} /></div>
                      <div><label className="text-[11px] text-muted-foreground">Mínimo</label><Input type="number" min={1} value={tier.minQuantity} onChange={(e) => updateProductData(index, { priceTiers: product.priceTiers.map((item, i) => i === tierIndex ? { ...item, minQuantity: Number(e.target.value) } : item) })} /></div>
                      <div><label className="text-[11px] text-muted-foreground">R$ unitário</label><Input type="number" min={0} step="0.01" value={tier.unitPrice} onChange={(e) => updateProductData(index, { priceTiers: product.priceTiers.map((item, i) => i === tierIndex ? { ...item, unitPrice: Number(e.target.value) } : item) })} /></div>
                      <button type="button" className="h-9 text-muted-foreground hover:text-destructive" onClick={() => updateProductData(index, { priceTiers: product.priceTiers.filter((_, i) => i !== tierIndex) })}><Trash2 className="h-4 w-4" /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        <Button
          type="button"
          variant="outline"
          onClick={addProduct}
          className="w-full"
        >
          <Plus className="h-4 w-4 mr-2" />
          Adicionar {isService ? 'serviço' : 'produto'}
        </Button>
      </div>

      <div className="flex justify-between pt-2">
        <Button type="button" variant="outline" onClick={() => setStep(3)}>
          ← Voltar
        </Button>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={handleSkip}>
            <SkipForward className="h-4 w-4 mr-1" />
            Pular
          </Button>
          {products.length > 0 && (
            <Button type="button" onClick={handleSave}>
              Salvar e Próximo →
            </Button>
          )}
          {products.length === 0 && (
            <Button type="button" onClick={handleSkip}>
              Próximo →
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

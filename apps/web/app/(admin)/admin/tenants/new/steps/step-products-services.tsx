'use client'

import { useState } from 'react'
import { useWizardStore } from '@/lib/wizard/store'
import type { ProductDraft, Step4Data } from '@/lib/wizard/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ShoppingBag, Plus, Trash2, SkipForward } from 'lucide-react'

const EMPTY_PRODUCT: ProductDraft = {
  name: '',
  description: '',
  price: '',
  category: '',
}

export function StepProductsServices() {
  const { step4, saveStep4, setStep } = useWizardStore()

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

  const validate = (): boolean => {
    const newErrors: Record<number, string> = {}
    products.forEach((p, i) => {
      if (!p.name.trim()) newErrors[i] = 'Nome obrigatório'
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
          <h2 className="text-lg font-semibold">Produtos e Serviços</h2>
          <p className="text-sm text-muted-foreground">
            Cadastro inicial do catálogo (opcional)
          </p>
        </div>
      </div>

      <div className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">
        Adicione alguns produtos ou serviços agora para o agente de IA já conhecer
        o catálogo. Você pode pular e cadastrar depois no painel do tenant.
      </div>

      {/* Lista de produtos */}
      <div className="space-y-4">
        {products.map((product, index) => (
          <div key={index} className="rounded-lg border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">
                Produto / Serviço #{index + 1}
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
                  placeholder="Ex: Consulta Dermatológica"
                  value={product.name}
                  onChange={(e) => updateProduct(index, 'name', e.target.value)}
                />
                {errors[index] && (
                  <p className="text-xs text-destructive">{errors[index]}</p>
                )}
              </div>

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
          Adicionar produto / serviço
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

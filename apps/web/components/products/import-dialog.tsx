'use client'

import { useState } from 'react'
import { FileSpreadsheet, Loader2, Sparkles, Trash2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  IMPORT_FIELDS,
  autoMapColumns,
  readSheetFile,
  rowsToItems,
  type ColumnMapping,
  type ImportFieldKey,
  type ImportItem,
  type SheetRows,
} from '@/lib/import/parse-sheet'
import { classifyImportItems, importProducts } from '@/lib/data/product-import'

const MAX_PRODUCTS = 1000
const CLASSIFY_CHUNK = 400
const IMPORT_CHUNK = 300

type Step = 'upload' | 'map' | 'review'

interface ImportDialogProps {
  open: boolean
  priceTypes: boolean
  onClose: () => void
  onImported: () => void
}

const fmtMoney = (n: number | null) =>
  n === null ? '—' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n)

export function ImportDialog({ open, priceTypes, onClose, onImported }: ImportDialogProps) {
  const [step, setStep] = useState<Step>('upload')
  const [busy, setBusy] = useState<string | null>(null)
  const [fileName, setFileName] = useState('')
  const [rows, setRows] = useState<SheetRows>([])
  const [mapping, setMapping] = useState<ColumnMapping | null>(null)
  const [items, setItems] = useState<ImportItem[]>([])
  const [warning, setWarning] = useState<string | null>(null)

  const fields = IMPORT_FIELDS.filter((f) => priceTypes || (f.key !== 'priceWholesale' && f.key !== 'priceReseller'))
  const headers = rows[0] ?? []

  const reset = () => {
    setStep('upload'); setBusy(null); setFileName(''); setRows([]); setMapping(null); setItems([]); setWarning(null)
  }
  const close = () => { reset(); onClose() }

  const onFile = async (file: File | undefined) => {
    if (!file) return
    setBusy('Lendo planilha…')
    try {
      const parsed = await readSheetFile(file)
      if (parsed.length - 1 > MAX_PRODUCTS) throw new Error(`Máximo de ${MAX_PRODUCTS} produtos por importação. Divida a planilha.`)
      setRows(parsed)
      setFileName(file.name)
      setMapping(autoMapColumns(parsed[0], { priceTypes }))
      setStep('map')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não consegui ler o arquivo.')
    } finally {
      setBusy(null)
    }
  }

  const setSingle = (key: ImportFieldKey, value: string) =>
    setMapping((m) => (m ? { ...m, [key]: value === '' ? [] : [Number(value)] } : m))

  const toggleCharacteristic = (idx: number) =>
    setMapping((m) => {
      if (!m) return m
      const has = m.characteristics.includes(idx)
      return { ...m, characteristics: has ? m.characteristics.filter((i) => i !== idx) : [...m.characteristics, idx] }
    })

  const goReview = async () => {
    if (!mapping) return
    if (mapping.name.length === 0) { toast.error('Escolha qual coluna é o nome do produto.'); return }
    const parsed = rowsToItems(rows, mapping)
    if (parsed.length === 0) { toast.error('Nenhum produto com nome encontrado.'); return }
    setBusy('Classificando categorias com IA…')
    setWarning(null)
    try {
      const next = [...parsed]
      for (let start = 0; start < parsed.length; start += CLASSIFY_CHUNK) {
        const chunk = parsed.slice(start, start + CLASSIFY_CHUNK)
        const res = await classifyImportItems(chunk.map((c) => ({
          name: c.name, description: c.description, category: c.category, characteristics: c.characteristics,
        })))
        if (res.warning) setWarning(res.warning)
        chunk.forEach((c, i) => {
          next[start + i] = { ...c, category: res.categories[i] ?? c.category, characteristics: res.characteristics[i] ?? c.characteristics }
        })
      }
      setItems(next)
      setStep('review')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao classificar.')
    } finally {
      setBusy(null)
    }
  }

  const updateItem = (idx: number, patch: Partial<ImportItem>) =>
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)))

  const doImport = async () => {
    setBusy('Importando produtos…')
    try {
      let created = 0
      let skipped = 0
      for (let start = 0; start < items.length; start += IMPORT_CHUNK) {
        const res = await importProducts(items.slice(start, start + IMPORT_CHUNK))
        created += res.created
        skipped += res.skippedDuplicates
      }
      toast.success(`${created} produto(s) importado(s)${skipped ? ` · ${skipped} já existiam e foram ignorados` : ''}.`)
      onImported()
      close()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao importar.')
      setBusy(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !busy) close() }}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" /> Importar produtos por planilha
          </DialogTitle>
          <DialogDescription>
            Envie um .csv ou .xlsx. Só o nome é obrigatório; a IA completa categoria e características que faltarem.
          </DialogDescription>
        </DialogHeader>

        {step === 'upload' && (
          <label className="flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-10 cursor-pointer hover:bg-muted/40">
            {busy ? <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /> : <Upload className="h-8 w-8 text-muted-foreground" />}
            <span className="text-sm font-medium">{busy ?? 'Clique para escolher o arquivo'}</span>
            <span className="text-xs text-muted-foreground">Primeira linha = cabeçalho. Até {MAX_PRODUCTS} produtos.</span>
            <input type="file" accept=".csv,.xlsx,.txt" className="hidden" disabled={!!busy} onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = '' }} />
          </label>
        )}

        {step === 'map' && mapping && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              <b>{fileName}</b> · {rows.length - 1} linhas. Confira qual coluna é cada campo:
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {fields.filter((f) => f.key !== 'characteristics').map((f) => (
                <div key={f.key}>
                  <label className="block text-sm font-medium mb-1">{f.label}{f.required && ' *'}</label>
                  <select
                    className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                    value={mapping[f.key][0] ?? ''}
                    onChange={(e) => setSingle(f.key, e.target.value)}
                  >
                    <option value="">— não tem —</option>
                    {headers.map((h, i) => <option key={i} value={i}>{h || `Coluna ${i + 1}`}</option>)}
                  </select>
                </div>
              ))}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Colunas de características (cor, tamanho, material…)</label>
              <div className="flex flex-wrap gap-2">
                {headers.map((h, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => toggleCharacteristic(i)}
                    className={`rounded-full border px-3 py-1 text-xs ${mapping.characteristics.includes(i) ? 'bg-primary text-primary-foreground' : 'bg-background'}`}
                  >
                    {h || `Coluna ${i + 1}`}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={reset} disabled={!!busy}>Trocar arquivo</Button>
              <Button onClick={goReview} disabled={!!busy} className="gap-2">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {busy ?? 'Continuar'}
              </Button>
            </div>
          </div>
        )}

        {step === 'review' && (
          <div className="space-y-3">
            {warning && <p className="rounded-md bg-amber-500/10 p-2 text-xs text-amber-700">{warning}</p>}
            <p className="text-sm text-muted-foreground">
              {items.length} produto(s). Ajuste a categoria se precisar e remova o que não quiser. Nomes que já existem no catálogo são ignorados.
            </p>
            <div className="max-h-[50vh] overflow-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted text-left text-xs">
                  <tr>
                    <th className="p-2">Produto</th>
                    <th className="p-2">{priceTypes ? 'Varejo' : 'Preço'}</th>
                    {priceTypes && <th className="p-2">Atacado</th>}
                    {priceTypes && <th className="p-2">Revenda</th>}
                    <th className="p-2 w-44">Categoria</th>
                    <th className="p-2">Características</th>
                    <th className="p-2" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, idx) => (
                    <tr key={idx} className="border-t align-top">
                      <td className="p-2 max-w-[220px] truncate" title={it.name}>{it.name}</td>
                      <td className="p-2 whitespace-nowrap">{fmtMoney(it.price)}</td>
                      {priceTypes && <td className="p-2 whitespace-nowrap">{fmtMoney(it.priceWholesale)}</td>}
                      {priceTypes && <td className="p-2 whitespace-nowrap">{fmtMoney(it.priceReseller)}</td>}
                      <td className="p-2">
                        <Input
                          value={it.category ?? ''}
                          onChange={(e) => updateItem(idx, { category: e.target.value || null })}
                          placeholder="Sem categoria"
                          className="h-8"
                        />
                      </td>
                      <td className="p-2 text-xs text-muted-foreground max-w-[220px]">{it.characteristics.join(' · ') || '—'}</td>
                      <td className="p-2">
                        <button type="button" onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))} aria-label="Remover">
                          <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={() => setStep('map')} disabled={!!busy}>Voltar</Button>
              <Button onClick={doImport} disabled={!!busy || items.length === 0} className="gap-2">
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {busy ?? `Importar ${items.length} produto(s)`}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

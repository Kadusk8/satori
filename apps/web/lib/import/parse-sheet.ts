// Leitura de planilha (CSV / XLSX) no navegador + mapeamento automático de colunas.
// Roda só no client: o arquivo nunca sobe inteiro pro servidor, só as linhas
// já mapeadas (ver lib/data/product-import.ts).

export type Cell = string | number | boolean | Date | null | undefined
export type SheetRows = string[][]

export const IMPORT_FIELDS = [
  { key: 'name', label: 'Nome', required: true, aliases: ['nome', 'produto', 'titulo', 'título', 'item', 'descricao curta', 'name'] },
  { key: 'price', label: 'Preço (varejo)', required: false, aliases: ['preco', 'preço', 'valor', 'varejo', 'preco varejo', 'preço varejo', 'preco venda', 'preço venda', 'price'] },
  { key: 'priceWholesale', label: 'Preço atacado', required: false, aliases: ['atacado', 'preco atacado', 'preço atacado'] },
  { key: 'priceReseller', label: 'Preço revenda', required: false, aliases: ['revenda', 'preco revenda', 'preço revenda', 'revendedor'] },
  { key: 'category', label: 'Categoria', required: false, aliases: ['categoria', 'tipo', 'grupo', 'departamento', 'linha', 'category'] },
  { key: 'description', label: 'Descrição', required: false, aliases: ['descricao', 'descrição', 'detalhes', 'description', 'obs', 'observacao', 'observação'] },
  { key: 'characteristics', label: 'Características (cor, tamanho…)', required: false, aliases: ['caracteristicas', 'características', 'cor', 'cores', 'tamanho', 'material', 'modelo', 'voltagem', 'marca'] },
  { key: 'imageUrl', label: 'Link da imagem', required: false, aliases: ['imagem', 'foto', 'link imagem', 'url imagem', 'link da imagem', 'image', 'url'] },
] as const

export type ImportFieldKey = (typeof IMPORT_FIELDS)[number]['key']
export type ColumnMapping = Record<ImportFieldKey, number[]>

function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

function cellToString(c: Cell): string {
  if (c === null || c === undefined) return ''
  if (c instanceof Date) return c.toISOString().slice(0, 10)
  return String(c).trim()
}

// Parser CSV simples com aspas, separador , ou ; (detectado pela 1ª linha).
export function parseCsv(text: string): SheetRows {
  const clean = text.replace(/^﻿/, '')
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? ''
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ','
  const rows: string[][] = []
  let row: string[] = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i]
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') { cur += '"'; i++ }
      else if (ch === '"') quoted = false
      else cur += ch
    } else if (ch === '"') quoted = true
    else if (ch === sep) { row.push(cur.trim()); cur = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && clean[i + 1] === '\n') i++
      row.push(cur.trim()); cur = ''
      if (row.some(Boolean)) rows.push(row)
      row = []
    } else cur += ch
  }
  row.push(cur.trim())
  if (row.some(Boolean)) rows.push(row)
  return rows
}

// CSV exportado do Excel brasileiro costuma vir em Windows-1252: tenta UTF-8 e cai pro latin1.
function decodeCsv(buffer: ArrayBuffer): string {
  const utf8 = new TextDecoder('utf-8').decode(buffer)
  return utf8.includes('�') ? new TextDecoder('windows-1252').decode(buffer) : utf8
}

export async function readSheetFile(file: File): Promise<SheetRows> {
  const isXlsx = /\.xlsx$/i.test(file.name)
  if (!isXlsx && !/\.(csv|txt)$/i.test(file.name)) {
    throw new Error('Formato não suportado. Envie um arquivo .csv ou .xlsx.')
  }
  let rows: SheetRows
  if (isXlsx) {
    const { readSheet } = await import('read-excel-file/browser')
    const raw = (await readSheet(file)) as Cell[][]
    rows = raw.map((r) => r.map(cellToString))
  } else {
    rows = parseCsv(decodeCsv(await file.arrayBuffer()))
  }
  rows = rows.filter((r) => r.some((c) => c !== ''))
  if (rows.length < 2) throw new Error('A planilha precisa ter o cabeçalho e pelo menos uma linha de produto.')
  return rows
}

// Descobre sozinho qual coluna é qual pelo nome do cabeçalho.
export function autoMapColumns(headers: string[], allowTypes: { priceTypes: boolean }): ColumnMapping {
  const mapping = Object.fromEntries(IMPORT_FIELDS.map((f) => [f.key, [] as number[]])) as ColumnMapping
  const used = new Set<number>()
  const normalized = headers.map(norm)
  for (const field of IMPORT_FIELDS) {
    if (!allowTypes.priceTypes && (field.key === 'priceWholesale' || field.key === 'priceReseller')) continue
    // cabeçalho igual ao apelido, ou começando com ele ("Preço de venda" → preço)
    for (const alias of field.aliases) {
      const a = norm(alias)
      normalized.forEach((h, i) => {
        if (used.has(i)) return
        const hit = h === a || (field.key !== 'characteristics' && h.startsWith(a + ' '))
        if (hit && (field.key === 'characteristics' || mapping[field.key].length === 0)) {
          mapping[field.key].push(i)
          used.add(i)
        }
      })
    }
  }
  return mapping
}

// "57.900,00" → 57900 | "99,90" → 99.9 | "R$ 12" → 12 | inválido → null
export function parseBRL(raw: string): number | null {
  const cleaned = raw.replace(/[^\d.,]/g, '')
  if (!cleaned) return null
  const lastComma = cleaned.lastIndexOf(',')
  const lastDot = cleaned.lastIndexOf('.')
  const sepIdx = Math.max(lastComma, lastDot)
  let normalized: string
  if (sepIdx === -1) normalized = cleaned
  else {
    const decimals = cleaned.length - sepIdx - 1
    normalized = decimals >= 1 && decimals <= 2
      ? cleaned.slice(0, sepIdx).replace(/[.,]/g, '') + '.' + cleaned.slice(sepIdx + 1)
      : cleaned.replace(/[.,]/g, '')
  }
  const n = Number(normalized)
  return Number.isFinite(n) && n >= 0 ? n : null
}

export interface ImportItem {
  name: string
  description: string | null
  price: number | null
  priceWholesale: number | null
  priceReseller: number | null
  category: string | null
  characteristics: string[]
  imageUrl: string | null
}

export function rowsToItems(rows: SheetRows, mapping: ColumnMapping): ImportItem[] {
  const headers = rows[0]
  const get = (row: string[], key: ImportFieldKey) => (mapping[key][0] !== undefined ? row[mapping[key][0]] ?? '' : '')
  const items: ImportItem[] = []
  for (const row of rows.slice(1)) {
    const name = get(row, 'name').trim()
    if (!name) continue
    const characteristics = mapping.characteristics.flatMap((idx) => {
      const value = (row[idx] ?? '').trim()
      if (!value) return []
      const header = headers[idx]?.trim() ?? ''
      // coluna "Cor" com valor "Azul" vira "Cor: Azul"; coluna genérica "Características" vai crua
      return norm(header) === 'caracteristicas' ? value.split(/[;|]/).map((v) => v.trim()).filter(Boolean) : [`${header}: ${value}`]
    })
    const image = get(row, 'imageUrl').trim()
    items.push({
      name: name.slice(0, 200),
      description: get(row, 'description').trim() || null,
      price: parseBRL(get(row, 'price')),
      priceWholesale: parseBRL(get(row, 'priceWholesale')),
      priceReseller: parseBRL(get(row, 'priceReseller')),
      category: get(row, 'category').trim() || null,
      characteristics,
      imageUrl: /^https:\/\//i.test(image) ? image : null,
    })
  }
  return items
}

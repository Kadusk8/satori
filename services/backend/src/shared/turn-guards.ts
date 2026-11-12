// Guardas determinísticas do turno da IA (sem dependências, testáveis sem banco).

/**
 * O fluxo envia UMA foto por resposta, mas a IA às vezes chama send_product_image várias vezes
 * (reenvia o produto anterior, ou foto de itens que só apareceram na busca e o cliente não pediu).
 * Regra: a primeira chamada vale; uma chamada seguinte só substitui se for o produto TOP da busca
 * mais recente do turno (o que o cliente está pedindo agora).
 */
export function shouldReplaceDeferredImage(
  hasDeferredImage: boolean,
  productId: string,
  latestSearchTopProductId: string | null
): boolean {
  if (!hasDeferredImage) return true
  return latestSearchTopProductId !== null && latestSearchTopProductId === productId
}

/**
 * Remove marcadores de imagem escritos como texto — "[imagem da camiseta]", "[Ver imagem da X]",
 * "[foto]" — que o LLM às vezes escreve no lugar de chamar a ferramenta e que chegam quebrados
 * no WhatsApp. Não mexe em colchetes comuns que não falem de imagem/foto.
 */
export function stripImagePlaceholders(text: string): string {
  return text
    .replace(/\[\s*(?:ver\s+)?(?:a\s+)?(?:imagem|imagens|foto|fotos)\b[^\]]*\]/gi, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

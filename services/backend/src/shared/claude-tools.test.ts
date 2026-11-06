import { describe, expect, it } from 'vitest'
import { isToolAllowedForBusinessModel } from './claude-tools.js'

const enabled = { canSearchCatalog: true, canSendImages: true }

describe('isToolAllowedForBusinessModel', () => {
  it('isola as tools de catálogo e imagem no modo de produtos', () => {
    expect(isToolAllowedForBusinessModel('search_products', 'product', enabled)).toBe(true)
    expect(isToolAllowedForBusinessModel('search_services', 'product', enabled)).toBe(false)
    expect(isToolAllowedForBusinessModel('send_product_image', 'product', enabled)).toBe(true)
  })

  it('isola serviços e bloqueia imagens de produto no modo de serviços', () => {
    expect(isToolAllowedForBusinessModel('search_services', 'service', enabled)).toBe(true)
    expect(isToolAllowedForBusinessModel('search_products', 'service', enabled)).toBe(false)
    expect(isToolAllowedForBusinessModel('send_product_image', 'service', enabled)).toBe(false)
    expect(isToolAllowedForBusinessModel('book_appointment', 'service', enabled)).toBe(true)
  })
})

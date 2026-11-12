import { describe, expect, it, vi } from 'vitest'
import { sendWithLidRetry, isNotRegisteredError } from './lid-retry.js'

const NOT_REGISTERED = new Error('Evolution Go send/text: {"error":"number +551112345678@s.whatsapp.net is not registered on WhatsApp"}')

describe('sendWithLidRetry', () => {
  it('envio que funciona de primeira não consulta o LID nem reenvia', async () => {
    const send = vi.fn().mockResolvedValue('id-1')
    const lookup = vi.fn()
    expect(await sendWithLidRetry('5511912345678', send, lookup)).toBe('id-1')
    expect(send).toHaveBeenCalledTimes(1)
    expect(lookup).not.toHaveBeenCalled()
  })

  it('"not registered" com LID gravado: reenvia pelo LID e devolve o resultado', async () => {
    const send = vi.fn().mockRejectedValueOnce(NOT_REGISTERED).mockResolvedValueOnce('id-2')
    const onRetry = vi.fn()
    const out = await sendWithLidRetry('5511912345678', send, async () => '11111111111111@lid', onRetry)
    expect(out).toBe('id-2')
    expect(send).toHaveBeenNthCalledWith(1, '5511912345678')
    expect(send).toHaveBeenNthCalledWith(2, '11111111111111@lid')
    expect(onRetry).toHaveBeenCalledWith('5511912345678', '11111111111111@lid')
  })

  it('"not registered" sem LID: sobe o erro original', async () => {
    const send = vi.fn().mockRejectedValue(NOT_REGISTERED)
    await expect(sendWithLidRetry('5511912345678', send, async () => null)).rejects.toBe(NOT_REGISTERED)
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('outro tipo de erro não dispara reenvio nem consulta ao LID', async () => {
    const boom = new Error('Evolution Go send/text: timeout')
    const send = vi.fn().mockRejectedValue(boom)
    const lookup = vi.fn()
    await expect(sendWithLidRetry('5511912345678', send, lookup)).rejects.toBe(boom)
    expect(lookup).not.toHaveBeenCalled()
  })

  it('número que já é JID (grupo/LID) não é reenviado', async () => {
    const send = vi.fn().mockRejectedValue(NOT_REGISTERED)
    const lookup = vi.fn()
    await expect(sendWithLidRetry('11111111111111@lid', send, lookup)).rejects.toBe(NOT_REGISTERED)
    expect(lookup).not.toHaveBeenCalled()
  })

  it('se o reenvio pelo LID também falhar, esse erro sobe (sem loop)', async () => {
    const second = new Error('Evolution Go send/text: instance disconnected')
    const send = vi.fn().mockRejectedValueOnce(NOT_REGISTERED).mockRejectedValueOnce(second)
    await expect(sendWithLidRetry('5511912345678', send, async () => 'x@lid')).rejects.toBe(second)
    expect(send).toHaveBeenCalledTimes(2)
  })
})

describe('isNotRegisteredError', () => {
  it('reconhece a mensagem do Evolution e ignora o resto', () => {
    expect(isNotRegisteredError(NOT_REGISTERED)).toBe(true)
    expect(isNotRegisteredError(new Error('other'))).toBe(false)
    expect(isNotRegisteredError('number x is NOT REGISTERED ON WHATSAPP')).toBe(true)
  })
})

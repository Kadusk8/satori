// Definição das 7 tools de function calling para o agente SDR

export interface Tool {
  name: string
  description: string
  input_schema: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
  }
}

export const AI_TOOLS: Tool[] = [
  {
    name: 'search_products',
    description:
      'Busca produtos no catálogo do estabelecimento. Use quando o cliente perguntar sobre produtos, preços, disponibilidade ou pedir recomendações.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Termo de busca (nome, categoria ou descrição). Se omitido, lista todos os produtos disponíveis.',
        },
        category: {
          type: 'string',
          description: 'Filtrar por categoria específica',
        },
        max_results: {
          type: 'number',
          description: 'Máximo de resultados (padrão: 8)',
        },
        price_max: {
          type: 'number',
          description: 'Preço máximo',
        },
      },
      required: [],
    },
  },
  {
    name: 'check_availability',
    description:
      'Consulta horários disponíveis para agendamento. Use quando o cliente quiser marcar, agendar ou saber horários livres.',
    input_schema: {
      type: 'object',
      properties: {
        date: {
          type: 'string',
          description: 'Data no formato YYYY-MM-DD. Se não informada, usa os próximos 7 dias.',
        },
        period: {
          type: 'string',
          enum: ['morning', 'afternoon', 'evening'],
          description: 'Período do dia preferido',
        },
      },
    },
  },
  {
    name: 'book_appointment',
    description:
      'Cria um agendamento confirmado. Use SOMENTE após o cliente confirmar data e horário.',
    input_schema: {
      type: 'object',
      properties: {
        date: {
          type: 'string',
          description: 'Data YYYY-MM-DD',
        },
        start_time: {
          type: 'string',
          description: 'Horário HH:MM',
        },
        contact_name: {
          type: 'string',
          description: 'Nome do cliente',
        },
        notes: {
          type: 'string',
          description: 'Observações do agendamento',
        },
      },
      required: ['date', 'start_time'],
    },
  },
  {
    name: 'cancel_appointment',
    description:
      'Cancela um agendamento existente. Confirme com o cliente antes de cancelar.',
    input_schema: {
      type: 'object',
      properties: {
        appointment_id: {
          type: 'string',
          description: 'ID do agendamento',
        },
        reason: {
          type: 'string',
          description: 'Motivo do cancelamento',
        },
      },
      required: ['appointment_id'],
    },
  },
  {
    name: 'escalate_to_human',
    description:
      'Transfere o atendimento para um operador humano. Use quando: não souber responder, o cliente pedir, assunto sensível, ou reclamação complexa.',
    input_schema: {
      type: 'object',
      properties: {
        reason: {
          type: 'string',
          description: 'Motivo da escalação',
        },
        summary: {
          type: 'string',
          description: 'Resumo do que foi tratado até agora',
        },
        priority: {
          type: 'string',
          enum: ['normal', 'high', 'urgent'],
          description: 'Prioridade',
        },
      },
      required: ['reason', 'summary'],
    },
  },
  {
    name: 'send_product_image',
    description:
      'Envia a imagem de um produto específico para o cliente. Use após recomendar um produto que tem imagem.',
    input_schema: {
      type: 'object',
      properties: {
        product_id: {
          type: 'string',
          description: 'ID do produto',
        },
      },
      required: ['product_id'],
    },
  },
  {
    name: 'get_business_info',
    description:
      'Retorna informações do estabelecimento como horário de funcionamento, endereço, contato. Use quando o cliente perguntar sobre o negócio.',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'schedule_follow_up',
    description:
      'Agenda um follow-up automático para entrar em contato com o cliente depois de um período sem resposta. Use quando o cliente demonstra interesse mas não finaliza a conversa, ou quando combinar de retornar depois.',
    input_schema: {
      type: 'object',
      properties: {
        delay_hours: {
          type: 'number',
          description: 'Horas para aguardar antes de enviar o follow-up (padrão: 24)',
        },
        context: {
          type: 'string',
          description: 'Resumo do contexto da conversa para personalizar a mensagem de follow-up (ex: "Cliente interessado na Camiseta Básica, perguntou sobre tamanhos")',
        },
      },
      required: ['context'],
    },
  },
]

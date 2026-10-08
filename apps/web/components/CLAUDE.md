## Kanban Board

```
Estrutura:
- KanbanBoard: container principal, carrega stages e conversations
- KanbanColumn: uma coluna (stage), recebe drop
- KanbanCard: um card (conversation), draggable
- Usar @dnd-kit/core para drag & drop
- Subscribe ao Pusher para atualizações em tempo real (canal por tenant — ver
  lib/realtime/channels.ts)
```

## Chat ao vivo

```
Estrutura:
- ChatView: layout com sidebar + área de mensagens
- ChatSidebar: lista de conversas ativas (filtráveis por status)
- ChatMessages: scroll de mensagens com auto-scroll
- ChatInput: textarea + botões (enviar, template, anexo)
- MessageBubble: bolha com estilo diferente por sender_type
- Realtime subscription por conversation_id (Pusher)
- Quando operador envia msg:
  1. Salvar na tabela messages (sender_type: 'human')
  2. Enviar via POST /send-whatsapp (services/backend)
  3. Realtime atualiza a UI automaticamente
```

## Catálogo de produtos

```
Estrutura:
- ProductList: grid de produtos com filtro e busca
- ProductCard: card com imagem, nome, preço, status
- ProductForm: formulário de criação/edição
- ImageUploader: drag & drop com preview, upload para Cloudinary
  - Aceitar: jpg, png, webp (máx 5MB)
  - Gerar thumbnail automaticamente
  - Permitir reordenar imagens (posição)
```

## Agenda

```
Estrutura:
- AppointmentCalendar: visão semanal/mensal
- TimeSlotPicker: seletor de horários disponíveis
- AppointmentCard: card com info do agendamento
- AppointmentForm: criação manual
- Usar date-fns com timezone do tenant
- Cores por status: confirmed=verde, pending=amarelo, cancelled=vermelho
```

# Especificação da Funcionalidade: Reconhecimento de Anúncios pela IA (Click-to-WhatsApp)

## 1. Visão Geral e Viabilidade
**Viabilidade:** A funcionalidade é **totalmente viável** e representa um excelente caso de uso para melhorar as taxas de conversão de leads vindos de tráfego pago (Facebook/Instagram Ads).

**Como funciona:** Quando o usuário clica em um anúncio que direciona para o WhatsApp (Click-to-WhatsApp), o WhatsApp Business API envia metadados adicionais ou envia uma mensagem pré-configurada (ex: *"Quero saber mais sobre o carro X"*). A ideia é fazer a ponte entre os produtos marcados no banco de dados como "em anúncio" e o contexto passado para a Inteligência Artificial, permitindo um atendimento personalizado e imediato.

---

## 2. Estrutura de Banco de Dados
Para que o sistema saiba quais carros estão sendo anunciados, é necessário alterar a tabela de Produtos/Veículos.

**Ação:** Adicionar um novo campo no banco de dados.
- **Campo:** `is_running_ad` (ou `em_anuncio`)
- **Tipo:** `Boolean` (Verdadeiro/Falso)
- **Padrão:** `false`

*Nota para o Frontend/Admin:* Criar um botão (toggle) no painel de administração de produtos para que a equipe de marketing possa ligar e desligar essa flag facilmente quando ativarem ou pausarem uma campanha no Facebook Ads.

---

## 3. Recepção do Webhook (WhatsApp API)
Quando a mensagem chega no webhook, precisamos identificar que ela se trata de um anúncio. Existem duas formas principais de identificar isso:

1. **Através do payload de Referral (Recomendado):** O WhatsApp Business API envia um objeto `referral` no webhook quando o cliente vem de um anúncio (CTWA). Ele contém o `headline`, `body` e o link do anúncio.
2. **Através do texto da mensagem:** Se o cliente envia a mensagem padrão configurada no Gerenciador de Anúncios (ex: *"Olá, vi este anúncio no Facebook e quero saber mais sobre o carro..."*).

**Lógica de Back-end (Controlador do Webhook):**
```javascript
// Exemplo pseudocódigo
let adContext = null;

if (message.referral || message.text.includes("Quero saber mais sobre")) {
    // 1. O usuário veio de um anúncio!
    
    // 2. Buscar no banco de dados quais carros estão rodando anúncio hoje
    const carrosEmAnuncio = await db.produtos.find({ is_running_ad: true });
    
    // 3. Montar o contexto para a IA
    adContext = carrosEmAnuncio;
}
```

---

## 4. Integração do Contexto para a IA (System Prompt)
A "mágica" acontece quando injetamos essa informação no cérebro da IA (no *System Prompt* ou contexto da sessão).

Antes de enviar a mensagem do usuário para a OpenAI (ou outra LLM), o backend deve modificar as instruções do sistema, adicionando o contexto dos anúncios.

**Exemplo de instrução a ser concatenada no System Prompt da IA:**
> *"ATENÇÃO: Este cliente acabou de clicar em um anúncio de tráfego pago e iniciou a conversa. A mensagem inicial dele foi gerada automaticamente pelo anúncio. Atualmente, os seguintes veículos estão com campanhas de anúncios ativas: [Carro A - R$ 50.000], [Carro B - R$ 80.000]. O seu objetivo é assumir que o interesse inicial dele é voltado para os carros anunciados, apresentar as vantagens desses veículos, confirmar qual deles chamou a atenção e tentar agendar uma visita física."*

### Exemplo de Fluxo (Como a IA vai se comportar)
- **Lead (Mensagem do Webhook):** "Quero saber mais sobre os carros do anúncio."
- **Contexto Oculto enviado para IA:** *(Flag de anúncio ativa. Carros atuais: Honda Civic 2020 e Toyota Corolla 2021).*
- **Resposta da IA:** "Olá! Que ótimo que você viu nosso anúncio. Hoje estamos com condições imperdíveis para o Honda Civic 2020 e o Toyota Corolla 2021. Qual desses modelos mais te interessou no vídeo que você assistiu? Quer que eu te mande mais fotos?"

---

## 5. Resumo das Tarefas para Implementação (Task List)

- [ ] **Banco de Dados:** Adicionar a coluna `is_running_ad` (boolean) na tabela de produtos/veículos.
- [ ] **Painel Admin:** Adicionar o botão liga/desliga para os anúncios no formulário de edição do produto.
- [ ] **Webhook do WhatsApp:** Implementar verificação para checar se a mensagem recebida possui a chave `referral` (típica de anúncios) ou faz match (Regex) com o texto padrão configurado na campanha de Ads.
- [ ] **Serviço da IA:** Criar um método que busca os produtos com `is_running_ad: true` no banco sempre que um novo chat vindo de anúncio for iniciado.
- [ ] **Engenharia de Prompt:** Atualizar a construção do *System Prompt* da IA para injetar a lista de carros em anúncio e ditar a postura que ela deve tomar frente a esse lead específico.

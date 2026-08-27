import Link from 'next/link'

export const metadata = {
  title: 'Termos de Uso — SATORI',
}

export default function TermosPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between px-6 py-6 sm:px-10">
        <Link href="/" className="inline-flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[#22d3ee]">
            <span className="text-[10px] font-black tracking-wider text-black">S</span>
          </span>
          <span className="text-sm font-black tracking-[0.2em]">SATORI</span>
        </Link>
        <Link href="/" className="text-[13px] font-medium text-muted-foreground hover:text-foreground">
          Voltar
        </Link>
      </header>

      <main className="mx-auto w-full max-w-3xl px-6 pb-24 sm:px-10">
        <h1 className="text-3xl font-medium tracking-tight sm:text-4xl">Termos de Uso</h1>
        <p className="mt-2 text-sm text-muted-foreground">Última atualização: agosto de 2026</p>

        <div className="mt-10 rounded-xl border border-white/10 bg-white/[0.03] px-5 py-4 text-sm text-muted-foreground">
          Este documento ainda não passou por revisão jurídica formal — trate como um rascunho de
          boa-fé até validação com um advogado antes de qualquer uso comercial mais amplo. Condições
          comerciais (preço, forma de pagamento, cancelamento) são as combinadas diretamente com
          cada cliente no momento da contratação.
        </div>

        <div className="mt-10 space-y-8 text-sm leading-relaxed text-foreground/90">
          <section>
            <h2 className="text-lg font-medium">1. Aceitação</h2>
            <p className="mt-2 text-muted-foreground">
              Ao contratar ou usar o Satori, você concorda com estes termos. Se você usa a
              plataforma em nome de uma empresa, está declarando ter autoridade para vinculá-la a
              este acordo.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium">2. O que é o serviço</h2>
            <p className="mt-2 text-muted-foreground">
              O Satori é uma plataforma que conecta a instância de WhatsApp da sua empresa a um
              agente de inteligência artificial configurável, permitindo atendimento automatizado a
              clientes finais, gestão de catálogo, agenda e kanban de atendimento.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium">3. Conta e acesso</h2>
            <p className="mt-2 text-muted-foreground">
              Você é responsável por manter suas credenciais de acesso em sigilo e por toda
              atividade realizada na sua conta. Contas de operadores criadas por você são de sua
              responsabilidade.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium">4. Uso aceitável</h2>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-muted-foreground">
              <li>Não utilizar a plataforma para envio de mensagens em massa não solicitadas (spam).</li>
              <li>Não utilizar o serviço para fins ilegais ou que violem direitos de terceiros.</li>
              <li>
                Manter as informações do catálogo e das políticas configuradas para a IA
                verdadeiras — o Satori responde com base no que você cadastra.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-medium">5. Instância de WhatsApp</h2>
            <p className="mt-2 text-muted-foreground">
              Cada empresa conecta sua própria instância de WhatsApp (via Evolution API). O Satori
              não é responsável por bloqueios, instabilidades ou políticas aplicadas pelo próprio
              WhatsApp à sua instância.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium">6. Limitação de responsabilidade</h2>
            <p className="mt-2 text-muted-foreground">
              O Satori é fornecido &quot;como está&quot;. Fazemos o possível para manter o serviço
              disponível e a IA precisa, mas não garantimos ausência total de erros nas respostas
              geradas automaticamente — recomendamos revisão humana em decisões críticas
              (financiamento, valores altos, questões jurídicas).
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium">7. Cancelamento</h2>
            <p className="mt-2 text-muted-foreground">
              As condições de cancelamento são as combinadas na contratação. Fale com a gente pelo
              suporte para tratar do seu caso específico.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium">8. Alterações</h2>
            <p className="mt-2 text-muted-foreground">
              Podemos atualizar estes termos periodicamente. Mudanças relevantes serão comunicadas
              aos clientes ativos.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium">9. Contato</h2>
            <p className="mt-2 text-muted-foreground">
              Dúvidas sobre estes termos podem ser enviadas pelo WhatsApp de suporte, disponível no
              rodapé da{' '}
              <Link href="/" className="text-[#22d3ee] hover:underline">
                página inicial
              </Link>
              .
            </p>
          </section>
        </div>
      </main>
    </div>
  )
}

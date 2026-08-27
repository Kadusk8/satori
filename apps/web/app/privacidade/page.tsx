import Link from 'next/link'

export const metadata = {
  title: 'Política de Privacidade — SATORI',
}

export default function PrivacidadePage() {
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
        <h1 className="text-3xl font-medium tracking-tight sm:text-4xl">Política de Privacidade</h1>
        <p className="mt-2 text-sm text-muted-foreground">Última atualização: agosto de 2026</p>

        <div className="mt-10 rounded-xl border border-white/10 bg-white/[0.03] px-5 py-4 text-sm text-muted-foreground">
          Este documento descreve, de forma honesta e técnica, como os dados são tratados na
          plataforma. Ele ainda não passou por revisão jurídica formal (LGPD) — trate como um
          rascunho de boa-fé até validação com um advogado antes de qualquer uso comercial mais
          amplo.
        </div>

        <div className="prose-invert mt-10 space-y-8 text-sm leading-relaxed text-foreground/90">
          <section>
            <h2 className="text-lg font-medium">1. Quem somos</h2>
            <p className="mt-2 text-muted-foreground">
              O Satori é uma plataforma de atendimento automatizado via WhatsApp com inteligência
              artificial, operada para empresas (&quot;tenants&quot;) que contratam o serviço para atender
              seus próprios clientes finais.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium">2. Quais dados coletamos</h2>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-muted-foreground">
              <li>Dados cadastrais da empresa contratante (nome, e-mail, telefone, endereço).</li>
              <li>
                Conversas trocadas via WhatsApp entre a empresa e seus clientes finais — texto,
                imagens e áudio — necessárias para o funcionamento do atendimento automatizado.
              </li>
              <li>Catálogo de produtos/serviços cadastrado pela empresa (nome, preço, fotos).</li>
              <li>
                Dados de uso da plataforma (login, ações no painel) para fins de segurança e
                operação.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-medium">3. Como os dados são armazenados</h2>
            <p className="mt-2 text-muted-foreground">
              Os dados ficam num banco de dados PostgreSQL com isolamento por empresa (cada tenant
              só acessa os próprios dados). Chaves de API sensíveis (integrações de IA, WhatsApp)
              são armazenadas de forma criptografada, nunca em texto puro.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium">4. Serviços de terceiros envolvidos</h2>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-muted-foreground">
              <li>
                <strong className="text-foreground/90">Cloudinary</strong> — armazenamento de
                imagens de produto e áudios recebidos pelo WhatsApp.
              </li>
              <li>
                <strong className="text-foreground/90">Evolution API</strong> — cada empresa
                conecta sua própria instância de WhatsApp; a plataforma não hospeda nem opera essas
                instâncias.
              </li>
              <li>
                <strong className="text-foreground/90">Provedores de IA</strong> (Anthropic,
                OpenAI ou Google, conforme configurado por cada empresa) — processam o texto das
                conversas para gerar as respostas automáticas.
              </li>
              <li>
                <strong className="text-foreground/90">Resend</strong> — envio de e-mails
                transacionais (recuperação de senha, convites).
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-medium">5. Com quem compartilhamos dados</h2>
            <p className="mt-2 text-muted-foreground">
              Não vendemos dados de clientes finais a terceiros. Os dados só circulam entre a
              plataforma e os serviços listados acima, estritamente para operar o atendimento
              automatizado contratado pela empresa.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium">6. Seus direitos</h2>
            <p className="mt-2 text-muted-foreground">
              Você pode solicitar acesso, correção ou exclusão dos seus dados entrando em contato
              com a empresa que contratou o Satori (ela é a controladora dos dados dos clientes
              finais) ou diretamente conosco pelo canal de suporte.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium">7. Contato</h2>
            <p className="mt-2 text-muted-foreground">
              Dúvidas sobre esta política podem ser enviadas pelo WhatsApp de suporte, disponível
              no rodapé da{' '}
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

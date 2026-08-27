import Link from 'next/link'

const WHATSAPP_NUMBER = '5562999350398'
const waHref = (msg: string) => `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`

const CTA_ESPECIALISTA = waHref('Olá! Quero falar com um especialista sobre o Satori para o meu negócio.')
const CTA_PLANOS = waHref('Olá! Quero saber quanto custa o Satori pro meu negócio.')

const VALUE_POINTS = [
  {
    title: 'Seu número, sua marca',
    body: 'O Satori atende no WhatsApp que sua empresa já usa — o cliente fala com você, não com um app novo.',
  },
  {
    title: 'Treinado pro seu negócio',
    body: 'Tom, regras e catálogo configurados pra sua empresa — não é um script genérico de robô.',
  },
  {
    title: 'Você decide quando entra',
    body: 'A IA resolve o que sabe resolver bem e te chama exatamente na hora certa — nunca escondida, nunca em excesso.',
  },
]

const SEGMENTS = [
  {
    label: 'Clínicas',
    body: 'Agenda consulta sozinho, sem sua secretária tocar no celular.',
    from: 'Consigo pra quinta às 14h?',
    to: 'Perfeito, confirmado! 📅',
  },
  {
    label: 'Lojas',
    body: 'Manda foto, preço e fecha venda no automático.',
    from: 'Oi, vocês têm esse modelo em azul?',
    to: 'Temos sim! Essa aqui é a opção em azul, com garantia de 90 dias.',
  },
  {
    label: 'Concessionárias',
    body: 'Qualifica o lead e só te chama quando o interesse é real.',
    from: 'Vim ver o preço do Onix',
    to: 'Consigo te mandar a ficha completa e agendar um test-drive essa semana.',
  },
  {
    label: 'Prestadores de serviço',
    body: 'Cota orçamento e agenda visita — você só aparece pra trabalhar.',
    from: 'Quanto custa a instalação?',
    to: 'Depende do tamanho — me manda uma foto que já te passo um valor.',
  },
  {
    label: 'Studios',
    body: 'Marca horário, cobra sinal, lembra o cliente — sem no-show.',
    from: 'Quero marcar sobrancelha',
    to: 'Tenho quinta 15h ou sexta 10h — qual prefere?',
  },
  {
    label: 'Petshops',
    body: 'Agenda banho e tosa, avisa quando terminar.',
    from: 'Meu cachorro pode ir amanhã?',
    to: 'Pode sim! Te aviso assim que terminar 🐾',
  },
]

const STEPS = [
  {
    n: '01',
    title: 'Conecta o WhatsApp',
    body: 'Liga o número que sua empresa já usa em poucos minutos. Sem trocar de aparelho, sem trocar de número, sem perder histórico.',
  },
  {
    n: '02',
    title: 'Configura o agente',
    body: 'Você define o tom, as regras e o catálogo. O Satori aprende a vender do jeito da sua empresa — não do jeito de um robô genérico.',
  },
  {
    n: '03',
    title: 'Atendimento no automático',
    body: 'A IA responde, manda foto, agenda horário — e só te chama quando for de verdade preciso. Você recupera o tempo que gastava respondendo "oi, tudo bem" 40 vezes por dia.',
  },
]

const FAQ = [
  {
    q: 'Preciso trocar de número ou de aparelho?',
    a: 'Não. O Satori conecta no número que você já usa hoje.',
  },
  {
    q: 'Já uso o WhatsApp Business — funciona junto?',
    a: 'Sim, o Satori assume o atendimento automático e te avisa quando precisar entrar você.',
  },
  {
    q: 'E se o cliente quiser falar com uma pessoa?',
    a: 'O Satori identifica isso e te chama na hora — ele não tenta resolver tudo sozinho, só o que já sabe resolver bem.',
  },
  {
    q: 'Quanto tempo até funcionar de verdade?',
    a: 'Menos de um dia, contando conexão e configuração do catálogo.',
  },
]

function WordMark({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[#22d3ee]">
        <span className="text-[10px] font-black tracking-wider text-black">S</span>
      </span>
      <span className="text-sm font-black tracking-[0.2em] text-foreground">SATORI</span>
    </span>
  )
}

function ChatBubbles({ from, to }: { from: string; to: string }) {
  return (
    <div className="mt-4 flex flex-col gap-1.5 text-[12px] leading-snug">
      <div className="max-w-[85%] self-start rounded-xl rounded-tl-sm bg-white/[0.06] px-3 py-2 text-foreground/80">
        {from}
      </div>
      <div className="max-w-[85%] self-end rounded-xl rounded-tr-sm bg-[#22d3ee]/[0.14] px-3 py-2 text-foreground">
        {to}
      </div>
    </div>
  )
}

function ChatMock() {
  return (
    <div className="relative w-full max-w-[380px] rounded-2xl border border-white/10 bg-[#0b0e14] p-4 shadow-[0_40px_120px_-40px_rgba(34,211,238,0.25)]">
      <div className="mb-4 flex items-center gap-2 border-b border-white/5 pb-3">
        <span className="h-2 w-2 rounded-full bg-[#22d3ee]" />
        <span className="text-[11px] font-medium tracking-wide text-muted-foreground">
          Atendimento · Satori IA
        </span>
      </div>

      <div className="flex flex-col gap-2.5 text-[13px] leading-snug">
        <div className="max-w-[78%] self-start rounded-2xl rounded-tl-sm bg-white/[0.06] px-3.5 py-2.5 text-foreground/90">
          Oi, vocês têm esse modelo em azul?
        </div>
        <div className="max-w-[85%] self-end rounded-2xl rounded-tr-sm bg-[#22d3ee]/[0.14] px-3.5 py-2.5 text-foreground">
          Temos sim! Essa aqui é a opção em azul, com garantia de 90 dias.
          <span className="mt-1 block text-[11px] text-[#22d3ee]">📷 foto enviada · R$ 3.290</span>
        </div>
        <div className="max-w-[78%] self-start rounded-2xl rounded-tl-sm bg-white/[0.06] px-3.5 py-2.5 text-foreground/90">
          Consigo ver amanhã de manhã?
        </div>
        <div className="max-w-[85%] self-end rounded-2xl rounded-tr-sm bg-[#22d3ee]/[0.14] px-3.5 py-2.5 text-foreground">
          Consigo te encaixar às 9h ou 10h30 — qual fica melhor?
          <span className="mt-1 flex items-center justify-end gap-1 text-[10px] text-muted-foreground">
            09:41 <span className="text-[#22d3ee]">✓✓</span>
          </span>
        </div>
      </div>
    </div>
  )
}

export default function Home() {
  return (
    <div className="relative flex min-h-screen flex-col overflow-x-clip bg-background text-foreground">
      {/* glow de fundo, sutil */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-[560px] w-[900px] -translate-x-1/2 rounded-full bg-[#22d3ee]/[0.07] blur-[140px]"
      />

      {/* NAV */}
      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6 sm:px-10">
        <WordMark />
        <Link
          href="/login"
          className="rounded-full border border-white/15 px-5 py-2 text-[13px] font-medium text-foreground/90 transition-colors hover:border-[#22d3ee]/60 hover:text-[#22d3ee]"
        >
          Entrar
        </Link>
      </header>

      {/* HERO */}
      <section className="relative z-10 mx-auto grid w-full max-w-6xl items-center gap-16 px-6 py-16 sm:px-10 lg:grid-cols-[1.1fr_0.9fr] lg:py-20">
        <div>
          <p className="mb-6 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
            <span className="h-1 w-1 rounded-full bg-[#22d3ee]" />
            Atendimento com IA no WhatsApp
          </p>

          <h1 className="max-w-xl text-[2.5rem] font-medium leading-[1.08] tracking-tight sm:text-5xl">
            O vendedor que <span className="font-light italic text-muted-foreground">nunca</span> perde uma
            mensagem.
          </h1>

          <p className="mt-6 max-w-md text-base leading-relaxed text-muted-foreground">
            O Satori atende no WhatsApp da sua empresa como o seu melhor vendedor: entende o que o
            cliente quer, manda foto do produto, fecha horário na agenda — e só te chama quando for
            pra fechar negócio de verdade.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-3">
            <a
              href="#demo"
              className="inline-flex items-center gap-2 rounded-full border border-white/15 px-5 py-2.5 text-sm font-medium text-foreground/90 transition-colors hover:border-[#22d3ee]/60 hover:text-[#22d3ee]"
            >
              Ver o Satori atendendo
            </a>
            <a
              href={CTA_ESPECIALISTA}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full bg-[#22d3ee] px-6 py-3 text-sm font-semibold text-black transition-transform hover:scale-[1.03] active:scale-[0.98]"
            >
              Falar com um especialista
              <span aria-hidden>↗</span>
            </a>
          </div>
          <Link
            href="/login"
            className="mt-4 inline-block text-sm font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
          >
            Já tenho conta — entrar
          </Link>
        </div>

        <div className="flex justify-center lg:justify-end">
          <ChatMock />
        </div>
      </section>

      {/* POR QUE SATORI */}
      <section className="relative z-10 border-y border-white/[0.06]">
        <div className="mx-auto grid w-full max-w-6xl gap-8 px-6 py-10 sm:px-10 sm:grid-cols-3">
          {VALUE_POINTS.map((v) => (
            <div key={v.title}>
              <h3 className="text-sm font-semibold text-foreground">{v.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{v.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* SEGMENTOS */}
      <section id="demo" className="relative z-10 mx-auto w-full max-w-6xl scroll-mt-8 px-6 py-24 sm:px-10">
        <h2 className="mb-14 max-w-lg text-3xl font-medium tracking-tight sm:text-4xl">
          Feito pro seu tipo de negócio.
        </h2>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {SEGMENTS.map((s) => (
            <div key={s.label} className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
              <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#22d3ee]">
                {s.label}
              </span>
              <p className="mt-2 text-sm leading-relaxed text-foreground/90">{s.body}</p>
              <ChatBubbles from={s.from} to={s.to} />
            </div>
          ))}
        </div>
      </section>

      {/* COMO FUNCIONA */}
      <section className="relative z-10 mx-auto w-full max-w-6xl px-6 py-24 sm:px-10">
        <h2 className="mb-14 max-w-lg text-3xl font-medium tracking-tight sm:text-4xl">
          Do zero ao primeiro atendimento em um dia.
        </h2>
        <div className="grid gap-10 sm:grid-cols-3">
          {STEPS.map((step) => (
            <div key={step.n} className="border-t border-white/10 pt-5">
              <span className="font-mono text-[13px] text-[#22d3ee]">{step.n}</span>
              <h3 className="mt-3 text-lg font-medium">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* INVESTIMENTO */}
      <section className="relative z-10 border-y border-white/[0.06] bg-white/[0.02]">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-start justify-between gap-6 px-6 py-16 sm:px-10 lg:flex-row lg:items-center">
          <div>
            <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
              Investimento
            </p>
            <h2 className="max-w-md text-2xl font-medium tracking-tight sm:text-3xl">
              Menos que meio salário de um atendente. Atendendo 24h, todo santo dia.
            </h2>
            <p className="mt-3 max-w-md text-sm text-muted-foreground">
              Planos por porte de negócio. Fala com a gente e a gente te diz qual plano cabe no seu
              volume de atendimento.
            </p>
          </div>
          <a
            href={CTA_PLANOS}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-2 rounded-full border border-white/15 px-6 py-3 text-sm font-medium text-foreground transition-colors hover:border-[#22d3ee]/60 hover:text-[#22d3ee]"
          >
            Ver planos
            <span aria-hidden>↗</span>
          </a>
        </div>
      </section>

      {/* FAQ */}
      <section className="relative z-10 mx-auto w-full max-w-6xl px-6 py-24 sm:px-10">
        <h2 className="mb-10 max-w-lg text-3xl font-medium tracking-tight sm:text-4xl">Perguntas frequentes</h2>
        <div className="mx-auto max-w-2xl divide-y divide-white/10 border-t border-white/10">
          {FAQ.map((item) => (
            <details key={item.q} className="group py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-medium text-foreground marker:content-none">
                {item.q}
                <span className="shrink-0 text-muted-foreground transition-transform group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* CTA FINAL */}
      <section className="relative z-10 mx-auto w-full max-w-6xl px-6 pb-24 sm:px-10">
        <div className="flex flex-col items-start justify-between gap-8 rounded-3xl border border-white/10 bg-white/[0.03] px-8 py-12 sm:px-14 sm:py-16 lg:flex-row lg:items-center">
          <div>
            <h2 className="max-w-md text-2xl font-medium tracking-tight sm:text-3xl">
              Bora colocar sua IA pra atender ainda essa semana?
            </h2>
            <p className="mt-3 text-sm text-muted-foreground">
              Resposta em minutos, direto no WhatsApp.
            </p>
          </div>
          <a
            href={CTA_ESPECIALISTA}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-2 rounded-full bg-[#22d3ee] px-7 py-3.5 text-sm font-semibold text-black transition-transform hover:scale-[1.03] active:scale-[0.98]"
          >
            Falar com um especialista
            <span aria-hidden>↗</span>
          </a>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="relative z-10 mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-6 border-t border-white/[0.06] px-6 py-8 text-xs text-muted-foreground sm:flex-row sm:px-10">
        <WordMark />
        <nav className="flex items-center gap-5">
          <Link href="/termos" className="transition-colors hover:text-foreground">
            Termos de uso
          </Link>
          <Link href="/privacidade" className="transition-colors hover:text-foreground">
            Política de privacidade
          </Link>
          <a
            href={waHref('Olá! Preciso de suporte com o Satori.')}
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-foreground"
          >
            Contato / suporte
          </a>
        </nav>
        <p>© {new Date().getFullYear()} Satori. Todos os direitos reservados.</p>
      </footer>
    </div>
  )
}

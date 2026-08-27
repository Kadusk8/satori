import Link from 'next/link'

const WHATSAPP_NUMBER = '5562999350398'
const WHATSAPP_MESSAGE =
  'Olá! Quero assinar o Satori para o meu negócio — pode me passar mais informações?'
const WHATSAPP_HREF = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(WHATSAPP_MESSAGE)}`

const SEGMENTS = ['Clínicas', 'Lojas', 'Concessionárias', 'Prestadores de serviço', 'Studios', 'Petshops']

const STEPS = [
  {
    n: '01',
    title: 'Conecta o WhatsApp',
    body: 'Liga o número que sua empresa já usa em poucos minutos — sem trocar de aparelho, sem trocar de número.',
  },
  {
    n: '02',
    title: 'Configura o agente',
    body: 'Define o tom, as regras e o catálogo do seu negócio. O Satori aprende a vender do seu jeito.',
  },
  {
    n: '03',
    title: 'Atendimento no automático',
    body: 'A IA responde, mostra produto com foto, agenda horário — e só te chama quando for de verdade preciso.',
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
      <section className="relative z-10 mx-auto grid w-full max-w-6xl flex-1 items-center gap-16 px-6 py-16 sm:px-10 lg:grid-cols-[1.1fr_0.9fr] lg:py-24">
        <div>
          <p className="mb-6 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
            <span className="h-1 w-1 rounded-full bg-[#22d3ee]" />
            Atendimento com IA no WhatsApp
          </p>

          <h1 className="max-w-xl text-[2.75rem] font-medium leading-[1.05] tracking-tight sm:text-6xl">
            O atendimento
            <br />
            <span className="font-light italic text-muted-foreground">nunca</span> dorme.
          </h1>

          <p className="mt-6 max-w-md text-base leading-relaxed text-muted-foreground">
            O Satori conversa pelo WhatsApp da sua empresa como um vendedor de verdade: entende o
            que o cliente quer, mostra produto com foto, agenda horário — e só te chama quando for
            realmente preciso.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-4">
            <a
              href={WHATSAPP_HREF}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full bg-[#22d3ee] px-6 py-3 text-sm font-semibold text-black transition-transform hover:scale-[1.03] active:scale-[0.98]"
            >
              Assinar o Satori
              <span aria-hidden>↗</span>
            </a>
            <Link
              href="/login"
              className="text-sm font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
            >
              Já tenho conta — entrar
            </Link>
          </div>
        </div>

        <div className="flex justify-center lg:justify-end">
          <ChatMock />
        </div>
      </section>

      {/* SEGMENTOS */}
      <section className="relative z-10 border-y border-white/[0.06] py-6">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-center gap-x-8 gap-y-3 px-6 sm:px-10">
          {SEGMENTS.map((s, i) => (
            <span key={s} className="flex items-center gap-8">
              <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground/70">
                {s}
              </span>
              {i < SEGMENTS.length - 1 && <span className="h-1 w-1 rounded-full bg-white/15" />}
            </span>
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
            href={WHATSAPP_HREF}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-2 rounded-full bg-[#22d3ee] px-7 py-3.5 text-sm font-semibold text-black transition-transform hover:scale-[1.03] active:scale-[0.98]"
          >
            Assinar o Satori
            <span aria-hidden>↗</span>
          </a>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="relative z-10 mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 border-t border-white/[0.06] px-6 py-8 text-xs text-muted-foreground sm:flex-row sm:px-10">
        <WordMark />
        <p>© {new Date().getFullYear()} Satori. Todos os direitos reservados.</p>
      </footer>
    </div>
  )
}

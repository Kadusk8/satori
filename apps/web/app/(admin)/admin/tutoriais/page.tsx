import { listTutorialsForAdmin } from '@/lib/data/tutorials'
import { TutorialsAdmin } from '@/components/admin/tutorials-admin'

export const dynamic = 'force-dynamic'

export default async function AdminTutoriaisPage() {
  const videos = await listTutorialsForAdmin()
  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Tutoriais em vídeo</h1>
        <p className="text-sm text-muted-foreground">Envie o vídeo de cada vaga. As empresas e vendedores assistem em <span className="font-mono">/tutoriais</span>; vaga sem vídeo aparece como “Em breve”.</p>
      </div>
      <TutorialsAdmin initial={videos} />
    </div>
  )
}

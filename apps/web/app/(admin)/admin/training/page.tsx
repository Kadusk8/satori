import { listTrainingForAdmin } from '@/lib/data/ai-training'
import { TrainingAdminView } from '@/components/ai-training/training-admin-view'

export const dynamic = 'force-dynamic'

export default async function AdminTrainingPage() {
  const data = await listTrainingForAdmin()
  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Treinamento da IA</h1>
        <p className="text-sm text-muted-foreground">O que cada cliente pediu para mudar depois de testar a IA.</p>
      </div>
      <TrainingAdminView feedback={data.feedback} sessions={data.sessions} />
    </div>
  )
}

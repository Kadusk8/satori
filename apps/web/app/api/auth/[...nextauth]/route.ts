// Route handler do NextAuth v5. Só fica ativo quando batido em /api/auth/*;
// não afeta as páginas atuais até o cutover.
import { handlers } from '@/auth'

export const { GET, POST } = handlers

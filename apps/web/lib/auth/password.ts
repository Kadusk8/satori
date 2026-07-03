import bcrypt from 'bcryptjs'

// bcrypt — mesmo algoritmo que o Supabase Auth usa, então hashes migrados do
// auth.users continuam verificando aqui sem forçar reset de senha.
export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10)
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash)
}

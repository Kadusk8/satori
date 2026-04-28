import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh session — IMPORTANTE: não remover esse bloco
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    console.log('>>> DEBUG: Logged in user UUID:', user.id)
  }

  const { pathname } = request.nextUrl

  // Rotas públicas que não precisam de auth
  const publicRoutes = ['/login', '/register', '/auth/callback', '/']
  const isPublicRoute = publicRoutes.some(
    (route) => pathname === route || pathname.startsWith('/auth/')
  )

  // Sem autenticação → /login
  if (!user) {
    if (!isPublicRoute) {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      return NextResponse.redirect(url)
    }
    return supabaseResponse
  }

  // Usuário autenticado em rota pública → detectar role e redirecionar
  if (isPublicRoute && pathname !== '/auth/callback') {
    return redirectByRole(user, request, supabaseResponse, supabase)
  }

  // Usuário autenticado tentando acessar /admin sem ser super_admin
  if (pathname.startsWith('/admin')) {
    const isSuperAdmin = await checkIsSuperAdmin(supabase, user.id)
    if (!isSuperAdmin) {
      const url = request.nextUrl.clone()
      url.pathname = '/dashboard'
      return NextResponse.redirect(url)
    }
  }

  // Usuário autenticado tentando acessar /dashboard sem ser tenant user
  if (pathname.startsWith('/dashboard')) {
    const isSuperAdmin = await checkIsSuperAdmin(supabase, user.id)
    if (isSuperAdmin) {
      const url = request.nextUrl.clone()
      url.pathname = '/admin'
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}

async function checkIsSuperAdmin(
  supabase: ReturnType<typeof createServerClient>,
  userId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('super_admins')
    .select('id')
    .eq('id', userId)
    .single()

  return !error && !!data
}

async function redirectByRole(
  user: { id: string },
  request: NextRequest,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _supabaseResponse: any,
  supabase: ReturnType<typeof createServerClient>
): Promise<NextResponse> {
  const isSuperAdmin = await checkIsSuperAdmin(supabase, user.id)

  const url = request.nextUrl.clone()

  if (isSuperAdmin) {
    url.pathname = '/admin'
  } else {
    url.pathname = '/dashboard'
  }

  return NextResponse.redirect(url)
}

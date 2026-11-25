-- Teste de regressão do trigger users_guard_privileged_columns.
-- Roda inteiro numa transação com ROLLBACK: NÃO altera nada, pode rodar em produção.
-- Uso (da raiz do repo): psql "$DATABASE_URL" -q -f db/tests/users-guard-privileged-columns.sql 2>&1 | grep NOTICE
-- Cada linha mostra o resultado e o esperado; qualquer 'PASSOU (esperado bloqueado)' ou
-- 'BLOQUEADO (... esperado ok)' é falha.

\set ON_ERROR_STOP on
BEGIN;
\i db/migrations/2026-11-25-users-guard-privileged-columns.sql

DO $$
DECLARE
  op   record;  -- um usuário não-owner
  own  record;  -- o owner do mesmo tenant (se houver)
  other_tenant uuid;
BEGIN
  SELECT id, tenant_id, role INTO op FROM users WHERE role <> 'owner' AND active ORDER BY created_at LIMIT 1;
  SELECT id, tenant_id INTO own FROM users WHERE role = 'owner' AND tenant_id = op.tenant_id LIMIT 1;
  SELECT id INTO other_tenant FROM tenants WHERE id <> op.tenant_id LIMIT 1;
  RAISE NOTICE 'usuario de teste: papel=%', op.role;

  -- Helper inline: cada bloco seta role+claims, tenta, e volta.
  -- 1) operador altera is_available (permitido)
  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', op.id, 'tenant_id', op.tenant_id, 'user_role', op.role, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    UPDATE users SET is_available = NOT is_available WHERE id = op.id;
    RAISE NOTICE '1 operador muda is_available: ok (esperado ok)';
    RESET ROLE;
  EXCEPTION WHEN OTHERS THEN RESET ROLE; RAISE NOTICE '1 operador muda is_available: BLOQUEADO (%) (esperado ok)', SQLERRM;
  END;

  -- 2) operador altera preferências de push (permitido)
  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', op.id, 'tenant_id', op.tenant_id, 'user_role', op.role, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    UPDATE users SET push_only_assigned = NOT push_only_assigned, push_quiet_start = '22:00', push_quiet_end = '07:00' WHERE id = op.id;
    RAISE NOTICE '2 operador muda prefs de push: ok (esperado ok)';
    RESET ROLE;
  EXCEPTION WHEN OTHERS THEN RESET ROLE; RAISE NOTICE '2 operador muda prefs de push: BLOQUEADO (%) (esperado ok)', SQLERRM;
  END;

  -- 3) operador vira owner (bloquear)
  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', op.id, 'tenant_id', op.tenant_id, 'user_role', op.role, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    UPDATE users SET role = 'owner' WHERE id = op.id;
    RESET ROLE; RAISE NOTICE '3 operador vira owner: PASSOU (esperado bloqueado)';
  EXCEPTION WHEN insufficient_privilege THEN RESET ROLE; RAISE NOTICE '3 operador vira owner: bloqueado (esperado bloqueado)';
  END;

  -- 4) operador muda de empresa (bloquear)
  IF other_tenant IS NOT NULL THEN
    BEGIN
      PERFORM set_config('request.jwt.claims', json_build_object('sub', op.id, 'tenant_id', op.tenant_id, 'user_role', op.role, 'role', 'authenticated')::text, true);
      SET LOCAL ROLE authenticated;
      UPDATE users SET tenant_id = other_tenant WHERE id = op.id;
      RESET ROLE; RAISE NOTICE '4 operador troca tenant_id: PASSOU (esperado bloqueado)';
    EXCEPTION WHEN insufficient_privilege THEN RESET ROLE; RAISE NOTICE '4 operador troca tenant_id: bloqueado (esperado bloqueado)';
             WHEN OTHERS THEN RESET ROLE; RAISE NOTICE '4 operador troca tenant_id: bloqueado por outra regra: % (esperado bloqueado)', SQLERRM;
    END;
  END IF;

  -- 5) operador troca e-mail / se reativa (bloquear)
  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', op.id, 'tenant_id', op.tenant_id, 'user_role', op.role, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    UPDATE users SET email = email || '.x' WHERE id = op.id;
    RESET ROLE; RAISE NOTICE '5 operador troca email: PASSOU (esperado bloqueado)';
  EXCEPTION WHEN insufficient_privilege THEN RESET ROLE; RAISE NOTICE '5 operador troca email: bloqueado (esperado bloqueado)';
  END;

  -- 6) owner rebaixa/promove alguém via withClaims (bloquear — o fluxo legítimo usa withAdmin)
  IF own.id IS NOT NULL THEN
    BEGIN
      PERFORM set_config('request.jwt.claims', json_build_object('sub', own.id, 'tenant_id', own.tenant_id, 'user_role', 'owner', 'role', 'authenticated')::text, true);
      SET LOCAL ROLE authenticated;
      UPDATE users SET role = 'admin' WHERE id = op.id AND role <> 'admin';
      UPDATE users SET role = 'operator' WHERE id = op.id AND role = 'admin';
      RESET ROLE; RAISE NOTICE '6 owner muda papel via withClaims: PASSOU (esperado bloqueado)';
    EXCEPTION WHEN insufficient_privilege THEN RESET ROLE; RAISE NOTICE '6 owner muda papel via withClaims: bloqueado (esperado bloqueado)';
    END;
  END IF;

  -- 7) withAdmin (service_role) muda papel — fluxo da tela Equipe (permitido)
  BEGIN
    PERFORM set_config('request.jwt.claims', '', true);
    SET LOCAL ROLE service_role;
    UPDATE users SET role = CASE WHEN role = 'admin' THEN 'operator' ELSE 'admin' END, active = active WHERE id = op.id;
    RESET ROLE; RAISE NOTICE '7 withAdmin muda papel: ok (esperado ok)';
  EXCEPTION WHEN OTHERS THEN RESET ROLE; RAISE NOTICE '7 withAdmin muda papel: BLOQUEADO (%) (esperado ok)', SQLERRM;
  END;

  -- 8) conexão direta (backend/migrations, sem SET ROLE) muda papel (permitido)
  BEGIN
    UPDATE users SET active = active, role = role WHERE id = op.id;
    UPDATE users SET email = email || '' WHERE id = op.id;
    RAISE NOTICE '8 conexao direta (backend): ok (esperado ok)';
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE '8 conexao direta (backend): BLOQUEADO (%) (esperado ok)', SQLERRM;
  END;
END $$;

ROLLBACK;
-- prova de que nada ficou
SELECT 'trigger apos rollback: ' || count(*) FROM pg_trigger WHERE tgname = 'users_guard_privileged_columns';

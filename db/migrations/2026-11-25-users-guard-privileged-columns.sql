-- Bloqueia alteração de colunas privilegiadas de `users` em requisições de usuário.
--
-- Problema: a policy operator_self_update (FOR UPDATE USING id = auth.uid()) não
-- restringe colunas, e o papel `authenticated` tem UPDATE em todas elas. Qualquer
-- caminho que fizesse UPDATE na própria linha via withClaims com input do usuário
-- permitiria:
--   • trocar o próprio `role` pra 'owner' (escalada de privilégio);
--   • trocar o próprio `tenant_id` — os claims são relidos do banco a cada 5 min
--     (auth.ts), então o usuário passaria a acessar OUTRA empresa;
--   • se reativar (`active`) ou trocar o `email` de login.
-- Não era explorável hoje (nenhuma action repassa essas colunas), mas era uma
-- armadilha pra qualquer código futuro.
--
-- Regra: quando o UPDATE roda como `authenticated` (withClaims no apps/web), essas
-- colunas não mudam — pra nenhum papel, exceto super admin. As mudanças legítimas
-- (Equipe → papel/ativo, troca de e-mail do owner) já passam por withAdmin
-- (`service_role`) com checagem de tenant/papel no código, e não são afetadas.
-- services/backend e migrations também não rodam como `authenticated`.
--
-- Idempotente.

CREATE OR REPLACE FUNCTION users_guard_privileged_columns() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  -- Só requisições de usuário (withClaims faz SET LOCAL ROLE authenticated).
  IF current_user <> 'authenticated' THEN
    RETURN NEW;
  END IF;

  IF COALESCE((auth.jwt() ->> 'is_super_admin')::boolean, false) THEN
    RETURN NEW;
  END IF;

  IF NEW.id        IS DISTINCT FROM OLD.id
  OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
  OR NEW.role      IS DISTINCT FROM OLD.role
  OR NEW.active    IS DISTINCT FROM OLD.active
  OR NEW.email     IS DISTINCT FROM OLD.email
  THEN
    RAISE EXCEPTION 'Alteração de id/tenant_id/role/active/email de usuário não permitida nesta operação.'
      USING ERRCODE = '42501'; -- insufficient_privilege
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_guard_privileged_columns ON users;
CREATE TRIGGER users_guard_privileged_columns
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION users_guard_privileged_columns();

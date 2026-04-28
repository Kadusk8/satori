-- Migration 022: função pg_net para disparar process-message de forma assíncrona
-- Permite que o webhook-evolution retorne 200 imediatamente e o banco
-- dispara o process-message de forma independente via pg_net.

CREATE OR REPLACE FUNCTION invoke_process_message(
  p_conversation_id TEXT,
  p_url TEXT,
  p_service_key TEXT
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM net.http_post(
    url := p_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || p_service_key
    ),
    body := jsonb_build_object('conversationId', p_conversation_id)
  );
END;
$$;

-- Permite que service role e anon chamem a função
GRANT EXECUTE ON FUNCTION invoke_process_message(TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION invoke_process_message(TEXT, TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION invoke_process_message(TEXT, TEXT, TEXT) TO authenticated;

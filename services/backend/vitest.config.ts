import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    env: {
      // Dummy — só pra satisfazer o import de db/index.ts em testes que não
      // tocam banco de verdade (nenhuma conexão é aberta nos testes atuais).
      DATABASE_URL: 'postgres://test:test@localhost:5432/test',
    },
  },
})

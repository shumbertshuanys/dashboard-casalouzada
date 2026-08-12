-- Saldo histórico é saldo de abertura: no máximo uma linha por tipo.
-- A unicidade vive no banco porque checar antes de inserir abriria corrida
-- entre o SELECT e o INSERT. O índice único cobre também as buscas por tipo,
-- então o índice simples anterior deixa de ser necessário.

-- DropIndex
DROP INDEX "saldo_historico_tipo_idx";

-- CreateIndex
CREATE UNIQUE INDEX "saldo_historico_tipo_key" ON "saldo_historico"("tipo");

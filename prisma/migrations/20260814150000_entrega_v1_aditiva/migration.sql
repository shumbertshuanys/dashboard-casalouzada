-- Entrega v1 — E2A: migration ADITIVA (DEC-051, DEC-053, DEC-054, DEC-055).
--
-- Sem cutover: `lancamentos.corretor_id`/`equipe_id` continuam NOT NULL e
-- preenchidos, inclusive nas VENDA, e seguem sendo a fonte executável do código
-- atual. O CHECK final da DEC-051 e o NULL nas VENDA são do cutover da E3.
--
-- O DDL abaixo é o script canônico de `prisma migrate diff`; os dois backfills
-- e a prova ao final foram adicionados à mão, como manda a DEC-051.

-- CreateEnum
CREATE TYPE "status_proposta" AS ENUM ('AGUARDANDO', 'ACEITA', 'REJEITADA');

-- CreateEnum
CREATE TYPE "precisao_saldo_historico" AS ENUM ('EXATO', 'MINIMO_CONHECIDO');

-- CreateEnum
CREATE TYPE "status_reserva_locacao" AS ENUM ('ATIVA', 'FINALIZADA', 'CANCELADA');

-- AlterTable
ALTER TABLE "lancamentos" ADD COLUMN     "status_proposta" "status_proposta",
ADD COLUMN     "valor_proposta" DECIMAL(14,2);

-- AlterTable
-- Default EXATO: toda linha existente preserva a semântica que sempre teve.
-- Nenhum saldo vira MINIMO_CONHECIDO sem edição explícita (DEC-054).
ALTER TABLE "saldo_historico" ADD COLUMN     "precisao" "precisao_saldo_historico" NOT NULL DEFAULT 'EXATO';

-- CreateTable
CREATE TABLE "participacoes_venda" (
    "id" UUID NOT NULL,
    "lancamento_id" UUID NOT NULL,
    "corretor_id" UUID NOT NULL,
    "equipe_id" UUID NOT NULL,
    "ordem" INTEGER NOT NULL,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "participacoes_venda_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservas_locacao" (
    "id" UUID NOT NULL,
    "corretor_id" UUID NOT NULL,
    "equipe_id" UUID NOT NULL,
    "imovel_ref" TEXT NOT NULL,
    "status" "status_reserva_locacao" NOT NULL DEFAULT 'ATIVA',
    "data_referencia" DATE NOT NULL,
    "observacao" TEXT,
    "criado_por" UUID,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "reservas_locacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "participacoes_venda_corretor_id_idx" ON "participacoes_venda"("corretor_id");

-- CreateIndex
CREATE INDEX "participacoes_venda_equipe_id_idx" ON "participacoes_venda"("equipe_id");

-- CreateIndex
CREATE UNIQUE INDEX "participacoes_venda_lancamento_id_corretor_id_key" ON "participacoes_venda"("lancamento_id", "corretor_id");

-- CreateIndex
CREATE UNIQUE INDEX "participacoes_venda_lancamento_id_ordem_key" ON "participacoes_venda"("lancamento_id", "ordem");

-- CreateIndex
CREATE INDEX "reservas_locacao_status_data_referencia_idx" ON "reservas_locacao"("status", "data_referencia");

-- CreateIndex
CREATE INDEX "reservas_locacao_corretor_id_data_referencia_idx" ON "reservas_locacao"("corretor_id", "data_referencia");

-- CreateIndex
CREATE INDEX "reservas_locacao_equipe_id_data_referencia_idx" ON "reservas_locacao"("equipe_id", "data_referencia");

-- AddForeignKey
ALTER TABLE "participacoes_venda" ADD CONSTRAINT "participacoes_venda_lancamento_id_fkey" FOREIGN KEY ("lancamento_id") REFERENCES "lancamentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participacoes_venda" ADD CONSTRAINT "participacoes_venda_corretor_id_fkey" FOREIGN KEY ("corretor_id") REFERENCES "corretores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participacoes_venda" ADD CONSTRAINT "participacoes_venda_equipe_id_fkey" FOREIGN KEY ("equipe_id") REFERENCES "equipes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservas_locacao" ADD CONSTRAINT "reservas_locacao_corretor_id_fkey" FOREIGN KEY ("corretor_id") REFERENCES "corretores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservas_locacao" ADD CONSTRAINT "reservas_locacao_equipe_id_fkey" FOREIGN KEY ("equipe_id") REFERENCES "equipes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservas_locacao" ADD CONSTRAINT "reservas_locacao_criado_por_fkey" FOREIGN KEY ("criado_por") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill inicial de VENDA (DEC-051, passos 1–3 da E2A).
--
-- Uma participação de ordem 1 por VENDA existente, copiando o crédito
-- histórico. O id reaproveita o id do próprio lançamento: são tabelas
-- diferentes, não há colisão de namespace, e isso torna o backfill
-- determinístico sem depender de extensão para gerar UUID. Participações
-- criadas pela aplicação daqui em diante usam uuid() normal. O criado_em
-- preserva o do lançamento.
INSERT INTO "participacoes_venda" ("id", "lancamento_id", "corretor_id", "equipe_id", "ordem", "criado_em")
SELECT l."id", l."id", l."corretor_id", l."equipe_id", 1, l."criado_em"
FROM "lancamentos" l
WHERE l."tipo" = 'VENDA';

-- Prova do backfill: a migration FALHA se alguma VENDA ficar sem exatamente
-- uma participação. Venda sem participação é inválida (DEC-051).
DO $$
DECLARE
  sem_participacao integer;
  contagem_errada integer;
BEGIN
  SELECT COUNT(*) INTO sem_participacao
  FROM "lancamentos" l
  WHERE l."tipo" = 'VENDA'
    AND NOT EXISTS (
      SELECT 1 FROM "participacoes_venda" p WHERE p."lancamento_id" = l."id"
    );

  IF sem_participacao > 0 THEN
    RAISE EXCEPTION 'backfill incompleto: % VENDA sem participacao', sem_participacao;
  END IF;

  SELECT COUNT(*) INTO contagem_errada
  FROM (
    SELECT p."lancamento_id"
    FROM "participacoes_venda" p
    GROUP BY p."lancamento_id"
    HAVING COUNT(*) <> 1
  ) duplicadas;

  IF contagem_errada > 0 THEN
    RAISE EXCEPTION 'backfill invalido: % vendas com participacoes em numero diferente de 1', contagem_errada;
  END IF;
END $$;

-- Backfill das PROPOSTA legadas: AGUARDANDO é o padrão do pipeline (DEC-053).
-- Sem default de coluna de propósito — um default em `lancamentos` atingiria
-- também os tipos não-PROPOSTA. A E2B fecha o contrato na aplicação.
UPDATE "lancamentos"
SET "status_proposta" = 'AGUARDANDO'
WHERE "tipo" = 'PROPOSTA' AND "status_proposta" IS NULL;

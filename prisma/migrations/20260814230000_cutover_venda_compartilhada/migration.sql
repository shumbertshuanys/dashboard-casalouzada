-- Entrega v1 — E3: cutover da venda compartilhada (DEC-051, DEC-052).
--
-- Fecha a dualidade que a E2A deixou aberta de propósito. Ao final desta
-- migration o crédito de VENDA mora **exclusivamente** em `participacoes_venda`,
-- e `lancamentos.corretor_id`/`equipe_id` ficam `NULL` em toda venda.
--
-- Ordem obrigatória: completar as participações que faltam ANTES de zerar
-- qualquer coisa, provar a cobertura, só então afrouxar o NOT NULL, gravar o
-- NULL e instalar o CHECK. A informação histórica só sai dos campos antigos
-- depois de materializada na participação — nenhuma venda muda de dono ou de
-- equipe, e nenhum resíduo fica para trás.
--
-- O `ALTER TABLE` do meio é o script canônico de `prisma migrate diff`; os
-- backfills e as duas provas foram escritos à mão, como manda a DEC-051.

-- A. Backfill idempotente das vendas criadas entre a E2A e a E3.
--
-- A E2A criou uma participação de ordem 1 para cada VENDA existente naquele
-- momento, mas o admin da E2 continuou gravando venda com um corretor só e sem
-- participação. Estas são as que faltam — e os campos antigos delas ainda estão
-- preenchidos, que é justamente de onde o crédito é copiado.
--
-- `id` reaproveita o id do lançamento, como no backfill da E2A: determinístico,
-- sem depender de extensão para gerar UUID, e sem colisão porque só entra quem
-- ainda não tem participação nenhuma. O `criado_em` preserva o do lançamento.
INSERT INTO "participacoes_venda" ("id", "lancamento_id", "corretor_id", "equipe_id", "ordem", "criado_em")
SELECT l."id", l."id", l."corretor_id", l."equipe_id", 1, l."criado_em"
FROM "lancamentos" l
WHERE l."tipo" = 'VENDA'
  AND l."corretor_id" IS NOT NULL
  AND l."equipe_id" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "participacoes_venda" p WHERE p."lancamento_id" = l."id"
  );

-- B. Prova pré-cutover: sem cobertura integral, nada é zerado.
--
-- Esta migration falha inteira — a transação do `migrate deploy` desfaz o
-- INSERT acima — se sobrar qualquer venda sem crédito materializado. Zerar os
-- campos antigos de uma venda sem participação apagaria o histórico dela.
DO $$
DECLARE
  sem_participacao integer;
  ordem_invalida integer;
BEGIN
  SELECT COUNT(*) INTO sem_participacao
  FROM "lancamentos" l
  WHERE l."tipo" = 'VENDA'
    AND NOT EXISTS (
      SELECT 1 FROM "participacoes_venda" p WHERE p."lancamento_id" = l."id"
    );

  IF sem_participacao > 0 THEN
    RAISE EXCEPTION
      'cutover abortado: % VENDA sem participacao — o credito nao esta materializado',
      sem_participacao;
  END IF;

  -- A ordem tem de ser contígua de 1 a N dentro de cada venda: um buraco
  -- quebraria a divisão igualitária do VGV, que distribui os centavos
  -- residuais por ordem crescente (DEC-052).
  SELECT COUNT(*) INTO ordem_invalida
  FROM (
    SELECT p."lancamento_id"
    FROM "participacoes_venda" p
    GROUP BY p."lancamento_id"
    HAVING MIN(p."ordem") <> 1
        OR MAX(p."ordem") <> COUNT(*)
        OR COUNT(DISTINCT p."ordem") <> COUNT(*)
  ) invalidas;

  IF ordem_invalida > 0 THEN
    RAISE EXCEPTION
      'cutover abortado: % venda(s) com ordem de participacao fora de 1..N',
      ordem_invalida;
  END IF;
END $$;

-- C. AlterTable
ALTER TABLE "lancamentos" ALTER COLUMN "corretor_id" DROP NOT NULL,
ALTER COLUMN "equipe_id" DROP NOT NULL;

-- D. O crédito sai dos campos antigos — só nas VENDA.
--
-- Depois de B, cada uma dessas linhas já tem o mesmo crédito registrado em
-- `participacoes_venda`. Os demais tipos não são tocados.
UPDATE "lancamentos"
SET "corretor_id" = NULL, "equipe_id" = NULL
WHERE "tipo" = 'VENDA';

-- E. Contrato excludente do estado final (DEC-051).
--
-- Nome explícito para o erro do banco ser legível e a constraint ser
-- referenciável. O CHECK da proposta, instalado na E2B, continua intocado: os
-- dois predicados falam de colunas diferentes e são satisfeitos ao mesmo tempo.
ALTER TABLE "lancamentos"
ADD CONSTRAINT "lancamentos_venda_credito_check" CHECK (
  (
    "tipo" = 'VENDA'
    AND "corretor_id" IS NULL
    AND "equipe_id" IS NULL
  )
  OR
  (
    "tipo" <> 'VENDA'
    AND "corretor_id" IS NOT NULL
    AND "equipe_id" IS NOT NULL
  )
);

-- F. Prova pós-cutover.
--
-- O `ADD CONSTRAINT` acima já validou as linhas existentes; o que esta prova
-- acrescenta é a invariante que o CHECK não sabe expressar — toda venda com
-- pelo menos uma participação — e a garantia de que o CHECK da proposta
-- sobreviveu ao cutover.
DO $$
DECLARE
  venda_com_credito_antigo integer;
  individual_sem_credito integer;
  venda_sem_participacao integer;
  check_proposta integer;
BEGIN
  SELECT COUNT(*) INTO venda_com_credito_antigo
  FROM "lancamentos"
  WHERE "tipo" = 'VENDA'
    AND ("corretor_id" IS NOT NULL OR "equipe_id" IS NOT NULL);

  IF venda_com_credito_antigo > 0 THEN
    RAISE EXCEPTION 'cutover incompleto: % VENDA com credito antigo preenchido', venda_com_credito_antigo;
  END IF;

  SELECT COUNT(*) INTO individual_sem_credito
  FROM "lancamentos"
  WHERE "tipo" <> 'VENDA'
    AND ("corretor_id" IS NULL OR "equipe_id" IS NULL);

  IF individual_sem_credito > 0 THEN
    RAISE EXCEPTION 'cutover invalido: % lancamento nao-VENDA sem corretor ou equipe', individual_sem_credito;
  END IF;

  SELECT COUNT(*) INTO venda_sem_participacao
  FROM "lancamentos" l
  WHERE l."tipo" = 'VENDA'
    AND NOT EXISTS (
      SELECT 1 FROM "participacoes_venda" p WHERE p."lancamento_id" = l."id"
    );

  IF venda_sem_participacao > 0 THEN
    RAISE EXCEPTION 'cutover invalido: % VENDA sem participacao', venda_sem_participacao;
  END IF;

  SELECT COUNT(*) INTO check_proposta
  FROM pg_constraint
  WHERE conname = 'lancamentos_proposta_campos_check';

  IF check_proposta <> 1 THEN
    RAISE EXCEPTION 'o CHECK de proposta da E2B nao sobreviveu ao cutover';
  END IF;
END $$;

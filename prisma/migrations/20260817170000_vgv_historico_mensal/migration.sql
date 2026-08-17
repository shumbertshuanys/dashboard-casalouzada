-- VGV histórico mensal — E1: persistência do agregado mensal consolidado.
--
-- Estritamente aditiva: uma tabela nova, o índice único dela e dois CHECKs.
-- Nenhuma tabela existente é tocada — sem coluna nova, sem alteração de coluna,
-- sem constraint nova em `lancamentos`, `saldo_historico` ou qualquer outra, sem
-- FK, sem backfill, sem trigger e sem seed. Rodar isto num banco existente não
-- muda uma única linha de dado comercial.
--
-- `vgv_historico_mensal` guarda o **VGV total consolidado de uma competência
-- mensal passada**: o número que o escritório já apurava antes de o sistema
-- existir, fechado por mês, sem os eventos individuais que o compõem. Não é
-- `Lancamento`, não é `VENDA`, não é `SaldoHistorico`, e não há FK para nenhum
-- deles — de propósito. As duas coisas são fatos de naturezas diferentes: o
-- lançamento é o evento, este é o agregado que veio de um relatório histórico.
--
-- `valor_total` representa **exclusivamente valor de imóveis vendidos**,
-- semanticamente o mesmo que `lancamentos.valor` de uma VENDA contribui para o
-- VGV. Não é locação, comissão, honorário nem receita de outra natureza. O tipo
-- é o mesmo `DECIMAL(14, 2)` do resto do dinheiro do projeto, pela mesma razão:
-- centavos exatos, nunca ponto flutuante.
--
-- Sem consumo nesta etapa. Nenhuma leitura, nenhuma métrica e nenhuma tela lêem
-- esta tabela ainda; o destino aprovado é o VGV **trimestral e anual**, e ele
-- será implementado depois. Esta migration só cria o lugar onde o fato mora.

-- CreateTable
CREATE TABLE "vgv_historico_mensal" (
    "id" UUID NOT NULL,
    "competencia" DATE NOT NULL,
    "valor_total" DECIMAL(14,2) NOT NULL,
    "observacao" TEXT,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "vgv_historico_mensal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
--
-- Unicidade da competência **no banco**, e não em código: checar antes de
-- inserir abriria corrida entre o SELECT e o INSERT, exatamente como em
-- `saldo_historico.tipo`. Duas linhas para o mesmo mês fariam o agregado ser
-- contado duas vezes no trimestre e no ano.
CREATE UNIQUE INDEX "vgv_historico_mensal_competencia_key" ON "vgv_historico_mensal"("competencia");

-- Os dois CHECKs — invariantes que não dependem de relógio.
--
-- `competencia` é o **primeiro dia do mês**, sempre. A coluna é `DATE` e guarda
-- uma data civil, mas "agosto de 2026" tem uma representação só: `2026-08-01`.
-- Sem esta barreira, `2026-08-14` e `2026-08-01` seriam duas competências
-- distintas para o mesmo mês, e o índice único acima não perceberia — a
-- unicidade protegeria valores diferentes do mesmo fato.
--
-- `valor_total > 0`, e não `>= 0`. Um mês consolidado com zero não é um fato
-- registrável por esta entidade: ou o mês teve VGV, ou não há agregado a
-- cadastrar. Zero aqui afirmaria "apuramos e deu zero" com a mesma forma de
-- "ainda não apuramos", que é justamente a confusão que a DEC-014 proíbe.
--
-- O que **não** está aqui, e por quê: a regra "somente competência passada".
-- Um CHECK sobre `now()` não é imutável — a linha que passou na validação hoje
-- deixaria de passar amanhã, e qualquer `pg_dump`/restore ou `VALIDATE
-- CONSTRAINT` futuro reprovaria dados legítimos. Essa regra é da aplicação, e
-- não foi implementada nesta etapa.
ALTER TABLE "vgv_historico_mensal"
ADD CONSTRAINT "vgv_historico_mensal_competencia_dia1_check" CHECK (
  EXTRACT(DAY FROM "competencia") = 1
);

ALTER TABLE "vgv_historico_mensal"
ADD CONSTRAINT "vgv_historico_mensal_valor_total_positivo_check" CHECK (
  "valor_total" > 0
);

-- Continuidade do SEC-001 (DEC-058) para a tabela nova.
--
-- A migration 20260815190000 fechou o caminho da Data API do Supabase com duas
-- barreiras independentes em cada tabela de `public`: privilégios revogados de
-- `anon`/`authenticated`, e RLS ligado sem nenhuma policy. Uma tabela criada
-- depois daquela migration **não herda a segunda**: `ENABLE ROW LEVEL SECURITY`
-- não é default de schema, é estado de tabela. É o mesmo raciocínio que a
-- 20260816120000 aplicou a `celebracoes`, e vale aqui pela mesma razão — sem
-- esta seção, `vgv_historico_mensal` nasceria protegida por uma barreira só, a
-- dos default privileges, que o próprio SEC-001 registra como reinstalável por
-- fora, porque é o padrão da plataforma.
--
-- Nada aqui muda o comportamento da aplicação: sem `FORCE`, o dono da tabela
-- continua enxergando tudo, e o runtime atravessa o RLS pelo `BYPASSRLS` do
-- role dedicado (DEC-060). A ausência de policy é o contrato, não um vazio a
-- preencher depois.
--
-- Portabilidade: `anon` e `authenticated` existem no Supabase e não num
-- PostgreSQL comum. O REVOKE é condicionado ao catálogo; onde os roles não
-- existem, não há o que revogar e isso não é erro.
DO $$
DECLARE
  roles_data_api CONSTANT text[] := ARRAY['anon', 'authenticated'];
  papel text;
  acl_remanescente text[];
  rls_ligado boolean;
  policies_encontradas integer;
BEGIN
  ALTER TABLE "vgv_historico_mensal" ENABLE ROW LEVEL SECURITY;

  FOREACH papel IN ARRAY roles_data_api LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = papel) THEN
      -- `REVOKE ALL` e não uma lista de verbos, pela mesma razão do SEC-001:
      -- uma lista escrita à mão já nasce sem os privilégios que o PostgreSQL
      -- ainda vai acrescentar.
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public."vgv_historico_mensal" FROM %I', papel);
    ELSE
      RAISE NOTICE 'vgv_historico_mensal: role % nao existe neste banco; nada a revogar.', papel;
    END IF;
  END LOOP;

  -- Prova. Meia barreira é pior que nenhuma, porque parece proteção.
  SELECT c.relrowsecurity INTO rls_ligado
    FROM pg_class c
   WHERE c.relnamespace = 'public'::regnamespace
     AND c.relname = 'vgv_historico_mensal';

  IF rls_ligado IS NOT TRUE THEN
    RAISE EXCEPTION 'RLS nao ficou ativo em vgv_historico_mensal';
  END IF;

  -- Agnóstica ao nome do privilégio: qualquer entrada que sobre aparece aqui.
  SELECT array_agg(
           format('%s/%s', pg_get_userbyid(a.grantee), a.privilege_type)
           ORDER BY pg_get_userbyid(a.grantee), a.privilege_type
         )
    INTO acl_remanescente
    FROM pg_class c
    CROSS JOIN LATERAL aclexplode(c.relacl) a
   WHERE c.relnamespace = 'public'::regnamespace
     AND c.relname = 'vgv_historico_mensal'
     AND a.grantee IN (SELECT oid FROM pg_roles WHERE rolname = ANY(roles_data_api));

  IF acl_remanescente IS NOT NULL THEN
    RAISE EXCEPTION 'privilegio direto sobrou na ACL de vgv_historico_mensal: %',
      array_to_string(acl_remanescente, ', ');
  END IF;

  SELECT count(*) INTO policies_encontradas
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename = 'vgv_historico_mensal';

  IF policies_encontradas <> 0 THEN
    RAISE EXCEPTION 'nenhuma policy deveria existir em vgv_historico_mensal; encontradas %',
      policies_encontradas;
  END IF;
END $$;

-- O acesso do runtime (DEC-061).
--
-- Pela DEC-061 uma tabela sem `GRANT` explícito é **inacessível ao runtime** —
-- não existe default privilege para `casalouzada_runtime`, de propósito. Foi
-- exatamente esse o bloqueio que a 20260816160000 teve de corrigir em
-- `celebracoes`, e a lição entra aqui na própria migration de criação, em vez
-- de virar uma correção depois.
--
-- O contrato desta entidade, e nada além:
--
--   SELECT  — a leitura futura do VGV trimestral/anual;
--   INSERT  — o cadastro de uma competência consolidada pelo Admin;
--   UPDATE  — a correção de um agregado, quando a fonte consolidada usada para
--             cadastrá-lo não contemplava alguma venda. Ao contrário de
--             `celebracoes`, que nasce e é lida, este é um número apurado à mão
--             e retificável;
--   DELETE  — a remoção de uma competência cadastrada por engano. Não há FK
--             apontando para cá, então nenhum cascade faria esse trabalho.
--
-- O que **não** é concedido:
--
--   TRUNCATE,
--   REFERENCES,
--   TRIGGER,
--   MAINTAIN    nenhuma tabela do projeto concede esses ao runtime (DEC-060), e
--               esta não é a exceção. DELETE apaga linha a linha, com CHECK e
--               trigger valendo; TRUNCATE é outra operação, e mais larga.
--
-- Portabilidade: `casalouzada_runtime` existe em produção e pode não existir num
-- PostgreSQL comum — o banco local de teste roda com um role só, dono das
-- tabelas. O bloco é condicionado ao catálogo: sem o role não há a quem
-- conceder, isso não é erro, e a prova só roda quando a concessão aconteceu.
DO $$
DECLARE
  runtime CONSTANT text := 'casalouzada_runtime';

  /* O contrato, escrito como duas listas: o que tem de estar lá e o que não
     pode estar. Provar só a primeira deixaria passar um GRANT largo demais. */
  concedidos CONSTANT text[] := ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE'];
  negados text[] := ARRAY['TRUNCATE', 'REFERENCES', 'TRIGGER'];

  privilegio text;
  faltando text[] := ARRAY[]::text[];
  excedentes text[] := ARRAY[]::text[];
  dono text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = runtime) THEN
    RAISE NOTICE
      'E1: role % nao existe neste banco; nada a conceder em vgv_historico_mensal.',
      runtime;
    RETURN;
  END IF;

  EXECUTE format(
    'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."vgv_historico_mensal" TO %I',
    runtime
  );

  ---------------------------------------------------------------------------
  -- Prova. Um GRANT que não é conferido é uma intenção, não um estado.
  ---------------------------------------------------------------------------

  -- Ownership antes de tudo: o dono de uma tabela tem todos os privilégios
  -- dela, e por isso um runtime que fosse dono passaria na prova positiva e
  -- também na negativa — invertida. A DEC-060 exige zero ownership.
  SELECT pg_get_userbyid(c.relowner) INTO dono
    FROM pg_class c
   WHERE c.relnamespace = 'public'::regnamespace
     AND c.relname = 'vgv_historico_mensal';

  IF dono IS NULL THEN
    RAISE EXCEPTION 'vgv_historico_mensal nao existe neste banco; a criacao acima nao aconteceu';
  END IF;

  IF dono = runtime THEN
    RAISE EXCEPTION 'o runtime % e dono de vgv_historico_mensal; a DEC-060 exige zero ownership', runtime;
  END IF;

  FOREACH privilegio IN ARRAY concedidos LOOP
    IF NOT has_table_privilege(runtime, 'public.vgv_historico_mensal', privilegio) THEN
      faltando := faltando || privilegio;
    END IF;
  END LOOP;

  IF array_length(faltando, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'o runtime % ficou sem privilegio necessario em vgv_historico_mensal: %',
      runtime, array_to_string(faltando, ', ');
  END IF;

  -- `MAINTAIN` chegou no PostgreSQL 17; em 16 o nome nem é reconhecido por
  -- `has_table_privilege`, que estoura em vez de responder `false`. A versão é
  -- medida, não presumida.
  --
  -- `array_append`, e não `||`: com um literal sem tipo declarado, o `||`
  -- resolve para `anyarray || anyarray` e o PostgreSQL tenta ler `'MAINTAIN'`
  -- como **literal de array**, falhando com `22P02 malformed array literal`. Foi
  -- isso que derrubou a 20260816160000 na primeira tentativa de deploy, num
  -- ramo que nenhum gate em PostgreSQL 16 tinha como alcançar.
  IF current_setting('server_version_num')::int >= 170000 THEN
    negados := array_append(negados, 'MAINTAIN');
  ELSE
    RAISE NOTICE
      'E1: MAINTAIN so existe a partir do PostgreSQL 17; nada a provar em %.',
      current_setting('server_version');
  END IF;

  -- `has_table_privilege` responde pelo privilégio **efetivo**: pega o que veio
  -- por GRANT direto, por herança de membership e por PUBLIC. É por isso que a
  -- prova negativa vale alguma coisa — ela não olha só a linha da ACL.
  FOREACH privilegio IN ARRAY negados LOOP
    IF has_table_privilege(runtime, 'public.vgv_historico_mensal', privilegio) THEN
      excedentes := excedentes || privilegio;
    END IF;
  END LOOP;

  IF array_length(excedentes, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'o runtime % recebeu privilegio a mais em vgv_historico_mensal: %',
      runtime, array_to_string(excedentes, ', ');
  END IF;

  RAISE NOTICE
    'E1: vgv_historico_mensal concede SELECT, INSERT, UPDATE, DELETE a % — e nada alem disso.',
    runtime;
END $$;

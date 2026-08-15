-- Entrega S1-R1A — SEC-001: fecha o caminho da Data API do Supabase até os dados.
--
-- O que a auditoria S1 mediu: as tabelas do schema `public` estavam com RLS
-- desligado e, ao mesmo tempo, com privilégios amplos concedidos aos roles
-- `anon` e `authenticated`. Esses dois não são roles internos do banco — são os
-- que a Data API (PostgREST) assume ao atender uma requisição vinda da internet
-- com a chave pública do projeto. Nesse arranjo, quem tivesse a chave lia e
-- escrevia em `usuarios`, `lancamentos` e no resto sem passar pelo Next.js, pelo
-- `src/proxy.ts`, pela guarda administrativa ou pelo token do painel.
--
-- A aplicação não usa a Data API. Não há `@supabase/supabase-js` no projeto,
-- nenhuma chamada a `rest/v1`, nenhuma variável `SUPABASE_*`: o acesso ao banco é
-- sempre PostgreSQL direto, por Prisma (`src/lib/db.ts`). Não existe consumidor
-- legítimo de `anon` ou `authenticated` a preservar.
--
-- São duas barreiras independentes, de propósito:
--
--   1. os privilégios saem — sem GRANT não há o que a Data API leia;
--   2. o RLS entra, e **sem nenhuma policy** — sem policy, RLS nega tudo.
--
-- Uma só bastaria hoje. Duas continuam valendo quando a outra cair: os grants do
-- schema `public` são reinstaláveis por fora, porque são o padrão da plataforma,
-- e o RLS sobrevive a isso. A ausência de policy é o contrato, não um vazio a
-- preencher depois: nenhum cliente da Data API deve alcançar estes dados.
--
-- `FORCE ROW LEVEL SECURITY` **não** é usado, e é essa a decisão que mantém a
-- aplicação intacta. Sem FORCE, o dono da tabela e qualquer role com BYPASSRLS
-- continuam enxergando tudo — exatamente o caso das duas conexões legítimas: o
-- `postgres` do Supabase (BYPASSRLS) em produção, e o dono das tabelas no banco
-- local de teste. Nenhuma consulta da aplicação muda de comportamento e nenhum
-- invariante do produto é tocado. Nada de coluna, constraint, índice, FK ou dado
-- é alterado aqui: esta migration mexe só em permissão.
--
-- Portabilidade. `anon` e `authenticated` existem no Supabase e não num
-- PostgreSQL comum, e os default privileges do role `postgres` só podem ser
-- mexidos por quem é membro dele. Todo comando que depende dessas condições é
-- condicionado ao catálogo (`pg_roles`, `pg_has_role`); onde o ambiente não
-- permite, a migration avisa por NOTICE e segue. O que ela nunca faz é dar por
-- aplicado o que não aplicou — daí a prova da seção E, que relê o catálogo e
-- estoura se o resultado não for o prometido.

DO $$
DECLARE
  /* Lista literal, e não uma varredura de `pg_tables`: o schema `public` de um
     projeto Supabase hospeda também objetos de extensões, e uma migration não
     deve decidir sobre o que não é dela. Estas são as sete tabelas do domínio,
     na ordem do `schema.prisma`. */
  tabelas_dominio CONSTANT text[] := ARRAY[
    'equipes',
    'corretores',
    'lancamentos',
    'participacoes_venda',
    'reservas_locacao',
    'saldo_historico',
    'usuarios'
  ];

  /* A tabela de controle do Prisma entra pelo mesmo motivo que as outras: a
     auditoria encontrou nela os mesmos grants, e com eles dá para corromper o
     estado das migrations. Fica à parte porque é a única que pode legitimamente
     não existir — quando este SQL é aplicado fora do fluxo do Prisma. */
  tabela_controle CONSTANT text := '_prisma_migrations';

  /* `service_role` fica fora deste ciclo por decisão do mandato. */
  roles_data_api CONSTANT text[] := ARRAY['anon', 'authenticated'];

  privilegios_provados CONSTANT text[] := ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE'];

  alvos text[];
  tabela text;
  papel text;
  privilegio text;
  ausentes text[] := ARRAY[]::text[];
  restantes text[] := ARRAY[]::text[];
  sem_rls text[];
  policies_encontradas integer;
  pode_mexer_em_defaults boolean := false;
BEGIN
  ---------------------------------------------------------------------------
  -- Alvos: as sete obrigatórias, mais a de controle quando ela existir.
  ---------------------------------------------------------------------------
  FOREACH tabela IN ARRAY tabelas_dominio LOOP
    IF to_regclass(format('public.%I', tabela)) IS NULL THEN
      ausentes := ausentes || tabela;
    END IF;
  END LOOP;

  IF array_length(ausentes, 1) IS NOT NULL THEN
    -- Falha alto: rodar isto sobre um schema incompleto deixaria tabela
    -- desprotegida sem ninguém perceber.
    RAISE EXCEPTION 'tabela de dominio ausente em public: %', array_to_string(ausentes, ', ');
  END IF;

  alvos := tabelas_dominio;

  IF to_regclass(format('public.%I', tabela_controle)) IS NOT NULL THEN
    alvos := alvos || tabela_controle;
  ELSE
    RAISE NOTICE 'SEC-001: %.% nao existe neste banco; seguindo com as tabelas de dominio.',
      'public', tabela_controle;
  END IF;

  ---------------------------------------------------------------------------
  -- A. Row Level Security, sem policy e sem FORCE.
  ---------------------------------------------------------------------------
  FOREACH tabela IN ARRAY alvos LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tabela);
  END LOOP;

  ---------------------------------------------------------------------------
  -- B e C. Privilégios de `anon` e `authenticated` nas tabelas existentes.
  --
  -- `REVOKE ALL` em vez de listar verbos: a auditoria encontrou sete deles
  -- concedidos, e uma lista escrita à mão envelhece — PostgreSQL 17 acrescentou
  -- MAINTAIN, e o próximo acrescentará outro.
  ---------------------------------------------------------------------------
  FOREACH papel IN ARRAY roles_data_api LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = papel) THEN
      FOREACH tabela IN ARRAY alvos LOOP
        EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM %I', tabela, papel);
      END LOOP;
    ELSE
      -- PostgreSQL comum: o role não existe, então não há privilégio a revogar.
      -- Isto é o esperado fora do Supabase, e não é erro.
      RAISE NOTICE 'SEC-001: role % nao existe neste banco; nada a revogar.', papel;
    END IF;
  END LOOP;

  ---------------------------------------------------------------------------
  -- D. Default privileges: impedir que a próxima tabela nasça aberta.
  --
  -- O REVOKE acima trata do que existe hoje. Sem isto, uma tabela nova criada
  -- pelo `postgres` em `public` receberia os grants padrão da plataforma e
  -- reabriria o caminho — com o agravante de que ninguém repara.
  --
  -- `ALTER DEFAULT PRIVILEGES FOR ROLE postgres` exige ser o próprio `postgres`
  -- ou membro dele. É verdade no Supabase, onde as migrations rodam como
  -- `postgres`, e tipicamente falso num banco local, onde o dono do schema é um
  -- role de aplicação. Por isso a condição é medida, e não presumida.
  ---------------------------------------------------------------------------
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres') THEN
    -- Em duas etapas de propósito: `pg_has_role` estoura se o role não existir,
    -- e um AND numa expressão só não garante a ordem de avaliação.
    pode_mexer_em_defaults := pg_has_role(current_user, 'postgres', 'USAGE');
  END IF;

  FOREACH papel IN ARRAY roles_data_api LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = papel) THEN
      CONTINUE;
    END IF;

    IF pode_mexer_em_defaults THEN
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM %I',
        papel
      );
    ELSE
      -- Sem direito sobre os defaults do `postgres`, a alternativa seria estourar
      -- e impedir que as duas barreiras principais fossem aplicadas. O aviso é
      -- deliberado: as tabelas de hoje ficam protegidas, e a herança das futuras
      -- continua sendo assunto de quem administra o banco.
      RAISE NOTICE
        'SEC-001: % existe, mas % nao pode alterar os default privileges de postgres; tabelas futuras nao foram cobertas.',
        papel, current_user;
    END IF;
  END LOOP;

  ---------------------------------------------------------------------------
  -- E. Prova. O que não puder ser demonstrado aqui derruba a migration inteira,
  -- que o Prisma executa em transação única — meia barreira é pior que nenhuma,
  -- porque parece proteção.
  ---------------------------------------------------------------------------
  SELECT array_agg(c.relname ORDER BY c.relname) INTO sem_rls
    FROM pg_class c
   WHERE c.relnamespace = 'public'::regnamespace
     AND c.relkind = 'r'
     AND c.relname = ANY(alvos)
     AND NOT c.relrowsecurity;

  IF sem_rls IS NOT NULL THEN
    RAISE EXCEPTION 'RLS nao ficou ativo em: %', array_to_string(sem_rls, ', ');
  END IF;

  FOREACH papel IN ARRAY roles_data_api LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = papel) THEN
      CONTINUE;
    END IF;

    FOREACH tabela IN ARRAY alvos LOOP
      FOREACH privilegio IN ARRAY privilegios_provados LOOP
        -- `has_table_privilege` responde pelo privilégio efetivo, herança
        -- inclusive: é o que se quer provar, e não apenas a ausência da linha
        -- de GRANT.
        IF has_table_privilege(papel, format('public.%I', tabela), privilegio) THEN
          restantes := restantes || format('%s/%s/%s', papel, tabela, privilegio);
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;

  IF array_length(restantes, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'privilegio remanescente apos o REVOKE: %', array_to_string(restantes, ', ');
  END IF;

  SELECT count(*) INTO policies_encontradas
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename = ANY(alvos);

  IF policies_encontradas <> 0 THEN
    -- Uma policy permissiva devolveria à Data API o acesso que as duas barreiras
    -- acabaram de tirar.
    RAISE EXCEPTION 'nenhuma policy deveria existir nestas tabelas; encontradas %', policies_encontradas;
  END IF;
END $$;

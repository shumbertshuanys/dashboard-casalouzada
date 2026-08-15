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
--
-- Fronteira desta migration: os defaults de **um** creator.
--
-- Default privilege não é do schema, é do par (role que cria, schema). Quem
-- decide qual conjunto se aplica a uma tabela nova é o role que executa o
-- CREATE TABLE. Num projeto Supabase há mais de um conjunto registrado para
-- `public` — o preflight encontrou `postgres` e `supabase_admin` —, e o
-- `postgres` não é membro do `supabase_admin`, logo não tem autoridade sobre os
-- defaults dele. Tentar governá-los aqui não daria uma barreira a mais: daria um
-- erro de permissão que derrubaria as barreiras que esta migration consegue
-- levantar.
--
-- Por isso o contrato é declarado pelo que ela controla: os defaults cujo
-- creator é `postgres`, que é justamente quem cria tabela neste projeto — as
-- oito existentes são dele, e `prisma migrate deploy` roda como ele. Defaults de
-- outros creators ficam de fora do predicado da prova, de propósito, e apenas
-- rendem um NOTICE informativo. Fechá-los, se for o caso, é decisão de quem
-- administra o banco, com autoridade que esta migration não tem.

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

  /* Os quatro verbos do acesso efetivo (E.3). Não confundir com a prova de ACL
     direta (E.2), que é agnóstica ao nome do privilégio de propósito. */
  privilegios_provados CONSTANT text[] := ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE'];

  alvos text[];
  tabela text;
  papel text;
  privilegio text;
  ausentes text[] := ARRAY[]::text[];
  restantes text[] := ARRAY[]::text[];
  sem_rls text[];
  acl_remanescente text[];
  defaults_remanescentes text[];
  outros_creators text[];
  policies_encontradas integer;
  pode_mexer_em_defaults boolean := false;
  oid_postgres oid;
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
  -- `REVOKE ALL` em vez de listar verbos, e o preflight mostrou por quê: a
  -- auditoria contou sete privilégios concedidos lendo
  -- `information_schema.role_table_grants`, mas a ACL bruta tem oito — o oitavo é
  -- `MAINTAIN`, que chegou no PostgreSQL 17 e que aquela view não expõe. Uma
  -- lista escrita à mão já teria nascido incompleta.
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
  --
  -- Só o creator `postgres` é tocado — ver a nota de fronteira no cabeçalho.
  -- Nenhum outro creator entra aqui, e em particular não se tenta `FOR ROLE
  -- supabase_admin`: o executor não é membro dele, e a tentativa terminaria em
  -- erro de permissão levando junto o RLS e os REVOKEs desta mesma execução.
  ---------------------------------------------------------------------------
  SELECT oid INTO oid_postgres FROM pg_roles WHERE rolname = 'postgres';

  IF oid_postgres IS NOT NULL THEN
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
  -- E. Prova. Meia barreira é pior que nenhuma, porque parece proteção.
  --
  -- O que sustenta o "tudo ou nada" aqui é a forma do arquivo, não uma garantia
  -- do Prisma: da primeira linha à última existe **um único statement**, este
  -- `DO`, e tudo o que as seções A a D executam acontece dentro dele, por
  -- `EXECUTE`. Um `RAISE EXCEPTION` abaixo faz esse statement falhar, e um
  -- statement que falha não deixa efeito parcial — nem quando é o único da
  -- transação implícita. Não há, portanto, estado observável em que o RLS esteja
  -- ligado e os privilégios continuem lá, ou vice-versa. Nada disso depende de o
  -- Prisma envolver o arquivo numa transação própria; se envolver, o resultado é
  -- o mesmo.
  --
  -- São quatro afirmações, e cada uma existe porque as outras não a cobrem:
  --
  --   E.1  RLS ligado nos alvos;
  --   E.2  nenhuma ACL direta sobrando — agnóstica ao nome do privilégio;
  --   E.3  nenhum acesso efetivo aos quatro verbos — pega herança e PUBLIC;
  --   E.4  nenhum default privilege sobrando sob o creator `postgres`;
  --   E.5  nenhuma policy.
  ---------------------------------------------------------------------------

  -- E.1 -----------------------------------------------------------------
  SELECT array_agg(c.relname ORDER BY c.relname) INTO sem_rls
    FROM pg_class c
   WHERE c.relnamespace = 'public'::regnamespace
     AND c.relkind = 'r'
     AND c.relname = ANY(alvos)
     AND NOT c.relrowsecurity;

  IF sem_rls IS NOT NULL THEN
    RAISE EXCEPTION 'RLS nao ficou ativo em: %', array_to_string(sem_rls, ', ');
  END IF;

  -- E.2 -----------------------------------------------------------------
  -- A ACL da tabela, lida como ela é, sem lista de verbos a manter.
  --
  -- Esta é a prova do `REVOKE ALL`: qualquer entrada que sobre para `anon` ou
  -- `authenticated` aparece aqui, tenha o nome que tiver. `MAINTAIN` chegou no
  -- PostgreSQL 17 e não é o último — uma prova que enumerasse privilégios
  -- deixaria de ver exatamente o que ainda não conhece.
  --
  -- O filtro é por OID de role, não por nome: `aclexplode` devolve `grantee = 0`
  -- para PUBLIC, e comparar OIDs evita traduzir esse zero. Se os roles não
  -- existirem, o subselect é vazio e a prova passa sem nada a dizer, que é o
  -- correto num PostgreSQL comum. `relacl` nula — tabela que nunca recebeu GRANT
  -- explícito — simplesmente não produz linha.
  SELECT array_agg(
           format('%s/%s/%s', pg_get_userbyid(a.grantee), c.relname, a.privilege_type)
           ORDER BY pg_get_userbyid(a.grantee), c.relname, a.privilege_type
         )
    INTO acl_remanescente
    FROM pg_class c
    CROSS JOIN LATERAL aclexplode(c.relacl) a
   WHERE c.relnamespace = 'public'::regnamespace
     AND c.relkind = 'r'
     AND c.relname = ANY(alvos)
     AND a.grantee IN (SELECT oid FROM pg_roles WHERE rolname = ANY(roles_data_api));

  IF acl_remanescente IS NOT NULL THEN
    RAISE EXCEPTION 'privilegio direto sobrou na ACL apos o REVOKE ALL: %',
      array_to_string(acl_remanescente, ', ');
  END IF;

  -- E.3 -----------------------------------------------------------------
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
    RAISE EXCEPTION 'acesso efetivo remanescente apos o REVOKE: %',
      array_to_string(restantes, ', ');
  END IF;

  -- E.4 -----------------------------------------------------------------
  -- A barreira D era, até aqui, a única aplicada sem ser conferida.
  --
  -- O predicado tem três amarras e todas importam: `defaclrole = postgres`,
  -- porque é o único creator sob autoridade desta migration; `defaclnamespace =
  -- public`, porque defaults de `auth`, `storage` e afins não são assunto dela;
  -- e `defaclobjtype = 'r'`, porque o contrato é sobre tabelas — SEQUENCE e
  -- FUNCTION pertencem a outro ciclo.
  --
  -- A primeira amarra é o que impede um falso positivo: os defaults de
  -- `supabase_admin` ficam fora do filtro e não derrubam nada. Se derrubassem, a
  -- migration falharia por uma condição que ela não tem permissão para corrigir.
  --
  -- A conferência só roda quando a seção D de fato executou. Onde ela pulou, não
  -- há o que provar, e afirmar um estado que ninguém tentou produzir seria mentir
  -- em qualquer das duas direções.
  IF pode_mexer_em_defaults THEN
    SELECT array_agg(
             format('%s/%s', pg_get_userbyid(a.grantee), a.privilege_type)
             ORDER BY pg_get_userbyid(a.grantee), a.privilege_type
           )
      INTO defaults_remanescentes
      FROM pg_default_acl d
      CROSS JOIN LATERAL aclexplode(d.defaclacl) a
     WHERE d.defaclrole = oid_postgres
       AND d.defaclnamespace = 'public'::regnamespace
       AND d.defaclobjtype = 'r'
       AND a.grantee IN (SELECT oid FROM pg_roles WHERE rolname = ANY(roles_data_api));

    IF defaults_remanescentes IS NOT NULL THEN
      RAISE EXCEPTION 'default privilege de tabela sobrou sob o creator postgres: %',
        array_to_string(defaults_remanescentes, ', ');
    END IF;
  END IF;

  -- Informativo, nunca condição de sucesso: quem mais concede às futuras tabelas
  -- de `public` e está fora do alcance desta migration.
  SELECT array_agg(DISTINCT pg_get_userbyid(d.defaclrole))
    INTO outros_creators
    FROM pg_default_acl d
    CROSS JOIN LATERAL aclexplode(d.defaclacl) a
   WHERE d.defaclnamespace = 'public'::regnamespace
     AND d.defaclobjtype = 'r'
     AND d.defaclrole IS DISTINCT FROM oid_postgres
     AND a.grantee IN (SELECT oid FROM pg_roles WHERE rolname = ANY(roles_data_api));

  IF outros_creators IS NOT NULL THEN
    RAISE NOTICE
      'SEC-001: defaults de tabela em public tambem sao concedidos por % — fora da autoridade desta migration; tabela criada por esses roles ainda nasceria aberta.',
      array_to_string(outros_creators, ', ');
  END IF;

  -- E.5 -----------------------------------------------------------------
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

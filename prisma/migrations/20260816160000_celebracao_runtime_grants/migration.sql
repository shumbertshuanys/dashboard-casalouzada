-- Celebração de venda — C1-R1: o acesso do runtime a `celebracoes`.
--
-- Correção de um bloqueio deixado pela migration 20260816120000: a tabela foi
-- criada sem `GRANT` nenhum para `casalouzada_runtime`, e pela DEC-061 isso
-- significa tabela **inacessível ao runtime** — não existe default privilege
-- para esse role, de propósito. Sem esta migration, a primeira leitura da TV e
-- o primeiro registro de celebração falhariam em produção com
-- `permission denied for table celebracoes`.
--
-- O contrato é o mínimo que o C2 e o C3 exigem, e nada além:
--
--   SELECT  — o endpoint da TV lê as celebrações recentes;
--   INSERT  — o disparo da celebração, automático ou manual, grava uma linha.
--
-- O que **não** é concedido, e por quê:
--
--   UPDATE      celebração não é editada. Ela nasce e é lida; não há campo de
--               consumo, de status ou de retificação para mexer.
--   DELETE      a poda de uma celebração acompanha o lançamento, e o `ON DELETE
--               CASCADE` da FK **não** exige DELETE na tabela filha: a ação
--               referencial é executada pelo sistema, não com os privilégios de
--               quem apagou o pai. Conceder DELETE aqui daria ao runtime um
--               poder que o cascade já dispensa.
--   TRUNCATE,
--   REFERENCES,
--   TRIGGER,
--   MAINTAIN    nenhuma tabela do projeto concede esses ao runtime (DEC-060), e
--               `celebracoes` não é a exceção.
--
-- Por que uma migration nova em vez de corrigir a anterior: a 20260816120000 já
-- foi commitada, publicada e aplicada. Editá-la mudaria o checksum registrado em
-- `_prisma_migrations` e faria o `migrate deploy` recusar o banco. Correção de
-- migration publicada nasce depois dela, sempre.
--
-- Correção documental da 20260816120000, registrada aqui porque aquele arquivo
-- não pode ser editado. O cabeçalho dela descreve "as duas conexões legítimas"
-- como sendo o `postgres` do Supabase em produção e o dono das tabelas no banco
-- local. Isso descreve o estado anterior à DEC-060: em produção o runtime é
-- `casalouzada_runtime`, e não `postgres`. O que a frase afirmava continua
-- valendo em substância — o runtime atravessa o RLS —, mas pelo `BYPASSRLS` do
-- role dedicado, não por ser administrativo. A `DIRECT_URL`, essa sim, continua
-- com `postgres`, e é ela que aplica esta migration. A documentação geral fica
-- para o ciclo de fechamento.
--
-- Portabilidade. `casalouzada_runtime` existe em produção e num PostgreSQL
-- comum pode não existir — o banco local de teste, por exemplo, roda com um
-- role só, que é dono das tabelas. O bloco é condicionado ao catálogo: sem o
-- role não há a quem conceder, isso não é erro, e a migration avisa por NOTICE e
-- segue. O que ela nunca faz é dar por concedido o que não concedeu — daí a
-- prova, que só roda quando a concessão de fato aconteceu.
DO $$
DECLARE
  runtime CONSTANT text := 'casalouzada_runtime';

  /* O contrato, escrito como duas listas: o que tem de estar lá e o que não
     pode estar. Provar só a primeira deixaria passar um GRANT largo demais. */
  concedidos CONSTANT text[] := ARRAY['SELECT', 'INSERT'];
  negados text[] := ARRAY['UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'];

  privilegio text;
  faltando text[] := ARRAY[]::text[];
  excedentes text[] := ARRAY[]::text[];
  dono text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = runtime) THEN
    RAISE NOTICE
      'C1-R1: role % nao existe neste banco; nada a conceder em celebracoes.',
      runtime;
    RETURN;
  END IF;

  EXECUTE format('GRANT SELECT, INSERT ON TABLE public."celebracoes" TO %I', runtime);

  ---------------------------------------------------------------------------
  -- Prova. Um GRANT que não é conferido é uma intenção, não um estado.
  ---------------------------------------------------------------------------

  -- Ownership antes de tudo: o dono de uma tabela tem todos os privilégios
  -- dela, e por isso um runtime que fosse dono passaria na prova positiva e
  -- também na negativa — invertida. A DEC-060 exige zero ownership; sem esta
  -- verificação, o resto do bloco poderia afirmar um contrato que não existe.
  SELECT pg_get_userbyid(c.relowner) INTO dono
    FROM pg_class c
   WHERE c.relnamespace = 'public'::regnamespace
     AND c.relname = 'celebracoes';

  IF dono IS NULL THEN
    RAISE EXCEPTION 'celebracoes nao existe neste banco; a migration C1 nao foi aplicada';
  END IF;

  IF dono = runtime THEN
    RAISE EXCEPTION 'o runtime % e dono de celebracoes; a DEC-060 exige zero ownership', runtime;
  END IF;

  FOREACH privilegio IN ARRAY concedidos LOOP
    IF NOT has_table_privilege(runtime, 'public.celebracoes', privilegio) THEN
      faltando := faltando || privilegio;
    END IF;
  END LOOP;

  IF array_length(faltando, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'o runtime % ficou sem privilegio necessario em celebracoes: %',
      runtime, array_to_string(faltando, ', ');
  END IF;

  -- `MAINTAIN` chegou no PostgreSQL 17; em 16 o nome nem é reconhecido por
  -- `has_table_privilege`, que estoura em vez de responder `false`. A versão é
  -- medida, não presumida: onde o privilégio não existe não há o que negar, e
  -- inventar a pergunta derrubaria a migration num banco perfeitamente correto.
  --
  -- `array_append`, e não `||`: com um literal sem tipo declarado, o `||` resolve
  -- para `anyarray || anyarray` e o PostgreSQL tenta ler `'MAINTAIN'` como
  -- **literal de array**, falhando com `22P02 malformed array literal`. Foi
  -- exatamente isso que derrubou esta migration na primeira tentativa de deploy:
  -- o ramo só executa a partir do 17, então nenhum gate num PostgreSQL 16 tinha
  -- como alcançá-lo. `array_append` nomeia a operação e não deixa o operador
  -- ambíguo escolher por conta própria.
  IF current_setting('server_version_num')::int >= 170000 THEN
    negados := array_append(negados, 'MAINTAIN');
  ELSE
    RAISE NOTICE
      'C1-R1: MAINTAIN so existe a partir do PostgreSQL 17; nada a provar em %.',
      current_setting('server_version');
  END IF;

  -- `has_table_privilege` responde pelo privilégio **efetivo**: pega o que veio
  -- por GRANT direto, por herança de membership e por PUBLIC. É por isso que a
  -- prova negativa vale alguma coisa — ela não olha só a linha da ACL.
  FOREACH privilegio IN ARRAY negados LOOP
    IF has_table_privilege(runtime, 'public.celebracoes', privilegio) THEN
      excedentes := excedentes || privilegio;
    END IF;
  END LOOP;

  IF array_length(excedentes, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'o runtime % recebeu privilegio a mais em celebracoes: %',
      runtime, array_to_string(excedentes, ', ');
  END IF;

  RAISE NOTICE
    'C1-R1: celebracoes concede SELECT, INSERT a % — e nada alem disso.',
    runtime;
END $$;

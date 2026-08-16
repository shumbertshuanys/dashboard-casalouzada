-- Celebração de venda — C1: persistência mínima do evento de UX.
--
-- Estritamente aditiva: uma tabela nova, o índice dela e a FK. Nenhuma tabela
-- comercial é tocada — sem coluna nova, sem alteração de coluna, sem constraint
-- nova em `lancamentos`, sem backfill, sem trigger e sem seed. Rodar isto num
-- banco existente não muda uma única linha de dado comercial.
--
-- `celebracoes` guarda apenas a referência ao lançamento e o instante do
-- pedido. Valor, corretor, equipe e imóvel **não** são copiados: eles moram no
-- lançamento e nas participações, e a leitura os alcança pela relação. Um
-- snapshot aqui seria uma segunda versão do fato comercial, livre para
-- divergir da primeira depois de uma edição.
--
-- `ON DELETE CASCADE` pelo mesmo princípio de `participacoes_venda`: o registro
-- dependente morre com o fato que o sustenta. `lancamentos` tem hard delete na
-- aplicação, e `RESTRICT` aqui faria um evento de tela impedir a exclusão de
-- uma venda lançada por engano.

-- CreateTable
CREATE TABLE "celebracoes" (
    "id" UUID NOT NULL,
    "lancamento_id" UUID NOT NULL,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "celebracoes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "celebracoes_criado_em_id_idx" ON "celebracoes"("criado_em", "id");

-- AddForeignKey
ALTER TABLE "celebracoes" ADD CONSTRAINT "celebracoes_lancamento_id_fkey" FOREIGN KEY ("lancamento_id") REFERENCES "lancamentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Continuidade do SEC-001 para a tabela nova.
--
-- A migration 20260815190000 fechou o caminho da Data API do Supabase com duas
-- barreiras independentes em cada tabela de `public`: privilégios revogados de
-- `anon`/`authenticated`, e RLS ligado sem nenhuma policy. Uma tabela criada
-- depois daquela migration não herda a segunda: `ENABLE ROW LEVEL SECURITY` não
-- é default de schema, é estado de tabela.
--
-- Sem esta seção, `celebracoes` nasceria protegida por uma barreira só — a dos
-- default privileges — que o próprio cabeçalho do SEC-001 registra como
-- reinstalável por fora, porque é o padrão da plataforma. Deixar assim seria
-- regredir em silêncio o contrato estabelecido no ciclo anterior, e a
-- celebração referencia `lancamento_id`, que é chave de dado comercial.
--
-- Nada aqui muda o comportamento da aplicação: sem `FORCE`, o dono da tabela
-- continua enxergando tudo — o `postgres` do Supabase em produção e o dono das
-- tabelas no banco local de teste, que são as duas únicas conexões legítimas.
-- A ausência de policy é o contrato, não um vazio a preencher depois.
--
-- Portabilidade: `anon` e `authenticated` existem no Supabase e não num
-- PostgreSQL comum. O REVOKE é condicionado ao catálogo; onde os roles não
-- existem, não há o que revogar e isso não é erro. Os default privileges não
-- são tocados — o SEC-001 já os fechou para o creator `postgres`, e esta
-- migration não tem autoridade sobre nenhum outro.
DO $$
DECLARE
  roles_data_api CONSTANT text[] := ARRAY['anon', 'authenticated'];
  papel text;
  acl_remanescente text[];
  rls_ligado boolean;
  policies_encontradas integer;
BEGIN
  ALTER TABLE "celebracoes" ENABLE ROW LEVEL SECURITY;

  FOREACH papel IN ARRAY roles_data_api LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = papel) THEN
      -- `REVOKE ALL` e não uma lista de verbos, pela mesma razão do SEC-001:
      -- uma lista escrita à mão já nasce sem os privilégios que o PostgreSQL
      -- ainda vai acrescentar.
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public."celebracoes" FROM %I', papel);
    ELSE
      RAISE NOTICE 'celebracoes: role % nao existe neste banco; nada a revogar.', papel;
    END IF;
  END LOOP;

  -- Prova. Meia barreira é pior que nenhuma, porque parece proteção.
  SELECT c.relrowsecurity INTO rls_ligado
    FROM pg_class c
   WHERE c.relnamespace = 'public'::regnamespace
     AND c.relname = 'celebracoes';

  IF rls_ligado IS NOT TRUE THEN
    RAISE EXCEPTION 'RLS nao ficou ativo em celebracoes';
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
     AND c.relname = 'celebracoes'
     AND a.grantee IN (SELECT oid FROM pg_roles WHERE rolname = ANY(roles_data_api));

  IF acl_remanescente IS NOT NULL THEN
    RAISE EXCEPTION 'privilegio direto sobrou na ACL de celebracoes: %',
      array_to_string(acl_remanescente, ', ');
  END IF;

  SELECT count(*) INTO policies_encontradas
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename = 'celebracoes';

  IF policies_encontradas <> 0 THEN
    RAISE EXCEPTION 'nenhuma policy deveria existir em celebracoes; encontradas %',
      policies_encontradas;
  END IF;
END $$;

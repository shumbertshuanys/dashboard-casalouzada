# Decisões — Dashboard Casa Louzada

Decisões duráveis do projeto: as que restringem o que pode ser construído daqui em
diante. Não é diário de execução — o andamento fica em
[HANDOFF_ATUAL.md](./HANDOFF_ATUAL.md).

Cada decisão traz um marcador de estado:

- **implementada** — já vale no código, com evidência;
- **invariante futura** — decidida e obrigatória, ainda não implementada.

---

## Dados

### DEC-001 — Cada fato comercial é um registro individual

**Decisão.** Venda, locação, captação, proposta e avaliação entram como linhas
individuais em `lancamentos`. Não há contadores agregados mantidos à mão.

**Motivo.** Agregado não se audita nem se corrige: um número errado não tem como ser
rastreado até o fato que o originou.

**Impacto.** Todo total do painel é derivado por soma. Corrigir um erro é editar ou
apagar um lançamento.

**Fonte.** `prisma/schema.prisma` (modelo `Lancamento`); `PLANO.md` §2. **implementada**

### DEC-002 — `lancamentos.equipe_id` é gravado no evento

**Decisão.** A equipe é persistida no lançamento, não lida da equipe atual do
corretor.

**Motivo.** Corretor troca de equipe. Sem isso, a troca reescreveria o histórico
inteiro dele retroativamente.

**Impacto.** O lançamento carrega `corretor_id` e `equipe_id`. Quem consultar por
equipe deve usar o campo do lançamento, nunca `corretor.equipe_id`.

**Fonte.** `prisma/schema.prisma`, campo `equipeId` de `Lancamento`; `PLANO.md` §3. **implementada**

### DEC-003 — `CAPTACAO_VENDA` e `CAPTACAO_EXCLUSIVA` são independentes

**Decisão.** São dois tipos distintos do enum. Um lançamento é um ou outro, nunca os
dois.

**Motivo.** São métricas comerciais diferentes; somar uma dentro da outra inflaria os
números.

**Impacto.** Os totais das duas linhas do quadro mensal **nunca** se sobrepõem.
Nenhum cálculo pode somar exclusividade dentro de captação de venda.

**Fonte.** enum `tipo_lancamento` em `prisma/schema.prisma` e na migração inicial;
`PLANO.md` §3. **implementada**

### DEC-004 — `saldo_historico` entra somente em acumulados

**Decisão.** Os saldos históricos entram nos big numbers acumulados e **nunca** em
recortes por período — mensal, trimestral ou anual.

**Motivo.** Existem para evitar cadastrar retroativamente centenas de vendas antigas.
Não têm data de fato, só data de corte.

**Impacto.** Qualquer cálculo por período deverá ignorar `saldo_historico`. Confundir
isso duplicaria valores no VGV do mês.

**Fonte.** `prisma/schema.prisma` (modelo `SaldoHistorico`); `PLANO.md` §3 e §4.
**invariante futura** — o modelo `SaldoHistorico` já está implementado; a aplicação da
regra de cálculo entra na F3, junto com a DEC-013

### DEC-005 — Períodos civis no fuso `America/Sao_Paulo`

**Decisão.** Mês, trimestre e ano são civis, calculados em `America/Sao_Paulo`.

**Motivo.** Corte de mês em UTC erraria a virada por três horas, jogando lançamentos
do dia 1º para o mês anterior.

**Impacto.** Nenhum cálculo de período pode usar o fuso do servidor. O fuso é fixo,
não é o do navegador nem o da máquina de deploy.

**Fonte.** `PLANO.md` §4. **invariante futura** — a camada de cálculo ainda não existe

### DEC-006 — Corretor se inativa, não se exclui

**Decisão.** Corretores têm `ativo: boolean`. Desligamento marca inativo.

**Motivo.** Excluir apagaria o histórico de lançamentos da pessoa e distorceria os
acumulados da empresa.

**Impacto.** O fluxo administrativo existe: a área de corretores inativa e reativa,
e não há action nem botão de exclusão. Continua futuro o filtro por `ativo` nas
listagens do **painel** (F3) — inativo deve sumir da TV sem perder o histórico.

**Fonte.** `prisma/schema.prisma`, campo `ativo` de `Corretor`;
`src/app/admin/corretores/acoes.ts`; commit `fa49528`.
**implementada na administração** — o filtro do painel continua sendo F3

### DEC-007 — Histórico protegido por foreign keys `Restrict`

**Decisão.** `Lancamento` referencia `Corretor` e `Equipe` com `onDelete: Restrict`.
`Lancamento.autor` usa `SetNull`.

**Motivo.** O banco recusa apagar quem tem histórico, em vez de depender de a
aplicação lembrar de verificar.

**Impacto.** Apagar equipe ou corretor com lançamentos falha na camada do banco. É
proposital, e reforça a DEC-006. Já o autor do lançamento pode sumir sem levar o
lançamento junto.

**Fonte.** `prisma/schema.prisma`, relações de `Lancamento`. **implementada**

---

## Painel

### DEC-008 — Painel é somente leitura

**Decisão.** A tela da TV não escreve nada. Todo dado entra pela área
administrativa.

**Motivo.** É uma tela pública dentro do escritório, sem operador; qualquer escrita
seria superfície de ataque e de erro.

**Impacto.** Nenhuma rota de escrita responde sob `/painel`.

**Fonte.** `src/app/painel/[token]/page.tsx`; `PLANO.md` §2. **implementada**

### DEC-009 — Acesso ao painel por token na URL, sem login

**Decisão.** A proteção é um token longo na própria URL, guardado em `PAINEL_TOKEN`.
Não há tela de login no painel.

**Motivo.** A TV precisa abrir sozinha ao ligar, sem ninguém digitar senha.

**Impacto.** O token é trocável a qualquer momento: basta atualizar a variável e a
URL da TV. Quem tiver a URL tem acesso — ela não deve circular fora do escritório.

**Fonte.** `src/app/painel/[token]/page.tsx`; `PLANO.md` §5.1. **implementada**

### DEC-010 — Token errado responde 404

**Decisão.** Token incorreto devolve 404, não 401 nem uma tela de acesso negado.

**Motivo.** Qualquer resposta diferente de 404 confirmaria que a rota existe e que há
algo a ser adivinhado ali.

**Impacto.** A comparação usa `timingSafeEqual`, para o tempo de resposta também não
denunciar nada.

**Fonte.** `src/app/painel/[token]/page.tsx`, função `tokenConfere`. **implementada**

### DEC-011 — Painel é `noindex`

**Decisão.** As rotas sob `/painel` enviam `X-Robots-Tag: noindex, nofollow,
noarchive` e a página declara `metadata.robots`.

**Motivo.** Se a URL secreta vazar em algum lugar, ela não deve virar resultado de
busca.

**Impacto.** Dupla camada — cabeçalho e metadata. Nenhuma das duas deve ser removida
sem substituir a outra.

**Fonte.** `next.config.ts`; `src/app/painel/[token]/page.tsx`. **implementada**

### DEC-012 — Dimensões estruturais relativas à viewport

**Decisão.** O layout do painel é dimensionado em unidades relativas à largura da
tela, não em pixels fixos.

**Motivo.** O mesmo código precisa servir à TV de 80" em 3840×2160 e ao monitor onde
o resultado é conferido, sem manter duas versões.

**Impacto.** Os tamanhos mínimos de leitura do plano (big numbers 220px, VGV 110px,
nomes 44px, rótulos 32px) são alvos **em pixels de 4K real**, expressos em `cqw`.
No protótipo os quatro foram medidos e atendidos num painel de 3840px. Aplicar o
mesmo dimensionamento ao painel **real** continua sendo F3/F4.

**Fonte.** `PLANO.md` §5.1 e §6; `src/components/painel/painel.module.css`;
commit `22bf943`. **implementada no protótipo**

### DEC-013 — Todo cálculo do painel converge para `src/lib/metricas.ts`

**Decisão.** Na F3, a regra de cálculo mora numa camada única, `src/lib/metricas.ts`.
Nenhum componente calcula por conta própria.

**Motivo.** Regra espalhada por componente diverge silenciosamente: dois lugares
somando "captação" de formas diferentes produzem dois números diferentes na mesma
tela.

**Impacto.** É a fronteira onde DEC-003, DEC-004, DEC-005 e DEC-014 são efetivamente
aplicadas.

**Fonte.** `PLANO.md` §8. **invariante futura** — o arquivo ainda não existe

### DEC-014 — Zero real é diferente de ausência de lançamento

**Decisão.** A tela distingue "o corretor fez zero vendas neste mês" de "não há dado
para este recorte".

**Motivo.** Exibir ausência como zero transforma falha de carga ou de conexão em
informação falsa na parede do escritório.

**Impacto.** Vale também para a queda de rede prevista no plano: em falha, o painel
mantém o último valor conhecido em vez de zerar.

**Fonte.** `PLANO.md` §5.1. **invariante futura**

---

## Administração

### DEC-015 — Área administrativa exige autenticação

**Decisão.** Tudo sob `/admin` exige sessão válida.

**Motivo.** É por ali que os dados entram e são corrigidos.

**Impacto.** Duas barreiras: o middleware `src/proxy.ts` e a leitura de sessão na
própria página, para a proteção não depender só do matcher.

**Fonte.** `src/proxy.ts`; `src/app/admin/page.tsx`. **implementada**

### DEC-016 — Um único administrador na primeira versão

**Decisão.** A v1 opera com um usuário. A tabela `usuarios` existe mesmo assim, com
`ativo` e relação com `lancamentos`.

**Motivo.** Adicionar um segundo acesso no futuro não deve exigir migração.

**Impacto.** Não há tela de gestão de usuários na v1. O registro inicial vem pelo
seed.

**Fonte.** `prisma/schema.prisma` (modelo `Usuario`); `PLANO.md` §3. **implementada**

### DEC-017 — Senha em bcrypt, com geração centralizada

**Decisão.** Senha guardada como hash bcrypt de custo 12. `src/lib/senha.ts` é o
único lugar que gera e confere hash.

**Motivo.** Custo e algoritmo iguais em todos os caminhos — aplicação, seed e script
de troca. Duplicar a lógica é como surgem hashes que o login não consegue conferir.

**Impacto.** Nenhum código novo deve chamar `bcrypt` diretamente; use
`gerarHashSenha()` e `conferirSenha()`.

**Fonte.** `src/lib/senha.ts`; `src/lib/auth.ts`. **implementada**

### DEC-018 — Sessão em JWT assinado, em cookie `httpOnly`

**Decisão.** Sessão é um JWT HS256 assinado com `AUTH_SECRET`, guardado em cookie
`httpOnly`, `sameSite=lax`, `secure` em produção, com validade de 7 dias.

**Motivo.** `httpOnly` tira o token do alcance de JavaScript. O JWT permite ao
middleware validar a sessão sem consultar o banco a cada requisição — por isso
`src/lib/sessao.ts` é livre de Prisma e de APIs de Node.

**Impacto.** Trocar `AUTH_SECRET` invalida imediatamente todas as sessões emitidas —
é o botão de revogação, já usado uma vez no saneamento pós-F1. Em contrapartida, não
há revogação individual de sessão.

**Fonte.** `src/lib/sessao.ts`; `src/lib/sessao-servidor.ts`. **implementada**

### DEC-019 — O seed não sobrescreve senha de usuário existente

**Decisão.** Se o e-mail do administrador já existe, o seed atualiza nome e `ativo` e
**preserva** o hash da senha.

**Motivo.** O seed roda a cada deploy. Sobrescrever devolveria a senha ao valor da
variável de ambiente toda vez, desfazendo silenciosamente qualquer troca.

**Impacto.** Mudar `SEED_ADMIN_SENHA` e rodar o seed **não** troca a senha de
ninguém. É a razão de existir a DEC-020.

**Fonte.** `prisma/seed.ts`, função `semearAdministrador`. **implementada**

### DEC-020 — Rotação de senha por script separado e explícito

**Decisão.** A troca de senha de um usuário existente é feita por
`scripts/trocar-senha-admin.ts` (`npm run db:trocar-senha-admin`), com entrada por
variáveis de ambiente — nunca por argumento de linha de comando.

**Motivo.** Argumento de linha de comando vaza no histórico do shell e na lista de
processos. E a operação precisa ser deliberada, não um efeito colateral do deploy.

**Impacto.** O script exige que o usuário exista, falha se não existir, **não é
upsert** e altera exclusivamente `senhaHash`. A senha nova usa variável própria
(`TROCA_SENHA_NOVA`) em vez de reaproveitar `SEED_ADMIN_SENHA`, para uma execução
distraída não reinstalar um valor antigo.

**Fonte.** `scripts/trocar-senha-admin.ts`, commit `c59be18`. **implementada**

### DEC-021 — Segredos nunca entram no Git

**Decisão.** Nenhum segredo real entra no Git. O repositório versiona apenas
`.env.example`, com placeholders.

**Motivo.** O repositório é público. Segredo commitado fica exposto no instante do
push e não some com um commit de remoção.

**Impacto.** Todo segredo é lido de `process.env`; nenhum valor real aparece em
arquivo versionado. No desenvolvimento local isso significa um `.env` ignorado pelo
Git. Em ambientes de deploy, as credenciais devem viver no mecanismo de
environment/secrets do provedor — nunca em arquivo do repositório. O `.env.example`
serve só para documentar os nomes das variáveis.

**Fonte.** `.gitignore` (regra `.env*` com exceção `!.env.example`); `.env.example`. **implementada**

---

## Escopo da v1

### DEC-022 — Metas ficam fora da v1

**Decisão.** A tabela `metas` está desenhada no plano mas não existe no banco.

**Motivo.** Nenhuma tela depende dela, então criar depois é migração aditiva, sem
mexer no que já estiver funcionando.

**Impacto.** Nada no schema nem na migração inicial cria `metas`. Barras de progresso
de meta são F5.

**Fonte.** `PLANO.md` §3; ausência confirmada em `prisma/schema.prisma` e na migração. **implementada**

### DEC-023 — Sem CRM e sem integração automática

**Decisão.** Não há integração automática com CRM nem com Google. Os dados entram
manualmente pela área administrativa, incluindo as avaliações Google.

**Motivo.** O volume comporta entrada manual, e integração exigiria contrato de dados
externo antes de o sistema existir.

**Impacto.** `AVALIACAO_GOOGLE` é um tipo de lançamento como qualquer outro, digitado
à mão.

**Fonte.** `PLANO.md` §1 e §3. **implementada**

### DEC-024 — Sem multi-tenant

**Decisão.** O sistema atende uma imobiliária. Não há noção de organização ou de
isolamento por cliente.

**Motivo.** Multi-tenant contamina todo o modelo de dados e toda consulta; não há
demanda para isso.

**Impacto.** Nenhuma tabela tem coluna de tenant.

**Fonte.** `prisma/schema.prisma`; `PLANO.md` §1. **implementada**

### DEC-025 — Sem múltiplos usuários na v1

**Decisão.** Um acesso administrativo, sem papéis nem permissões.

**Motivo.** Um operador só; papéis seriam complexidade sem uso.

**Impacto.** Ver DEC-016. Não há tela de convite, de papéis nem de permissão.

**Fonte.** `PLANO.md` §3. **implementada**

### DEC-026 — Sem notificações

**Decisão.** Não há e-mail, push nem alerta de qualquer espécie.

**Motivo.** O produto é uma tela na parede; quem precisa do dado está olhando para
ele.

**Impacto.** Nenhuma dependência de serviço de envio. Inclui a recuperação de senha:
não existe "esqueci minha senha" por e-mail — a troca é pela DEC-020.

**Fonte.** `PLANO.md` §5; ausência de dependência de envio em `package.json`. **implementada**

---

## Sequenciamento

### DEC-027 — O protótipo visual é portado, não redesenhado

**Decisão.** Existe um HTML de referência produzido fora do repositório, em uma
sessão do Claude.ai. A implementação visual parte dele.

**Motivo.** O HTML carrega decisões de layout já tomadas e aprovadas. Redesenhar do
zero as descartaria e produziria uma terceira versão do mesmo painel.

**Impacto.** O HTML foi auditado regra a regra antes da implementação — cores, grid,
paddings, tracking, réguas, marcadores e temporização — e o desenho foi portado, não
recriado. O port está feito: `/preview` existe. As divergências deliberadas em
relação ao original estão registradas no handoff. O HTML segue fora do repositório,
como referência de consulta.

**Fonte.** HTML de referência auditado (SHA-256
`9b6b875093b3f4940c698d7bf9af9905835fe9841d847350ff096d53b9d5bd10`);
`src/app/preview/page.tsx`; commit `22bf943`. **implementada**

### DEC-028 — F2 precede F3

**Decisão.** A administração vem antes do painel.

**Motivo.** Sem CRUD não há como alimentar o sistema de verdade, e o painel ficaria
sendo validado contra dados inventados.

**Impacto.** Ao fim da F2 é possível operar o sistema mesmo sem painel pronto — e é
exatamente onde o projeto está: equipes, corretores, lançamentos e saldo histórico
podem ser alimentados, com o painel ainda desligado do banco.

**Fonte.** `PLANO.md` §9; commits `bee7df7` a `485ba36`. **cumprida**

### DEC-029 — F3 depende da F2 e do protótipo

**Decisão.** O painel real só começa com a administração funcionando e o protótipo
portado.

**Motivo.** A F3 junta duas coisas que precisam já existir: dados reais e o layout
aprovado.

**Impacto.** O port do protótipo pode usar dados fictícios; o painel de F3, não. As
duas pré-condições estão satisfeitas — administração pronta e protótipo portado —,
então a F3 está liberada para começar. Ela própria continua não iniciada.

**Fonte.** `PLANO.md` §9; commits `22bf943` e `485ba36`.
**invariante futura** — pré-condições cumpridas, F3 ainda não começou

### DEC-030 — F4 depende da F3

**Decisão.** Identidade final e modo TV entram depois do painel funcionando.

**Motivo.** Ajuste fino de tipografia, escala 4K e transições precisa de uma tela real
para ser ajustado.

**Impacto.** Os tokens de cor já existem em `src/app/globals.css` desde a F1; o
restante da identidade — tipografia, escala, transições, comportamento offline,
quiosque — é F4.

**Fonte.** `PLANO.md` §9; `src/app/globals.css`. **invariante futura**

---

## Decisões de stack que valem lembrar

### DEC-031 — Prisma 7: URLs fora do `schema.prisma`

**Decisão.** Migrações e introspecção leem `datasource.url` do `prisma.config.ts`
(`DIRECT_URL`); a aplicação em runtime conecta pelo driver adapter em `src/lib/db.ts`
(`DATABASE_URL`, pooler).

**Motivo.** É como o Prisma 7 funciona, e o pooler em modo transaction derruba os
advisory locks que o schema engine usa nas migrações.

**Impacto.** São duas URLs, com papéis distintos, e trocá-las de lugar quebra as
migrações de um jeito difícil de diagnosticar. O cliente gerado fica em
`src/generated/prisma`, fora do Git, recriado pelo `postinstall`.

**Fonte.** `prisma.config.ts`; `src/lib/db.ts`; `prisma/schema.prisma`. **implementada**

### DEC-032 — O middleware se chama `proxy`

**Decisão.** O middleware da aplicação é `src/proxy.ts`.

**Motivo.** O Next 16 renomeou a convenção; `middleware.ts` não é mais o nome do
arquivo.

**Impacto.** Procurar por `middleware.ts` não encontra nada. A proteção de `/admin`
mora em `src/proxy.ts`.

**Fonte.** `src/proxy.ts`. **implementada**

### DEC-033 — O ciclo dos quadros usa oito métricas

**Decisão.** Os quadros das três equipes percorrem **oito** métricas, na ordem do
protótipo: vendidos, VGV, locados, captação de venda, exclusividades, captação de
locação, propostas e avaliações Google. Cada etapa dura 20 segundos, o que dá uma
volta completa de 160 s — 2min40s. As três equipes compartilham o mesmo índice
ativo e trocam em sincronia.

**Motivo.** O `PLANO.md` §5.2 diz "Ciclo de 7 métricas × 20 segundos = 2min20s",
mas a frase seguinte enumera oito. O HTML de referência e o port usam oito. A
contagem de sete é o erro; a enumeração é que está certa.

**Impacto.** A F3 preserva esse comportamento, salvo decisão posterior explícita.
Não confundir com o cálculo real: a rotação é apresentação, e a origem dos valores
continua sendo responsabilidade da DEC-013. O quadro "mensal geral" segue com sete
linhas — ali o VGV não entra, porque tem faixa própria.

**Fonte.** HTML de referência auditado; `src/lib/mock-painel.ts`;
`src/components/painel/quadros-equipe.tsx`; commit `22bf943`.
**implementada no protótipo**

### DEC-034 — Editar um lançamento não recalcula a equipe histórica

**Decisão.** Ao editar um lançamento, a equipe gravada nele só muda por decisão
explícita do operador, e apenas entre duas opções:

- **corretor inalterado** — a equipe armazenada é preservada literalmente,
  qualquer que seja a equipe atual dele hoje;
- **corretor trocado, equipe atual igual à armazenada** — preserva, sem perguntar;
- **corretor trocado, equipes diferentes** — o sistema pergunta: *preservar* a
  equipe registrada ou *corrigir* para a equipe atual do novo corretor.

Não existe terceira equipe escolhível, e nenhum campo de equipe é enviado pelo
formulário.

**Motivo.** O sistema não guarda o histórico de qual corretor esteve em qual equipe
em cada data. Logo, a equipe atual de um corretor **não prova** qual era a equipe
verdadeira na data do evento. Recalcular sozinho seria adivinhar, e adivinhar move
crédito de produção entre equipes.

**Impacto.** Corrigir um valor, uma data ou uma observação nunca reescreve crédito
de equipe. A equipe resultante sai sempre da função pura sobre o que o banco diz no
momento do submit; o campo escondido que acompanha a escolha serve só para detectar
que a situação mudou desde a pergunta — se mudou, a resposta antiga é recusada e o
conflito é reapresentado com os dados atuais.

**Fonte.** Q7, aprovada pelo proprietário em 2026-08-12 (Recomendação C);
`src/lib/lancamento-equipe.ts`; `src/app/admin/lancamentos/acoes.ts`;
`tests/lancamento-equipe.test.ts`;
`tests/integracao/lancamentos-edicao.integracao.test.ts`; commit `caa151f`.
**implementada**

### DEC-035 — Saldo histórico só existe para vendas e avaliações, uma linha por tipo

**Decisão.** `saldo_historico` é o saldo de **abertura** dos big numbers. Na v1 ele
existe apenas para `VENDA` e `AVALIACAO_GOOGLE`, com no máximo **uma linha por
tipo**, garantida por índice único no banco.

- `VENDA` — quantidade > 0 e `valorTotal` > 0;
- `AVALIACAO_GOOGLE` — quantidade > 0 e `valorTotal` sempre `0.00`;
- `dataCorte` obrigatória, como data civil;
- o tipo de um saldo cadastrado **não muda**.

**Motivo.** Os outros cinco tipos do enum não têm acumulado anterior a registrar
nesta versão. A unicidade vive no banco porque conferir antes de inserir abriria
corrida entre o `SELECT` e o `INSERT`. Avaliação é contagem, não dinheiro — guardar
valor ali convidaria a somá-lo depois.

**Impacto administrativo.** A área administrativa cria, edita e remove o saldo.
Ausência é diferente de zero: um tipo sem linha aparece como "Não cadastrado", nunca
como `0`, e nenhuma linha zerada é criada automaticamente. A exclusão existe
justamente por isso — sem ela, um saldo criado por engano só poderia ser zerado, o
que afirmaria um acumulado que ninguém apurou.

**Impacto no cálculo — ainda futuro.** Como o saldo entra nos acumulados e nunca em
recortes de período, isso é responsabilidade da F3 (ver DEC-004). Nada na F2 soma
saldo com lançamento.

**Fonte.** Q8, aprovada pelo proprietário em 2026-08-12; `prisma/schema.prisma`;
`prisma/migrations/20260812120000_saldo_historico_tipo_unico/`;
`src/lib/validacao/saldo-historico.ts`; commit `485ba36`.
**implementada na administração** — o uso nos cálculos continua sendo F3

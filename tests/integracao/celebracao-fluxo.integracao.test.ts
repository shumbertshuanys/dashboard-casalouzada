import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, describe, it } from "node:test";
import { GET } from "@/app/painel/[token]/celebracao/route";
import { exigirAdministradorAtivo } from "@/lib/admin/guarda";
import {
  buscarUltimaVendaCadastrada,
  celebrarSemBloquear,
  listarCelebracoesRecentes,
  registrarCelebracao,
} from "@/lib/celebracao";
import { paraRespostaCelebracoes } from "@/lib/contrato-celebracao";
import { prisma as prismaDaAplicacao } from "@/lib/db";
import type { PrismaClient } from "@/generated/prisma/client";
import { paraDataCivil } from "@/lib/datas";
import { criarPrismaTeste, urlBancoTeste } from "../helpers/banco-teste";

/**
 * Fluxo da celebração (C2) contra o PostgreSQL **local**: disparo automático,
 * disparo manual e o endpoint da TV.
 *
 * **Esta suíte não commita nada.** Todo teste que depende de dado no banco roda
 * dentro de uma transação revertida no final. Não é preciosismo: é o que torna
 * o arquivo determinístico ao lado dos outros.
 *
 * O motivo é concreto. `tests/integracao/celebracao.integracao.test.ts` (C1) faz
 * `celebracao.deleteMany({})` — limpeza **global** da tabela — em seis pontos,
 * porque o teste do teto dele precisa de tabela vazia; e o `node --test` roda os
 * arquivos deste diretório em paralelo. Uma celebração commitada aqui poderia
 * ser apagada no meio de uma asserção de lá ou de cá. Linha não commitada é
 * invisível para o `DELETE` do outro processo, então a disputa deixa de existir
 * — sem reescrever nenhuma asserção aprovada do C1.
 *
 * `tests/integracao-painel/` não serve de alternativa: `painel.integracao.test.ts`
 * exige o banco **globalmente vazio** de corretores, lançamentos, saldos e
 * reservas (o "banco em repouso"), e qualquer fixture desta suíte o derrubaria.
 *
 * As duas exceções à transação estão marcadas onde aparecem, e nenhuma delas
 * escreve: a chamada real à rota (que usa o singleton da aplicação, fora da
 * transação) e a guarda administrativa.
 */

const prisma = criarPrismaTeste();
const PREFIXO = "__C2_TESTE_";
const nome = (sufixo: string) => `${PREFIXO}${sufixo}`;

before(() => {
  // A rota usa o singleton de `src/lib/db.ts`, que lê `DATABASE_URL` do
  // ambiente. Sob `scripts/banco-teste.ts` ela aponta para o banco local
  // validado; esta exigência recusa rodar de qualquer outro jeito, para que um
  // descuido de ambiente não faça um teste de integração falar com produção.
  assert.equal(
    process.env.DATABASE_URL,
    urlBancoTeste(),
    "rode por `npm run test:integracao`: esta suíte toca o singleton da aplicação",
  );
  assert.ok(process.env.PAINEL_TOKEN, "PAINEL_TOKEN_TEST precisa estar em .env.test.local");
});

after(async () => {
  await prisma.$disconnect();
  await prismaDaAplicacao.$disconnect();
});

/** Sinal privado: sai da transação sem que o erro se confunda com uma falha. */
const REVERTER = new Error("__reverter__");

/**
 * Roda o corpo numa transação e desfaz tudo no fim.
 *
 * Falha de asserção continua propagando — só o sinal de reversão é engolido —,
 * então um teste que quebra quebra, e nenhum resíduo fica no banco.
 *
 * O `tx` do Prisma é um `TransactionClient`: tem os delegates que o núcleo usa,
 * mas não os métodos de ciclo de vida do cliente. O cast é local e existe só
 * para não alargar a assinatura do núcleo, que é contrato aprovado no C1.
 */
async function revertendo(corpo: (tx: PrismaClient) => Promise<void>): Promise<void> {
  try {
    await prisma.$transaction(
      async (tx) => {
        await corpo(tx as unknown as PrismaClient);
        throw REVERTER;
      },
      // `REPEATABLE READ`, e não o `READ COMMITTED` padrão, por uma razão
      // medida: o Prisma resolve `select` aninhado em **mais de uma consulta** —
      // primeiro as celebrações, depois os lançamentos delas. Sob READ
      // COMMITTED cada consulta pega um snapshot novo, então a suíte do C1,
      // rodando em paralelo, podia apagar um lançamento entre as duas e fazer a
      // relação voltar `null` para uma linha já lida. O sintoma era
      // `Cannot read properties of null (reading 'valor')` dentro do núcleo,
      // reproduzido 1 vez em 12 execuções.
      //
      // Com um snapshot só para a transação inteira, as duas consultas
      // enxergam o mesmo banco e a corrida deixa de existir. Não é `sleep`,
      // retry nem timeout maior: é a leitura passar a ser consistente, que é o
      // que ela sempre precisou ser.
      { isolationLevel: "RepeatableRead" },
    );
  } catch (erro) {
    if (erro !== REVERTER) throw erro;
  }
}

/**
 * Um instante de leitura adiantado, com carimbos logo antes dele.
 *
 * A leitura do núcleo é global e limitada às `MAXIMO_CELEBRACOES_RECENTES` mais
 * recentes. As outras suítes criam celebrações com `now()` o tempo todo — a do
 * C1 chega a criar doze de uma vez —, e as desta suíte podiam ser empurradas
 * para fora do teto antes de serem verificadas.
 *
 * Adiantar o relógio da leitura em um minuto e carimbar as celebrações logo
 * abaixo dele garante que elas sejam as mais recentes do banco, e portanto
 * sempre estejam dentro do corte. Continuam folgadamente dentro da janela de
 * cinco minutos, que é o que o teste quer exercitar.
 */
function relogioAdiantado() {
  const agora = new Date(Date.now() + 60_000);
  return { agora, em: (segundosAntes: number) => new Date(agora.getTime() - segundosAntes * 1_000) };
}

async function criarEquipe(tx: PrismaClient, sufixo: string) {
  return tx.equipe.create({
    data: { nome: nome(`Equipe ${sufixo}`), gerenteNome: "C2", ordemExibicao: 93 },
  });
}

async function criarCorretor(tx: PrismaClient, sufixo: string, equipeId: string) {
  return tx.corretor.create({
    data: { nomeCompleto: nome(`Corretor ${sufixo}`), nomeExibicao: `C2 ${sufixo}`, equipeId },
  });
}

type Participante = { corretorId: string; equipeId: string };

/**
 * O `create` da venda **na mesma forma que a action usa**: campos antigos
 * `NULL`, elenco aninhado na mesma transação, e `select: { id: true }` — é dele
 * que sai o id do disparo.
 */
async function criarVenda(
  tx: PrismaClient,
  sufixo: string,
  participantes: readonly Participante[],
  extras: { valor?: string; criadoEm?: Date; imovelRef?: string | null } = {},
) {
  return tx.lancamento.create({
    data: {
      tipo: "VENDA",
      corretorId: null,
      equipeId: null,
      dataReferencia: paraDataCivil("2026-08-10"),
      valor: extras.valor ?? "900000.00",
      imovelRef: extras.imovelRef === undefined ? nome(sufixo) : extras.imovelRef,
      ...(extras.criadoEm === undefined ? {} : { criadoEm: extras.criadoEm }),
      participacoes: {
        create: participantes.map((participante, indice) => ({
          corretorId: participante.corretorId,
          equipeId: participante.equipeId,
          ordem: indice + 1,
        })),
      },
    },
    select: { id: true },
  });
}

/** Um lançamento de participante único, como o ramo `else` da action grava. */
async function criarEventoIndividual(
  tx: PrismaClient,
  sufixo: string,
  tipo: "LOCACAO" | "PROPOSTA" | "CAPTACAO_VENDA" | "CAPTACAO_EXCLUSIVA" | "AVALIACAO_GOOGLE",
  corretorId: string,
  equipeId: string,
) {
  return tx.lancamento.create({
    data: {
      tipo,
      corretorId,
      equipeId,
      dataReferencia: paraDataCivil("2026-08-10"),
      valor: tipo === "LOCACAO" ? "3500.00" : null,
      valorProposta: tipo === "PROPOSTA" ? "800000.00" : null,
      statusProposta: tipo === "PROPOSTA" ? "AGUARDANDO" : null,
      imovelRef: nome(sufixo),
    },
    select: { id: true },
  });
}

const elencoDe = (tx: PrismaClient, lancamentoId: string) =>
  tx.participacaoVenda.findMany({
    where: { lancamentoId },
    orderBy: { ordem: "asc" },
    select: { id: true, corretorId: true, equipeId: true, ordem: true },
  });

const FONTE_ACOES = "src/app/admin/lancamentos/acoes.ts";

/**
 * A fonte da action, com as quebras normalizadas.
 *
 * O repositório guarda LF e o checkout no Windows entrega CRLF: sem normalizar,
 * uma asserção estrutural passaria numa máquina e falharia na outra por causa de
 * um `\r` invisível.
 */
const lerFonte = (caminho: string) => readFileSync(caminho, "utf8").replace(/\r\n/g, "\n");

describe("celebração — fluxo do C2", () => {
  /* T1 ---------------------------------------------------------------- */
  describe("disparo automático", () => {
    /**
     * O contrato que separa o desenho certo do errado.
     *
     * Se o disparo consultasse "última venda" em vez de usar o retorno do
     * `create`, duas pessoas cadastrando ao mesmo tempo veriam a TV comemorar o
     * fato da outra. A armadilha é montada de propósito: existe uma venda cujo
     * `criadoEm` é maior que o de todas as outras, então
     * `buscarUltimaVendaCadastrada` responde **ela**. O alvo é outro — e é o
     * alvo que tem de ser celebrado.
     */
    it("celebra o id devolvido pelo create, não o da consulta por última venda", async () => {
      await revertendo(async (tx) => {
        const equipe = await criarEquipe(tx, "t1");
        const corretor = await criarCorretor(tx, "t1", equipe.id);

        // A isca: adiantada no tempo, é a "última venda cadastrada" do banco.
        const isca = await criarVenda(tx, "t1isca", [
          { corretorId: corretor.id, equipeId: equipe.id },
        ], { criadoEm: new Date("2099-01-01T00:00:00.000Z") });

        // O alvo: cadastrado agora, como a action faz.
        const alvo = await criarVenda(tx, "t1alvo", [
          { corretorId: corretor.id, equipeId: equipe.id },
        ]);
        const celebrou = await celebrarSemBloquear(tx, alvo.id);

        assert.equal(celebrou, true);

        const ultima = await buscarUltimaVendaCadastrada(tx);
        assert.equal(ultima?.id, isca.id, "a consulta por última venda aponta para a isca");
        assert.notEqual(alvo.id, isca.id);

        assert.equal(
          await tx.celebracao.count({ where: { lancamentoId: alvo.id } }),
          1,
          "o alvo foi celebrado",
        );
        assert.equal(
          await tx.celebracao.count({ where: { lancamentoId: isca.id } }),
          0,
          "a isca não foi celebrada",
        );
      });
    });

    /**
     * Evidência estrutural da fiação dentro da action.
     *
     * `src/app/admin/lancamentos/acoes.ts` **não é importável** neste harness:
     * ele importa `next/navigation`, que carrega o runtime de cliente do React e
     * estoura com `_react.default.createContext is not a function`. Sem poder
     * invocar a action, o que resta para fixar a posição da chamada é a forma do
     * arquivo. É frágil de propósito reconhecido: se alguém mover a chamada,
     * este teste quebra e pede revisão em vez de deixar passar.
     */
    it("a chamada fica no ramo VENDA, depois do create e antes do else", () => {
      const fonte = lerFonte(FONTE_ACOES);

      assert.equal(
        fonte.split("celebrarSemBloquear(").length - 1,
        1,
        "um disparo automático, num lugar só",
      );

      const abreVenda = fonte.indexOf('if (validado.dados.tipo === "VENDA") {');
      const create = fonte.indexOf("const venda = await prisma.lancamento.create(", abreVenda);
      const disparo = fonte.indexOf("await celebrarSemBloquear(prisma, venda.id);", create);
      const fechaVenda = fonte.indexOf("} else {", abreVenda);

      assert.ok(abreVenda >= 0, "o ramo VENDA existe");
      assert.ok(create > abreVenda, "o create está dentro do ramo VENDA");
      assert.ok(disparo > create, "a celebração vem DEPOIS do create comercial");
      assert.ok(disparo < fechaVenda, "e continua dentro do ramo VENDA — nenhum outro tipo passa");
    });

    it("o id celebrado sai do create, não de uma releitura", () => {
      const fonte = lerFonte(FONTE_ACOES);
      const criar = fonte.slice(
        fonte.indexOf("export async function criarLancamento("),
        fonte.indexOf("/* Edição"),
      );

      assert.equal(
        criar.includes("buscarUltimaVendaCadastrada"),
        false,
        "o cadastro nunca pergunta ao banco qual foi a última venda",
      );
      assert.equal(criar.includes("select: { id: true }"), true, "o create devolve o id");
    });
  });

  /* T2 ---------------------------------------------------------------- */
  describe("cardinalidade", () => {
    it("venda compartilhada: N participações, uma celebração só", async () => {
      await revertendo(async (tx) => {
        const equipeX = await criarEquipe(tx, "t2X");
        const equipeY = await criarEquipe(tx, "t2Y");
        const a = await criarCorretor(tx, "t2a", equipeX.id);
        const b = await criarCorretor(tx, "t2b", equipeX.id);
        const c = await criarCorretor(tx, "t2c", equipeY.id);

        const venda = await criarVenda(tx, "t2", [
          { corretorId: a.id, equipeId: equipeX.id },
          { corretorId: b.id, equipeId: equipeX.id },
          { corretorId: c.id, equipeId: equipeY.id },
        ]);
        await celebrarSemBloquear(tx, venda.id);

        assert.equal(
          await tx.participacaoVenda.count({ where: { lancamentoId: venda.id } }),
          3,
          "três participações",
        );
        assert.equal(
          await tx.celebracao.count({ where: { lancamentoId: venda.id } }),
          1,
          "uma celebração — não uma por participante",
        );
      });
    });
  });

  /* T3 ---------------------------------------------------------------- */
  describe("tipos não-VENDA", () => {
    it("nenhum evento de participante único gera celebração", async () => {
      await revertendo(async (tx) => {
        const equipe = await criarEquipe(tx, "t3");
        const corretor = await criarCorretor(tx, "t3", equipe.id);

        // O ramo `else` da action grava o lançamento e mais nada — a ausência
        // da chamada lá é o que o teste estrutural do T1 fixa. Aqui se confirma
        // a consequência no banco.
        const tipos = [
          "LOCACAO",
          "PROPOSTA",
          "CAPTACAO_VENDA",
          "CAPTACAO_EXCLUSIVA",
          "AVALIACAO_GOOGLE",
        ] as const;

        for (const tipo of tipos) {
          const criado = await criarEventoIndividual(tx, `t3${tipo}`, tipo, corretor.id, equipe.id);
          assert.equal(
            await tx.celebracao.count({ where: { lancamentoId: criado.id } }),
            0,
            `${tipo} não celebra`,
          );
        }

        assert.equal(
          await tx.celebracao.count({
            where: { lancamento: { imovelRef: { startsWith: PREFIXO }, tipo: { not: "VENDA" } } },
          }),
          0,
          "nenhuma celebração desta suíte aponta para lançamento que não seja VENDA",
        );
      });
    });
  });

  /* T4 — bloqueante --------------------------------------------------- */
  describe("falha da celebração não invalida a venda", () => {
    it("engole a falha, devolve false e deixa o fato comercial intacto", async () => {
      await revertendo(async (tx) => {
        const equipe = await criarEquipe(tx, "t4");
        const a = await criarCorretor(tx, "t4a", equipe.id);
        const b = await criarCorretor(tx, "t4b", equipe.id);

        const venda = await criarVenda(tx, "t4", [
          { corretorId: a.id, equipeId: equipe.id },
          { corretorId: b.id, equipeId: equipe.id },
        ]);

        const antes = await tx.lancamento.findUniqueOrThrow({ where: { id: venda.id } });
        const elencoAntes = await elencoDe(tx, venda.id);

        // Um cliente que só sabe falhar. É o menor seam possível: nada de mock
        // framework, nada de refatorar a action — só um `celebracao.create` que
        // rejeita, que é o modo de falha real (banco fora do ar, privilégio
        // faltando, FK violada).
        const clienteQueFalha = {
          celebracao: {
            create: async () => {
              throw new Error("falha simulada de banco na gravação da celebração");
            },
          },
        } as unknown as PrismaClient;

        const avisos: unknown[][] = [];
        const warnOriginal = console.warn;
        console.warn = (...args: unknown[]) => void avisos.push(args);

        let resultado: boolean;
        try {
          // Não lança: é isso que impede a action de transformar uma venda já
          // persistida em erro de tela.
          resultado = await celebrarSemBloquear(clienteQueFalha, venda.id);
        } finally {
          console.warn = warnOriginal;
        }

        assert.equal(resultado, false, "a falha é reportada por retorno, não por exceção");

        // O log é genérico: uma frase e nada mais. Sem erro anexado, sem stack,
        // sem string de conexão, sem token.
        assert.equal(avisos.length, 1);
        assert.deepEqual(avisos[0], ["Registro da celebração da venda falhou."]);
        const logado = JSON.stringify(avisos);
        for (const proibido of ["postgres", "://", "senha", "password", "    at "]) {
          assert.equal(logado.includes(proibido), false, `o log não pode conter "${proibido}"`);
        }

        // E a venda continua exatamente onde estava.
        const depois = await tx.lancamento.findUniqueOrThrow({ where: { id: venda.id } });
        assert.equal(depois.tipo, "VENDA");
        assert.equal(depois.valor?.toFixed(2), antes.valor?.toFixed(2));
        assert.equal(
          depois.atualizadoEm.toISOString(),
          antes.atualizadoEm.toISOString(),
          "o lançamento não foi tocado pela falha",
        );
        assert.deepEqual(await elencoDe(tx, venda.id), elencoAntes, "participações idênticas");
        assert.equal(
          await tx.celebracao.count({ where: { lancamentoId: venda.id } }),
          0,
          "nenhuma celebração foi gravada",
        );
      });
    });

    it("no caminho feliz devolve true e grava exatamente uma", async () => {
      await revertendo(async (tx) => {
        const equipe = await criarEquipe(tx, "t4ok");
        const corretor = await criarCorretor(tx, "t4ok", equipe.id);
        const venda = await criarVenda(tx, "t4ok", [
          { corretorId: corretor.id, equipeId: equipe.id },
        ]);

        assert.equal(await celebrarSemBloquear(tx, venda.id), true);
        assert.equal(await tx.celebracao.count({ where: { lancamentoId: venda.id } }), 1);
      });
    });

    it("o disparo automático ignora o retorno — o cadastro segue igual nos dois casos", () => {
      const fonte = lerFonte(FONTE_ACOES);
      const criar = fonte.slice(
        fonte.indexOf("export async function criarLancamento("),
        fonte.indexOf("/* Edição"),
      );

      // Nenhum `if` pendura o resultado do cadastro no sucesso da celebração:
      // a chamada é um statement solto, e o `return` de sucesso vem depois de
      // qualquer que tenha sido o resultado dela.
      assert.match(criar, /\n\s*await celebrarSemBloquear\(prisma, venda\.id\);\n/);
      assert.equal(
        /(if|const|let|var|return)[^\n]*celebrarSemBloquear/.test(criar),
        false,
        "o retorno da celebração não decide nada no cadastro",
      );
    });
  });

  /* T5 e T6 ----------------------------------------------------------- */
  describe("disparo manual", () => {
    it("dois acionamentos geram dois eventos distintos, sem tocar na venda", async () => {
      await revertendo(async (tx) => {
        const equipe = await criarEquipe(tx, "t5");
        const a = await criarCorretor(tx, "t5a", equipe.id);
        const b = await criarCorretor(tx, "t5b", equipe.id);

        // Adiantada no tempo para ser, com certeza, a última cadastrada do
        // banco — as suítes rodam em paralelo e outras criam VENDA o tempo todo.
        const venda = await criarVenda(
          tx,
          "t5",
          [
            { corretorId: a.id, equipeId: equipe.id },
            { corretorId: b.id, equipeId: equipe.id },
          ],
          { criadoEm: new Date("2099-06-01T00:00:00.000Z") },
        );

        const antes = await tx.lancamento.findUniqueOrThrow({ where: { id: venda.id } });
        const elencoAntes = await elencoDe(tx, venda.id);

        // O miolo da action manual: núcleo, nunca consulta reescrita.
        const primeira = await buscarUltimaVendaCadastrada(tx);
        assert.equal(primeira?.id, venda.id);
        const eventoUm = await registrarCelebracao(tx, primeira!.id);
        assert.equal(await tx.celebracao.count({ where: { lancamentoId: venda.id } }), 1);

        const segunda = await buscarUltimaVendaCadastrada(tx);
        assert.equal(segunda?.id, venda.id);
        const eventoDois = await registrarCelebracao(tx, segunda!.id);
        assert.equal(await tx.celebracao.count({ where: { lancamentoId: venda.id } }), 2);

        assert.notEqual(eventoUm.id, eventoDois.id, "identidades distintas — não é o mesmo evento");

        const depois = await tx.lancamento.findUniqueOrThrow({ where: { id: venda.id } });
        assert.equal(depois.valor?.toFixed(2), antes.valor?.toFixed(2));
        assert.equal(depois.atualizadoEm.toISOString(), antes.atualizadoEm.toISOString());
        assert.deepEqual(await elencoDe(tx, venda.id), elencoAntes);
      });
    });

    /**
     * O ramo "sem venda" não pode ser provado esvaziando `lancamentos`: as
     * suítes rodam em paralelo e apagar as vendas das outras destruiria o
     * isolamento delas. O que se prova é a decisão em si, com um cliente que
     * responde o que um banco vazio responderia, e que nada foi escrito.
     */
    it("sem venda aplicável: null do núcleo, nenhuma escrita", async () => {
      await revertendo(async (tx) => {
        const clienteSemVenda = {
          lancamento: { findFirst: async () => null },
        } as unknown as PrismaClient;

        const ultima = await buscarUltimaVendaCadastrada(clienteSemVenda);

        assert.equal(ultima, null, "o núcleo devolve null em vez de lançar");
        assert.equal(
          await tx.celebracao.count({
            where: { lancamento: { imovelRef: { startsWith: PREFIXO } } },
          }),
          0,
          "nada foi gravado",
        );
      });
    });

    it("o resultado sem venda é controlado, não exceção", () => {
      const fonte = lerFonte(FONTE_ACOES);
      const manual = fonte.slice(fonte.indexOf("export async function comemorarUltimaVenda("));

      assert.match(manual, /if \(ultima === null\) \{[\s\S]*?return \{ mensagem:/);
      assert.equal(manual.includes("throw"), false, "o estado normal não vira erro");
    });
  });

  /* T7 ---------------------------------------------------------------- */
  describe("guarda administrativa", () => {
    /**
     * A action manual chama `exigirAdministradorAtivo()` na primeira linha. A
     * action em si não é importável aqui (ver o teste estrutural do T1), mas a
     * guarda é — e o que importa provar é que ela **falha fechado**: sem
     * contexto de requisição não existe cookie, e sem cookie ela lança antes de
     * autorizar. Um caminho que dependa dela não chega a escrever.
     *
     * Fora de transação de propósito: a guarda não escreve, e o que se mede é
     * que ela nem chega ao banco.
     */
    it("fora de um contexto autorizado a guarda lança", async () => {
      await assert.rejects(
        () => exigirAdministradorAtivo(),
        /request scope|Acesso administrativo negado/,
        "a guarda nunca devolve administrador sem sessão",
      );
    });

    it("a guarda é a primeira linha da action manual", () => {
      const fonte = lerFonte(FONTE_ACOES);
      const manual = fonte.slice(fonte.indexOf("export async function comemorarUltimaVenda("));

      const guarda = manual.indexOf("await exigirAdministradorAtivo();");
      const leitura = manual.indexOf("await buscarUltimaVendaCadastrada(");
      const escrita = manual.indexOf("await registrarCelebracao(");

      assert.ok(guarda > 0, "a guarda está no corpo da action");
      assert.ok(guarda < leitura, "nenhuma leitura acontece antes da guarda");
      assert.ok(guarda < escrita, "nenhuma escrita acontece antes da guarda");
    });
  });

  /* T9 ---------------------------------------------------------------- */
  describe("endpoint da TV", () => {
    const contexto = (token: string) => ({ params: Promise.resolve({ token }) });
    const requisicao = (token: string) =>
      new Request(`http://localhost/painel/${encodeURIComponent(token)}/celebracao`);

    /**
     * O conteúdo do payload, provado sobre o par que a rota compõe.
     *
     * A rota é `paraRespostaCelebracoes(await listarCelebracoesRecentes(prisma,
     * agora))` — é esse par que decide o que a TV recebe. Aqui ele roda contra o
     * banco real, dentro da transação, o que permite afirmar pluralidade, ordem
     * e elenco sem commitar linha nenhuma. A chamada real ao handler está logo
     * abaixo, e prova o que só ela pode: status, cabeçalho e envelope.
     */
    it("plural, em ordem, com o elenco de cada venda", async () => {
      await revertendo(async (tx) => {
        const equipeX = await criarEquipe(tx, "t9X");
        const equipeY = await criarEquipe(tx, "t9Y");
        const a = await criarCorretor(tx, "t9a", equipeX.id);
        const b = await criarCorretor(tx, "t9b", equipeY.id);

        const vendaA = await criarVenda(tx, "t9a", [{ corretorId: a.id, equipeId: equipeX.id }], {
          valor: "1250000.00",
        });
        const vendaB = await criarVenda(tx, "t9b", [
          { corretorId: b.id, equipeId: equipeY.id },
          { corretorId: a.id, equipeId: equipeX.id },
        ]);

        const { agora, em } = relogioAdiantado();
        const primeira = await tx.celebracao.create({
          data: { lancamentoId: vendaA.id, criadoEm: em(40) },
          select: { id: true },
        });
        const segunda = await tx.celebracao.create({
          data: { lancamentoId: vendaB.id, criadoEm: em(20) },
          select: { id: true },
        });

        const { celebracoes } = paraRespostaCelebracoes(
          await listarCelebracoesRecentes(tx, agora),
        );

        // Filtrado às desta suíte: a leitura é da tabela inteira, e outras
        // celebrações recentes podem existir legitimamente.
        const minhas = celebracoes.filter((c) => c.id === primeira.id || c.id === segunda.id);

        assert.equal(minhas.length, 2, "as duas atravessaram — o payload é plural");
        assert.deepEqual(
          minhas.map((c) => c.id),
          [primeira.id, segunda.id],
          "ordem de exibição: mais antiga → mais nova",
        );

        const [umaSo, compartilhada] = minhas;
        assert.equal(umaSo.valor, "1250000.00", "dinheiro como string canônica");
        assert.deepEqual(umaSo.participantes, [
          { ordem: 1, corretorNome: "C2 t9a", equipeNome: nome("Equipe t9X") },
        ]);
        assert.deepEqual(
          compartilhada.participantes,
          [
            { ordem: 1, corretorNome: "C2 t9b", equipeNome: nome("Equipe t9Y") },
            { ordem: 2, corretorNome: "C2 t9a", equipeNome: nome("Equipe t9X") },
          ],
          "venda compartilhada atravessa inteira, na ordem de ParticipacaoVenda",
        );

        for (const celebracao of minhas) {
          assert.match(celebracao.criadoEm, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
          assert.equal("lancamentoId" in celebracao, false);
        }
      });
    });

    /**
     * A chamada real ao handler, contra o banco de verdade.
     *
     * Fora da transação — o singleton da aplicação tem conexão própria e não
     * enxergaria linha não commitada. Por isso este teste não planta dado: ele
     * afirma o que independe do conteúdo, e cada item que voltar tem de
     * respeitar o contrato de fio. Se a tabela estiver vazia, um envelope com
     * lista vazia continua sendo a resposta certa.
     */
    it("token válido: 200, sem cache, envelope no contrato", async () => {
      const resposta = await GET(
        requisicao(process.env.PAINEL_TOKEN!),
        contexto(process.env.PAINEL_TOKEN!),
      );

      assert.equal(resposta.status, 200);
      assert.equal(
        resposta.headers.get("Cache-Control"),
        "no-store",
        "celebração é efêmera: nenhum intermediário pode reservir",
      );

      const corpo = (await resposta.json()) as {
        celebracoes: {
          id: string;
          criadoEm: string;
          valor: string | null;
          imovelRef: string | null;
          participantes: { ordem: number; corretorNome: string; equipeNome: string }[];
        }[];
      };

      assert.deepEqual(Object.keys(corpo), ["celebracoes"], "o envelope tem um campo só");
      assert.equal(Array.isArray(corpo.celebracoes), true);

      for (const celebracao of corpo.celebracoes) {
        assert.deepEqual(Object.keys(celebracao).sort(), [
          "criadoEm",
          "id",
          "imovelRef",
          "participantes",
          "valor",
        ]);
        assert.match(celebracao.criadoEm, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
        assert.ok(celebracao.participantes.length > 0, "toda celebração exibida tem elenco");
        for (const participante of celebracao.participantes) {
          assert.equal(typeof participante.ordem, "number");
          assert.equal(typeof participante.corretorNome, "string");
          assert.equal(typeof participante.equipeNome, "string");
        }
      }
    });

    /**
     * O imóvel vem do lançamento pela relação — não há cópia, snapshot nem
     * coluna nova. O que se prova aqui é o caminho inteiro contra o banco: o
     * que está gravado em `lancamentos.imovel_ref` chega ao payload da TV, e a
     * ausência chega como `null` em vez de string vazia.
     */
    it("o imóvel do lançamento atravessa; ausência e branco viram null", async () => {
      await revertendo(async (tx) => {
        const equipe = await criarEquipe(tx, "t9im");
        const corretor = await criarCorretor(tx, "t9im", equipe.id);
        const participantes = [{ corretorId: corretor.id, equipeId: equipe.id }];

        const comImovel = await criarVenda(tx, "t9imA", participantes, {
          imovelRef: "Cobertura Ipiranga 900",
        });
        const semImovel = await criarVenda(tx, "t9imB", participantes, { imovelRef: null });
        // Branco no banco: o validador de lançamento já normaliza, mas o banco é
        // mais velho que ele e nada impede uma linha assim.
        const comBranco = await criarVenda(tx, "t9imC", participantes, { imovelRef: "   " });

        const { agora, em } = relogioAdiantado();
        for (const [indice, venda] of [comImovel, semImovel, comBranco].entries()) {
          await tx.celebracao.create({
            data: { lancamentoId: venda.id, criadoEm: em(30 - indice) },
          });
        }

        const { celebracoes } = paraRespostaCelebracoes(
          await listarCelebracoesRecentes(tx, agora),
        );
        const porLancamento = new Map(
          (await listarCelebracoesRecentes(tx, agora)).map((c) => [c.lancamentoId, c.id]),
        );
        const imovelDe = (lancamentoId: string) =>
          celebracoes.find((c) => c.id === porLancamento.get(lancamentoId))?.imovelRef;

        assert.equal(imovelDe(comImovel.id), "Cobertura Ipiranga 900", "o que foi gravado chega");
        assert.equal(imovelDe(semImovel.id), null, "ausência chega como null");
        assert.equal(imovelDe(comBranco.id), null, "branco não atravessa como texto vazio");
      });
    });

    it("token inválido: 404 e corpo vazio", async () => {
      const resposta = await GET(requisicao("token-errado"), contexto("token-errado"));
      assert.equal(resposta.status, 404);
      assert.equal(await resposta.text(), "");
    });
  });
});

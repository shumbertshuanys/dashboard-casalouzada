import "server-only";

import type { PrismaClient } from "@/generated/prisma/client";

/**
 * Celebração de venda — o núcleo server-side do evento de UX.
 *
 * A celebração **não é dado comercial**. Ela não entra em métrica, VGV,
 * ranking, contagem, saldo nem período, e por isso nada deste módulo é chamado
 * por `src/lib/metricas-prisma.ts` ou por `src/lib/leitura-painel.ts`. O que ela
 * faz é registrar que alguém pediu para a TV comemorar, e devolver o que a TV
 * precisa para comemorar.
 *
 * Nada é copiado para `Celebracao`: valor, corretor, equipe e imóvel continuam
 * morando no lançamento e nas participações, e a leitura os alcança pela
 * relação. Um snapshot aqui viraria uma segunda versão do fato comercial, livre
 * para divergir da primeira depois de uma edição — e a TV passaria a exibir um
 * número que o painel já não confirma.
 *
 * O cliente Prisma entra **por parâmetro** (DEC-041), como em
 * `metricas-prisma.ts`: importar o singleton amarraria a camada à
 * `DATABASE_URL` da aplicação e tiraria da integração a chance de exercitar
 * exatamente este código contra o banco local de teste.
 */

/**
 * Quanto tempo uma celebração continua sendo "recente".
 *
 * A TV consulta em intervalo curto; a janela existe para que um evento não
 * ressuscite numa aba aberta horas depois, e para que uma queda de rede de
 * alguns segundos não faça a comemoração se perder.
 */
export const JANELA_CELEBRACAO_MS = 5 * 60 * 1000;

/**
 * Teto de eventos devolvidos numa leitura.
 *
 * Pequeno de propósito: a TV comemora uma venda de cada vez, e uma lista longa
 * só significaria fila. O teto protege a leitura de um pico acidental; a janela
 * é que decide o que é recente.
 */
export const MAXIMO_CELEBRACOES_RECENTES = 10;

/** A identidade do evento registrado — o bastante para o chamador se orientar. */
export type CelebracaoRegistrada = {
  id: string;
  criadoEm: Date;
};

/** A venda mais recentemente **cadastrada**, não a de maior `dataReferencia`. */
export type UltimaVendaCadastrada = {
  id: string;
  criadoEm: Date;
};

/**
 * Um participante da venda, já resolvido para exibição.
 *
 * `equipeNome` vem do snapshot `ParticipacaoVenda.equipeId` — a equipe do
 * momento do fato (DEC-052) —, nunca da lotação de hoje do corretor.
 */
export type ParticipanteCelebracao = {
  ordem: number;
  corretorNome: string;
  equipeNome: string;
};

/**
 * Uma celebração pronta para a tela.
 *
 * `valor` é a string decimal canônica de `src/lib/dinheiro.ts` (`"900000.00"`),
 * pelo mesmo motivo da camada de métricas: um `Decimal(14, 2)` no topo da faixa
 * não cabe exato num double, e `Number` no caminho perderia centavos. `null`
 * quando a venda não tem valor gravado — o schema permite, e esconder isso
 * atrás de um zero inventaria um número.
 */
export type CelebracaoApresentavel = {
  id: string;
  criadoEm: Date;
  lancamentoId: string;
  valor: string | null;
  participantes: ParticipanteCelebracao[];
};

/** O único contrato do `Decimal` do Prisma que esta camada usa. */
type DecimalPrisma = { toFixed(casas: number): string };

/**
 * O `select` da leitura apresentável, num lugar só.
 *
 * Uma consulta, não três: a celebração, a venda e o elenco chegam juntos por
 * `select` aninhado. Encadear `find` da celebração → `find` da venda → `find`
 * das participações multiplicaria as idas ao banco por evento devolvido, e o
 * Prisma resolve isto sem custo de legibilidade.
 */
const SELECT_APRESENTAVEL = {
  id: true,
  criadoEm: true,
  lancamentoId: true,
  lancamento: {
    select: {
      valor: true,
      participacoes: {
        select: {
          ordem: true,
          corretor: { select: { nomeExibicao: true } },
          equipe: { select: { nome: true } },
        },
        orderBy: { ordem: "asc" },
      },
    },
  },
} as const;

type LinhaApresentavel = {
  id: string;
  criadoEm: Date;
  lancamentoId: string;
  lancamento: {
    valor: DecimalPrisma | null;
    participacoes: {
      ordem: number;
      corretor: { nomeExibicao: string };
      equipe: { nome: string };
    }[];
  };
};

function paraApresentavel(linha: LinhaApresentavel): CelebracaoApresentavel {
  return {
    id: linha.id,
    criadoEm: linha.criadoEm,
    lancamentoId: linha.lancamentoId,
    valor: linha.lancamento.valor === null ? null : linha.lancamento.valor.toFixed(2),
    // A ordem vem do banco (`ordem` crescente) e não é rederivada aqui: ela é o
    // que decide quem aparece primeiro na TV, e é a mesma do formulário.
    participantes: linha.lancamento.participacoes.map((participacao) => ({
      ordem: participacao.ordem,
      corretorNome: participacao.corretor.nomeExibicao,
      equipeNome: participacao.equipe.nome,
    })),
  };
}

/**
 * Registra o pedido de comemoração de um lançamento.
 *
 * Escrita mínima e única: uma linha em `celebracoes`. `Lancamento` e
 * `ParticipacaoVenda` **não** são tocados — comemorar não muda o fato
 * comercial, não cria evento derivado e não marca nada como consumido.
 *
 * A FK recusa `lancamentoId` inexistente; quem chama decide o que fazer com
 * isso. Não há validação de tipo aqui de propósito: o filtro de apresentação
 * mora na leitura, num lugar só, e uma celebração órfã de sentido simplesmente
 * não aparece (ver `listarCelebracoesRecentes`).
 */
export async function registrarCelebracao(
  prisma: PrismaClient,
  lancamentoId: string,
): Promise<CelebracaoRegistrada> {
  return prisma.celebracao.create({
    data: { lancamentoId },
    select: { id: true, criadoEm: true },
  });
}

/**
 * Tenta celebrar sem deixar a falha escapar. Devolve se conseguiu.
 *
 * Esta é a fronteira entre o fato comercial e o evento de UX, e ela existe
 * porque a direção da dependência é de mão única: a venda sustenta a
 * celebração, nunca o contrário. Quando o cadastro de uma venda chama isto, a
 * venda **já está persistida** — e uma falha ao gravar a comemoração não pode
 * desfazê-la, transformá-la em erro na tela nem escondê-la do operador. O que
 * se perde numa falha aqui é a animação na TV; a venda continua lá, contando em
 * tudo o que ela conta.
 *
 * Por isso o `catch` engole. É o oposto do resto do projeto — onde exceção
 * continua sendo exceção —, e a exceção à regra é deliberada e local: só vale
 * para o caminho automático, que é acessório ao que o operador pediu. O disparo
 * manual não usa esta função: lá a celebração **é** a operação, e falhar tem de
 * aparecer.
 *
 * O log é uma frase fixa, na convenção dos dois `console.warn` que o projeto já
 * tem. O erro não é anexado de propósito: exceção de inicialização do Prisma
 * carrega a string de conexão na mensagem, e stack trace num log de UX é
 * superfície sem contrapartida.
 */
export async function celebrarSemBloquear(
  prisma: PrismaClient,
  lancamentoId: string,
): Promise<boolean> {
  try {
    await registrarCelebracao(prisma, lancamentoId);
    return true;
  } catch {
    console.warn("Registro da celebração da venda falhou.");
    return false;
  }
}

/**
 * A última venda **cadastrada**, para o futuro botão "Comemorar última venda".
 *
 * A ordem é `criadoEm DESC, id DESC` — o instante do cadastro, não
 * `dataReferencia`. São coisas diferentes: uma venda de junho digitada hoje é a
 * última cadastrada, e é ela que acabou de acontecer na sala. Ordenar por
 * `dataReferencia` faria o botão comemorar a venda errada sempre que alguém
 * registrasse um fato retroativo.
 *
 * `id` entra só como desempate determinístico: `criadoEm` tem resolução de
 * microssegundo, mas dois cadastros no mesmo instante não podem devolver
 * resultado que muda entre chamadas.
 *
 * Devolve `null` quando não há nenhuma venda.
 */
export async function buscarUltimaVendaCadastrada(
  prisma: PrismaClient,
): Promise<UltimaVendaCadastrada | null> {
  return prisma.lancamento.findFirst({
    where: { tipo: "VENDA" },
    orderBy: [{ criadoEm: "desc" }, { id: "desc" }],
    select: { id: true, criadoEm: true },
  });
}

/**
 * As celebrações recentes apresentáveis, da mais antiga para a mais nova.
 *
 * **Plural, e é o ponto do contrato.** Devolver só a última perderia evento:
 * duas vendas cadastradas entre duas consultas da TV e a primeira nunca
 * chegaria à tela. Qualquer regressão para `ORDER BY ... LIMIT 1` reintroduz
 * exatamente esse buraco.
 *
 * `agora` é **obrigatório**, como em `lerPainel`: quem chama congela o
 * instante. Um default aqui criaria um segundo relógio dentro de um caminho que
 * precisa ter só um, e a fronteira da janela deixaria de ser testável.
 *
 * Só é apresentável a celebração cujo lançamento **continua** sendo `VENDA` e
 * **continua** tendo participação. Os dois são filtro relacional no `where`, e
 * não código depois da leitura: uma celebração cujo lançamento virou PROPOSTA
 * numa edição não é um erro a tratar, é uma linha que não deve ser lida. Sem
 * trigger e sem constraint nova — o contrato de apresentação vive na leitura.
 *
 * A ordem: o banco entrega as **mais recentes** (`DESC` + `take`), porque é o
 * teto que precisa cair sobre as novas e não sobre as velhas; a inversão logo
 * abaixo devolve a ordem de exibição. Fazer `ASC` direto com `take` traria as
 * dez mais antigas da janela, que é o oposto do que a TV quer.
 */
export async function listarCelebracoesRecentes(
  prisma: PrismaClient,
  agora: Date,
): Promise<CelebracaoApresentavel[]> {
  const inicioDaJanela = new Date(agora.getTime() - JANELA_CELEBRACAO_MS);

  const maisRecentesPrimeiro = await prisma.celebracao.findMany({
    where: {
      criadoEm: { gte: inicioDaJanela },
      lancamento: { tipo: "VENDA", participacoes: { some: {} } },
    },
    orderBy: [{ criadoEm: "desc" }, { id: "desc" }],
    take: MAXIMO_CELEBRACOES_RECENTES,
    select: SELECT_APRESENTAVEL,
  });

  // `reverse` sobre uma lista já ordenada por (criadoEm, id) DESC produz
  // exatamente (criadoEm, id) ASC — determinístico, inclusive no empate.
  return maisRecentesPrimeiro.reverse().map(paraApresentavel);
}

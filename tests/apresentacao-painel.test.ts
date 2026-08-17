import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CHAVES_RANKING,
  type MetricasDeEquipe,
  type MetricasEmpresaPuras,
  type QuadroMensal,
  type RankingsDaEquipe,
  TIPOS_EVENTO,
} from "@/lib/metricas";
import type { MetricasEmpresaPeriodicas, ResultadoPainel } from "@/lib/metricas-prisma";
import {
  type ApresentacaoPainel,
  criarApresentacaoPainel,
  formatarDinheiroComposto,
  formatarDinheiroTexto,
  formatarInteiro,
  METRICAS_PAINEL,
  rotuloPeriodoMensal,
} from "@/lib/apresentacao-painel";

/**
 * O shape de apresentação do painel.
 *
 * Duas metades: os formatadores, que são funções de texto puras, e o adaptador,
 * que traduz estado de domínio em estado de tela. Nenhum teste aqui recalcula
 * métrica — quanto dá cada número é da `tests/metricas.test.ts`.
 */

/** Instante que cai em 15 de agosto de 2026 em São Paulo. */
const AGORA = new Date("2026-08-15T15:00:00.000Z");

describe("rótulo do período", () => {
  it("nomeia o mês civil corrente em português", () => {
    assert.equal(rotuloPeriodoMensal(AGORA), "agosto de 2026");
  });

  it("segue o dia de São Paulo, não o do servidor", () => {
    // 1º de janeiro às 02:00 UTC ainda é 31 de dezembro no escritório.
    assert.equal(rotuloPeriodoMensal(new Date("2026-01-01T02:00:00.000Z")), "dezembro de 2025");
  });

  it("cobre os doze meses", () => {
    const nomes = [];
    for (let mes = 0; mes < 12; mes += 1) {
      nomes.push(rotuloPeriodoMensal(new Date(Date.UTC(2026, mes, 15, 15))));
    }
    assert.deepEqual(nomes, [
      "janeiro de 2026",
      "fevereiro de 2026",
      "março de 2026",
      "abril de 2026",
      "maio de 2026",
      "junho de 2026",
      "julho de 2026",
      "agosto de 2026",
      "setembro de 2026",
      "outubro de 2026",
      "novembro de 2026",
      "dezembro de 2026",
    ]);
  });
});

describe("contagens", () => {
  it("agrupa milhar com ponto", () => {
    assert.equal(formatarInteiro(0), "0");
    assert.equal(formatarInteiro(999), "999");
    assert.equal(formatarInteiro(1000), "1.000");
    assert.equal(formatarInteiro(2643), "2.643");
    assert.equal(formatarInteiro(1000000), "1.000.000");
  });

  it("recusa o que não é inteiro", () => {
    assert.throws(() => formatarInteiro(1.5), /inteiro/);
    assert.throws(() => formatarInteiro(Number.NaN), /inteiro/);
  });
});

describe("dinheiro — valores do protótipo", () => {
  const casos: [string, string][] = [
    ["4200000000.00", "R$ 4,2 bi"],
    ["431000000.00", "R$ 431,0 mi"],
    ["128000000.00", "R$ 128,0 mi"],
    ["42500000.00", "R$ 42,5 mi"],
    ["4200000.00", "R$ 4,2 mi"],
    ["900000.00", "R$ 0,9 mi"],
    ["0.00", "R$ 0,0 mi"],
  ];

  for (const [canonico, esperado] of casos) {
    it(`${canonico} → ${esperado}`, () => {
      assert.equal(formatarDinheiroTexto(canonico), esperado);
    });
  }
});

describe("dinheiro — forma composta", () => {
  it("separa prefixo, valor e sufixo", () => {
    assert.deepEqual(formatarDinheiroComposto("4200000.00"), {
      prefixo: "R$",
      valor: "4,2",
      sufixo: "mi",
    });
  });

  it("a forma texto é a composta unida por espaços", () => {
    for (const canonico of ["0.00", "900000.00", "42500000.00", "4200000000.00"]) {
      const { prefixo, valor, sufixo } = formatarDinheiroComposto(canonico);
      assert.equal(formatarDinheiroTexto(canonico), `${prefixo} ${valor} ${sufixo}`);
    }
  });
});

describe("dinheiro — arredondamento meio-para-cima", () => {
  it("abaixo do corte, desce", () => {
    assert.equal(formatarDinheiroTexto("4249999.99"), "R$ 4,2 mi");
  });

  it("exatamente no corte, sobe", () => {
    assert.equal(formatarDinheiroTexto("4250000.00"), "R$ 4,3 mi");
  });

  it("acima do corte, sobe", () => {
    assert.equal(formatarDinheiroTexto("4250000.01"), "R$ 4,3 mi");
  });

  it("centavos isolados não somem do arredondamento", () => {
    // A diferença entre os dois é de um centavo, e ela decide a casa exibida.
    assert.notEqual(formatarDinheiroTexto("4249999.99"), formatarDinheiroTexto("4250000.00"));
  });
});

describe("dinheiro — a precisão é da unidade, não da magnitude", () => {
  it("em mi, uma casa decimal abaixo de 100", () => {
    assert.equal(formatarDinheiroTexto("99940000.00"), "R$ 99,9 mi");
  });

  it("em mi, a casa decimal continua de 100 para cima", () => {
    assert.equal(formatarDinheiroTexto("128000000.00"), "R$ 128,0 mi");
  });

  it("em bi, de 100 para cima não há casa decimal", () => {
    assert.equal(formatarDinheiroTexto("128000000000.00"), "R$ 128 bi");
  });
});

describe("dinheiro — `mi` mantém a casa decimal em qualquer magnitude", () => {
  /**
   * O acumulado do escritório vive na casa das centenas de milhão, e é o único
   * número da tela que cresce por soma lenta: saldo histórico mais as vendas que
   * vieram depois do corte. Sem casa decimal a resolução da faixa `mi` seria de
   * um milhão inteiro, e uma venda real de algumas centenas de milhares sairia da
   * tela idêntica a "não vendeu nada" — o mesmo defeito que `< 0,1` já resolve na
   * ponta de baixo, repetido na ponta de cima.
   */
  const casos: [string, string][] = [
    ["100000000.00", "R$ 100,0 mi"],
    ["100100000.00", "R$ 100,1 mi"],
    ["100450000.00", "R$ 100,5 mi"],
    ["100500000.00", "R$ 100,5 mi"],
    ["105000000.00", "R$ 105,0 mi"],
    ["128000000.00", "R$ 128,0 mi"],
    ["431000000.00", "R$ 431,0 mi"],
  ];

  for (const [canonico, esperado] of casos) {
    it(`${canonico} → ${esperado}`, () => {
      assert.equal(formatarDinheiroTexto(canonico), esperado);
    });
  }

  it("um incremento de R$ 100 mil é visível na faixa dos 100 milhões", () => {
    // O caso que originou o ajuste: saldo de 100 mi mais uma venda posterior.
    assert.notEqual(formatarDinheiroTexto("100000000.00"), formatarDinheiroTexto("100100000.00"));
  });

  it("o arredondamento que alcança 100 mi não perde mais a casa decimal", () => {
    assert.equal(formatarDinheiroTexto("99950000.00"), "R$ 100,0 mi");
  });
});

describe("dinheiro — promoção de milhão para bilhão", () => {
  it("logo abaixo do corte continua em mi", () => {
    assert.equal(formatarDinheiroTexto("999499999.99"), "R$ 999,5 mi");
  });

  it("999,9 mi ainda cabe em mi, com a casa decimal", () => {
    assert.equal(formatarDinheiroTexto("999900000.00"), "R$ 999,9 mi");
  });

  it("no corte vira 1,0 bi, e não 1000,0 mi", () => {
    // Com uma casa decimal em `mi`, o corte é o arredondamento que alcançaria
    // `1000,0 mi` — e não mais `999,5`, que agora é exibível como tal.
    assert.equal(formatarDinheiroTexto("999950000.00"), "R$ 1,0 bi");
  });

  it("logo abaixo desse corte, ainda é mi", () => {
    assert.equal(formatarDinheiroTexto("999949999.99"), "R$ 999,9 mi");
  });

  it("um bilhão exato é 1,0 bi", () => {
    assert.equal(formatarDinheiroTexto("1000000000.00"), "R$ 1,0 bi");
  });

  it("abaixo de um milhão continua em mi, não vira outra unidade", () => {
    assert.equal(formatarDinheiroTexto("1000.00"), "R$ < 0,1 mi");
    assert.equal(formatarDinheiroComposto("1000.00").sufixo, "mi");
  });
});

describe("dinheiro — positivo abaixo da resolução não vira zero", () => {
  it("zero exato continua sendo R$ 0,0 mi", () => {
    assert.equal(formatarDinheiroTexto("0.00"), "R$ 0,0 mi");
    assert.deepEqual(formatarDinheiroComposto("0.00"), {
      prefixo: "R$",
      valor: "0,0",
      sufixo: "mi",
    });
  });

  it("um centavo já é positivo e sai marcado", () => {
    assert.equal(formatarDinheiroTexto("0.01"), "R$ < 0,1 mi");
  });

  it("a forma composta traz a marca no lugar do número", () => {
    assert.deepEqual(formatarDinheiroComposto("1000.00"), {
      prefixo: "R$",
      valor: "< 0,1",
      sufixo: "mi",
    });
  });

  it("logo abaixo do corte half-up, ainda é sub-resolução", () => {
    assert.equal(formatarDinheiroTexto("49999.99"), "R$ < 0,1 mi");
  });

  it("no corte half-up, vira 0,1 mi de verdade", () => {
    assert.equal(formatarDinheiroTexto("50000.00"), "R$ 0,1 mi");
  });

  it("acima do corte, 0,1 mi", () => {
    assert.equal(formatarDinheiroTexto("50000.01"), "R$ 0,1 mi");
  });

  it("o corte não é constante mágica: sai do próprio arredondamento", () => {
    // Um centavo separa os dois lados, e é o half-up da escala que decide.
    assert.notEqual(formatarDinheiroTexto("49999.99"), formatarDinheiroTexto("50000.00"));
  });
});

describe("dinheiro positivo nunca é confundido com zero real", () => {
  it("um centavo e zero não podem ter a mesma aparência", () => {
    // Uma venda pequena e "não vendeu nada" são fatos diferentes; se saíssem
    // iguais na parede, a tela estaria afirmando algo falso sobre o corretor.
    assert.notEqual(formatarDinheiroTexto("0.01"), formatarDinheiroTexto("0.00"));
    assert.notDeepEqual(formatarDinheiroComposto("0.01"), formatarDinheiroComposto("0.00"));
  });

  it("nenhum valor positivo produz o texto de zero exato", () => {
    for (const canonico of ["0.01", "1.00", "1000.00", "49999.99"]) {
      assert.notEqual(
        formatarDinheiroTexto(canonico),
        "R$ 0,0 mi",
        `${canonico} é positivo e não pode parecer zero`,
      );
    }
  });
});

describe("dinheiro — bilhão", () => {
  it("abaixo de 100 bi, uma casa decimal", () => {
    assert.equal(formatarDinheiroTexto("99940000000.00"), "R$ 99,9 bi");
  });

  it("o arredondamento que alcança 100 bi perde a casa decimal", () => {
    assert.equal(formatarDinheiroTexto("99950000000.00"), "R$ 100 bi");
  });

  it("acima de mil bilhões o milhar é agrupado", () => {
    assert.equal(formatarDinheiroTexto("1000000000000.00"), "R$ 1.000 bi");
  });

  it("o topo de Decimal(14,2) não perde precisão", () => {
    assert.equal(formatarDinheiroTexto("999999999999.99"), "R$ 1.000 bi");
  });
});

describe("dinheiro — entradas recusadas", () => {
  const invalidos = [
    "1250000",
    "1250000.0",
    "1250000.000",
    "1250000,00",
    "-100.00",
    "abc",
    "",
    " 100.00",
    "1.250.000,00",
    "R$ 100,00",
  ];

  for (const bruto of invalidos) {
    it(`recusa ${JSON.stringify(bruto)}`, () => {
      assert.throws(() => formatarDinheiroTexto(bruto), /forma canônica/);
      assert.throws(() => formatarDinheiroComposto(bruto), /forma canônica/);
    });
  }
});

describe("ordem das métricas", () => {
  it("as oito métricas saem na ordem do núcleo", () => {
    assert.deepEqual(
      METRICAS_PAINEL.map((metrica) => metrica.chave),
      [...CHAVES_RANKING],
    );
  });

  it("cada métrica tem rótulo próprio, não vazio", () => {
    assert.equal(METRICAS_PAINEL.length, 8);
    const nomes = METRICAS_PAINEL.map((metrica) => metrica.nome);
    assert.equal(new Set(nomes).size, 8, "nenhum rótulo se repete");
    assert.ok(
      nomes.every((nome) => nome.length > 0),
      "nenhum rótulo é vazio",
    );
  });

  it("os sete tipos do quadro mensal continuam distintos", () => {
    // `CAPTACAO_VENDA` e `CAPTACAO_EXCLUSIVA` são métricas independentes
    // (DEC-003) e não podem colapsar no mesmo rótulo.
    assert.equal(TIPOS_EVENTO.length, 7);
    assert.equal(new Set(TIPOS_EVENTO).size, 7);
  });
});

// --- Fixtures de domínio -----------------------------------------------------
//
// Objetos de domínio escritos à mão, como o núcleo os produziria. Nenhum teste
// daqui para baixo calcula métrica: o que se prova é a tradução de estado e de
// formato.

const TRACO = "—";

function quadro(valor: number): QuadroMensal {
  return {
    VENDA: valor,
    LOCACAO: valor,
    CAPTACAO_VENDA: valor,
    CAPTACAO_EXCLUSIVA: valor,
    CAPTACAO_LOCACAO: valor,
    PROPOSTA: valor,
    AVALIACAO_GOOGLE: valor,
  };
}

function periodos(
  estadoPeriodoMensal: "OK" | "SEM_DADOS" = "OK",
  quadroMensal: QuadroMensal = quadro(30),
): MetricasEmpresaPeriodicas {
  return {
    estadoPeriodoMensal,
    vgvPeriodos: {
      mensal: "42500000.00",
      trimestral: "128000000.00",
      anual: "431000000.00",
    },
    quadroMensal,
  };
}

function acumulados(
  parcial: Partial<MetricasEmpresaPuras["acumulados"]> = {},
): MetricasEmpresaPuras["acumulados"] {
  return {
    // `EXATO` é o caso comum; os testes de "+ de" passam `MINIMO_CONHECIDO`.
    vendidos: { estado: "OK", valor: 528, precisao: "EXATO" },
    vgv: { estado: "OK", valor: "4200000000.00", precisao: "EXATO" },
    avaliacoes: { estado: "OK", valor: 2643, precisao: "EXATO" },
    ...parcial,
  };
}

const SEM_SALDO = { estado: "SEM_SALDO_HISTORICO", valor: null } as const;

type Corretor = { id: string; nome: string; contagem: number; vgv: string };

/**
 * Os oito rankings de uma equipe, todos com o mesmo elenco na mesma ordem — o
 * suficiente para provar que a apresentação preserva a ordem que recebeu.
 */
function rankings(elenco: Corretor[]): RankingsDaEquipe {
  const contagem = () =>
    elenco.map((corretor) => ({
      corretorId: corretor.id,
      nomeExibicao: corretor.nome,
      valor: corretor.contagem,
    }));

  return {
    vendidos: contagem(),
    vgv: elenco.map((corretor) => ({
      corretorId: corretor.id,
      nomeExibicao: corretor.nome,
      valor: corretor.vgv,
    })),
    locados: contagem(),
    capVenda: contagem(),
    exclusivas: contagem(),
    capLocacao: contagem(),
    propostas: contagem(),
    avaliacoes: contagem(),
  };
}

const ELENCO: Corretor[] = [
  { id: "c1", nome: "Rafael Nunes", contagem: 3, vgv: "4200000.00" },
  { id: "c2", nome: "Marina Castro", contagem: 2, vgv: "3400000.00" },
  { id: "c3", nome: "Bruno Teixeira", contagem: 0, vgv: "0.00" },
];

function equipe(nome: string, gerenteNome: string, total: number): MetricasDeEquipe {
  return {
    id: `equipe-${nome}`,
    nome,
    gerenteNome,
    totalCorretores: total,
    rankings: rankings(ELENCO),
  };
}

const TRES_EQUIPES = [
  equipe("Equipe Suellen", "Suellen Martins", 7),
  equipe("Equipe Lena", "Lena Duarte", 7),
  equipe("Equipe Fernanda L.", "Fernanda Louzada", 7),
];

/** Um `ResultadoPainel` completo, com tudo `OK`, para as variações partirem daqui. */
function resultado(parcial: Partial<ResultadoPainel> = {}): ResultadoPainel {
  return {
    empresa: {
      periodos: { estadoLeitura: "OK", dados: periodos() },
      acumulados: { estadoLeitura: "OK", dados: acumulados() },
    },
    equipes: {
      estadoLeitura: "OK",
      dados: { estadoPeriodoMensal: "OK", estadoEquipes: "OK", equipes: TRES_EQUIPES },
    },
    propostas: { estadoLeitura: "OK", dados: [] },
    reservas: { estadoLeitura: "OK", dados: [] },
    ...parcial,
  };
}

function apresentar(parcial: Partial<ResultadoPainel> = {}): ApresentacaoPainel {
  return criarApresentacaoPainel(resultado(parcial), AGORA);
}

/** Os valores de todos os rankings de todas as equipes, achatados. */
function todosOsValores(area: ApresentacaoPainel["equipes"]): string[] {
  if (area.estado !== "OK" && area.estado !== "SEM_DADOS") return [];
  return area.equipes.flatMap((time) =>
    CHAVES_RANKING.flatMap((chave) => time.rankings[chave].map((linha) => linha.valor)),
  );
}

describe("o período vem do `agora` recebido", () => {
  it("não há relógio próprio na apresentação", () => {
    assert.equal(apresentar().periodo, "agosto de 2026");
    assert.equal(
      criarApresentacaoPainel(resultado(), new Date("2026-03-02T12:00:00.000Z")).periodo,
      "março de 2026",
    );
  });
});

describe("caminho completo — tudo OK", () => {
  it("os três big numbers saem formatados", () => {
    assert.deepEqual(apresentar().bigNumbers, [
      { rotulo: "Imóveis vendidos", numero: { valor: "528" }, estado: "OK" },
      {
        rotulo: "VGV acumulado",
        numero: { prefixo: "R$", valor: "4,2", sufixo: "bi" },
        estado: "OK",
      },
      { rotulo: "Avaliações Google", numero: { valor: "2.643" }, estado: "OK" },
    ]);
  });

  it("as três faixas de VGV saem formatadas", () => {
    assert.deepEqual(apresentar().vgvPeriodos, [
      { rotulo: "Anual", valor: { prefixo: "R$", valor: "431,0", sufixo: "mi" }, estado: "OK" },
      { rotulo: "Trimestral", valor: { prefixo: "R$", valor: "128,0", sufixo: "mi" }, estado: "OK" },
      { rotulo: "Mensal", valor: { prefixo: "R$", valor: "42,5", sufixo: "mi" }, estado: "OK" },
    ]);
  });

  it("o quadro mensal sai na ordem dos tipos do núcleo", () => {
    const area = apresentar().quadroMensal;
    assert.equal(area.estado, "OK");
    assert.deepEqual(
      area.linhas.map((linha) => linha.rotulo),
      [
        "Vendidos",
        "Locados",
        "Captação de venda",
        "Exclusividades",
        "Captação de locação",
        "Propostas",
        "Avaliações Google",
      ],
    );
    assert.equal(area.linhas.length, TIPOS_EVENTO.length);
  });

  it("as equipes saem com nome, gerente e headcount", () => {
    const area = apresentar().equipes;
    assert.equal(area.estado, "OK");
    if (area.estado !== "OK") return;

    assert.deepEqual(
      area.equipes.map((time) => [time.nome, time.gerente, time.totalCorretores]),
      [
        ["Equipe Suellen", "Suellen Martins", 7],
        ["Equipe Lena", "Lena Duarte", 7],
        ["Equipe Fernanda L.", "Fernanda Louzada", 7],
      ],
    );
  });

  it("os rankings mantêm a ordem recebida do núcleo", () => {
    const area = apresentar().equipes;
    if (area.estado !== "OK") return;

    for (const chave of CHAVES_RANKING) {
      assert.deepEqual(
        area.equipes[0].rankings[chave].map((linha) => linha.rotulo),
        ELENCO.map((corretor) => corretor.nome),
        `a ordem de ${chave} não pode ser refeita aqui`,
      );
    }
  });

  it("contagem sai como inteiro e VGV como texto monetário", () => {
    const area = apresentar().equipes;
    if (area.estado !== "OK") return;

    assert.deepEqual(area.equipes[0].rankings.vendidos, [
      { rotulo: "Rafael Nunes", valor: "3" },
      { rotulo: "Marina Castro", valor: "2" },
      { rotulo: "Bruno Teixeira", valor: "0" },
    ]);
    assert.deepEqual(area.equipes[0].rankings.vgv, [
      { rotulo: "Rafael Nunes", valor: "R$ 4,2 mi" },
      { rotulo: "Marina Castro", valor: "R$ 3,4 mi" },
      { rotulo: "Bruno Teixeira", valor: "R$ 0,0 mi" },
    ]);
  });
});

describe("zero real continua sendo zero", () => {
  it("mês OK com tudo zerado mostra zeros, nunca traço", () => {
    const painel = apresentar({
      empresa: {
        periodos: { estadoLeitura: "OK", dados: periodos("OK", quadro(0)) },
        acumulados: { estadoLeitura: "OK", dados: acumulados() },
      },
    });

    assert.equal(painel.quadroMensal.estado, "OK");
    assert.deepEqual(
      painel.quadroMensal.linhas.map((linha) => linha.valor),
      ["0", "0", "0", "0", "0", "0", "0"],
    );
  });

  it("VGV zerado num mês OK é R$ 0,0 mi, não traço", () => {
    const painel = criarApresentacaoPainel(
      resultado({
        empresa: {
          periodos: {
            estadoLeitura: "OK",
            dados: {
              estadoPeriodoMensal: "OK",
              vgvPeriodos: { mensal: "0.00", trimestral: "0.00", anual: "0.00" },
              quadroMensal: quadro(0),
            },
          },
          acumulados: { estadoLeitura: "OK", dados: acumulados() },
        },
      }),
      AGORA,
    );

    assert.deepEqual(
      painel.vgvPeriodos.map((item) => item.valor.valor),
      ["0,0", "0,0", "0,0"],
    );
    assert.ok(painel.vgvPeriodos.every((item) => item.estado === "OK"));
  });

  it("o zero do ranking de um corretor ativo é exibido", () => {
    const area = apresentar().equipes;
    if (area.estado !== "OK") return;
    assert.equal(area.equipes[0].rankings.vendidos[2].valor, "0");
    assert.equal(area.equipes[0].rankings.vgv[2].valor, "R$ 0,0 mi");
  });
});

describe("sub-resolução chega ao shape de apresentação", () => {
  /** Dois corretores lado a lado: um com venda pequena, outro sem venda. */
  const ELENCO_PEQUENO: Corretor[] = [
    { id: "c1", nome: "Vendeu pouco", contagem: 1, vgv: "1000.00" },
    { id: "c2", nome: "Não vendeu", contagem: 0, vgv: "0.00" },
  ];

  const comVendaPequena = (): Partial<ResultadoPainel> => ({
    equipes: {
      estadoLeitura: "OK",
      dados: {
        estadoPeriodoMensal: "OK",
        estadoEquipes: "OK",
        equipes: [
          {
            id: "e1",
            nome: "Equipe Suellen",
            gerenteNome: "Suellen Martins",
            totalCorretores: 2,
            rankings: rankings(ELENCO_PEQUENO),
          },
          equipe("Equipe Lena", "Lena Duarte", 7),
          equipe("Equipe Fernanda L.", "Fernanda Louzada", 7),
        ],
      },
    },
  });

  it("no ranking, quem vendeu pouco não fica igual a quem não vendeu", () => {
    const area = apresentar(comVendaPequena()).equipes;
    assert.equal(area.estado, "OK");
    if (area.estado !== "OK") return;

    assert.deepEqual(area.equipes[0].rankings.vgv, [
      { rotulo: "Vendeu pouco", valor: "R$ < 0,1 mi" },
      { rotulo: "Não vendeu", valor: "R$ 0,0 mi" },
    ]);
  });

  it("o VGV mensal de um mês OK com pouca venda sai marcado, e continua OK", () => {
    const painel = criarApresentacaoPainel(
      resultado({
        empresa: {
          periodos: {
            estadoLeitura: "OK",
            dados: {
              estadoPeriodoMensal: "OK",
              vgvPeriodos: {
                mensal: "1000.00",
                trimestral: "128000000.00",
                anual: "431000000.00",
              },
              quadroMensal: quadro(1),
            },
          },
          acumulados: { estadoLeitura: "OK", dados: acumulados() },
        },
      }),
      AGORA,
    );

    const mensal = painel.vgvPeriodos[2];
    // Valor real e positivo: o estado continua OK, não vira ausência.
    assert.equal(mensal.estado, "OK");
    assert.deepEqual(mensal.valor, { prefixo: "R$", valor: "< 0,1", sufixo: "mi" });
  });

  it("o big number de VGV acumulado também distingue", () => {
    const painel = apresentar({
      empresa: {
        periodos: { estadoLeitura: "OK", dados: periodos() },
        acumulados: {
          estadoLeitura: "OK",
          dados: acumulados({ vgv: { estado: "OK", valor: "1000.00", precisao: "EXATO" } }),
        },
      },
    });

    assert.equal(painel.bigNumbers[1].estado, "OK");
    assert.deepEqual(painel.bigNumbers[1].numero, {
      prefixo: "R$",
      valor: "< 0,1",
      sufixo: "mi",
    });
  });
});

describe("leitura de períodos indisponível", () => {
  const painel = () =>
    apresentar({
      empresa: {
        periodos: { estadoLeitura: "INDISPONIVEL" },
        acumulados: { estadoLeitura: "OK", dados: acumulados() },
      },
    });

  it("as três faixas de VGV viram traço", () => {
    assert.deepEqual(painel().vgvPeriodos, [
      { rotulo: "Anual", valor: { valor: TRACO }, estado: "INDISPONIVEL" },
      { rotulo: "Trimestral", valor: { valor: TRACO }, estado: "INDISPONIVEL" },
      { rotulo: "Mensal", valor: { valor: TRACO }, estado: "INDISPONIVEL" },
    ]);
  });

  it("o quadro mensal mantém as sete linhas, todas em traço", () => {
    const area = painel().quadroMensal;
    assert.equal(area.estado, "INDISPONIVEL");
    assert.equal(area.linhas.length, 7);
    assert.ok(area.linhas.every((linha) => linha.valor === TRACO));
  });

  it("os big numbers não são afetados", () => {
    assert.ok(painel().bigNumbers.every((big) => big.estado === "OK"));
  });

  it("ausência não carrega prefixo nem sufixo de moeda", () => {
    for (const item of painel().vgvPeriodos) {
      assert.deepEqual(Object.keys(item.valor), ["valor"]);
    }
  });
});

describe("mês sem dados", () => {
  const semDados = (): Partial<ResultadoPainel> => ({
    empresa: {
      periodos: { estadoLeitura: "OK", dados: periodos("SEM_DADOS") },
      acumulados: { estadoLeitura: "OK", dados: acumulados() },
    },
    equipes: {
      estadoLeitura: "OK",
      dados: { estadoPeriodoMensal: "SEM_DADOS", estadoEquipes: "OK", equipes: TRES_EQUIPES },
    },
  });

  it("anual e trimestral seguem reais; só o mensal vira traço", () => {
    assert.deepEqual(apresentar(semDados()).vgvPeriodos, [
      { rotulo: "Anual", valor: { prefixo: "R$", valor: "431,0", sufixo: "mi" }, estado: "OK" },
      { rotulo: "Trimestral", valor: { prefixo: "R$", valor: "128,0", sufixo: "mi" }, estado: "OK" },
      { rotulo: "Mensal", valor: { valor: TRACO }, estado: "SEM_DADOS" },
    ]);
  });

  it("o VGV mensal não pode afirmar R$ 0,0 mi", () => {
    const mensal = apresentar(semDados()).vgvPeriodos[2];
    assert.equal(mensal.valor.valor, TRACO);
    assert.equal(mensal.valor.prefixo, undefined);
  });

  it("o quadro mensal fica em sete traços", () => {
    const area = apresentar(semDados()).quadroMensal;
    assert.equal(area.estado, "SEM_DADOS");
    assert.deepEqual(
      area.linhas.map((linha) => linha.valor),
      [TRACO, TRACO, TRACO, TRACO, TRACO, TRACO, TRACO],
    );
  });

  it("as equipes ficam em SEM_DADOS com o elenco preservado", () => {
    const area = apresentar(semDados()).equipes;
    assert.equal(area.estado, "SEM_DADOS");
    if (area.estado !== "SEM_DADOS") return;

    assert.equal(area.equipes.length, 3);
    assert.deepEqual(
      area.equipes.map((time) => [time.nome, time.gerente, time.totalCorretores]),
      [
        ["Equipe Suellen", "Suellen Martins", 7],
        ["Equipe Lena", "Lena Duarte", 7],
        ["Equipe Fernanda L.", "Fernanda Louzada", 7],
      ],
    );
    assert.deepEqual(
      area.equipes[0].rankings.vendidos.map((linha) => linha.rotulo),
      ELENCO.map((corretor) => corretor.nome),
      "os nomes e a ordem continuam",
    );
  });

  it("todos os valores de ranking viram traço, inclusive o VGV", () => {
    const valores = todosOsValores(apresentar(semDados()).equipes);
    assert.equal(valores.length, 3 * CHAVES_RANKING.length * ELENCO.length);
    assert.ok(
      valores.every((valor) => valor === TRACO),
      "nenhum dígito pode sobrar num mês sem dados",
    );
    assert.ok(
      valores.every((valor) => !valor.includes("R$")),
      "o VGV ausente sai sem moeda",
    );
  });

  it("os big numbers não são afetados pelo mês vazio", () => {
    // Acumulado não depende do mês corrente (DEC-042).
    assert.ok(apresentar(semDados()).bigNumbers.every((big) => big.estado === "OK"));
  });
});

describe("acumulados", () => {
  it("leitura indisponível derruba os três big numbers", () => {
    const painel = apresentar({
      empresa: {
        periodos: { estadoLeitura: "OK", dados: periodos() },
        acumulados: { estadoLeitura: "INDISPONIVEL" },
      },
    });

    assert.deepEqual(painel.bigNumbers, [
      { rotulo: "Imóveis vendidos", numero: { valor: TRACO }, estado: "INDISPONIVEL" },
      { rotulo: "VGV acumulado", numero: { valor: TRACO }, estado: "INDISPONIVEL" },
      { rotulo: "Avaliações Google", numero: { valor: TRACO }, estado: "INDISPONIVEL" },
    ]);
  });

  it("leitura indisponível não afeta VGV por período nem quadro mensal", () => {
    const painel = apresentar({
      empresa: {
        periodos: { estadoLeitura: "OK", dados: periodos() },
        acumulados: { estadoLeitura: "INDISPONIVEL" },
      },
    });

    assert.ok(painel.vgvPeriodos.every((item) => item.estado === "OK"));
    assert.equal(painel.quadroMensal.estado, "OK");
  });

  it("faltar o saldo de VENDA apaga só vendidos e VGV acumulado", () => {
    const painel = apresentar({
      empresa: {
        periodos: { estadoLeitura: "OK", dados: periodos() },
        acumulados: {
          estadoLeitura: "OK",
          dados: acumulados({ vendidos: SEM_SALDO, vgv: SEM_SALDO }),
        },
      },
    });

    assert.deepEqual(painel.bigNumbers, [
      { rotulo: "Imóveis vendidos", numero: { valor: TRACO }, estado: "SEM_SALDO_HISTORICO" },
      { rotulo: "VGV acumulado", numero: { valor: TRACO }, estado: "SEM_SALDO_HISTORICO" },
      { rotulo: "Avaliações Google", numero: { valor: "2.643" }, estado: "OK" },
    ]);
  });

  it("faltar o saldo de avaliações apaga só as avaliações", () => {
    const painel = apresentar({
      empresa: {
        periodos: { estadoLeitura: "OK", dados: periodos() },
        acumulados: { estadoLeitura: "OK", dados: acumulados({ avaliacoes: SEM_SALDO }) },
      },
    });

    assert.deepEqual(
      painel.bigNumbers.map((big) => big.estado),
      ["OK", "OK", "SEM_SALDO_HISTORICO"],
    );
    assert.equal(painel.bigNumbers[2].numero.valor, TRACO);
  });
});

describe("área de equipes — estados sem lista", () => {
  it("leitura indisponível não carrega equipes", () => {
    const area = apresentar({ equipes: { estadoLeitura: "INDISPONIVEL" } }).equipes;
    assert.deepEqual(area, { estado: "INDISPONIVEL" });
    assert.deepEqual(Object.keys(area), ["estado"]);
  });

  it("configuração inválida não carrega equipes", () => {
    const area = apresentar({
      equipes: {
        estadoLeitura: "OK",
        dados: {
          estadoPeriodoMensal: "OK",
          estadoEquipes: "CONFIGURACAO_INVALIDA",
          equipes: [],
        },
      },
    }).equipes;

    assert.deepEqual(area, { estado: "CONFIGURACAO_INVALIDA" });
    assert.deepEqual(Object.keys(area), ["estado"]);
  });

  it("os números da empresa sobrevivem à configuração inválida", () => {
    const painel = apresentar({
      equipes: {
        estadoLeitura: "OK",
        dados: { estadoPeriodoMensal: "OK", estadoEquipes: "CONFIGURACAO_INVALIDA", equipes: [] },
      },
    });

    assert.ok(painel.bigNumbers.every((big) => big.estado === "OK"));
    assert.ok(painel.vgvPeriodos.every((item) => item.estado === "OK"));
    assert.equal(painel.quadroMensal.estado, "OK");
  });
});

describe("precedência: configuração inválida vence mês sem dados", () => {
  it("com os dois estados juntos, a área acusa a configuração", () => {
    // `SEM_DADOS` com lista vazia anunciaria "mês sem dados" para um problema
    // que é de cadastro — e esconderia a equipe a mais (DEC-040).
    const area = apresentar({
      equipes: {
        estadoLeitura: "OK",
        dados: {
          estadoPeriodoMensal: "SEM_DADOS",
          estadoEquipes: "CONFIGURACAO_INVALIDA",
          equipes: [],
        },
      },
    }).equipes;

    assert.deepEqual(area, { estado: "CONFIGURACAO_INVALIDA" });
    assert.notEqual(area.estado, "SEM_DADOS");
  });

  it("o VGV mensal continua refletindo o mês vazio", () => {
    // Os dois diagnósticos convivem: a área de equipes acusa configuração, e a
    // faixa de VGV continua dizendo que o mês não tem dado.
    const painel = apresentar({
      empresa: {
        periodos: { estadoLeitura: "OK", dados: periodos("SEM_DADOS") },
        acumulados: { estadoLeitura: "OK", dados: acumulados() },
      },
      equipes: {
        estadoLeitura: "OK",
        dados: {
          estadoPeriodoMensal: "SEM_DADOS",
          estadoEquipes: "CONFIGURACAO_INVALIDA",
          equipes: [],
        },
      },
    });

    assert.equal(painel.equipes.estado, "CONFIGURACAO_INVALIDA");
    assert.equal(painel.vgvPeriodos[2].estado, "SEM_DADOS");
    assert.equal(painel.quadroMensal.estado, "SEM_DADOS");
  });
});

/**
 * O "+ de" dos acumulados de saldo mínimo conhecido (DEC-054).
 *
 * O número não muda: o que muda é a afirmação. `EXATO` diz "527";
 * `MINIMO_CONHECIDO` diz "+ de 527" — e o qualificador é campo próprio, para o
 * `prefixo` continuar significando só moeda.
 */
describe("precisão do saldo vira qualificador (DEC-054)", () => {
  it("saldo EXATO não traz qualificador", () => {
    const painel = apresentar();

    assert.equal(painel.bigNumbers[0].qualificador, undefined);
    assert.equal(painel.bigNumbers[1].qualificador, undefined);
    assert.equal(painel.bigNumbers[2].qualificador, undefined);
  });

  it("saldo MINIMO_CONHECIDO qualifica os imóveis vendidos", () => {
    const painel = apresentar({
      empresa: {
        periodos: { estadoLeitura: "OK", dados: periodos() },
        acumulados: {
          estadoLeitura: "OK",
          dados: acumulados({
            vendidos: { estado: "OK", valor: 527, precisao: "MINIMO_CONHECIDO" },
          }),
        },
      },
    });

    assert.deepEqual(painel.bigNumbers[0], {
      rotulo: "Imóveis vendidos",
      numero: { valor: "527" },
      estado: "OK",
      qualificador: "+ de",
    });
  });

  it("saldo MINIMO_CONHECIDO qualifica o VGV acumulado, sem mexer na moeda", () => {
    const painel = apresentar({
      empresa: {
        periodos: { estadoLeitura: "OK", dados: periodos() },
        acumulados: {
          estadoLeitura: "OK",
          dados: acumulados({
            vgv: { estado: "OK", valor: "800000000.00", precisao: "MINIMO_CONHECIDO" },
          }),
        },
      },
    });

    const big = painel.bigNumbers[1];
    assert.equal(big.qualificador, "+ de");
    // O prefixo continua sendo só a moeda: os dois papéis não se misturam.
    assert.deepEqual(big.numero, { prefixo: "R$", valor: "800,0", sufixo: "mi" });
  });

  it("saldo MINIMO_CONHECIDO qualifica as avaliações", () => {
    const painel = apresentar({
      empresa: {
        periodos: { estadoLeitura: "OK", dados: periodos() },
        acumulados: {
          estadoLeitura: "OK",
          dados: acumulados({
            avaliacoes: { estado: "OK", valor: 2643, precisao: "MINIMO_CONHECIDO" },
          }),
        },
      },
    });

    assert.equal(painel.bigNumbers[2].qualificador, "+ de");
    assert.equal(painel.bigNumbers[2].numero.valor, "2.643");
  });

  it("a precisão de um saldo não contamina o outro", () => {
    const painel = apresentar({
      empresa: {
        periodos: { estadoLeitura: "OK", dados: periodos() },
        acumulados: {
          estadoLeitura: "OK",
          dados: acumulados({
            vendidos: { estado: "OK", valor: 527, precisao: "MINIMO_CONHECIDO" },
            vgv: { estado: "OK", valor: "800000000.00", precisao: "MINIMO_CONHECIDO" },
          }),
        },
      },
    });

    assert.equal(painel.bigNumbers[0].qualificador, "+ de");
    assert.equal(painel.bigNumbers[1].qualificador, "+ de");
    assert.equal(painel.bigNumbers[2].qualificador, undefined, "avaliações seguem EXATO");
  });

  it("sem saldo, não existe `+ de —`", () => {
    const painel = apresentar({
      empresa: {
        periodos: { estadoLeitura: "OK", dados: periodos() },
        acumulados: {
          estadoLeitura: "OK",
          dados: acumulados({ vendidos: SEM_SALDO, vgv: SEM_SALDO, avaliacoes: SEM_SALDO }),
        },
      },
    });

    for (const big of painel.bigNumbers) {
      assert.equal(big.estado, "SEM_SALDO_HISTORICO");
      assert.equal(big.numero.valor, TRACO);
      assert.equal(big.qualificador, undefined);
    }
  });

  it("leitura indisponível também não qualifica nada", () => {
    const painel = apresentar({
      empresa: {
        periodos: { estadoLeitura: "OK", dados: periodos() },
        acumulados: { estadoLeitura: "INDISPONIVEL" },
      },
    });

    for (const big of painel.bigNumbers) {
      assert.equal(big.estado, "INDISPONIVEL");
      assert.equal(big.qualificador, undefined);
    }
  });

  it("o `+ de` não escapa para VGV por período nem para o quadro mensal", () => {
    const painel = apresentar({
      empresa: {
        periodos: { estadoLeitura: "OK", dados: periodos() },
        acumulados: {
          estadoLeitura: "OK",
          dados: acumulados({
            vgv: { estado: "OK", valor: "800000000.00", precisao: "MINIMO_CONHECIDO" },
          }),
        },
      },
    });

    // O piso qualifica o acumulado, não os recortes de período (DEC-054).
    for (const periodo of painel.vgvPeriodos) {
      assert.equal("qualificador" in periodo, false);
    }
    for (const linha of painel.quadroMensal.linhas) {
      assert.equal(linha.valor.startsWith("+"), false);
    }
  });
});

/** As duas listas da Tela B, já formatadas (DEC-056). */
describe("listas operacionais", () => {
  it("transporta imóvel e corretor, na ordem que o núcleo entregou", () => {
    const painel = apresentar({
      propostas: {
        estadoLeitura: "OK",
        dados: [
          { id: "p1", imovelRef: "AP-1203", corretorNome: "Marina" },
          { id: "p2", imovelRef: "CA-450", corretorNome: "Rodrigo" },
        ],
      },
      reservas: {
        estadoLeitura: "OK",
        dados: [{ id: "r1", imovelRef: "AP-88", corretorNome: "Camila" }],
      },
    });

    assert.deepEqual(painel.operacionais.propostas, {
      estado: "OK",
      itens: [
        { imovel: "AP-1203", corretor: "Marina" },
        { imovel: "CA-450", corretor: "Rodrigo" },
      ],
    });
    assert.deepEqual(painel.operacionais.reservas, {
      estado: "OK",
      itens: [{ imovel: "AP-88", corretor: "Camila" }],
    });
  });

  it("proposta legada sem imóvel diz o que falta, em vez de sumir (DEC-053)", () => {
    const painel = apresentar({
      propostas: {
        estadoLeitura: "OK",
        dados: [{ id: "p1", imovelRef: null, corretorNome: "Bianca" }],
      },
    });

    assert.deepEqual(painel.operacionais.propostas, {
      estado: "OK",
      itens: [{ imovel: "Imóvel não informado", corretor: "Bianca" }],
    });
  });

  it("lista vazia é dado, não ausência", () => {
    const painel = apresentar({
      propostas: { estadoLeitura: "OK", dados: [] },
      reservas: { estadoLeitura: "OK", dados: [] },
    });

    assert.deepEqual(painel.operacionais.propostas, { estado: "OK", itens: [] });
    assert.deepEqual(painel.operacionais.reservas, { estado: "OK", itens: [] });
  });

  it("leitura indisponível não carrega itens", () => {
    const painel = apresentar({
      propostas: { estadoLeitura: "INDISPONIVEL" },
      reservas: { estadoLeitura: "INDISPONIVEL" },
    });

    assert.deepEqual(painel.operacionais.propostas, { estado: "INDISPONIVEL" });
    assert.deepEqual(painel.operacionais.reservas, { estado: "INDISPONIVEL" });
  });

  it("uma lista indisponível não derruba a outra", () => {
    const painel = apresentar({
      propostas: { estadoLeitura: "INDISPONIVEL" },
      reservas: {
        estadoLeitura: "OK",
        dados: [{ id: "r1", imovelRef: "AP-88", corretorNome: "Camila" }],
      },
    });

    assert.equal(painel.operacionais.propostas.estado, "INDISPONIVEL");
    assert.equal(painel.operacionais.reservas.estado, "OK");
  });

  it("nem os big numbers nem as equipes mudam por causa das listas", () => {
    const comListas = apresentar({
      propostas: {
        estadoLeitura: "OK",
        dados: [{ id: "p1", imovelRef: "AP-1", corretorNome: "Ana" }],
      },
    });
    const semListas = apresentar();

    assert.deepEqual(comListas.bigNumbers, semListas.bigNumbers);
    assert.deepEqual(comListas.quadroMensal, semListas.quadroMensal);
    assert.deepEqual(comListas.equipes, semListas.equipes);
  });
});

describe("as métricas do ciclo acompanham o painel", () => {
  it("saem na apresentação, na ordem do núcleo", () => {
    assert.deepEqual(
      apresentar().metricas.map((metrica) => metrica.chave),
      [...CHAVES_RANKING],
    );
  });

  it("cada chave do ciclo tem ranking correspondente", () => {
    const area = apresentar().equipes;
    if (area.estado !== "OK") return;

    for (const metrica of apresentar().metricas) {
      assert.ok(
        Array.isArray(area.equipes[0].rankings[metrica.chave]),
        `falta o ranking de ${metrica.chave}`,
      );
    }
  });
});

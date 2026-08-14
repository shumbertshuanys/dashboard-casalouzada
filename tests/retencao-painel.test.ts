import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ApresentacaoPainel, ChaveMetrica, Linha } from "@/lib/apresentacao-painel";
import type { LeituraPainel } from "@/lib/contrato-atualizacao-painel";
import {
  aplicarPayloadAtualizacao,
  comporApresentacao,
  estadoInicial,
  idadeExibida,
  resolverAtualizacao,
} from "@/lib/retencao-painel";

/**
 * A retenção do último valor conhecido.
 *
 * O invariante sob teste é a DEC-014 aplicada ao refresh: **falha de atualização
 * não apaga dado bom**. E o contrário também precisa valer — estado de domínio
 * (`SEM_DADOS`, `SEM_SALDO_HISTORICO`, `CONFIGURACAO_INVALIDA`) é dado, chega
 * dentro de uma leitura `OK` e deve substituir o que estava lá.
 *
 * Tudo aqui é função pura: nenhum destes testes prova o timer, o `fetch` ou a
 * ausência de flicker — isso não é testável sem navegador, e não se finge que é.
 */

const CHAVES = [
  "vendidos",
  "vgv",
  "locados",
  "capVenda",
  "exclusivas",
  "capLocacao",
  "propostas",
  "avaliacoes",
] as const satisfies readonly ChaveMetrica[];

function metricas() {
  return CHAVES.map((chave) => ({ chave, nome: `Rótulo de ${chave}` }));
}

function rankings(valor: string): Record<ChaveMetrica, Linha[]> {
  return Object.fromEntries(CHAVES.map((chave) => [chave, [{ rotulo: "Ana", valor }]])) as Record<
    ChaveMetrica,
    Linha[]
  >;
}

function equipes(valor: string) {
  return ["Alfa", "Beta", "Gama"].map((nome) => ({
    nome,
    gerente: `Gerente ${nome}`,
    totalCorretores: 7,
    rankings: rankings(valor),
  }));
}

type Opcoes = {
  competencia?: string;
  lidoEmMs?: number;
  horaLeitura?: string;
  periodo?: string;
  /** Marca visível nos valores, para distinguir uma leitura da outra. */
  marca?: string;
  periodos?: "OK" | "INDISPONIVEL";
  acumulados?: "OK" | "INDISPONIVEL";
  equipes?: "OK" | "INDISPONIVEL";
  estadoQuadro?: "OK" | "SEM_DADOS";
  estadoBigNumber?: "OK" | "SEM_SALDO_HISTORICO";
  estadoArea?: "OK" | "SEM_DADOS" | "CONFIGURACAO_INVALIDA";
  propostas?: "OK" | "INDISPONIVEL";
  reservas?: "OK" | "INDISPONIVEL";
  /** Quantos itens cada lista operacional traz quando a leitura é `OK`. */
  itensPropostas?: number;
  itensReservas?: number;
};

const TRACO = "—";

/**
 * Uma leitura completa e coerente, com cada bloco podendo vir `OK` ou
 * `INDISPONIVEL`. Quando indisponível, o conteúdo acompanha — como o contrato
 * exige e como a F3.3 de fato produz.
 */
function leitura(opcoes: Opcoes = {}): LeituraPainel {
  const {
    competencia = "2026-08-01",
    lidoEmMs = 1_786_000_000_000,
    horaLeitura = "14:32",
    periodo = "agosto de 2026",
    marca = "1",
    periodos = "OK",
    acumulados = "OK",
    equipes: leituraEquipes = "OK",
    estadoQuadro = "OK",
    estadoBigNumber = "OK",
    estadoArea = "OK",
    propostas = "OK",
    reservas = "OK",
    itensPropostas = 2,
    itensReservas = 1,
  } = opcoes;

  const periodosIndisponivel = periodos === "INDISPONIVEL";
  const acumuladosIndisponivel = acumulados === "INDISPONIVEL";
  const equipesIndisponivel = leituraEquipes === "INDISPONIVEL";

  /** Uma lista operacional coerente com o estado de leitura do bloco. */
  const lista = (estado: "OK" | "INDISPONIVEL", quantos: number, prefixo: string) =>
    estado === "INDISPONIVEL"
      ? ({ estado: "INDISPONIVEL" } as const)
      : ({
          estado: "OK" as const,
          itens: Array.from({ length: quantos }, (_, indice) => ({
            imovel: `${prefixo}-${indice}-${marca}`,
            corretor: `Corretor ${indice}`,
          })),
        } as const);

  return {
    competencia,
    lidoEmMs,
    horaLeitura,
    periodo,
    metricas: metricas(),
    blocos: {
      periodos: {
        estadoLeitura: periodos,
        vgvPeriodos: ["Anual", "Trimestral", "Mensal"].map((rotulo) =>
          periodosIndisponivel
            ? { rotulo, valor: { valor: TRACO }, estado: "INDISPONIVEL" as const }
            : {
                rotulo,
                valor: { prefixo: "R$", valor: marca, sufixo: "mi" },
                estado: estadoQuadro === "SEM_DADOS" && rotulo === "Mensal" ? "SEM_DADOS" : "OK",
              },
        ),
        quadroMensal: {
          estado: periodosIndisponivel ? "INDISPONIVEL" : estadoQuadro,
          linhas: Array.from({ length: 7 }, (_, indice) => ({
            rotulo: `Linha ${indice}`,
            valor: periodosIndisponivel || estadoQuadro === "SEM_DADOS" ? TRACO : marca,
          })),
        },
      },
      acumulados: {
        estadoLeitura: acumulados,
        bigNumbers: ["Imóveis vendidos", "VGV acumulado", "Avaliações Google"].map((rotulo) =>
          acumuladosIndisponivel
            ? { rotulo, numero: { valor: TRACO }, estado: "INDISPONIVEL" as const }
            : { rotulo, numero: { valor: marca }, estado: estadoBigNumber },
        ),
      },
      equipes: {
        estadoLeitura: leituraEquipes,
        area: equipesIndisponivel
          ? { estado: "INDISPONIVEL" }
          : estadoArea === "CONFIGURACAO_INVALIDA"
            ? { estado: "CONFIGURACAO_INVALIDA" }
            : { estado: estadoArea, equipes: equipes(marca) },
      },
      propostas: {
        estadoLeitura: propostas,
        lista: lista(propostas, itensPropostas, "AP"),
      },
      reservas: {
        estadoLeitura: reservas,
        lista: lista(reservas, itensReservas, "CA"),
      },
    },
  };
}

describe("T1 — tudo OK substitui tudo", () => {
  it("os três blocos passam a ser os novos", () => {
    const antes = estadoInicial(leitura({ marca: "1" }));
    const depois = resolverAtualizacao(antes, leitura({ marca: "2", lidoEmMs: 1_786_000_060_000, horaLeitura: "14:33" }));

    assert.equal(depois.periodos.dados.quadroMensal.linhas[0].valor, "2");
    assert.equal(depois.acumulados.dados.bigNumbers[0].numero.valor, "2");
    assert.equal(depois.periodos.horaLeitura, "14:33");
    assert.equal(depois.acumulados.horaLeitura, "14:33");
    assert.equal(depois.equipes.horaLeitura, "14:33");
  });
});

describe("T2 — payload fora do contrato não muda nada", () => {
  const invalidos: [string, unknown][] = [
    ["null", null],
    ["texto", "não é json de painel"],
    ["array", []],
    ["objeto vazio", {}],
    ["competência inválida", { ...leitura(), competencia: "2026-08-15" }],
    ["métricas a menos", { ...leitura(), metricas: metricas().slice(0, 7) }],
  ];

  for (const [nome, candidato] of invalidos) {
    it(`recusa ${nome} devolvendo o estado anterior`, () => {
      const antes = estadoInicial(leitura({ marca: "1" }));
      const depois = aplicarPayloadAtualizacao(antes, candidato);

      assert.deepEqual(depois, antes, "o estado precisa sair intacto");
      assert.equal(depois, antes, "e nem sequer recriado");
    });
  }

  it("payload válido passa pelo mesmo caminho", () => {
    const antes = estadoInicial(leitura({ marca: "1" }));
    const depois = aplicarPayloadAtualizacao(antes, leitura({ marca: "2" }));

    assert.notEqual(depois, antes);
    assert.equal(depois.acumulados.dados.bigNumbers[0].numero.valor, "2");
  });
});

describe("T3 — recuperação depois da retenção", () => {
  it("o bloco retido volta a andar quando a leitura volta", () => {
    const antes = estadoInicial(leitura({ marca: "1" }));
    const durante = resolverAtualizacao(antes, leitura({ marca: "2", acumulados: "INDISPONIVEL" }));
    const depois = resolverAtualizacao(durante, leitura({ marca: "3", horaLeitura: "14:34" }));

    assert.equal(durante.acumulados.dados.bigNumbers[0].numero.valor, "1", "reteve");
    assert.equal(depois.acumulados.dados.bigNumbers[0].numero.valor, "3", "recuperou");
    assert.equal(depois.acumulados.horaLeitura, "14:34");
  });
});

describe("T4 — a falha é por bloco, não do painel", () => {
  it("só o bloco indisponível é retido", () => {
    const antes = estadoInicial(leitura({ marca: "1" }));
    const depois = resolverAtualizacao(antes, leitura({ marca: "2", acumulados: "INDISPONIVEL" }));

    assert.equal(depois.acumulados.dados.bigNumbers[0].numero.valor, "1", "acumulados retido");
    assert.equal(depois.periodos.dados.quadroMensal.linhas[0].valor, "2", "períodos avançou");
    assert.equal(
      (depois.equipes.dados.area as { equipes: { rankings: Record<string, { valor: string }[]> }[] })
        .equipes[0].rankings.vendidos[0].valor,
      "2",
      "equipes avançou",
    );
  });
});

describe("T5–T7 — estado de domínio é dado, e substitui", () => {
  it("T5: SEM_DADOS entra no lugar do mês anterior", () => {
    const antes = estadoInicial(leitura({ marca: "1" }));
    const depois = resolverAtualizacao(antes, leitura({ marca: "2", estadoQuadro: "SEM_DADOS" }));

    assert.equal(depois.periodos.dados.quadroMensal.estado, "SEM_DADOS");
    assert.equal(depois.periodos.dados.quadroMensal.linhas[0].valor, TRACO);
  });

  it("T6: CONFIGURACAO_INVALIDA entra no lugar dos quadros", () => {
    const antes = estadoInicial(leitura({ marca: "1" }));
    const depois = resolverAtualizacao(
      antes,
      leitura({ marca: "2", estadoArea: "CONFIGURACAO_INVALIDA" }),
    );

    assert.deepEqual(depois.equipes.dados.area, { estado: "CONFIGURACAO_INVALIDA" });
  });

  it("T7: SEM_SALDO_HISTORICO entra no lugar do acumulado", () => {
    const antes = estadoInicial(leitura({ marca: "1" }));
    const depois = resolverAtualizacao(
      antes,
      leitura({ marca: "2", estadoBigNumber: "SEM_SALDO_HISTORICO" }),
    );

    assert.equal(depois.acumulados.dados.bigNumbers[0].estado, "SEM_SALDO_HISTORICO");
  });
});

describe("T8–T10 — a virada de mês decide o que pode ser retido", () => {
  const agosto = { competencia: "2026-08-01", periodo: "agosto de 2026" };
  const setembro = { competencia: "2026-09-01", periodo: "setembro de 2026" };

  it("T8: acumulados atravessam a virada, porque não têm recorte mensal", () => {
    // Imóveis vendidos e VGV acumulado são desde sempre (DEC-036): o número de
    // agosto continua descrevendo a mesma coisa em setembro.
    const antes = estadoInicial(leitura({ ...agosto, marca: "1" }));
    const depois = resolverAtualizacao(
      antes,
      leitura({ ...setembro, marca: "2", acumulados: "INDISPONIVEL" }),
    );

    assert.equal(depois.acumulados.dados.bigNumbers[0].numero.valor, "1", "retido");
    assert.equal(depois.competencia, "2026-09-01");
  });

  it("T9: períodos NÃO atravessam a virada", () => {
    // Um VGV de agosto sob o rótulo "setembro" seria um número verdadeiro
    // debaixo de uma legenda falsa.
    const antes = estadoInicial(leitura({ ...agosto, marca: "1" }));
    const depois = resolverAtualizacao(
      antes,
      leitura({ ...setembro, marca: "2", periodos: "INDISPONIVEL" }),
    );

    assert.equal(depois.periodos.dados.estadoLeitura, "INDISPONIVEL", "não retido");
    assert.equal(depois.periodos.dados.quadroMensal.linhas[0].valor, TRACO);
  });

  it("T10: equipes NÃO atravessam a virada", () => {
    const antes = estadoInicial(leitura({ ...agosto, marca: "1" }));
    const depois = resolverAtualizacao(
      antes,
      leitura({ ...setembro, marca: "2", equipes: "INDISPONIVEL" }),
    );

    assert.deepEqual(depois.equipes.dados.area, { estado: "INDISPONIVEL" });
  });

  it("dentro do mesmo mês, períodos e equipes são retidos", () => {
    const antes = estadoInicial(leitura({ ...agosto, marca: "1" }));
    const depois = resolverAtualizacao(
      antes,
      leitura({ ...agosto, marca: "2", periodos: "INDISPONIVEL", equipes: "INDISPONIVEL" }),
    );

    assert.equal(depois.periodos.dados.quadroMensal.linhas[0].valor, "1");
    assert.equal(depois.equipes.dados.area.estado, "OK");
  });
});

describe("T11 — indisponível sobre indisponível", () => {
  it("o novo é aceito, porque não há nada bom a guardar", () => {
    const antes = estadoInicial(leitura({ marca: "1", acumulados: "INDISPONIVEL" }));
    const depois = resolverAtualizacao(
      antes,
      leitura({ marca: "2", acumulados: "INDISPONIVEL", lidoEmMs: 1_786_000_060_000, horaLeitura: "14:33" }),
    );

    assert.equal(depois.acumulados.dados.estadoLeitura, "INDISPONIVEL");
    assert.equal(depois.acumulados.horaLeitura, "14:33", "a marca acompanha o novo");
  });
});

describe("T12–T13 — a hora do selo", () => {
  it("T12: é a do bloco OK mais antigo", () => {
    // Com um bloco retido, anunciar a leitura mais recente diria "agora" sobre
    // um número velho.
    const antes = estadoInicial(leitura({ marca: "1", horaLeitura: "14:00" }));
    const depois = resolverAtualizacao(
      antes,
      leitura({
        marca: "2",
        acumulados: "INDISPONIVEL",
        lidoEmMs: 1_786_000_060_000,
        horaLeitura: "14:33",
      }),
    );

    assert.equal(idadeExibida(depois), "14:00", "o acumulado retido é o mais antigo");
  });

  it("blocos indisponíveis não entram na conta", () => {
    const antes = estadoInicial(leitura({ marca: "1", horaLeitura: "14:00" }));
    const depois = resolverAtualizacao(
      antes,
      leitura({
        ...{ competencia: "2026-09-01", periodo: "setembro de 2026" },
        marca: "2",
        periodos: "INDISPONIVEL",
        lidoEmMs: 1_786_000_060_000,
        horaLeitura: "14:33",
      }),
    );

    // Períodos virou INDISPONIVEL (virada de mês); sobram acumulados e equipes.
    assert.equal(idadeExibida(depois), "14:33");
  });

  it("T13: sem nenhum bloco OK, não há selo", () => {
    const estado = estadoInicial(
      leitura({
        periodos: "INDISPONIVEL",
        acumulados: "INDISPONIVEL",
        equipes: "INDISPONIVEL",
        propostas: "INDISPONIVEL",
        reservas: "INDISPONIVEL",
      }),
    );

    assert.equal(idadeExibida(estado), null);
  });
});

describe("T14 — a raiz vem sempre da leitura nova", () => {
  it("período e métricas acompanham o payload mais recente", () => {
    const antes = estadoInicial(leitura({ marca: "1", periodo: "agosto de 2026" }));
    const depois = resolverAtualizacao(
      antes,
      leitura({
        marca: "2",
        competencia: "2026-09-01",
        periodo: "setembro de 2026",
        acumulados: "INDISPONIVEL",
      }),
    );

    assert.equal(depois.periodo, "setembro de 2026");
    assert.equal(depois.competencia, "2026-09-01");
    assert.deepEqual(
      depois.metricas.map((metrica) => metrica.chave),
      CHAVES,
    );
  });
});

describe("T15 — nenhum bloco retido fica em competência alheia", () => {
  it("na virada, só o acumulado — que não é mensal — sobrevive", () => {
    const agosto = leitura({ competencia: "2026-08-01", periodo: "agosto de 2026", marca: "1" });
    let estado = estadoInicial(agosto);

    // Setembro chega com tudo indisponível.
    estado = resolverAtualizacao(
      estado,
      leitura({
        competencia: "2026-09-01",
        periodo: "setembro de 2026",
        marca: "2",
        periodos: "INDISPONIVEL",
        acumulados: "INDISPONIVEL",
        equipes: "INDISPONIVEL",
      }),
    );

    assert.equal(estado.competencia, "2026-09-01");
    assert.equal(estado.periodos.dados.estadoLeitura, "INDISPONIVEL", "período mensal não persiste");
    assert.equal(estado.equipes.dados.estadoLeitura, "INDISPONIVEL", "equipes não persistem");
    assert.equal(estado.acumulados.dados.bigNumbers[0].numero.valor, "1", "acumulado persiste");
  });
});

/**
 * As duas listas da Tela B na retenção (DEC-056).
 *
 * Elas seguem a mesma regra dos outros blocos — falha não apaga dado bom —, com
 * uma diferença: **não** têm recorte mensal. Uma proposta aguardando em 31/08
 * continua aguardando em 01/09, então a trava de competência não se aplica.
 */
describe("T17 — retenção das listas operacionais", () => {
  it("propostas indisponíveis retêm a lista anterior", () => {
    const antes = estadoInicial(leitura({ marca: "1", itensPropostas: 3 }));
    const depois = resolverAtualizacao(antes, leitura({ marca: "2", propostas: "INDISPONIVEL" }));

    assert.equal(depois.propostas.dados.estadoLeitura, "OK", "a lista de antes fica");
    assert.deepEqual(depois.propostas.dados.lista, antes.propostas.dados.lista);
    // E a queda de uma lista não contamina a outra.
    assert.equal(depois.reservas.dados.estadoLeitura, "OK");
    assert.equal(depois.acumulados.dados.bigNumbers[0].numero.valor, "2");
  });

  it("reservas indisponíveis retêm a lista anterior", () => {
    const antes = estadoInicial(leitura({ marca: "1", itensReservas: 3 }));
    const depois = resolverAtualizacao(antes, leitura({ marca: "2", reservas: "INDISPONIVEL" }));

    assert.equal(depois.reservas.dados.estadoLeitura, "OK");
    assert.deepEqual(depois.reservas.dados.lista, antes.reservas.dados.lista);
  });

  it("leitura OK com lista VAZIA substitui — não retém as anteriores", () => {
    const antes = estadoInicial(leitura({ marca: "1", itensPropostas: 3 }));
    const depois = resolverAtualizacao(antes, leitura({ marca: "2", itensPropostas: 0 }));

    // Vazio é dado: significa que não há mais nada em aberto. Reter as três
    // deixaria na parede itens que já saíram.
    assert.equal(depois.propostas.dados.estadoLeitura, "OK");
    assert.deepEqual(depois.propostas.dados.lista, { estado: "OK", itens: [] });
  });

  it("o mesmo vale para reservas", () => {
    const antes = estadoInicial(leitura({ marca: "1", itensReservas: 3 }));
    const depois = resolverAtualizacao(antes, leitura({ marca: "2", itensReservas: 0 }));

    assert.deepEqual(depois.reservas.dados.lista, { estado: "OK", itens: [] });
  });

  it("a retenção atravessa a virada de mês", () => {
    const antes = estadoInicial(leitura({ competencia: "2026-08-01", marca: "1" }));
    const depois = resolverAtualizacao(
      antes,
      leitura({
        competencia: "2026-09-01",
        marca: "2",
        propostas: "INDISPONIVEL",
        reservas: "INDISPONIVEL",
        periodos: "INDISPONIVEL",
      }),
    );

    assert.equal(depois.competencia, "2026-09-01");
    // Períodos caem na virada; as listas operacionais, não — elas não descrevem
    // a produção de um mês.
    assert.equal(depois.periodos.dados.estadoLeitura, "INDISPONIVEL");
    assert.equal(depois.propostas.dados.estadoLeitura, "OK");
    assert.equal(depois.reservas.dados.estadoLeitura, "OK");
  });

  it("a lista retida volta a andar quando a leitura volta", () => {
    const antes = estadoInicial(leitura({ marca: "1" }));
    const durante = resolverAtualizacao(antes, leitura({ marca: "2", propostas: "INDISPONIVEL" }));
    const depois = resolverAtualizacao(durante, leitura({ marca: "3" }));

    assert.equal(depois.propostas.dados.estadoLeitura, "OK");
    assert.ok(
      depois.propostas.dados.lista.estado === "OK" &&
        depois.propostas.dados.lista.itens[0].imovel.endsWith("-3"),
    );
  });

  it("o selo considera as listas: uma lista retida envelhece o selo", () => {
    const antes = estadoInicial(leitura({ marca: "1", horaLeitura: "14:00" }));
    const depois = resolverAtualizacao(
      antes,
      leitura({
        marca: "2",
        lidoEmMs: 1_786_000_600_000,
        horaLeitura: "14:10",
        propostas: "INDISPONIVEL",
      }),
    );

    // A lista de propostas continua sendo a das 14:00; o selo tem de dizer isso.
    assert.equal(idadeExibida(depois), "14:00");
  });

  it("sem nenhum bloco OK, inclusive as listas, não há selo", () => {
    const estado = estadoInicial(
      leitura({
        periodos: "INDISPONIVEL",
        acumulados: "INDISPONIVEL",
        equipes: "INDISPONIVEL",
        propostas: "INDISPONIVEL",
        reservas: "INDISPONIVEL",
      }),
    );

    assert.equal(idadeExibida(estado), null);
  });
});

describe("T16 — a recomposição devolve a apresentação original", () => {
  it("estado inicial de uma leitura OK recompõe exatamente o que a formou", () => {
    const base = leitura({ marca: "7" });

    const esperada: ApresentacaoPainel = {
      periodo: base.periodo,
      bigNumbers: base.blocos.acumulados.bigNumbers,
      vgvPeriodos: base.blocos.periodos.vgvPeriodos,
      quadroMensal: base.blocos.periodos.quadroMensal,
      metricas: base.metricas,
      equipes: base.blocos.equipes.area,
      operacionais: {
        propostas: base.blocos.propostas.lista,
        reservas: base.blocos.reservas.lista,
      },
    };

    assert.deepEqual(comporApresentacao(estadoInicial(base)), esperada);
  });

  it("depois de uma retenção, a apresentação mistura as duas leituras", () => {
    const antes = estadoInicial(leitura({ marca: "1" }));
    const depois = resolverAtualizacao(antes, leitura({ marca: "2", acumulados: "INDISPONIVEL" }));
    const apresentacao = comporApresentacao(depois);

    assert.equal(apresentacao.bigNumbers[0].numero.valor, "1", "acumulado retido");
    assert.equal(apresentacao.quadroMensal.linhas[0].valor, "2", "quadro atualizado");
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { paraDataCivil } from "@/lib/datas";
import {
  calcularMetricasEmpresa,
  calcularMetricasEquipes,
  dividirValorDaVenda,
  validarParticipacoesDaVenda,
  type CorretorMetrica,
  type EquipeMetrica,
  type LancamentoMetrica,
  type MetricasEquipesPuras,
  type ParticipacaoMetrica,
  type VendaMetrica,
} from "@/lib/metricas";

/**
 * Venda compartilhada no núcleo puro (DEC-051, DEC-052).
 *
 * A empresa conta a venda e o valor **uma vez**; cada participante recebe +1 e
 * a sua fração igualitária; cada equipe recebe a soma das frações dos seus
 * participantes. A soma de tudo volta a ser exatamente o valor da venda — é
 * essa invariante que estes testes perseguem em cada caso.
 */

const AGORA = new Date("2026-08-15T15:00:00.000Z");

function participacoes(
  ...pares: readonly (readonly [corretorId: string, equipeId: string])[]
): ParticipacaoMetrica[] {
  return pares.map(([corretorId, equipeId], indice) => ({
    corretorId,
    equipeId,
    ordem: indice + 1,
  }));
}

function venda(
  valor: string | null,
  elenco: readonly ParticipacaoMetrica[],
  dia = "2026-08-10",
): VendaMetrica {
  return { tipo: "VENDA", dataReferencia: paraDataCivil(dia), valor, participacoes: elenco };
}

function corretor(id: string, nomeExibicao: string, equipeId: string, ativo = true): CorretorMetrica {
  return { id, nomeExibicao, equipeId, ativo };
}

function time(id: string, ordemExibicao: number): EquipeMetrica {
  return { id, nome: `Equipe ${id}`, gerenteNome: `Gerente ${id}`, ordemExibicao, ativa: true };
}

const TRES_EQUIPES = [time("A", 1), time("B", 2), time("C", 3)];

/** Soma exata de valores canônicos, para as invariantes de fechamento. */
function somaCanonica(valores: readonly string[]): string {
  let centavos = BigInt(0);
  for (const valor of valores) centavos += BigInt(valor.replace(".", ""));
  const digitos = centavos.toString().padStart(3, "0");
  return `${digitos.slice(0, -2)}.${digitos.slice(-2)}`;
}

/** A linha de um corretor num ranking de equipe. */
function linha(
  resultado: MetricasEquipesPuras,
  equipeId: string,
  chave: "vendidos" | "vgv",
  corretorId: string,
) {
  const equipe = resultado.equipes.find((candidata) => candidata.id === equipeId);
  assert.ok(equipe, `equipe ${equipeId} deveria estar no resultado`);
  const linhas: readonly { corretorId: string; valor: number | string }[] = equipe.rankings[chave];
  return linhas.find((candidata) => candidata.corretorId === corretorId);
}

describe("dividirValorDaVenda — divisão exata em centavos", () => {
  it("um participante leva o valor inteiro", () => {
    const fracoes = dividirValorDaVenda("900000.00", participacoes(["a", "A"]), "teste");
    assert.deepEqual([...fracoes.entries()], [[1, "900000.00"]]);
  });

  it("R$ 100,00 entre três dá 33,34 / 33,33 / 33,33", () => {
    const elenco = participacoes(["a", "A"], ["b", "A"], ["c", "A"]);
    const fracoes = dividirValorDaVenda("100.00", elenco, "teste");

    assert.equal(fracoes.get(1), "33.34");
    assert.equal(fracoes.get(2), "33.33");
    assert.equal(fracoes.get(3), "33.33");
    assert.equal(somaCanonica([...fracoes.values()]), "100.00");
  });

  it("R$ 0,01 entre três: só o primeiro leva o centavo", () => {
    const elenco = participacoes(["a", "A"], ["b", "A"], ["c", "A"]);
    const fracoes = dividirValorDaVenda("0.01", elenco, "teste");

    assert.deepEqual([...fracoes.values()], ["0.01", "0.00", "0.00"]);
    assert.equal(somaCanonica([...fracoes.values()]), "0.01");
  });

  it("residual de dois centavos vai para os dois primeiros", () => {
    const elenco = participacoes(["a", "A"], ["b", "A"], ["c", "A"]);
    const fracoes = dividirValorDaVenda("100.01", elenco, "teste");

    assert.deepEqual([...fracoes.values()], ["33.34", "33.34", "33.33"]);
    assert.equal(somaCanonica([...fracoes.values()]), "100.01");
  });

  it("o topo de Decimal(14,2) fecha exato", () => {
    const elenco = participacoes(["a", "A"], ["b", "B"], ["c", "C"]);
    const fracoes = dividirValorDaVenda("999999999999.99", elenco, "teste");
    assert.equal(somaCanonica([...fracoes.values()]), "999999999999.99");
  });

  it("a soma fecha para qualquer resto entre 1 e N-1", () => {
    for (let n = 1; n <= 7; n += 1) {
      const elenco = participacoes(
        ...Array.from({ length: n }, (_, i) => [`c${i}`, "A"] as const),
      );
      for (const valor of ["100.00", "100.01", "100.02", "0.05", "1234567.89"]) {
        const fracoes = dividirValorDaVenda(valor, elenco, "teste");
        assert.equal(somaCanonica([...fracoes.values()]), valor, `${valor} entre ${n}`);
      }
    }
  });

  it("não muda a lista de participações recebida", () => {
    const elenco = participacoes(["a", "A"], ["b", "B"]);
    const copia = elenco.map((participacao) => ({ ...participacao }));
    dividirValorDaVenda("100.00", elenco, "teste");
    assert.deepEqual(elenco, copia);
  });
});

describe("validarParticipacoesDaVenda — estrutura exigida", () => {
  it("aceita 1..N contíguo sem repetição", () => {
    assert.doesNotThrow(() =>
      validarParticipacoesDaVenda(participacoes(["a", "A"], ["b", "B"], ["c", "C"]), "teste"),
    );
  });

  it("recusa venda sem participação", () => {
    assert.throws(() => validarParticipacoesDaVenda([], "teste"), /sem participação/i);
  });

  it("recusa ordem repetida", () => {
    const elenco = [
      { corretorId: "a", equipeId: "A", ordem: 1 },
      { corretorId: "b", equipeId: "B", ordem: 1 },
    ];
    assert.throws(() => validarParticipacoesDaVenda(elenco, "teste"), /Ordem de participação repetida/);
  });

  it("recusa buraco na ordem", () => {
    const elenco = [
      { corretorId: "a", equipeId: "A", ordem: 1 },
      { corretorId: "b", equipeId: "B", ordem: 3 },
    ];
    assert.throws(() => validarParticipacoesDaVenda(elenco, "teste"), /fora de 1\.\.2/);
  });

  it("recusa ordem que não começa em 1", () => {
    const elenco = [
      { corretorId: "a", equipeId: "A", ordem: 0 },
      { corretorId: "b", equipeId: "B", ordem: 1 },
    ];
    assert.throws(() => validarParticipacoesDaVenda(elenco, "teste"), /fora de 1\.\.2/);
  });

  it("recusa ordem não inteira", () => {
    const elenco = [{ corretorId: "a", equipeId: "A", ordem: 1.5 }];
    assert.throws(() => validarParticipacoesDaVenda(elenco, "teste"), /fora de 1\.\.1/);
  });

  it("recusa o mesmo corretor duas vezes", () => {
    const elenco = [
      { corretorId: "a", equipeId: "A", ordem: 1 },
      { corretorId: "a", equipeId: "B", ordem: 2 },
    ];
    assert.throws(() => validarParticipacoesDaVenda(elenco, "teste"), /Corretor repetido/);
  });
});

describe("empresa não infla com o número de participantes", () => {
  it("uma venda de três conta uma venda e um VGV", () => {
    const compartilhada = venda("900000.00", participacoes(["a", "A"], ["b", "A"], ["c", "B"]));
    const metricas = calcularMetricasEmpresa([compartilhada], [], AGORA);

    assert.equal(metricas.quadroMensal.VENDA, 1);
    assert.equal(metricas.vgvPeriodos.mensal, "900000.00");
    assert.equal(metricas.vgvPeriodos.trimestral, "900000.00");
    assert.equal(metricas.vgvPeriodos.anual, "900000.00");
  });

  it("o acumulado conta a venda uma vez e soma o valor uma vez", () => {
    const compartilhada = venda("900000.00", participacoes(["a", "A"], ["b", "A"], ["c", "B"]));
    const metricas = calcularMetricasEmpresa(
      [compartilhada],
      [
        {
          tipo: "VENDA",
          quantidade: 10,
          valorTotal: "100000.00",
          precisao: "EXATO",
          dataCorte: paraDataCivil("2026-07-31"),
        },
      ],
      AGORA,
    );

    assert.deepEqual(metricas.acumulados.vendidos, { estado: "OK", valor: 11, precisao: "EXATO" });
    assert.deepEqual(metricas.acumulados.vgv, { estado: "OK", valor: "1000000.00", precisao: "EXATO" });
  });

  it("venda sem valor continua falhando alto", () => {
    const semValor = venda(null, participacoes(["a", "A"], ["b", "B"]));
    assert.throws(() => calcularMetricasEmpresa([semValor], [], AGORA), /VENDA sem valor/);
  });
});

describe("exemplo canônico da DEC-052 — R$ 900.000, A e B na equipe A, C na B", () => {
  const compartilhada = venda("900000.00", participacoes(["a", "A"], ["b", "A"], ["c", "B"]));
  const corretores = [
    corretor("a", "Ana", "A"),
    corretor("b", "Bruno", "A"),
    corretor("c", "Carla", "B"),
  ];
  const resultado = calcularMetricasEquipes(
    [compartilhada as LancamentoMetrica],
    corretores,
    TRES_EQUIPES,
    AGORA,
  );

  it("cada participante recebe +1 vendido", () => {
    assert.equal(linha(resultado, "A", "vendidos", "a")?.valor, 1);
    assert.equal(linha(resultado, "A", "vendidos", "b")?.valor, 1);
    assert.equal(linha(resultado, "B", "vendidos", "c")?.valor, 1);
  });

  it("cada participante recebe a fração igualitária", () => {
    assert.equal(linha(resultado, "A", "vgv", "a")?.valor, "300000.00");
    assert.equal(linha(resultado, "A", "vgv", "b")?.valor, "300000.00");
    assert.equal(linha(resultado, "B", "vgv", "c")?.valor, "300000.00");
  });

  it("a equipe A soma 600 mil e a B, 300 mil — juntas, o valor integral", () => {
    const daEquipeA = somaCanonica(
      resultado.equipes
        .find((equipe) => equipe.id === "A")!
        .rankings.vgv.map((item) => item.valor),
    );
    const daEquipeB = somaCanonica(
      resultado.equipes
        .find((equipe) => equipe.id === "B")!
        .rankings.vgv.map((item) => item.valor),
    );

    assert.equal(daEquipeA, "600000.00");
    assert.equal(daEquipeB, "300000.00");
    assert.equal(somaCanonica([daEquipeA, daEquipeB]), "900000.00");
  });

  it("a equipe C, sem participante, não recebe nada da venda", () => {
    const equipeC = resultado.equipes.find((equipe) => equipe.id === "C");
    assert.deepEqual(equipeC?.rankings.vgv, []);
  });

  it("a empresa continua contando uma venda de 900 mil", () => {
    const empresa = calcularMetricasEmpresa([compartilhada], [], AGORA);
    assert.equal(empresa.quadroMensal.VENDA, 1);
    assert.equal(empresa.vgvPeriodos.mensal, "900000.00");
  });
});

describe("crédito por equipe", () => {
  it("dois participantes da mesma equipe não dobram o VGV dela", () => {
    const compartilhada = venda("900000.00", participacoes(["a", "A"], ["b", "A"]));
    const resultado = calcularMetricasEquipes(
      [compartilhada],
      [corretor("a", "Ana", "A"), corretor("b", "Bruno", "A")],
      TRES_EQUIPES,
      AGORA,
    );

    // Se a venda fosse creditada por participação pelo valor cheio, daria
    // 1.800.000,00 — o dobro do que a empresa registrou.
    const daEquipeA = somaCanonica(
      resultado.equipes.find((equipe) => equipe.id === "A")!.rankings.vgv.map((i) => i.valor),
    );
    assert.equal(daEquipeA, "900000.00");
    assert.equal(linha(resultado, "A", "vgv", "a")?.valor, "450000.00");
    assert.equal(linha(resultado, "A", "vgv", "b")?.valor, "450000.00");
  });

  it("participantes de equipes diferentes creditam cada uma a sua fração", () => {
    const compartilhada = venda("100.00", participacoes(["a", "A"], ["b", "B"], ["c", "C"]));
    const resultado = calcularMetricasEquipes(
      [compartilhada],
      [corretor("a", "Ana", "A"), corretor("b", "Bruno", "B"), corretor("c", "Carla", "C")],
      TRES_EQUIPES,
      AGORA,
    );

    assert.equal(linha(resultado, "A", "vgv", "a")?.valor, "33.34");
    assert.equal(linha(resultado, "B", "vgv", "b")?.valor, "33.33");
    assert.equal(linha(resultado, "C", "vgv", "c")?.valor, "33.33");
  });

  it("o participante entra no elenco da equipe da participação, não da lotação de hoje", () => {
    // Transferido: hoje está na B, mas a participação é da A.
    const compartilhada = venda("900000.00", participacoes(["x", "A"], ["y", "B"]));
    const resultado = calcularMetricasEquipes(
      [compartilhada],
      [corretor("x", "Xavier", "B"), corretor("y", "Yara", "B")],
      TRES_EQUIPES,
      AGORA,
    );

    assert.equal(linha(resultado, "A", "vgv", "x")?.valor, "450000.00");
    assert.equal(linha(resultado, "B", "vgv", "x")?.valor, "0.00");
    assert.equal(linha(resultado, "B", "vgv", "y")?.valor, "450000.00");
  });

  it("participante inativo fica fora do ranking sem sumir da empresa", () => {
    const compartilhada = venda("900000.00", participacoes(["a", "A"], ["z", "A"]));
    const resultado = calcularMetricasEquipes(
      [compartilhada],
      [corretor("a", "Ana", "A"), corretor("z", "Zeca", "A", false)],
      TRES_EQUIPES,
      AGORA,
    );

    assert.equal(linha(resultado, "A", "vgv", "z"), undefined);
    assert.equal(linha(resultado, "A", "vgv", "a")?.valor, "450000.00");

    // A venda inteira continua nos números da empresa.
    const empresa = calcularMetricasEmpresa([compartilhada], [], AGORA);
    assert.equal(empresa.vgvPeriodos.mensal, "900000.00");
    assert.equal(empresa.quadroMensal.VENDA, 1);
  });

  it("estrutura inválida derruba o cálculo das equipes em vez de creditar torto", () => {
    const semElenco = venda("900000.00", []);
    assert.throws(
      () => calcularMetricasEquipes([semElenco], [corretor("a", "Ana", "A")], TRES_EQUIPES, AGORA),
      /sem participação/i,
    );
  });

  it("eventos individuais continuam creditando pelo lançamento", () => {
    const locacao: LancamentoMetrica = {
      tipo: "LOCACAO",
      corretorId: "a",
      equipeId: "A",
      dataReferencia: paraDataCivil("2026-08-11"),
      valor: "3500.00",
    };
    const resultado = calcularMetricasEquipes(
      [locacao],
      [corretor("a", "Ana", "B")],
      TRES_EQUIPES,
      AGORA,
    );

    assert.equal(linha(resultado, "A", "vendidos", "a")?.valor, 0);
    assert.equal(linha(resultado, "A", "vgv", "a")?.valor, "0.00");
    // A locação conta na equipe do evento, não na lotação atual.
    const equipeA = resultado.equipes.find((equipe) => equipe.id === "A");
    assert.equal(equipeA?.rankings.locados.find((item) => item.corretorId === "a")?.valor, 1);
  });
});

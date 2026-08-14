import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ChaveMetrica, Linha } from "@/lib/apresentacao-painel";
import { ehLeituraPainel, type LeituraPainel } from "@/lib/contrato-atualizacao-painel";

/**
 * O portão de entrada do payload que chega pela rede.
 *
 * A disciplina aqui é a de um validador de fronteira: cada teste corrompe **um**
 * campo de um payload que sabidamente passa, para provar que a recusa veio
 * daquele campo e não de outro. O ponto mais delicado não é a forma — é a
 * **coerência**: um payload que diga `estadoLeitura: "OK"` carregando conteúdo
 * `INDISPONIVEL` é contraditório, e aceitá-lo apagaria dado bom da parede.
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

function rankings(): Record<ChaveMetrica, Linha[]> {
  return Object.fromEntries(
    CHAVES.map((chave) => [chave, [{ rotulo: "Ana", valor: "3" }]]),
  ) as Record<ChaveMetrica, Linha[]>;
}

function equipe(nome: string) {
  return { nome, gerente: `Gerente ${nome}`, totalCorretores: 7, rankings: rankings() };
}

function tresEquipes() {
  return [equipe("Alfa"), equipe("Beta"), equipe("Gama")];
}

/** Um payload completo e coerente — a base que cada teste corrompe num ponto só. */
function leituraValida(): LeituraPainel {
  return {
    competencia: "2026-08-01",
    lidoEmMs: 1_786_000_000_000,
    horaLeitura: "14:32",
    periodo: "agosto de 2026",
    metricas: metricas(),
    blocos: {
      periodos: {
        estadoLeitura: "OK",
        vgvPeriodos: [
          { rotulo: "Anual", valor: { prefixo: "R$", valor: "431", sufixo: "mi" }, estado: "OK" },
          {
            rotulo: "Trimestral",
            valor: { prefixo: "R$", valor: "128", sufixo: "mi" },
            estado: "OK",
          },
          { rotulo: "Mensal", valor: { prefixo: "R$", valor: "42,5", sufixo: "mi" }, estado: "OK" },
        ],
        quadroMensal: {
          estado: "OK",
          linhas: [
            { rotulo: "Vendidos", valor: "30" },
            { rotulo: "Locados", valor: "34" },
            { rotulo: "Captação de venda", valor: "71" },
            { rotulo: "Exclusividades", valor: "23" },
            { rotulo: "Captação de locação", valor: "46" },
            { rotulo: "Propostas", valor: "87" },
            { rotulo: "Avaliações Google", valor: "40" },
          ],
        },
      },
      acumulados: {
        estadoLeitura: "OK",
        bigNumbers: [
          { rotulo: "Imóveis vendidos", numero: { valor: "528" }, estado: "OK" },
          {
            rotulo: "VGV acumulado",
            numero: { prefixo: "R$", valor: "4,2", sufixo: "bi" },
            estado: "OK",
          },
          { rotulo: "Avaliações Google", numero: { valor: "2.643" }, estado: "OK" },
        ],
      },
      equipes: {
        estadoLeitura: "OK",
        area: { estado: "OK", equipes: tresEquipes() },
      },
      propostas: {
        estadoLeitura: "OK",
        lista: {
          estado: "OK",
          itens: [
            { imovel: "AP-1203", corretor: "Marina" },
            { imovel: "CA-450", corretor: "Rodrigo" },
          ],
        },
      },
      reservas: {
        estadoLeitura: "OK",
        lista: { estado: "OK", itens: [{ imovel: "AP-88", corretor: "Camila" }] },
      },
    },
  };
}

/**
 * As duas listas da Tela B no contrato (DEC-056).
 *
 * O que se valida aqui é o mesmo de sempre: forma e **coerência**. Um bloco que
 * diga `INDISPONIVEL` carregando itens é contraditório, e aceitá-lo apagaria da
 * parede a lista que estava retida.
 */
describe("listas operacionais no contrato", () => {
  it("aceita lista vazia — zero em aberto é dado válido", () => {
    assert.equal(
      ehLeituraPainel(
        corromper((leitura) => {
          leitura.blocos.propostas.lista = { estado: "OK", itens: [] };
          leitura.blocos.reservas.lista = { estado: "OK", itens: [] };
        }),
      ),
      true,
    );
  });

  it("aceita exatamente três itens", () => {
    assert.equal(
      ehLeituraPainel(
        corromper((leitura) => {
          leitura.blocos.propostas.lista = {
            estado: "OK",
            itens: [
              { imovel: "A", corretor: "1" },
              { imovel: "B", corretor: "2" },
              { imovel: "C", corretor: "3" },
            ],
          };
        }),
      ),
      true,
    );
  });

  it("recusa quatro itens: o teto da Tela B é três", () => {
    assert.equal(
      ehLeituraPainel(
        corromper((leitura) => {
          leitura.blocos.propostas.lista = {
            estado: "OK",
            itens: [
              { imovel: "A", corretor: "1" },
              { imovel: "B", corretor: "2" },
              { imovel: "C", corretor: "3" },
              { imovel: "D", corretor: "4" },
            ],
          };
        }),
      ),
      false,
    );
  });

  it("recusa item sem imóvel ou sem corretor", () => {
    const semImovel = corromper((leitura) => {
      leitura.blocos.reservas.lista = {
        estado: "OK",
        itens: [{ imovel: "", corretor: "Camila" }],
      };
    });
    const semCorretor = corromper((leitura) => {
      leitura.blocos.reservas.lista = {
        estado: "OK",
        itens: [{ imovel: "AP-88" } as never],
      };
    });

    assert.equal(ehLeituraPainel(semImovel), false);
    assert.equal(ehLeituraPainel(semCorretor), false);
  });

  it("recusa itens que não são objeto", () => {
    assert.equal(
      ehLeituraPainel(
        corromper((leitura) => {
          leitura.blocos.propostas.lista = { estado: "OK", itens: ["AP-1" as never] };
        }),
      ),
      false,
    );
  });

  it("aceita bloco indisponível sem itens", () => {
    assert.equal(
      ehLeituraPainel(
        corromper((leitura) => {
          leitura.blocos.propostas.estadoLeitura = "INDISPONIVEL";
          leitura.blocos.propostas.lista = { estado: "INDISPONIVEL" };
        }),
      ),
      true,
    );
  });

  it("recusa bloco indisponível carregando itens", () => {
    assert.equal(
      ehLeituraPainel(
        corromper((leitura) => {
          leitura.blocos.propostas.estadoLeitura = "INDISPONIVEL";
          leitura.blocos.propostas.lista = {
            estado: "INDISPONIVEL",
            itens: [{ imovel: "AP-1", corretor: "Ana" }],
          } as never;
        }),
      ),
      false,
    );
  });

  it("recusa leitura OK com lista indisponível, e o contrário", () => {
    const okComListaCaida = corromper((leitura) => {
      leitura.blocos.reservas.estadoLeitura = "OK";
      leitura.blocos.reservas.lista = { estado: "INDISPONIVEL" };
    });
    const caidoComListaOk = corromper((leitura) => {
      leitura.blocos.reservas.estadoLeitura = "INDISPONIVEL";
      leitura.blocos.reservas.lista = { estado: "OK", itens: [] };
    });

    assert.equal(ehLeituraPainel(okComListaCaida), false);
    assert.equal(ehLeituraPainel(caidoComListaOk), false);
  });

  it("recusa payload sem os blocos operacionais", () => {
    assert.equal(
      ehLeituraPainel(
        corromper((leitura) => {
          delete (leitura.blocos as Partial<LeituraPainel["blocos"]>).propostas;
        }),
      ),
      false,
    );
  });

  it("uma lista caída não invalida a outra", () => {
    assert.equal(
      ehLeituraPainel(
        corromper((leitura) => {
          leitura.blocos.propostas.estadoLeitura = "INDISPONIVEL";
          leitura.blocos.propostas.lista = { estado: "INDISPONIVEL" };
        }),
      ),
      true,
    );
  });
});

/** Corrompe o payload válido e devolve o objeto solto, para o validador julgar. */
function corromper(mutar: (leitura: LeituraPainel) => void): unknown {
  const leitura = leituraValida();
  mutar(leitura);
  return leitura;
}

describe("payload válido", () => {
  it("a base usada pelos demais testes passa", () => {
    assert.equal(ehLeituraPainel(leituraValida()), true);
  });

  it("sobrevive a uma volta por JSON", () => {
    const ida = leituraValida();
    assert.equal(ehLeituraPainel(JSON.parse(JSON.stringify(ida))), true);
  });

  it("prefixo e sufixo continuam opcionais", () => {
    const semAdornos = corromper((leitura) => {
      leitura.blocos.acumulados.bigNumbers[1].numero = { valor: "4,2" };
    });
    assert.equal(ehLeituraPainel(semAdornos), true);
  });
});

describe("raiz", () => {
  it("recusa o que não é objeto", () => {
    for (const valor of [null, undefined, 42, "texto", true, [], () => {}]) {
      assert.equal(ehLeituraPainel(valor), false, `${JSON.stringify(valor ?? null)} não é leitura`);
    }
  });

  it("recusa competência fora do primeiro dia do mês", () => {
    assert.equal(ehLeituraPainel(corromper((l) => (l.competencia = "2026-08-15"))), false);
    assert.equal(ehLeituraPainel(corromper((l) => (l.competencia = "2026-08"))), false);
    assert.equal(ehLeituraPainel(corromper((l) => (l.competencia = "agosto"))), false);
  });

  it("recusa mês 13", () => {
    assert.equal(ehLeituraPainel(corromper((l) => (l.competencia = "2026-13-01"))), false);
  });

  it("recusa mês 00", () => {
    assert.equal(ehLeituraPainel(corromper((l) => (l.competencia = "2026-00-01"))), false);
  });

  it("recusa lidoEmMs que não é número finito e positivo", () => {
    assert.equal(ehLeituraPainel(corromper((l) => (l.lidoEmMs = Number.NaN))), false);
    assert.equal(ehLeituraPainel(corromper((l) => (l.lidoEmMs = Number.POSITIVE_INFINITY))), false);
    assert.equal(ehLeituraPainel(corromper((l) => (l.lidoEmMs = 0))), false);
    assert.equal(ehLeituraPainel(corromper((l) => (l.lidoEmMs = -1))), false);
  });

  it("recusa lidoEmMs ausente", () => {
    const semCampo = leituraValida() as Partial<LeituraPainel>;
    delete semCampo.lidoEmMs;
    assert.equal(ehLeituraPainel(semCampo), false);
  });

  it("recusa hora fora de HH:mm em 24 horas", () => {
    for (const hora of ["24:00", "9:05", "14:60", "14h32", "", "1432"]) {
      assert.equal(ehLeituraPainel(corromper((l) => (l.horaLeitura = hora))), false, hora);
    }
  });

  it("aceita as bordas do relógio", () => {
    assert.equal(ehLeituraPainel(corromper((l) => (l.horaLeitura = "00:00"))), true);
    assert.equal(ehLeituraPainel(corromper((l) => (l.horaLeitura = "23:59"))), true);
  });

  it("recusa período vazio", () => {
    assert.equal(ehLeituraPainel(corromper((l) => (l.periodo = ""))), false);
  });
});

describe("métricas", () => {
  it("recusa quantidade diferente de oito", () => {
    assert.equal(ehLeituraPainel(corromper((l) => l.metricas.pop())), false);
    assert.equal(
      ehLeituraPainel(
        corromper((l) => l.metricas.push({ chave: "extra", nome: "Extra" } as never)),
      ),
      false,
    );
  });

  it("recusa chave duplicada", () => {
    // Duas métricas com a mesma chave fariam um ranking sobrescrever o outro.
    assert.equal(
      ehLeituraPainel(corromper((l) => (l.metricas[7] = { chave: "vendidos", nome: "Repetida" }))),
      false,
    );
  });

  it("recusa chave ou nome vazio", () => {
    assert.equal(ehLeituraPainel(corromper((l) => (l.metricas[0].chave = "" as never))), false);
    assert.equal(ehLeituraPainel(corromper((l) => (l.metricas[0].nome = ""))), false);
  });
});

describe("blocos e estados de leitura", () => {
  it("recusa bloco ausente", () => {
    for (const bloco of ["periodos", "acumulados", "equipes"] as const) {
      const sem = leituraValida();
      delete (sem.blocos as Record<string, unknown>)[bloco];
      assert.equal(ehLeituraPainel(sem), false, `sem ${bloco}`);
    }
  });

  it("recusa estadoLeitura desconhecido", () => {
    assert.equal(
      ehLeituraPainel(
        corromper((l) => {
          (l.blocos.periodos as { estadoLeitura: string }).estadoLeitura = "TALVEZ";
        }),
      ),
      false,
    );
  });

  it("recusa `blocos` que não é objeto", () => {
    assert.equal(
      ehLeituraPainel(corromper((l) => ((l as { blocos: unknown }).blocos = null))),
      false,
    );
  });
});

describe("quantidades dos blocos de apresentação", () => {
  it("recusa VGV com quantidade errada", () => {
    assert.equal(ehLeituraPainel(corromper((l) => l.blocos.periodos.vgvPeriodos.pop())), false);
  });

  it("recusa big numbers com quantidade errada", () => {
    assert.equal(ehLeituraPainel(corromper((l) => l.blocos.acumulados.bigNumbers.pop())), false);
  });

  it("recusa quadro mensal com seis linhas", () => {
    assert.equal(ehLeituraPainel(corromper((l) => l.blocos.periodos.quadroMensal.linhas.pop())), false);
  });

  it("recusa ValorComposto malformado", () => {
    assert.equal(
      ehLeituraPainel(
        corromper((l) => {
          (l.blocos.acumulados.bigNumbers[0] as { numero: unknown }).numero = { valor: 528 };
        }),
      ),
      false,
    );
  });

  it("recusa Linha malformada", () => {
    assert.equal(
      ehLeituraPainel(
        corromper((l) => {
          (l.blocos.periodos.quadroMensal.linhas[0] as { valor: unknown }).valor = 30;
        }),
      ),
      false,
    );
  });
});

describe("área de equipes — quem carrega lista e quem não carrega", () => {
  it("recusa OK sem equipes", () => {
    assert.equal(
      ehLeituraPainel(corromper((l) => (l.blocos.equipes.area = { estado: "OK" } as never))),
      false,
    );
  });

  it("recusa SEM_DADOS sem equipes", () => {
    assert.equal(
      ehLeituraPainel(corromper((l) => (l.blocos.equipes.area = { estado: "SEM_DADOS" } as never))),
      false,
    );
  });

  it("recusa OK com lista vazia", () => {
    assert.equal(
      ehLeituraPainel(corromper((l) => (l.blocos.equipes.area = { estado: "OK", equipes: [] }))),
      false,
    );
  });

  it("recusa menos ou mais de três equipes", () => {
    assert.equal(
      ehLeituraPainel(
        corromper(
          (l) => (l.blocos.equipes.area = { estado: "OK", equipes: [equipe("Alfa"), equipe("Beta")] }),
        ),
      ),
      false,
    );
    assert.equal(
      ehLeituraPainel(
        corromper(
          (l) =>
            (l.blocos.equipes.area = {
              estado: "OK",
              equipes: [...tresEquipes(), equipe("Delta")],
            }),
        ),
      ),
      false,
    );
  });

  it("aceita SEM_DADOS com as três equipes", () => {
    // O elenco é conhecido mesmo sem produção no mês (DEC-039).
    assert.equal(
      ehLeituraPainel(
        corromper((l) => (l.blocos.equipes.area = { estado: "SEM_DADOS", equipes: tresEquipes() })),
      ),
      true,
    );
  });

  it("recusa INDISPONIVEL que traga equipes", () => {
    assert.equal(
      ehLeituraPainel(
        corromper((l) => {
          l.blocos.equipes.estadoLeitura = "INDISPONIVEL";
          l.blocos.equipes.area = { estado: "INDISPONIVEL", equipes: tresEquipes() } as never;
        }),
      ),
      false,
    );
  });

  it("recusa CONFIGURACAO_INVALIDA que traga equipes", () => {
    assert.equal(
      ehLeituraPainel(
        corromper((l) => {
          l.blocos.equipes.area = {
            estado: "CONFIGURACAO_INVALIDA",
            equipes: tresEquipes(),
          } as never;
        }),
      ),
      false,
    );
  });

  it("aceita os dois estados sem lista", () => {
    assert.equal(
      ehLeituraPainel(
        corromper((l) => (l.blocos.equipes.area = { estado: "CONFIGURACAO_INVALIDA" })),
      ),
      true,
    );
    assert.equal(
      ehLeituraPainel(
        corromper((l) => {
          l.blocos.equipes.estadoLeitura = "INDISPONIVEL";
          l.blocos.equipes.area = { estado: "INDISPONIVEL" };
        }),
      ),
      true,
    );
  });

  it("recusa equipe sem o ranking de uma métrica do ciclo", () => {
    // A rotação pediria essa chave e encontraria `undefined`.
    assert.equal(
      ehLeituraPainel(
        corromper((l) => {
          const area = l.blocos.equipes.area as { equipes: { rankings: Record<string, unknown> }[] };
          delete area.equipes[0].rankings.propostas;
        }),
      ),
      false,
    );
  });

  it("recusa equipe com campo estrutural errado", () => {
    assert.equal(
      ehLeituraPainel(
        corromper((l) => {
          const area = l.blocos.equipes.area as { equipes: { totalCorretores: unknown }[] };
          area.equipes[0].totalCorretores = "sete";
        }),
      ),
      false,
    );
  });
});

describe("coerência cruzada — períodos", () => {
  it("recusa leitura OK com quadro INDISPONIVEL", () => {
    assert.equal(
      ehLeituraPainel(corromper((l) => (l.blocos.periodos.quadroMensal.estado = "INDISPONIVEL"))),
      false,
    );
  });

  it("recusa leitura OK com algum VGV INDISPONIVEL", () => {
    assert.equal(
      ehLeituraPainel(corromper((l) => (l.blocos.periodos.vgvPeriodos[2].estado = "INDISPONIVEL"))),
      false,
    );
  });

  it("recusa leitura INDISPONIVEL com VGV que não é INDISPONIVEL", () => {
    assert.equal(
      ehLeituraPainel(corromper((l) => (l.blocos.periodos.estadoLeitura = "INDISPONIVEL"))),
      false,
    );
  });

  it("aceita o bloco de períodos inteiramente indisponível", () => {
    assert.equal(
      ehLeituraPainel(
        corromper((l) => {
          l.blocos.periodos.estadoLeitura = "INDISPONIVEL";
          l.blocos.periodos.quadroMensal.estado = "INDISPONIVEL";
          for (const item of l.blocos.periodos.vgvPeriodos) item.estado = "INDISPONIVEL";
        }),
      ),
      true,
    );
  });

  it("aceita SEM_DADOS dentro de uma leitura OK", () => {
    // Mês vazio é dado, não falha de leitura (DEC-039).
    assert.equal(
      ehLeituraPainel(
        corromper((l) => {
          l.blocos.periodos.quadroMensal.estado = "SEM_DADOS";
          l.blocos.periodos.vgvPeriodos[2].estado = "SEM_DADOS";
        }),
      ),
      true,
    );
  });
});

describe("coerência cruzada — acumulados", () => {
  it("recusa leitura OK com big number INDISPONIVEL", () => {
    assert.equal(
      ehLeituraPainel(corromper((l) => (l.blocos.acumulados.bigNumbers[0].estado = "INDISPONIVEL"))),
      false,
    );
  });

  it("recusa leitura INDISPONIVEL com big number que não é INDISPONIVEL", () => {
    assert.equal(
      ehLeituraPainel(corromper((l) => (l.blocos.acumulados.estadoLeitura = "INDISPONIVEL"))),
      false,
    );
  });

  it("aceita SEM_SALDO_HISTORICO dentro de uma leitura OK", () => {
    assert.equal(
      ehLeituraPainel(
        corromper((l) => (l.blocos.acumulados.bigNumbers[0].estado = "SEM_SALDO_HISTORICO")),
      ),
      true,
    );
  });
});

describe("coerência cruzada — equipes", () => {
  it("recusa leitura OK com área INDISPONIVEL", () => {
    assert.equal(
      ehLeituraPainel(corromper((l) => (l.blocos.equipes.area = { estado: "INDISPONIVEL" }))),
      false,
    );
  });

  it("recusa leitura INDISPONIVEL com área diferente de INDISPONIVEL", () => {
    assert.equal(
      ehLeituraPainel(corromper((l) => (l.blocos.equipes.estadoLeitura = "INDISPONIVEL"))),
      false,
    );
  });

  it("aceita CONFIGURACAO_INVALIDA dentro de uma leitura OK", () => {
    assert.equal(
      ehLeituraPainel(
        corromper((l) => (l.blocos.equipes.area = { estado: "CONFIGURACAO_INVALIDA" })),
      ),
      true,
    );
  });
});

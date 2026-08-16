import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  avancarCelebracao,
  DURACAO_CELEBRACAO_MS,
  estadoInicialCelebracoes,
  incorporarCelebracoes,
  type EstadoCelebracoes,
} from "@/lib/celebracao-cliente";
import type { CelebracaoTV, RespostaCelebracoes } from "@/lib/contrato-celebracao";

/**
 * A fila da TV, provada sem navegador.
 *
 * O endpoint devolve **todas** as celebrações dos últimos cinco minutos, e o
 * poll acontece a cada cinco segundos: a mesma celebração volta muitas vezes. O
 * que estes testes fixam é que ela aparece uma vez só, que nenhuma se perde no
 * caminho, e que o que chega enquanto outra está em cena espera a vez.
 */

let contador = 0;

function celebracao(id: string, valor: string | null = "900000.00"): CelebracaoTV {
  contador += 1;
  return {
    id,
    criadoEm: new Date(Date.UTC(2026, 7, 16, 14, 0, contador)).toISOString(),
    valor,
    imovelRef: `AP-${id}`,
    participantes: [{ ordem: 1, corretorNome: `Corretor ${id}`, equipeNome: "Equipe Suellen" }],
  };
}

const resposta = (...celebracoes: CelebracaoTV[]): RespostaCelebracoes => ({ celebracoes });

const idsDaFila = (estado: EstadoCelebracoes) => estado.fila.map((c) => c.id);

describe("fila de celebrações da TV", () => {
  /* F1 ---------------------------------------------------------------- */
  it("F1 — a primeira celebração entra e vai direto para a tela", () => {
    const a = celebracao("A");

    const estado = incorporarCelebracoes(estadoInicialCelebracoes, resposta(a));

    assert.equal(estado.atual?.id, "A", "com a TV livre, entra em cena na hora");
    assert.deepEqual(idsDaFila(estado), [], "nada esperando atrás dela");
    assert.equal(estado.vistos.has("A"), true);
  });

  /* F2 ---------------------------------------------------------------- */
  it("F2 — o mesmo payload no poll seguinte não repete a celebração", () => {
    const a = celebracao("A");

    const primeiro = incorporarCelebracoes(estadoInicialCelebracoes, resposta(a));
    const segundo = incorporarCelebracoes(primeiro, resposta(a));

    assert.equal(segundo.atual?.id, "A", "continua a mesma em cena");
    assert.deepEqual(idsDaFila(segundo), [], "não foi enfileirada de novo");

    // E nem depois de terminar: o id continua conhecido.
    const terminou = avancarCelebracao(segundo);
    assert.equal(terminou.atual, null);

    const terceiro = incorporarCelebracoes(terminou, resposta(a));
    assert.equal(terceiro.atual, null, "A não ressuscita depois de ter passado");
    assert.deepEqual(idsDaFila(terceiro), []);
  });

  /* F3 ---------------------------------------------------------------- */
  it("F3 — de [A, B] para [A, B, C], só C é novo", () => {
    const a = celebracao("A");
    const b = celebracao("B");
    const c = celebracao("C");

    const primeiro = incorporarCelebracoes(estadoInicialCelebracoes, resposta(a, b));
    assert.equal(primeiro.atual?.id, "A");
    assert.deepEqual(idsDaFila(primeiro), ["B"]);

    const segundo = incorporarCelebracoes(primeiro, resposta(a, b, c));

    assert.equal(segundo.atual?.id, "A", "A não foi trocada nem reiniciada");
    assert.deepEqual(idsDaFila(segundo), ["B", "C"], "só C entrou, e no fim da fila");
  });

  /* F4 ---------------------------------------------------------------- */
  it("F4 — o que chega durante A fica enfileirado, em ordem", () => {
    const [a, b, c, d, e] = ["A", "B", "C", "D", "E"].map((id) => celebracao(id));

    const primeiro = incorporarCelebracoes(estadoInicialCelebracoes, resposta(a, b, c));
    assert.equal(primeiro.atual?.id, "A");
    assert.deepEqual(idsDaFila(primeiro), ["B", "C"]);

    // Durante A chegam D e E — junto com as três que já são conhecidas.
    const segundo = incorporarCelebracoes(primeiro, resposta(a, b, c, d, e));

    assert.equal(segundo.atual?.id, "A", "A continua exibindo");
    assert.deepEqual(
      idsDaFila(segundo),
      ["B", "C", "D", "E"],
      "fila restante na ordem do servidor: mais antiga → mais nova",
    );
  });

  it("F4b — nenhum evento se perde numa sequência rápida de vendas", () => {
    const ids = ["A", "B", "C", "D", "E"];
    const todas = ids.map((id) => celebracao(id));

    let estado = incorporarCelebracoes(estadoInicialCelebracoes, resposta(todas[0]));
    estado = incorporarCelebracoes(estado, resposta(todas[0], todas[1], todas[2]));
    estado = incorporarCelebracoes(estado, resposta(...todas));

    // Consome a fila inteira, como a TV faria ao longo de 50 segundos.
    const exibidas: string[] = [];
    while (estado.atual !== null) {
      exibidas.push(estado.atual.id);
      estado = avancarCelebracao(estado);
    }

    assert.deepEqual(exibidas, ids, "as cinco apareceram, cada uma uma vez, em ordem");
  });

  /* F5 ---------------------------------------------------------------- */
  it("F5 — o id é marcado ao entrar na fila, antes de ser exibido", () => {
    const a = celebracao("A");
    const b = celebracao("B");

    const estado = incorporarCelebracoes(estadoInicialCelebracoes, resposta(a, b));

    // B ainda não apareceu — está esperando atrás de A.
    assert.equal(estado.atual?.id, "A");
    assert.deepEqual(idsDaFila(estado), ["B"]);
    assert.equal(estado.vistos.has("B"), true, "mesmo sem ter aparecido, B já é conhecida");

    // É isso que impede o poll do meio de enfileirá-la outra vez.
    const depois = incorporarCelebracoes(estado, resposta(a, b));
    assert.deepEqual(idsDaFila(depois), ["B"], "B continua uma vez só na fila");
  });

  /* F6 ---------------------------------------------------------------- */
  it("F6 — fila vazia depois do término: nenhuma celebração atual", () => {
    const a = celebracao("A");

    const comA = incorporarCelebracoes(estadoInicialCelebracoes, resposta(a));
    const depois = avancarCelebracao(comA);

    assert.equal(depois.atual, null, "a TV volta ao dashboard");
    assert.deepEqual(idsDaFila(depois), []);
    assert.equal(depois.vistos.has("A"), true, "mas A continua conhecida");
  });

  it("avançar com a TV livre não muda nada", () => {
    assert.deepEqual(avancarCelebracao(estadoInicialCelebracoes), estadoInicialCelebracoes);
  });

  /* F7 ---------------------------------------------------------------- */
  it("F7 — com B na fila, B se torna a próxima quando A termina", () => {
    const a = celebracao("A");
    const b = celebracao("B");

    const comAB = incorporarCelebracoes(estadoInicialCelebracoes, resposta(a, b));
    assert.equal(comAB.atual?.id, "A");

    const depois = avancarCelebracao(comAB);

    assert.equal(depois.atual?.id, "B", "B assume a tela");
    assert.deepEqual(idsDaFila(depois), [], "e sai da fila ao assumir");
  });

  /* Bordas ------------------------------------------------------------ */
  describe("bordas", () => {
    it("resposta vazia não mexe em nada", () => {
      const a = celebracao("A");
      const b = celebracao("B");
      const antes = incorporarCelebracoes(estadoInicialCelebracoes, resposta(a, b));

      const depois = incorporarCelebracoes(antes, resposta());

      assert.equal(depois.atual?.id, "A", "o overlay atual não fecha");
      assert.deepEqual(idsDaFila(depois), ["B"], "a fila não é limpa");
    });

    it("o estado anterior não é mutado", () => {
      const a = celebracao("A");
      const b = celebracao("B");

      const primeiro = incorporarCelebracoes(estadoInicialCelebracoes, resposta(a));
      const filaAntes = [...primeiro.fila];
      const vistosAntes = [...primeiro.vistos];

      incorporarCelebracoes(primeiro, resposta(a, b));
      avancarCelebracao(primeiro);

      assert.deepEqual([...primeiro.fila], filaAntes);
      assert.deepEqual([...primeiro.vistos], vistosAntes);
      assert.equal(primeiro.atual?.id, "A");
      assert.deepEqual(estadoInicialCelebracoes.fila, [], "o estado inicial continua vazio");
      assert.equal(estadoInicialCelebracoes.vistos.size, 0);
    });

    it("a memória de vistos não cresce para sempre", () => {
      // Vinte celebrações ao longo do tempo, sempre saindo da janela do
      // servidor: o que já não é devolvido não pode voltar, então não precisa
      // continuar ocupando memória numa tela que fica meses ligada.
      let estado = estadoInicialCelebracoes;
      for (let i = 0; i < 20; i += 1) {
        estado = incorporarCelebracoes(estado, resposta(celebracao(`antiga-${i}`)));
        estado = avancarCelebracao(estado);
      }

      assert.equal(estado.atual, null);
      assert.equal(
        estado.vistos.size,
        1,
        "só o id ainda presente na última resposta continua guardado",
      );
    });

    it("o que ainda está na fila nunca é esquecido, mesmo fora da resposta", () => {
      const a = celebracao("A");
      const b = celebracao("B");
      const nova = celebracao("N");

      const comAB = incorporarCelebracoes(estadoInicialCelebracoes, resposta(a, b));
      // A e B saíram da janela do servidor antes de B ter aparecido.
      const depois = incorporarCelebracoes(comAB, resposta(nova));

      assert.equal(depois.vistos.has("A"), true, "A está em cena — continua conhecida");
      assert.equal(depois.vistos.has("B"), true, "B está na fila — continua conhecida");
      assert.deepEqual(idsDaFila(depois), ["B", "N"]);
    });

    it("valor nulo atravessa a fila sem virar zero", () => {
      const semValor = celebracao("SEM", null);

      const estado = incorporarCelebracoes(estadoInicialCelebracoes, resposta(semValor));

      assert.equal(estado.atual?.valor, null);
    });
  });

  it("a duração de cada celebração é de dez segundos", () => {
    assert.equal(DURACAO_CELEBRACAO_MS, 10_000);
  });
});

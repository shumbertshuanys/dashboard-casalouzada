import type { ApresentacaoPainel, Metrica } from "@/lib/apresentacao-painel";
import {
  type BlocoAcumulados,
  type BlocoEquipes,
  type BlocoOperacional,
  type BlocoPeriodos,
  ehLeituraPainel,
  type LeituraPainel,
} from "@/lib/contrato-atualizacao-painel";

/**
 * A retenção do último valor conhecido, como funções puras.
 *
 * Sem React, sem DOM, sem `server-only`, sem Prisma: o controlador do cliente é
 * uma casca fina em volta disto, e a regra que decide o que fica na tela é
 * testável sem navegador nenhum.
 *
 * O invariante é a DEC-014 levada ao refresh: **falha de atualização não apaga
 * dado bom**. Uma leitura que não chegou, chegou quebrada ou voltou
 * `INDISPONIVEL` deixa na parede o número que já estava lá — nunca `—`, nunca
 * zero, nunca a tela remontada.
 *
 * A retenção é **por bloco**, e não do painel inteiro, pela mesma razão que a
 * F3.3 separou as leituras: se só o saldo histórico cair, não há motivo para
 * congelar também o VGV do mês (DEC-042).
 */

/** Um bloco com a hora em que ele foi lido — que não é a hora da última tentativa. */
export type Retido<B> = {
  dados: B;
  lidoEmMs: number;
  horaLeitura: string;
};

export type EstadoPainel = {
  competencia: string;
  periodo: string;
  metricas: Metrica[];
  periodos: Retido<BlocoPeriodos>;
  acumulados: Retido<BlocoAcumulados>;
  equipes: Retido<BlocoEquipes>;
  propostas: Retido<BlocoOperacional>;
  reservas: Retido<BlocoOperacional>;
};

type Marca = { lidoEmMs: number; horaLeitura: string };

function marcaDe(leitura: LeituraPainel): Marca {
  return { lidoEmMs: leitura.lidoEmMs, horaLeitura: leitura.horaLeitura };
}

/** A primeira leitura vira estado direto: não há nada anterior para reter. */
export function estadoInicial(leitura: LeituraPainel): EstadoPainel {
  const marca = marcaDe(leitura);

  return {
    competencia: leitura.competencia,
    periodo: leitura.periodo,
    metricas: leitura.metricas,
    periodos: { dados: leitura.blocos.periodos, ...marca },
    acumulados: { dados: leitura.blocos.acumulados, ...marca },
    equipes: { dados: leitura.blocos.equipes, ...marca },
    propostas: { dados: leitura.blocos.propostas, ...marca },
    reservas: { dados: leitura.blocos.reservas, ...marca },
  };
}

/**
 * Aceita o bloco novo, ou mantém o anterior.
 *
 * Só se retém quando o novo veio `INDISPONIVEL` **e** o anterior era `OK`: reter
 * indisponível sobre indisponível não guardaria nada, e reter sobre um novo `OK`
 * congelaria a tela num valor velho. Estados de domínio — `SEM_DADOS`,
 * `SEM_SALDO_HISTORICO`, `CONFIGURACAO_INVALIDA` — chegam dentro de uma leitura
 * `OK` e substituem normalmente: eles são o dado, não a falha.
 */
function resolverBloco<B extends { estadoLeitura: "OK" | "INDISPONIVEL" }>(
  anterior: Retido<B>,
  nova: B,
  marca: Marca,
  retencaoPermitida: boolean,
): Retido<B> {
  const deveReter =
    retencaoPermitida && nova.estadoLeitura === "INDISPONIVEL" && anterior.dados.estadoLeitura === "OK";

  return deveReter ? anterior : { dados: nova, ...marca };
}

/**
 * O reducer da atualização.
 *
 * A diferença entre os blocos está na **virada de mês**:
 *
 * - `periodos` e `equipes` descrevem o mês corrente. Se a competência mudou, um
 *   valor de agosto não pode continuar exibido em setembro — seria um número
 *   verdadeiro sob um rótulo errado. Nesse caso o `INDISPONIVEL` novo entra.
 * - `acumulados` não tem recorte mensal: imóveis vendidos e VGV acumulado são
 *   desde sempre (DEC-036). Reter atravessando a virada é correto, porque o
 *   número velho continua descrevendo a mesma coisa.
 * - `propostas` e `reservas` também não têm recorte mensal: elas descrevem o que
 *   está **em aberto agora**, não a produção de um mês. Uma proposta aguardando
 *   em 31/08 continua aguardando em 01/09, então a trava de competência não se
 *   aplica a elas.
 *
 * Uma leitura `OK` com lista **vazia** substitui normalmente, como qualquer
 * outro dado: vazio ali significa "não há nada em aberto", e reter as três
 * anteriores deixaria na parede itens que já saíram (DEC-014).
 *
 * A raiz — competência, período e métricas — vem **sempre** da leitura nova, que
 * é válida por construção: quem chega aqui já passou pelo contrato. Assim o
 * cabeçalho nunca fica anunciando um mês que nenhum bloco representa.
 */
export function resolverAtualizacao(anterior: EstadoPainel, nova: LeituraPainel): EstadoPainel {
  const marca = marcaDe(nova);
  const mesmaCompetencia = anterior.competencia === nova.competencia;

  return {
    competencia: nova.competencia,
    periodo: nova.periodo,
    metricas: nova.metricas,
    periodos: resolverBloco(anterior.periodos, nova.blocos.periodos, marca, mesmaCompetencia),
    acumulados: resolverBloco(anterior.acumulados, nova.blocos.acumulados, marca, true),
    equipes: resolverBloco(anterior.equipes, nova.blocos.equipes, marca, mesmaCompetencia),
    propostas: resolverBloco(anterior.propostas, nova.blocos.propostas, marca, true),
    reservas: resolverBloco(anterior.reservas, nova.blocos.reservas, marca, true),
  };
}

/**
 * O caminho que o cliente usa: valida antes de reduzir.
 *
 * Payload fora do contrato devolve o estado **anterior**, idêntico. Para a tela,
 * um JSON corrompido é indistinguível de uma requisição que não voltou — e as
 * duas coisas devem deixar os números onde estão.
 */
export function aplicarPayloadAtualizacao(
  anterior: EstadoPainel,
  candidato: unknown,
): EstadoPainel {
  if (!ehLeituraPainel(candidato)) return anterior;
  return resolverAtualizacao(anterior, candidato);
}

/**
 * A hora que o selo mostra: a do bloco **mais antigo** entre os que estão `OK`.
 *
 * Anunciar a leitura mais recente seria otimista — com um bloco retido de vinte
 * minutos atrás, o selo diria "agora" sobre um número velho. O mais antigo é a
 * afirmação honesta: nada na tela é anterior a isso.
 *
 * Sem nenhum bloco `OK` não há o que datar, e o selo simplesmente não aparece.
 */
export function idadeExibida(estado: EstadoPainel): string | null {
  // As listas da Tela B entram na conta: a rotação as põe na parede tanto quanto
  // os big numbers, e um selo que as ignorasse dataria só metade do que se vê.
  const disponiveis = [
    estado.periodos,
    estado.acumulados,
    estado.equipes,
    estado.propostas,
    estado.reservas,
  ].filter((bloco) => bloco.dados.estadoLeitura === "OK");

  if (disponiveis.length === 0) return null;

  return disponiveis.reduce((maisAntigo, bloco) =>
    bloco.lidoEmMs < maisAntigo.lidoEmMs ? bloco : maisAntigo,
  ).horaLeitura;
}

/**
 * Remonta o que a tela desenha a partir dos blocos vigentes.
 *
 * Só seleção: nenhum cálculo, formatação, ordenação ou janela civil. Os blocos
 * podem ter vindo de leituras diferentes — é exatamente esse o ponto da
 * retenção —, e a apresentação não precisa saber disso.
 */
export function comporApresentacao(estado: EstadoPainel): ApresentacaoPainel {
  return {
    periodo: estado.periodo,
    bigNumbers: estado.acumulados.dados.bigNumbers,
    vgvPeriodos: estado.periodos.dados.vgvPeriodos,
    quadroMensal: estado.periodos.dados.quadroMensal,
    metricas: estado.metricas,
    equipes: estado.equipes.dados.area,
    operacionais: {
      propostas: estado.propostas.dados.lista,
      reservas: estado.reservas.dados.lista,
    },
  };
}

import "server-only";

import type { PrismaClient } from "@/generated/prisma/client";
import { criarApresentacaoPainel } from "@/lib/apresentacao-painel";
import type { LeituraPainel } from "@/lib/contrato-atualizacao-painel";
import { deDataCivil, horaEmSaoPaulo, mesCorrente } from "@/lib/datas";
import { obterMetricasPainel } from "@/lib/metricas-prisma";

/**
 * Uma leitura completa do painel, pronta para atravessar a rede.
 *
 * É o mesmo caminho que a página já fazia desde a F3.5 — ler e apresentar —,
 * agora num lugar só, porque duas entradas precisam dele: o render inicial da
 * página e a rota de dados que a aba consulta a cada minuto. Se cada uma montasse
 * o payload por conta própria, a atualização poderia servir um shape diferente do
 * que a primeira pintura usou.
 *
 * `agora` é **obrigatório**: quem chama congela o instante. Um default aqui
 * criaria um segundo relógio dentro de um caminho que precisa ter só um.
 *
 * Nada é recalculado nem reformatado: a leitura vem da F3.3, a formatação da
 * F3.4, e o que se faz aqui é fatiar o resultado nos blocos e carimbar a hora.
 * As duas listas da Tela B seguem a mesma regra — a seleção já aconteceu no
 * núcleo, e aqui elas só viajam. Sem `try`/`catch` — exceção continua sendo
 * exceção.
 */
export async function lerPainel(prisma: PrismaClient, agora: Date): Promise<LeituraPainel> {
  const resultado = await obterMetricasPainel(prisma, agora);
  const apresentacao = criarApresentacaoPainel(resultado, agora);

  return {
    // O mês civil da leitura, em São Paulo. É ele que a retenção compara na
    // virada: um valor de agosto não pode continuar na tela em setembro.
    competencia: deDataCivil(mesCorrente(agora).inicio),
    lidoEmMs: agora.getTime(),
    horaLeitura: horaEmSaoPaulo(agora),
    periodo: apresentacao.periodo,
    // `readonly` não sobrevive à serialização; a cópia rasa preserva o conteúdo.
    metricas: [...apresentacao.metricas],
    blocos: {
      periodos: {
        estadoLeitura: resultado.empresa.periodos.estadoLeitura,
        vgvPeriodos: apresentacao.vgvPeriodos,
        quadroMensal: apresentacao.quadroMensal,
      },
      acumulados: {
        estadoLeitura: resultado.empresa.acumulados.estadoLeitura,
        bigNumbers: apresentacao.bigNumbers,
      },
      equipes: {
        estadoLeitura: resultado.equipes.estadoLeitura,
        area: apresentacao.equipes,
      },
      propostas: {
        estadoLeitura: resultado.propostas.estadoLeitura,
        lista: apresentacao.operacionais.propostas,
      },
      reservas: {
        estadoLeitura: resultado.reservas.estadoLeitura,
        lista: apresentacao.operacionais.reservas,
      },
    },
  };
}

"use client";

import { useActionState, useState } from "react";
import { formatarBRL } from "@/lib/dinheiro";
import {
  ROTULOS,
  ROTULOS_STATUS_PROPOSTA,
  STATUS_PROPOSTA,
  TIPOS,
  ehTipoMonetario,
  interpretarTipo,
} from "@/lib/validacao/lancamento";
import type { EstadoEdicao, ValoresLancamento } from "./acoes";
import { excluirLancamento } from "./acoes";
import {
  Participantes,
  type OpcaoParticipante,
  type ParticipanteRegistrado,
} from "./participantes";

/**
 * Edição de lançamento.
 *
 * Separado do formulário de criação de propósito: aqui há coisas que lá não
 * existem — o conflito de equipe em dois passos, o aviso de descarte de valor
 * e a exclusão. Misturar os dois deixaria a tela de lançar em sequência, que é
 * a mais usada, carregando regra que ela não tem.
 *
 * A equipe nunca é escolhida livremente: ou fica a registrada, ou passa a ser
 * a equipe atual do novo corretor. Não existe um `<select>` de equipe.
 */

const VAZIO: EstadoEdicao = {};

export type OpcaoCorretorEdicao = {
  id: string;
  nomeExibicao: string;
  nomeCompleto: string;
  ativo: boolean;
};

export type ResumoLancamento = {
  id: string;
  tipoRotulo: string;
  corretorNome: string;
  equipeNome: string;
  dataFormatada: string;
  valorFormatado: string | null;
};

export function FormularioEdicaoLancamento({
  acao,
  corretores,
  candidatosAParticipante,
  participacoesRegistradas,
  valoresIniciais,
  equipeRegistradaNome,
  corretorOriginalId,
  valorOriginal,
  tipoOriginal,
  resumo,
}: {
  acao: (anterior: EstadoEdicao, form: FormData) => Promise<EstadoEdicao>;
  corretores: OpcaoCorretorEdicao[];
  /** Candidatos a participante **novo** de uma venda: ativos, de equipe ativa. */
  candidatosAParticipante: OpcaoParticipante[];
  /** O elenco já gravado, em ordem — vazio quando o lançamento não é venda. */
  participacoesRegistradas: ParticipanteRegistrado[];
  valoresIniciais: ValoresLancamento;
  /** Vazio numa venda: o crédito dela não tem equipe no lançamento. */
  equipeRegistradaNome: string;
  corretorOriginalId: string;
  /** Valor já gravado, em forma canônica, para o aviso de descarte. */
  valorOriginal: string | null;
  tipoOriginal: string;
  resumo: ResumoLancamento;
}) {
  const [estado, enviar, enviando] = useActionState(acao, VAZIO);
  const atuais = estado.valores ?? valoresIniciais;

  // Remontagem por `key` a cada retorno do servidor: é o que faz os campos
  // voltarem com o que foi enviado, inclusive os selects.
  const chave = [
    atuais.tipo,
    atuais.corretorId,
    atuais.participanteIds.join(","),
    atuais.dataReferencia,
    atuais.valor,
    atuais.valorProposta,
    atuais.statusProposta,
    atuais.imovelRef,
    atuais.observacao,
    estado.conflito?.equipeAtualApresentadaId ?? "",
  ].join("|");

  /**
   * Avisa antes de salvar quando a troca de tipo vai apagar algo que já existe:
   * o valor de um tipo monetário, ou o elenco de uma venda compartilhada. O
   * tipo é lido do próprio formulário, não de estado: assim a checagem não
   * depende de nenhum `onChange` ter passado por aqui.
   *
   * As regras reais são do servidor — tipo não monetário grava `valor = null`,
   * e sair de VENDA apaga as participações. Isto só evita a perda por descuido.
   */
  function confirmarDescartes(evento: React.FormEvent<HTMLFormElement>) {
    const escolhido = interpretarTipo(new FormData(evento.currentTarget).get("tipo"));
    if (escolhido === null) return;

    if (tipoOriginal === "VENDA" && escolhido !== "VENDA" && participacoesRegistradas.length > 0) {
      const nomes = participacoesRegistradas
        .map((participante) => participante.nomeExibicao)
        .join(", ");
      const segue = window.confirm(
        `Esta venda tem ${participacoesRegistradas.length} participante(s): ${nomes}.\n\n` +
          `Ao mudar para ${ROTULOS[escolhido]}, o elenco compartilhado é descartado e o ` +
          `lançamento passa a ter um corretor só.`,
      );
      if (!segue) {
        evento.preventDefault();
        return;
      }
    }

    const eraMonetario = ehTipoMonetario(interpretarTipo(tipoOriginal) ?? "PROPOSTA");
    if (!eraMonetario || valorOriginal === null) return;
    if (ehTipoMonetario(escolhido)) return;

    const segue = window.confirm(
      `Este lançamento possui valor de ${formatarBRL(valorOriginal)}.\n\n` +
        `Ao mudar para ${ROTULOS[escolhido]}, esse valor será removido.`,
    );
    if (!segue) evento.preventDefault();
  }

  return (
    <div className="max-w-2xl space-y-8">
      <form action={enviar} onSubmit={confirmarDescartes} className="space-y-5">
        {estado.mensagem && (
          <p className="rounded-md border border-negativo/40 px-3 py-2 text-sm text-negativo">
            {estado.mensagem}
          </p>
        )}

        <CamposEdicao
          key={chave}
          atuais={atuais}
          erros={estado.erros}
          corretores={corretores}
          candidatosAParticipante={candidatosAParticipante}
          participacoesRegistradas={participacoesRegistradas}
          equipeRegistradaNome={equipeRegistradaNome}
          conflito={estado.conflito}
          corretorOriginalId={corretorOriginalId}
        />

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={enviando}
            className="rounded-md bg-destaque px-4 py-2 text-sm font-medium text-fundo disabled:opacity-60"
          >
            {enviando ? "Salvando…" : estado.conflito ? "Confirmar e salvar" : "Salvar alterações"}
          </button>
          <a href="/admin/lancamentos" className="text-sm text-texto-secundario hover:text-texto">
            Cancelar
          </a>
        </div>
      </form>

      <ZonaDeExclusao resumo={resumo} />
    </div>
  );
}

function CamposEdicao({
  atuais,
  erros,
  corretores,
  candidatosAParticipante,
  participacoesRegistradas,
  equipeRegistradaNome,
  conflito,
  corretorOriginalId,
}: {
  atuais: ValoresLancamento;
  erros?: EstadoEdicao["erros"];
  corretores: OpcaoCorretorEdicao[];
  candidatosAParticipante: OpcaoParticipante[];
  participacoesRegistradas: ParticipanteRegistrado[];
  equipeRegistradaNome: string;
  conflito?: EstadoEdicao["conflito"];
  corretorOriginalId: string;
}) {
  // Só o tipo precisa de estado: é ele que decide se o campo de valor aparece.
  const [tipo, setTipo] = useState(atuais.tipo);
  const tipoAtual = interpretarTipo(tipo);
  const pedeValor = tipoAtual !== null && ehTipoMonetario(tipoAtual);
  const ehProposta = tipoAtual === "PROPOSTA";
  const ehVenda = tipoAtual === "VENDA";

  return (
    <>
      <Campo rotulo="Tipo" erro={erros?.tipo}>
        <select
          name="tipo"
          defaultValue={atuais.tipo}
          onChange={(evento) => setTipo(evento.target.value)}
          className="w-full rounded-md border border-white/15 bg-fundo px-3 py-2 text-texto"
        >
          <option value="">Selecione…</option>
          {TIPOS.map((valor) => (
            <option key={valor} value={valor}>
              {ROTULOS[valor]}
            </option>
          ))}
        </select>
      </Campo>

      {/* Venda credita por participação; os demais tipos, por um corretor só e
          pelo fluxo de conflito de equipe da Q7. */}
      {ehVenda ? (
        <Participantes
          corretores={candidatosAParticipante}
          iniciais={atuais.participanteIds}
          registrados={participacoesRegistradas}
          erro={erros?.participanteIds}
        />
      ) : (
        <>
          <Campo rotulo="Corretor" erro={erros?.corretorId}>
            <select
              name="corretorId"
              defaultValue={atuais.corretorId}
              className="w-full rounded-md border border-white/15 bg-fundo px-3 py-2 text-texto"
            >
              {/* Vindo de uma venda não há corretor gravado para preselecionar:
                  o operador escolhe quem fica com o evento. */}
              {equipeRegistradaNome === "" && <option value="">Selecione…</option>}
              {corretores.map((corretor) => (
                <option key={corretor.id} value={corretor.id}>
                  {corretor.nomeExibicao} — {corretor.nomeCompleto}
                  {corretor.ativo ? "" : " (inativo)"}
                  {corretor.id === corretorOriginalId ? " · atual" : ""}
                </option>
              ))}
            </select>
          </Campo>

          {/* Somente leitura. Não existe input de equipe. */}
          {equipeRegistradaNome !== "" && (
            <div>
              <span className="mb-1 block text-sm text-texto-secundario">
                Equipe registrada no lançamento
              </span>
              <p className="rounded-md border border-white/10 bg-fundo/40 px-3 py-2 text-sm text-texto">
                {equipeRegistradaNome}
              </p>
              <span className="mt-1 block text-xs text-texto-secundario">
                é a equipe do momento do fato; trocar o corretor pode exigir uma decisão
              </span>
            </div>
          )}

          {conflito && <EscolhaDeEquipe conflito={conflito} />}
        </>
      )}

      <Campo rotulo="Data do lançamento" erro={erros?.dataReferencia}>
        <input
          name="dataReferencia"
          type="date"
          defaultValue={atuais.dataReferencia}
          className="rounded-md border border-white/15 bg-fundo px-3 py-2 text-texto"
        />
      </Campo>

      {pedeValor && (
        <Campo rotulo="Valor" erro={erros?.valor}>
          <input
            name="valor"
            defaultValue={atuais.valor}
            inputMode="decimal"
            placeholder="1.250.000,00"
            autoComplete="off"
            className="w-56 rounded-md border border-white/15 bg-fundo px-3 py-2 text-texto"
          />
        </Campo>
      )}

      {/* Mesmo contrato visual da criação: em PROPOSTA o imóvel é obrigatório
          e sobe para a área principal, junto do status e do valor próprio da
          proposta (DEC-053). Uma proposta legada sem imóvel abre normalmente;
          o erro só aparece ao salvar sem preencher. */}
      {ehProposta && (
        <>
          <Campo rotulo="Imóvel" erro={erros?.imovelRef}>
            <input
              name="imovelRef"
              defaultValue={atuais.imovelRef}
              autoComplete="off"
              placeholder="código ou endereço"
              className="w-full rounded-md border border-white/15 bg-fundo px-3 py-2 text-texto"
            />
          </Campo>

          <Campo rotulo="Status da proposta" erro={erros?.statusProposta}>
            <select
              name="statusProposta"
              defaultValue={atuais.statusProposta || "AGUARDANDO"}
              className="w-56 rounded-md border border-white/15 bg-fundo px-3 py-2 text-texto"
            >
              {STATUS_PROPOSTA.map((status) => (
                <option key={status} value={status}>
                  {ROTULOS_STATUS_PROPOSTA[status]}
                </option>
              ))}
            </select>
          </Campo>

          <Campo rotulo="Valor da proposta (opcional)" erro={erros?.valorProposta}>
            <input
              name="valorProposta"
              defaultValue={atuais.valorProposta}
              inputMode="decimal"
              placeholder="450.000,00"
              autoComplete="off"
              className="w-56 rounded-md border border-white/15 bg-fundo px-3 py-2 text-texto"
            />
            <span className="mt-1 block text-xs text-texto-secundario">
              informativo; não entra no VGV
            </span>
          </Campo>
        </>
      )}

      <details className="rounded-md border border-white/10 px-3 py-2" open>
        <summary className="cursor-pointer text-sm text-texto-secundario">Detalhes</summary>
        <div className="mt-4 space-y-4">
          {!ehProposta && (
            <Campo rotulo="Imóvel" erro={erros?.imovelRef}>
              <input
                name="imovelRef"
                defaultValue={atuais.imovelRef}
                autoComplete="off"
                className="w-full rounded-md border border-white/15 bg-fundo px-3 py-2 text-texto"
              />
            </Campo>
          )}
          <Campo rotulo="Observação" erro={erros?.observacao}>
            <textarea
              name="observacao"
              defaultValue={atuais.observacao}
              rows={2}
              className="w-full rounded-md border border-white/15 bg-fundo px-3 py-2 text-texto"
            />
          </Campo>
        </div>
      </details>
    </>
  );
}

/**
 * As duas — e só as duas — saídas do conflito de equipe.
 *
 * O `equipeAtualApresentadaId` viaja junto apenas para o servidor perceber que
 * a situação mudou desde a pergunta. Ele não escolhe equipe nenhuma.
 */
function EscolhaDeEquipe({ conflito }: { conflito: NonNullable<EstadoEdicao["conflito"]> }) {
  return (
    <fieldset className="rounded-md border border-destaque/40 px-4 py-3">
      <legend className="px-1 text-sm text-destaque">Qual equipe deve ficar no lançamento?</legend>

      <p className="mb-3 text-sm text-texto-secundario">
        Equipe registrada no lançamento: <strong className="text-texto">{conflito.equipeArmazenada.nome}</strong>
        <br />
        Equipe atual de {conflito.nomeNovoCorretor}:{" "}
        <strong className="text-texto">{conflito.equipeAtualDoNovoCorretor.nome}</strong>
      </p>

      <input type="hidden" name="equipeAtualApresentadaId" value={conflito.equipeAtualApresentadaId} />

      <label className="mb-2 flex items-center gap-2 text-sm text-texto">
        <input type="radio" name="escolhaEquipe" value="PRESERVAR" defaultChecked />
        Preservar equipe registrada ({conflito.equipeArmazenada.nome})
      </label>
      <label className="flex items-center gap-2 text-sm text-texto">
        <input type="radio" name="escolhaEquipe" value="CORRIGIR" />
        Corrigir para a equipe atual ({conflito.equipeAtualDoNovoCorretor.nome})
      </label>

      <p className="mt-3 text-xs text-texto-secundario">
        O sistema não guarda em que equipe cada corretor esteve em cada data, então não dá para
        deduzir isso sozinho.
      </p>
    </fieldset>
  );
}

/** Exclusão vive só aqui, nunca na listagem. */
function ZonaDeExclusao({ resumo }: { resumo: ResumoLancamento }) {
  function confirmarExclusao(evento: React.FormEvent<HTMLFormElement>) {
    const linhas = [
      "Excluir este lançamento?",
      "",
      `Tipo: ${resumo.tipoRotulo}`,
      `Corretor: ${resumo.corretorNome}`,
      `Equipe: ${resumo.equipeNome}`,
      `Data: ${resumo.dataFormatada}`,
      ...(resumo.valorFormatado ? [`Valor: ${resumo.valorFormatado}`] : []),
      "",
      "Esta ação remove este registro permanentemente.",
    ];
    if (!window.confirm(linhas.join("\n"))) evento.preventDefault();
  }

  return (
    <form action={excluirLancamento} onSubmit={confirmarExclusao} className="border-t border-white/10 pt-6">
      <input type="hidden" name="id" value={resumo.id} />
      <button
        type="submit"
        className="rounded-md border border-negativo/50 px-3 py-2 text-sm text-negativo hover:bg-negativo/10"
      >
        Excluir lançamento
      </button>
      <span className="ml-3 text-xs text-texto-secundario">
        remove o registro em definitivo; não há desfazer
      </span>
    </form>
  );
}

function Campo({
  rotulo,
  erro,
  children,
}: {
  rotulo: string;
  erro?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm text-texto-secundario">{rotulo}</span>
      {children}
      {erro && <span className="mt-1 block text-sm text-negativo">{erro}</span>}
    </label>
  );
}

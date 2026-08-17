import type { ListaOperacional } from "@/lib/apresentacao-painel";
import estilos from "./painel.module.css";

/**
 * A Tela B da faixa superior: o que está em aberto agora (DEC-056).
 *
 * Duas listas lado a lado, imóvel e corretor, no máximo três itens cada. Nada
 * aqui filtra status, ordena ou corta: as listas chegam prontas do núcleo, e
 * este componente só as desenha.
 *
 * Lista vazia **não** vira `0`. Estas listas são operacionais, não métricas
 * (DEC-014): zero propostas em andamento é uma frase, não um número — um `0`
 * grande na parede leria como desempenho.
 */

const VAZIO_PROPOSTAS = "Nenhuma proposta em andamento";
const VAZIO_RESERVAS = "Nenhuma reserva ativa";
const INDISPONIVEL = "Dados indisponíveis";

function Coluna({
  titulo,
  lista,
  vazio,
}: {
  titulo: string;
  lista: ListaOperacional;
  /** O texto de "não há nada", que é diferente de "não deu para saber". */
  vazio: string;
}) {
  return (
    <section className={estilos.operacional}>
      <div className={estilos.rot}>{titulo}</div>

      {lista.estado !== "OK" ? (
        <div className={estilos.operacionalAviso}>{INDISPONIVEL}</div>
      ) : lista.itens.length === 0 ? (
        <div className={estilos.operacionalAviso}>{vazio}</div>
      ) : (
        <div className={estilos.operacionalItens}>
          {lista.itens.map((item, posicao) => (
            // A chave é a posição: a lista já chega pronta, ordenada e recortada
            // na página visível, e o mesmo imóvel pode aparecer em duas
            // propostas distintas. Trocar de página troca o texto de três linhas
            // que não guardam estado nem animam sozinhas — uma identidade
            // própria não mudaria o que a parede desenha.
            <div key={posicao} className={estilos.operacionalItem}>
              <span className={estilos.operacionalImovel}>{item.imovel}</span>
              <span className={estilos.operacionalCorretor}>{item.corretor}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function FaixaOperacional({
  propostas,
  reservas,
}: {
  propostas: ListaOperacional;
  reservas: ListaOperacional;
}) {
  return (
    <div className={estilos.faixaOperacional}>
      <Coluna titulo="Propostas em andamento" lista={propostas} vazio={VAZIO_PROPOSTAS} />
      <Coluna titulo="Reservas de locação" lista={reservas} vazio={VAZIO_RESERVAS} />
    </div>
  );
}

import type { BigNumber } from "@/lib/apresentacao-painel";
import estilos from "./painel.module.css";

/** Faixa de topo: os três acumulados que se leem de longe. */
export function FaixaBig({ itens }: { itens: BigNumber[] }) {
  return (
    <div className={estilos.faixaBig}>
      {itens.map((item) => (
        <div key={item.rotulo} className={estilos.big}>
          <div className={estilos.rot}>{item.rotulo}</div>
          <div className={estilos.num}>
            {/* "+ de" vem antes da moeda: o acumulado é um piso, e o piso
                qualifica o número inteiro, inclusive o `R$` (DEC-054). Só existe
                em acumulado com número — nunca "+ de —". */}
            {item.qualificador && <span className={estilos.qual}>{item.qualificador}</span>}
            {item.numero.prefixo && <span className={estilos.pre}>{item.numero.prefixo}</span>}
            {item.numero.valor}
            {item.numero.sufixo && <span className={estilos.suf}>{item.numero.sufixo}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

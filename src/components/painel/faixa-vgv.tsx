import type { VgvPeriodo } from "@/lib/apresentacao-painel";
import estilos from "./painel.module.css";

/** Faixa do meio: VGV anual, trimestral e mensal lado a lado. */
export function FaixaVgv({ titulo, itens }: { titulo: string; itens: VgvPeriodo[] }) {
  return (
    <div className={estilos.faixaVgv}>
      <div className={estilos.titulo}>{titulo}</div>
      {itens.map((item) => (
        <div key={item.rotulo} className={estilos.vgvItem}>
          <span className={estilos.rot}>{item.rotulo}</span>
          <span className={estilos.val}>
            {item.valor.prefixo && <span className={estilos.pre}>{item.valor.prefixo}</span>}
            {item.valor.valor}
            {item.valor.sufixo && <span className={estilos.suf}>{item.valor.sufixo}</span>}
          </span>
        </div>
      ))}
    </div>
  );
}

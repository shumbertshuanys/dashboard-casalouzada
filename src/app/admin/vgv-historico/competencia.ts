import { deDataCivil } from "@/lib/datas";

/**
 * A competência como o Admin a escreve: `2026-07-01` → `07/2026`.
 *
 * Mora num módulo próprio porque as três telas da rota precisam dela e um
 * `page.tsx` do App Router não pode exportar símbolo fora do contrato de rota.
 * Deriva de `deDataCivil`, que é o único conversor civil do projeto e lê só por
 * getters UTC — o fuso da máquina não desloca o mês.
 */
export function competenciaBR(competencia: Date): string {
  const [ano, mes] = deDataCivil(competencia).split("-");
  return `${mes}/${ano}`;
}

/** `2026-07-01` → `2026-07`, a forma que `<input type="month">` usa. */
export function competenciaISO(competencia: Date): string {
  return deDataCivil(competencia).slice(0, 7);
}

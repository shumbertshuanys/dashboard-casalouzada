import { redirect } from "next/navigation";

export default function Raiz() {
  // A raiz não tem conteúdo próprio: a TV abre a URL com token e as pessoas
  // entram pela administração.
  redirect("/admin");
}

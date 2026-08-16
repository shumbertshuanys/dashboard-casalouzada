import { Jost } from "next/font/google";
import Image from "next/image";
import { DURACAO_CELEBRACAO_MS } from "@/lib/celebracao-cliente";
import type { CelebracaoTV } from "@/lib/contrato-celebracao";
import { formatarBRL } from "@/lib/dinheiro";
import estilos from "./celebracao.module.css";

/**
 * A celebração ocupando a TV.
 *
 * Componente de desenho: recebe uma celebração pronta e a mostra. Não busca,
 * não valida, não decide quando entrar nem quando sair — isso é do
 * `VigiaCelebracao`, e a fila é do módulo puro. Aqui não há estado nem efeito.
 *
 * Ele é **camada**, não tela: o `PainelVisual` continua montado atrás, com os
 * números que estavam lá. Quando a celebração termina, o dashboard reaparece
 * exatamente como estava — nada é remontado, nada recarrega.
 *
 * A mesma `Jost` do painel, pelo mesmo motivo da seção 6 do PLANO: a celebração
 * aparece sobre o dashboard e não pode parecer outro produto. Como o overlay é
 * irmão do `AtualizadorPainel` e não filho dele, a classe da fonte não desce por
 * herança e precisa ser declarada aqui.
 */
const jost = Jost({ subsets: ["latin"], weight: ["300", "400", "500"] });

/**
 * Quantas partículas caem. Fixo de propósito: número derivado de dado — do
 * valor da venda, por exemplo — faria a mesma celebração ter densidades
 * diferentes sem que ninguém pedisse.
 */
const PARTICULAS = 44;

/** As duas cores da identidade que aparecem no confete: dourado e creme. */
const CORES_CONFETE = ["var(--color-destaque)", "var(--color-texto)"] as const;

/**
 * Uma partícula, calculada só a partir do índice.
 *
 * Sem `Math.random`: valor aleatório em render produz marcações diferentes no
 * servidor e no cliente, e a hidratação acusaria divergência. Os multiplicadores
 * abaixo são primos entre si e com 100, o que espalha as posições sem repetir
 * padrão visível ao longo das 44 partículas.
 */
function particula(indice: number) {
  return {
    "--esquerda": `${(indice * 37) % 100}%`,
    "--atraso": `${((indice * 29) % 100) / 25}s`,
    "--tempo": `${3.2 + ((indice * 13) % 7) / 5}s`,
    "--deriva": `${((indice * 17) % 21) - 10}cqw`,
    "--cor": CORES_CONFETE[indice % CORES_CONFETE.length],
  } as React.CSSProperties;
}

/**
 * Três degraus de escala para o elenco: um, poucos, muitos.
 *
 * Uma venda não é de um corretor só (DEC-051), e o número de participantes não
 * tem teto no contrato. Em vez de medir texto no cliente, o CSS decide a escala
 * por este atributo — determinístico, sem estado e sem layout thrash.
 */
function quantidadeDe(total: number): string {
  if (total === 1) return "1";
  return total <= 3 ? "poucos" : "muitos";
}

export function CelebracaoOverlay({ celebracao }: { celebracao: CelebracaoTV }) {
  return (
    <div
      className={`${jost.className} ${estilos.moldura}`}
      // A coreografia inteira do CSS deriva daqui — um relógio só entre o
      // temporizador do vigia e as animações de entrada e saída.
      style={{ "--duracao": `${DURACAO_CELEBRACAO_MS}ms` } as React.CSSProperties}
      // A TV não tem operador para ler um alerta, mas quem abrir a URL num
      // navegador comum deve perceber que algo entrou na tela.
      role="status"
      aria-live="polite"
    >
      <div className={estilos.tv}>
        <div className={estilos.confete} aria-hidden="true">
          {Array.from({ length: PARTICULAS }, (_, indice) => (
            <i key={indice} className={estilos.particula} style={particula(indice)} />
          ))}
        </div>

        <div className={estilos.conteudo}>
          <p className={estilos.titulo}>É VENDA!</p>

          {/* Zero e ausência são coisas diferentes: uma venda sem valor gravado
              nunca vira `R$ 0,00` na parede. `formatarBRL` recebe a string
              canônica direto — dinheiro não passa por `Number` em lugar nenhum
              deste projeto. */}
          {celebracao.valor === null ? (
            <p className={estilos.semValor}>Venda realizada</p>
          ) : (
            <p className={estilos.valor}>{formatarBRL(celebracao.valor)}</p>
          )}

          {/* O imóvel entre o valor e o elenco: é o que foi vendido, e vem
              logo depois de por quanto. Sem rótulo fixo na frente — o campo é
              texto livre do operador, e um "Imóvel" acrescentado aqui viraria
              "Imóvel Imóvel 142" na maioria dos lançamentos. Ausente, o bloco
              inteiro não existe: nada de traço, nada de espaço reservado. */}
          {celebracao.imovelRef === null ? null : (
            <p className={estilos.imovel}>{celebracao.imovelRef}</p>
          )}

          <ul
            className={estilos.participantes}
            data-quantidade={quantidadeDe(celebracao.participantes.length)}
          >
            {celebracao.participantes.map((participante) => (
              <li key={participante.ordem} className={estilos.participante}>
                <span className={estilos.nome}>{participante.corretorNome}</span>
                {/* A equipe do momento do fato, que veio no snapshot da
                    participação — nunca a lotação de hoje do corretor. */}
                <span className={estilos.equipe}>{participante.equipeNome}</span>
              </li>
            ))}
          </ul>

          {/* A marca assina a celebração, embaixo de tudo e discreta: quem
              comemora é o corretor, não a imobiliária. Mesmo lockup oficial do
              cabeçalho do painel e mesmo tratamento — `next/image` com
              `unoptimized`, que serve o PNG como ele é, porque a marca não pode
              ser reprocessada (DEC-047). `width`/`height` aqui são só as
              dimensões intrínsecas, que reservam a proporção e impedem o
              deslocamento do layout; o tamanho real sai do CSS, em `cqw`. */}
          <div className={estilos.assinatura}>
            <Image
              src="/marca/casa-louzada-horizontal-claro.png"
              alt="Casa Louzada"
              width={2511}
              height={297}
              className={estilos.marcaImagem}
              unoptimized
              priority
            />
          </div>
        </div>
      </div>
    </div>
  );
}

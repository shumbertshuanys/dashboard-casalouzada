// Dados TOTALMENTE FICTÍCIOS, apenas ilustrativos: nomes, números e valores
// foram inventados para o protótipo visual. Nada aqui vem do banco.
//
// Este módulo não importa Prisma, `src/lib/db.ts` nem lê `process.env` — a rota
// /preview precisa desenhar sem banco e sem configuração.
//
// Os valores chegam prontos para exibição: totais somados, rankings já ordenados e
// o rótulo de período fixo. O cálculo de verdade é da Fase 3, em `src/lib/metricas.ts`,
// e não deve ser antecipado aqui nem nos componentes (ver DEC-013 em docs/DECISOES.md).

// Os tipos visuais moram em `src/lib/apresentacao-painel.ts` desde a F3.4: o
// mock e a apresentação real precisam desenhar o mesmo shape, e mantê-lo em dois
// lugares deixaria o protótipo divergir da tela de verdade sem ninguém notar.
import {
  type AreaOperacional,
  type BigNumber,
  type Equipe,
  type Linha,
  type Metrica,
  METRICAS_PAINEL,
  type VgvPeriodo,
} from "@/lib/apresentacao-painel";

export type {
  AreaOperacional,
  BigNumber,
  ChaveMetrica,
  Equipe,
  ItemOperacional,
  Linha,
  ListaOperacional,
  Metrica,
  ValorComposto,
  VgvPeriodo,
} from "@/lib/apresentacao-painel";

/** Fixo de propósito: o preview não usa relógio, para o screenshot ser reproduzível. */
export const periodo = "agosto de 2026";

/** Mesma ordem do ciclo real — derivada, não recopiada (DEC-033). */
export const metricas: Metrica[] = [...METRICAS_PAINEL];

// Os dois primeiros saem de um saldo fictício MINIMO_CONHECIDO, para o "+ de"
// entrar no contrato visual (DEC-054); o das avaliações é EXATO, e assim as duas
// formas aparecem lado a lado na mesma faixa.
export const bigNumbers: BigNumber[] = [
  { rotulo: "Imóveis vendidos", numero: { valor: "528" }, estado: "OK", qualificador: "+ de" },
  {
    rotulo: "VGV acumulado",
    numero: { prefixo: "R$", valor: "4,2", sufixo: "bi" },
    estado: "OK",
    qualificador: "+ de",
  },
  { rotulo: "Avaliações Google", numero: { valor: "2.643" }, estado: "OK" },
];

/**
 * A Tela B do protótipo: três propostas e três reservas, o máximo que cabe
 * (DEC-056). Imóveis e nomes inventados, como todo o resto deste módulo.
 *
 * A terceira proposta não tem imóvel de propósito — é o caso da proposta legada
 * (DEC-053), que continua na lista dizendo o que falta em vez de sumir.
 */
export const operacionais: AreaOperacional = {
  propostas: {
    estado: "OK",
    itens: [
      { imovel: "AP-1203 · Ed. Aurora", corretor: "Marina" },
      { imovel: "CA-450 · Alphaville", corretor: "Rodrigo" },
      { imovel: "Imóvel não informado", corretor: "Bianca" },
    ],
  },
  reservas: {
    estado: "OK",
    itens: [
      { imovel: "AP-88 · Jardins", corretor: "Camila" },
      { imovel: "SL-12 · Centro", corretor: "Otávio" },
      { imovel: "CA-77 · Granja", corretor: "Marina" },
    ],
  },
};

export const vgvPeriodos: VgvPeriodo[] = [
  { rotulo: "Anual", valor: { prefixo: "R$", valor: "431", sufixo: "mi" }, estado: "OK" },
  { rotulo: "Trimestral", valor: { prefixo: "R$", valor: "128", sufixo: "mi" }, estado: "OK" },
  { rotulo: "Mensal", valor: { prefixo: "R$", valor: "42,5", sufixo: "mi" }, estado: "OK" },
];

/** Sete linhas: todas as métricas menos VGV, que tem faixa própria. */
export const quadroMensal: Linha[] = [
  { rotulo: "Vendidos", valor: "30" },
  { rotulo: "Locados", valor: "34" },
  { rotulo: "Captação de venda", valor: "71" },
  { rotulo: "Exclusividades", valor: "23" },
  { rotulo: "Captação de locação", valor: "46" },
  { rotulo: "Propostas", valor: "87" },
  { rotulo: "Avaliações Google", valor: "40" },
];

export const equipes: Equipe[] = [
  {
    nome: "Equipe Suellen",
    gerente: "Suellen Martins",
    totalCorretores: 7,
    rankings: {
      vendidos: [
        { rotulo: "Rafael Nunes", valor: "3" },
        { rotulo: "Marina Castro", valor: "2" },
        { rotulo: "Patrícia Alves", valor: "2" },
        { rotulo: "Camila Rosa", valor: "1" },
        { rotulo: "Diego Faria", valor: "1" },
        { rotulo: "Tiago Barros", valor: "1" },
        { rotulo: "Bruno Teixeira", valor: "0" },
      ],
      vgv: [
        { rotulo: "Rafael Nunes", valor: "R$ 4,2 mi" },
        { rotulo: "Marina Castro", valor: "R$ 3,4 mi" },
        { rotulo: "Patrícia Alves", valor: "R$ 2,8 mi" },
        { rotulo: "Camila Rosa", valor: "R$ 1,6 mi" },
        { rotulo: "Diego Faria", valor: "R$ 1,1 mi" },
        { rotulo: "Tiago Barros", valor: "R$ 0,9 mi" },
        { rotulo: "Bruno Teixeira", valor: "R$ 0,0 mi" },
      ],
      locados: [
        { rotulo: "Diego Faria", valor: "3" },
        { rotulo: "Rafael Nunes", valor: "2" },
        { rotulo: "Tiago Barros", valor: "2" },
        { rotulo: "Bruno Teixeira", valor: "2" },
        { rotulo: "Marina Castro", valor: "1" },
        { rotulo: "Patrícia Alves", valor: "1" },
        { rotulo: "Camila Rosa", valor: "1" },
      ],
      capVenda: [
        { rotulo: "Rafael Nunes", valor: "5" },
        { rotulo: "Marina Castro", valor: "4" },
        { rotulo: "Patrícia Alves", valor: "4" },
        { rotulo: "Camila Rosa", valor: "3" },
        { rotulo: "Diego Faria", valor: "3" },
        { rotulo: "Tiago Barros", valor: "2" },
        { rotulo: "Bruno Teixeira", valor: "2" },
      ],
      exclusivas: [
        { rotulo: "Rafael Nunes", valor: "2" },
        { rotulo: "Marina Castro", valor: "2" },
        { rotulo: "Patrícia Alves", valor: "1" },
        { rotulo: "Camila Rosa", valor: "1" },
        { rotulo: "Tiago Barros", valor: "1" },
        { rotulo: "Diego Faria", valor: "0" },
        { rotulo: "Bruno Teixeira", valor: "0" },
      ],
      capLocacao: [
        { rotulo: "Diego Faria", valor: "4" },
        { rotulo: "Rafael Nunes", valor: "3" },
        { rotulo: "Patrícia Alves", valor: "2" },
        { rotulo: "Tiago Barros", valor: "2" },
        { rotulo: "Bruno Teixeira", valor: "2" },
        { rotulo: "Marina Castro", valor: "1" },
        { rotulo: "Camila Rosa", valor: "1" },
      ],
      propostas: [
        { rotulo: "Rafael Nunes", valor: "6" },
        { rotulo: "Marina Castro", valor: "5" },
        { rotulo: "Patrícia Alves", valor: "5" },
        { rotulo: "Camila Rosa", valor: "4" },
        { rotulo: "Diego Faria", valor: "4" },
        { rotulo: "Tiago Barros", valor: "3" },
        { rotulo: "Bruno Teixeira", valor: "2" },
      ],
      avaliacoes: [
        { rotulo: "Rafael Nunes", valor: "3" },
        { rotulo: "Marina Castro", valor: "2" },
        { rotulo: "Patrícia Alves", valor: "2" },
        { rotulo: "Camila Rosa", valor: "2" },
        { rotulo: "Diego Faria", valor: "1" },
        { rotulo: "Tiago Barros", valor: "1" },
        { rotulo: "Bruno Teixeira", valor: "1" },
      ],
    },
  },
  {
    nome: "Equipe Lena",
    gerente: "Lena Duarte",
    totalCorretores: 7,
    rankings: {
      vendidos: [
        { rotulo: "Cláudia Ramos", valor: "3" },
        { rotulo: "Juliana Prado", valor: "2" },
        { rotulo: "Fernando Lima", valor: "2" },
        { rotulo: "Renata Vieira", valor: "1" },
        { rotulo: "Ricardo Sena", valor: "1" },
        { rotulo: "Aline Moreira", valor: "1" },
        { rotulo: "Gustavo Pinho", valor: "0" },
      ],
      vgv: [
        { rotulo: "Cláudia Ramos", valor: "R$ 5,1 mi" },
        { rotulo: "Juliana Prado", valor: "R$ 3,0 mi" },
        { rotulo: "Fernando Lima", valor: "R$ 2,2 mi" },
        { rotulo: "Renata Vieira", valor: "R$ 1,8 mi" },
        { rotulo: "Ricardo Sena", valor: "R$ 1,4 mi" },
        { rotulo: "Aline Moreira", valor: "R$ 1,0 mi" },
        { rotulo: "Gustavo Pinho", valor: "R$ 0,0 mi" },
      ],
      locados: [
        { rotulo: "Ricardo Sena", valor: "3" },
        { rotulo: "Fernando Lima", valor: "2" },
        { rotulo: "Gustavo Pinho", valor: "2" },
        { rotulo: "Cláudia Ramos", valor: "1" },
        { rotulo: "Renata Vieira", valor: "1" },
        { rotulo: "Aline Moreira", valor: "1" },
        { rotulo: "Juliana Prado", valor: "0" },
      ],
      capVenda: [
        { rotulo: "Cláudia Ramos", valor: "6" },
        { rotulo: "Juliana Prado", valor: "5" },
        { rotulo: "Fernando Lima", valor: "4" },
        { rotulo: "Renata Vieira", valor: "3" },
        { rotulo: "Ricardo Sena", valor: "3" },
        { rotulo: "Aline Moreira", valor: "2" },
        { rotulo: "Gustavo Pinho", valor: "2" },
      ],
      exclusivas: [
        { rotulo: "Cláudia Ramos", valor: "3" },
        { rotulo: "Juliana Prado", valor: "2" },
        { rotulo: "Fernando Lima", valor: "1" },
        { rotulo: "Renata Vieira", valor: "1" },
        { rotulo: "Ricardo Sena", valor: "1" },
        { rotulo: "Gustavo Pinho", valor: "1" },
        { rotulo: "Aline Moreira", valor: "0" },
      ],
      capLocacao: [
        { rotulo: "Ricardo Sena", valor: "4" },
        { rotulo: "Fernando Lima", valor: "3" },
        { rotulo: "Cláudia Ramos", valor: "2" },
        { rotulo: "Aline Moreira", valor: "2" },
        { rotulo: "Gustavo Pinho", valor: "2" },
        { rotulo: "Juliana Prado", valor: "1" },
        { rotulo: "Renata Vieira", valor: "1" },
      ],
      propostas: [
        { rotulo: "Cláudia Ramos", valor: "7" },
        { rotulo: "Juliana Prado", valor: "6" },
        { rotulo: "Fernando Lima", valor: "5" },
        { rotulo: "Ricardo Sena", valor: "4" },
        { rotulo: "Renata Vieira", valor: "3" },
        { rotulo: "Aline Moreira", valor: "3" },
        { rotulo: "Gustavo Pinho", valor: "2" },
      ],
      avaliacoes: [
        { rotulo: "Cláudia Ramos", valor: "4" },
        { rotulo: "Juliana Prado", valor: "3" },
        { rotulo: "Fernando Lima", valor: "2" },
        { rotulo: "Renata Vieira", valor: "2" },
        { rotulo: "Aline Moreira", valor: "2" },
        { rotulo: "Ricardo Sena", valor: "1" },
        { rotulo: "Gustavo Pinho", valor: "1" },
      ],
    },
  },
  {
    nome: "Equipe Fernanda L.",
    gerente: "Fernanda Louzada",
    totalCorretores: 7,
    rankings: {
      vendidos: [
        { rotulo: "Joana Ferraz", valor: "3" },
        { rotulo: "Beatriz Nogueira", valor: "2" },
        { rotulo: "Marcelo Duarte", valor: "2" },
        { rotulo: "Larissa Campos", valor: "1" },
        { rotulo: "Silvia Mendes", valor: "1" },
        { rotulo: "Henrique Sales", valor: "1" },
        { rotulo: "Otávio Menezes", valor: "0" },
      ],
      vgv: [
        { rotulo: "Joana Ferraz", valor: "R$ 4,6 mi" },
        { rotulo: "Beatriz Nogueira", valor: "R$ 2,9 mi" },
        { rotulo: "Marcelo Duarte", valor: "R$ 2,5 mi" },
        { rotulo: "Larissa Campos", valor: "R$ 1,5 mi" },
        { rotulo: "Silvia Mendes", valor: "R$ 1,3 mi" },
        { rotulo: "Henrique Sales", valor: "R$ 1,2 mi" },
        { rotulo: "Otávio Menezes", valor: "R$ 0,0 mi" },
      ],
      locados: [
        { rotulo: "Larissa Campos", valor: "3" },
        { rotulo: "Joana Ferraz", valor: "2" },
        { rotulo: "Beatriz Nogueira", valor: "2" },
        { rotulo: "Otávio Menezes", valor: "2" },
        { rotulo: "Marcelo Duarte", valor: "1" },
        { rotulo: "Silvia Mendes", valor: "1" },
        { rotulo: "Henrique Sales", valor: "1" },
      ],
      capVenda: [
        { rotulo: "Joana Ferraz", valor: "5" },
        { rotulo: "Beatriz Nogueira", valor: "4" },
        { rotulo: "Marcelo Duarte", valor: "4" },
        { rotulo: "Silvia Mendes", valor: "3" },
        { rotulo: "Henrique Sales", valor: "3" },
        { rotulo: "Larissa Campos", valor: "2" },
        { rotulo: "Otávio Menezes", valor: "2" },
      ],
      exclusivas: [
        { rotulo: "Joana Ferraz", valor: "2" },
        { rotulo: "Marcelo Duarte", valor: "2" },
        { rotulo: "Beatriz Nogueira", valor: "1" },
        { rotulo: "Larissa Campos", valor: "1" },
        { rotulo: "Silvia Mendes", valor: "1" },
        { rotulo: "Henrique Sales", valor: "0" },
        { rotulo: "Otávio Menezes", valor: "0" },
      ],
      capLocacao: [
        { rotulo: "Joana Ferraz", valor: "3" },
        { rotulo: "Beatriz Nogueira", valor: "3" },
        { rotulo: "Larissa Campos", valor: "3" },
        { rotulo: "Marcelo Duarte", valor: "2" },
        { rotulo: "Henrique Sales", valor: "2" },
        { rotulo: "Otávio Menezes", valor: "2" },
        { rotulo: "Silvia Mendes", valor: "1" },
      ],
      propostas: [
        { rotulo: "Joana Ferraz", valor: "6" },
        { rotulo: "Beatriz Nogueira", valor: "5" },
        { rotulo: "Marcelo Duarte", valor: "5" },
        { rotulo: "Henrique Sales", valor: "4" },
        { rotulo: "Larissa Campos", valor: "3" },
        { rotulo: "Silvia Mendes", valor: "3" },
        { rotulo: "Otávio Menezes", valor: "2" },
      ],
      avaliacoes: [
        { rotulo: "Joana Ferraz", valor: "3" },
        { rotulo: "Beatriz Nogueira", valor: "3" },
        { rotulo: "Marcelo Duarte", valor: "2" },
        { rotulo: "Larissa Campos", valor: "2" },
        { rotulo: "Silvia Mendes", valor: "1" },
        { rotulo: "Henrique Sales", valor: "1" },
        { rotulo: "Otávio Menezes", valor: "1" },
      ],
    },
  },
];

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { PrismaClient } from "@/generated/prisma/client";
import { criarPrismaTeste } from "../helpers/banco-teste";
import { deDataCivil } from "@/lib/datas";
import {
  decidirReservaParaCorretor,
  validarCriacaoReserva,
  validarEdicaoReserva,
} from "@/lib/validacao/reserva-locacao";

/**
 * Administração de reservas de locação (E2C) contra o PostgreSQL **local**.
 *
 * Cada `it` cria as próprias fixtures com nomes únicos — os `it`s de um
 * `describe` rodam concorrentes, e nenhum teste pode disputar linha com outro
 * (lição da E2A). Os fluxos reproduzem o que as actions fazem: FormData →
 * validação → decisão de corretor → Prisma, com `status: "ATIVA"` explícito na
 * criação e UPDATE restrito aos quatro campos editáveis na edição.
 */

const prisma = criarPrismaTeste();
const PREFIXO = "__E2C_TESTE_";
const nome = (sufixo: string) => `${PREFIXO}${sufixo}`;

async function limpar(cliente: PrismaClient): Promise<void> {
  await cliente.reservaLocacao.deleteMany({
    where: { corretor: { nomeCompleto: { startsWith: PREFIXO } } },
  });
  await cliente.usuario.deleteMany({ where: { nome: { startsWith: PREFIXO } } });
  await cliente.corretor.deleteMany({ where: { nomeCompleto: { startsWith: PREFIXO } } });
  await cliente.equipe.deleteMany({ where: { nome: { startsWith: PREFIXO } } });
}

before(async () => {
  await limpar(prisma);
});

after(async () => {
  await limpar(prisma);
  await prisma.$disconnect();
});

/** Equipe + corretor exclusivos deste teste. Nomes únicos pelo sufixo. */
async function criarCenario(sufixo: string, opcoes: { equipeAtiva?: boolean; corretorAtivo?: boolean } = {}) {
  const equipe = await prisma.equipe.create({
    data: {
      nome: nome(`Equipe ${sufixo}`),
      gerenteNome: "E2C",
      ordemExibicao: 96,
      ativa: opcoes.equipeAtiva ?? true,
    },
  });
  const corretor = await prisma.corretor.create({
    data: {
      nomeCompleto: nome(`Corretor ${sufixo}`),
      nomeExibicao: `E2C ${sufixo}`,
      equipeId: equipe.id,
      ativo: opcoes.corretorAtivo ?? true,
    },
  });
  return { equipe, corretor };
}

function formCriacao(corretorId: string, extras: Record<string, string> = {}): FormData {
  const form = new FormData();
  form.set("corretorId", corretorId);
  form.set("imovelRef", "AP-200");
  form.set("dataReferencia", "2026-08-10");
  for (const [chave, valor] of Object.entries(extras)) form.set(chave, valor);
  return form;
}

/** O fluxo da action de criação: validar, decidir e gravar ATIVA explícita. */
async function criarComoAAction(corretorId: string, extras: Record<string, string> = {}, criadoPor?: string) {
  const validado = validarCriacaoReserva(formCriacao(corretorId, extras));
  assert.equal(validado.ok, true);
  if (!validado.ok) throw new Error("validação recusou a criação");

  const corretor = await prisma.corretor.findUnique({
    where: { id: validado.dados.corretorId },
    select: { id: true, ativo: true, equipeId: true, equipe: { select: { ativa: true } } },
  });
  const decisao = decidirReservaParaCorretor(corretor);
  assert.equal(decisao.ok, true);
  if (!decisao.ok) throw new Error("decisão recusou o corretor");

  return prisma.reservaLocacao.create({
    data: {
      corretorId: validado.dados.corretorId,
      equipeId: decisao.equipeId,
      imovelRef: validado.dados.imovelRef,
      status: "ATIVA",
      dataReferencia: validado.dados.dataReferencia,
      observacao: validado.dados.observacao,
      ...(criadoPor ? { criadoPor } : {}),
    },
  });
}

/** O fluxo da action de edição: validar e atualizar só os quatro campos. */
async function editarComoAAction(id: string, campos: Record<string, string>) {
  const form = new FormData();
  for (const [chave, valor] of Object.entries(campos)) form.set(chave, valor);
  const validado = validarEdicaoReserva(form);
  assert.equal(validado.ok, true);
  if (!validado.ok) throw new Error("validação recusou a edição");

  return prisma.reservaLocacao.update({
    where: { id },
    data: {
      imovelRef: validado.dados.imovelRef,
      status: validado.dados.status,
      dataReferencia: validado.dados.dataReferencia,
      observacao: validado.dados.observacao,
    },
  });
}

describe("criação de reserva", () => {
  it("grava corretor, snapshot de equipe, imóvel, ATIVA, data e autoria", async () => {
    const { equipe, corretor } = await criarCenario("cria");
    const autor = await prisma.usuario.create({
      data: {
        nome: nome("Autor cria"),
        email: `${PREFIXO.toLowerCase()}cria@teste.local`,
        senhaHash: "x",
      },
    });

    const criada = await criarComoAAction(corretor.id, { observacao: "com autoria" }, autor.id);

    const relida = await prisma.reservaLocacao.findUniqueOrThrow({ where: { id: criada.id } });
    assert.equal(relida.corretorId, corretor.id);
    assert.equal(relida.equipeId, equipe.id);
    assert.equal(relida.imovelRef, "AP-200");
    assert.equal(relida.status, "ATIVA");
    assert.equal(deDataCivil(relida.dataReferencia), "2026-08-10");
    assert.equal(relida.observacao, "com autoria");
    assert.equal(relida.criadoPor, autor.id);
  });

  it("ignora status forjado no FormData: nasce ATIVA", async () => {
    const { corretor } = await criarCenario("forja-status");

    const criada = await criarComoAAction(corretor.id, { status: "CANCELADA" });
    assert.equal(criada.status, "ATIVA");
  });

  it("ignora equipeId forjada no FormData: usa a equipe real do corretor", async () => {
    const { equipe, corretor } = await criarCenario("forja-equipe");
    const alheia = await prisma.equipe.create({
      data: { nome: nome("Equipe alheia"), gerenteNome: "E2C", ordemExibicao: 96 },
    });

    const criada = await criarComoAAction(corretor.id, { equipeId: alheia.id });
    assert.equal(criada.equipeId, equipe.id);
    assert.notEqual(criada.equipeId, alheia.id);
  });

  it("recusa reserva nova para corretor inativo", async () => {
    const { corretor } = await criarCenario("inativo", { corretorAtivo: false });

    const consultado = await prisma.corretor.findUnique({
      where: { id: corretor.id },
      select: { id: true, ativo: true, equipeId: true, equipe: { select: { ativa: true } } },
    });
    const decisao = decidirReservaParaCorretor(consultado);
    assert.equal(decisao.ok, false);
    if (!decisao.ok) assert.equal(decisao.erro, "Este corretor está inativo.");
  });

  it("recusa reserva nova para corretor de equipe desativada", async () => {
    const { corretor } = await criarCenario("eq-inativa", { equipeAtiva: false });

    const consultado = await prisma.corretor.findUnique({
      where: { id: corretor.id },
      select: { id: true, ativo: true, equipeId: true, equipe: { select: { ativa: true } } },
    });
    const decisao = decidirReservaParaCorretor(consultado);
    assert.equal(decisao.ok, false);
    if (!decisao.ok) assert.match(decisao.erro, /desativada/i);
  });
});

describe("edição de reserva", () => {
  const CAMPOS = { imovelRef: "AP-200", dataReferencia: "2026-08-10" };

  it("ATIVA → FINALIZADA", async () => {
    const { corretor } = await criarCenario("finaliza");
    const criada = await criarComoAAction(corretor.id);

    const editada = await editarComoAAction(criada.id, { ...CAMPOS, status: "FINALIZADA" });
    assert.equal(editada.status, "FINALIZADA");
  });

  it("FINALIZADA → CANCELADA", async () => {
    const { corretor } = await criarCenario("cancela");
    const criada = await criarComoAAction(corretor.id);
    await editarComoAAction(criada.id, { ...CAMPOS, status: "FINALIZADA" });

    const editada = await editarComoAAction(criada.id, { ...CAMPOS, status: "CANCELADA" });
    assert.equal(editada.status, "CANCELADA");
  });

  it("CANCELADA → ATIVA: erro operacional é reversível, sem máquina terminal", async () => {
    const { corretor } = await criarCenario("reativa");
    const criada = await criarComoAAction(corretor.id);
    await editarComoAAction(criada.id, { ...CAMPOS, status: "CANCELADA" });

    const editada = await editarComoAAction(criada.id, { ...CAMPOS, status: "ATIVA" });
    assert.equal(editada.status, "ATIVA");
  });

  it("preserva corretorId, equipeId e criadoPor", async () => {
    const { equipe, corretor } = await criarCenario("preserva");
    const autor = await prisma.usuario.create({
      data: {
        nome: nome("Autor preserva"),
        email: `${PREFIXO.toLowerCase()}preserva@teste.local`,
        senhaHash: "x",
      },
    });
    const criada = await criarComoAAction(corretor.id, {}, autor.id);

    // Payload com corretor/equipe forjados: a validação não os lê e o UPDATE
    // não os toca.
    await editarComoAAction(criada.id, {
      status: "FINALIZADA",
      imovelRef: "AP-201",
      dataReferencia: "2026-08-11",
      corretorId: "00000000-0000-4000-8000-000000000000",
      equipeId: "00000000-0000-4000-8000-000000000000",
    });

    const relida = await prisma.reservaLocacao.findUniqueOrThrow({ where: { id: criada.id } });
    assert.equal(relida.corretorId, corretor.id);
    assert.equal(relida.equipeId, equipe.id);
    assert.equal(relida.criadoPor, autor.id);
    assert.equal(relida.imovelRef, "AP-201");
  });

  it("corretor que ficou inativo depois não bloqueia a edição", async () => {
    const { corretor } = await criarCenario("corretor-depois-inativo");
    const criada = await criarComoAAction(corretor.id);

    await prisma.corretor.update({ where: { id: corretor.id }, data: { ativo: false } });

    const editada = await editarComoAAction(criada.id, { ...CAMPOS, status: "CANCELADA" });
    assert.equal(editada.status, "CANCELADA");
  });

  it("equipe que ficou inativa depois não bloqueia a edição", async () => {
    const { equipe, corretor } = await criarCenario("equipe-depois-inativa");
    const criada = await criarComoAAction(corretor.id);

    await prisma.equipe.update({ where: { id: equipe.id }, data: { ativa: false } });

    const editada = await editarComoAAction(criada.id, { ...CAMPOS, status: "FINALIZADA" });
    assert.equal(editada.status, "FINALIZADA");
    assert.equal(editada.equipeId, equipe.id);
  });
});

describe("snapshot de equipe", () => {
  it("corretor trocando de equipe depois não move a reserva", async () => {
    const { equipe, corretor } = await criarCenario("troca");
    const criada = await criarComoAAction(corretor.id);

    const destino = await prisma.equipe.create({
      data: { nome: nome("Equipe destino"), gerenteNome: "E2C", ordemExibicao: 96 },
    });
    await prisma.corretor.update({ where: { id: corretor.id }, data: { equipeId: destino.id } });

    // A reserva continua na equipe histórica — e é isso que a listagem mostra,
    // porque ela lê `ReservaLocacao.equipe`, nunca `corretor.equipe`.
    const relida = await prisma.reservaLocacao.findUniqueOrThrow({
      where: { id: criada.id },
      select: {
        equipeId: true,
        equipe: { select: { nome: true } },
        corretor: { select: { equipeId: true } },
      },
    });
    assert.equal(relida.equipeId, equipe.id);
    assert.equal(relida.equipe.nome, equipe.nome);
    assert.equal(relida.corretor.equipeId, destino.id);
  });
});

describe("reserva não é produção (DEC-055)", () => {
  it("criar, finalizar e cancelar não cria nenhum Lancamento", async () => {
    const { corretor } = await criarCenario("sem-locacao");

    const antes = await prisma.lancamento.count({ where: { corretorId: corretor.id } });
    assert.equal(antes, 0);

    const criada = await criarComoAAction(corretor.id);
    await editarComoAAction(criada.id, {
      imovelRef: "AP-200",
      dataReferencia: "2026-08-10",
      status: "FINALIZADA",
    });
    await editarComoAAction(criada.id, {
      imovelRef: "AP-200",
      dataReferencia: "2026-08-10",
      status: "CANCELADA",
    });

    const depois = await prisma.lancamento.count({ where: { corretorId: corretor.id } });
    assert.equal(depois, 0);
  });
});

describe("contrato da listagem", () => {
  it("ordena por data DESC e desempata por criação DESC, restrito ao próprio cenário", async () => {
    const { corretor } = await criarCenario("lista");

    const antiga = await criarComoAAction(corretor.id, { dataReferencia: "2026-08-01" });
    const recente = await criarComoAAction(corretor.id, { dataReferencia: "2026-08-12" });
    const recenteDepois = await criarComoAAction(corretor.id, { dataReferencia: "2026-08-12" });

    // A mesma forma da consulta da página, filtrada às linhas deste teste.
    const listadas = await prisma.reservaLocacao.findMany({
      where: { corretorId: corretor.id },
      orderBy: [{ dataReferencia: "desc" }, { criadoEm: "desc" }],
      select: { id: true },
    });
    assert.deepEqual(
      listadas.map((reserva) => reserva.id),
      [recenteDepois.id, recente.id, antiga.id],
    );
  });
});

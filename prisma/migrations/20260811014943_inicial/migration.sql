-- CreateEnum
CREATE TYPE "tipo_lancamento" AS ENUM ('VENDA', 'LOCACAO', 'CAPTACAO_VENDA', 'CAPTACAO_EXCLUSIVA', 'CAPTACAO_LOCACAO', 'PROPOSTA', 'AVALIACAO_GOOGLE');

-- CreateTable
CREATE TABLE "equipes" (
    "id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "gerente_nome" TEXT NOT NULL,
    "ordem_exibicao" INTEGER NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "equipes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "corretores" (
    "id" UUID NOT NULL,
    "nome_completo" TEXT NOT NULL,
    "nome_exibicao" TEXT NOT NULL,
    "foto_url" TEXT,
    "creci" TEXT,
    "equipe_id" UUID NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "data_entrada" DATE,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "corretores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lancamentos" (
    "id" UUID NOT NULL,
    "tipo" "tipo_lancamento" NOT NULL,
    "corretor_id" UUID NOT NULL,
    "equipe_id" UUID NOT NULL,
    "data_referencia" DATE NOT NULL,
    "valor" DECIMAL(14,2),
    "imovel_ref" TEXT,
    "observacao" TEXT,
    "criado_por" UUID,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "lancamentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saldo_historico" (
    "id" UUID NOT NULL,
    "tipo" "tipo_lancamento" NOT NULL,
    "quantidade" INTEGER NOT NULL DEFAULT 0,
    "valor_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "data_corte" DATE NOT NULL,
    "descricao" TEXT,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "saldo_historico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuarios" (
    "id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senha_hash" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "equipes_nome_key" ON "equipes"("nome");

-- CreateIndex
CREATE INDEX "equipes_ordem_exibicao_idx" ON "equipes"("ordem_exibicao");

-- CreateIndex
CREATE INDEX "corretores_equipe_id_idx" ON "corretores"("equipe_id");

-- CreateIndex
CREATE INDEX "corretores_ativo_idx" ON "corretores"("ativo");

-- CreateIndex
CREATE INDEX "lancamentos_tipo_data_referencia_idx" ON "lancamentos"("tipo", "data_referencia");

-- CreateIndex
CREATE INDEX "lancamentos_data_referencia_idx" ON "lancamentos"("data_referencia");

-- CreateIndex
CREATE INDEX "lancamentos_corretor_id_data_referencia_idx" ON "lancamentos"("corretor_id", "data_referencia");

-- CreateIndex
CREATE INDEX "lancamentos_equipe_id_data_referencia_idx" ON "lancamentos"("equipe_id", "data_referencia");

-- CreateIndex
CREATE INDEX "saldo_historico_tipo_idx" ON "saldo_historico"("tipo");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- AddForeignKey
ALTER TABLE "corretores" ADD CONSTRAINT "corretores_equipe_id_fkey" FOREIGN KEY ("equipe_id") REFERENCES "equipes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_corretor_id_fkey" FOREIGN KEY ("corretor_id") REFERENCES "corretores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_equipe_id_fkey" FOREIGN KEY ("equipe_id") REFERENCES "equipes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_criado_por_fkey" FOREIGN KEY ("criado_por") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

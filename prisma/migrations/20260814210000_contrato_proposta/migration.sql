-- Entrega v1 — E2B: contrato de integridade da PROPOSTA (DEC-053).
--
-- Fecha a janela transitória que a E2A deixou aberta: status obrigatório em
-- PROPOSTA, campos de proposta proibidos nos demais tipos, `valor` sempre NULL
-- em PROPOSTA e `valor_proposta` positivo quando informado.
--
-- O CHECK propositalmente NÃO exige `imovel_ref`: proposta legada sem imóvel
-- continua válida como histórico (DEC-053). A obrigatoriedade do imóvel é da
-- aplicação, em novas submissões e edições.

-- Backfill defensivo: cobre um ambiente que aplicou a E2A e usou o código
-- antigo antes da E2B — propostas dessa janela ficaram com status NULL.
UPDATE "lancamentos"
SET "status_proposta" = 'AGUARDANDO'
WHERE "tipo" = 'PROPOSTA' AND "status_proposta" IS NULL;

-- Contrato de integridade (DEC-053).
ALTER TABLE "lancamentos"
ADD CONSTRAINT "lancamentos_proposta_campos_check" CHECK (
  (
    "tipo" = 'PROPOSTA'
    AND "status_proposta" IS NOT NULL
    AND "valor" IS NULL
    AND ("valor_proposta" IS NULL OR "valor_proposta" > 0)
  )
  OR
  (
    "tipo" <> 'PROPOSTA'
    AND "status_proposta" IS NULL
    AND "valor_proposta" IS NULL
  )
);

"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { entrar, type EstadoLogin } from "./acoes";

function BotaoEntrar() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-2 rounded-md bg-destaque px-4 py-3 font-medium text-fundo transition-opacity hover:opacity-90 disabled:opacity-60"
    >
      {pending ? "Entrando…" : "Entrar"}
    </button>
  );
}

export function FormularioLogin({ proximo }: { proximo: string }) {
  const [estado, acao] = useActionState<EstadoLogin, FormData>(entrar, {});

  return (
    <form action={acao} className="flex flex-col gap-4">
      <input type="hidden" name="proximo" value={proximo} />

      <label className="flex flex-col gap-2 text-sm text-texto-secundario">
        E-mail
        <input
          name="email"
          type="email"
          required
          autoComplete="username"
          autoFocus
          className="rounded-md border border-white/10 bg-fundo px-3 py-2.5 text-base text-texto placeholder:text-texto-secundario/60 focus:border-destaque focus:outline-none"
        />
      </label>

      <label className="flex flex-col gap-2 text-sm text-texto-secundario">
        Senha
        <input
          name="senha"
          type="password"
          required
          autoComplete="current-password"
          className="rounded-md border border-white/10 bg-fundo px-3 py-2.5 text-base text-texto focus:border-destaque focus:outline-none"
        />
      </label>

      {estado.erro ? (
        <p role="alert" className="text-sm text-negativo">
          {estado.erro}
        </p>
      ) : null}

      <BotaoEntrar />
    </form>
  );
}

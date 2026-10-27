"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

/**
 * Volta a pedir a página ao servidor de 3 em 3 segundos enquanto o webhook da
 * Whop não marca a conta como PRO. Ao fim de ~90 s deixa de tentar e mostra o
 * aviso com o contacto, para ninguém ficar a olhar para um spinner sem fim.
 */
export function AtualizarAteAtivo({ aviso }: { aviso: string }) {
  const router = useRouter();
  const [tentativas, setTentativas] = React.useState(0);
  const desistiu = tentativas >= 30;

  React.useEffect(() => {
    if (desistiu) return;
    const id = setTimeout(() => {
      router.refresh();
      setTentativas((n) => n + 1);
    }, 3000);
    return () => clearTimeout(id);
  }, [tentativas, desistiu, router]);

  return desistiu ? <p className="mt-6 text-sm leading-relaxed text-muted-foreground">{aviso}</p> : null;
}

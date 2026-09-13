"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { initializePaddle, Paddle } from "@paddle/paddle-js";

interface PaddleContextValue {
  paddle: Paddle | null;
}

const PaddleContext = createContext<PaddleContextValue>({ paddle: null });

export function usePaddle() {
  return useContext(PaddleContext);
}

/**
 * Vendas próprias SUSPENSAS nesta fase.
 *
 * O acesso PRO vem da comunidade privada na Whop, e não há checkout do Paddle
 * em lado nenhum da aplicação. O provider envolve a app INTEIRA, portanto o
 * script do Paddle carregava em todas as páginas e para todos os visitantes —
 * incluindo quem só abre a landing e nunca vai pagar. É um terceiro a ver cada
 * visita, e CPU e rede gastos por um sistema desligado.
 *
 * O provider fica de pé e `usePaddle()` continua a devolver `{ paddle: null }`,
 * que é exatamente o estado que os três consumidores já sabiam tratar (o
 * DynamicProPrice, o cartão das definições e o Retain testam todos `!paddle` e
 * caem no preço das traduções). Por isso não foi preciso mexer em nenhum.
 *
 * Para reativar vendas próprias: pôr isto a `true`.
 */
const VENDAS_PROPRIAS_ATIVAS = false;

export function PaddleProvider({ children }: { children: ReactNode }) {
  const [paddle, setPaddle] = useState<Paddle | null>(null);

  useEffect(() => {
    let isMounted = true;

    if (!VENDAS_PROPRIAS_ATIVAS) return;

    if (!process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN) {
      // Em dev o token pode não existir (esperado) — só avisar em produção,
      // onde faltar o token é de facto um problema.
      if (process.env.NODE_ENV === "production") {
        console.warn("Paddle client token is missing!");
      }
      return;
    }

    const init = () => {
      initializePaddle({
        environment: (process.env.NEXT_PUBLIC_PADDLE_ENV as "sandbox" | "production") || "sandbox",
        token: process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN!,
      }).then((paddleInstance) => {
        if (paddleInstance && isMounted) {
          setPaddle(paddleInstance);
        }
      });
    };

    // Atrasar 4 segundos para garantir que FCP/LCP não sofrem concorrência de rede/CPU
    const timeoutId = setTimeout(() => {
      if ("requestIdleCallback" in window) {
        requestIdleCallback(() => init());
      } else {
        init();
      }
    }, 4000);

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, []);

  return (
    <PaddleContext.Provider value={{ paddle }}>
      {children}
    </PaddleContext.Provider>
  );
}

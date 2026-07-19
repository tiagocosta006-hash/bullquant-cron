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

export function PaddleProvider({ children }: { children: ReactNode }) {
  const [paddle, setPaddle] = useState<Paddle | null>(null);

  useEffect(() => {
    let isMounted = true;
    let timeoutId: ReturnType<typeof setTimeout>;

    if (!process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN) {
      console.warn("Paddle client token is missing!");
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
    timeoutId = setTimeout(() => {
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

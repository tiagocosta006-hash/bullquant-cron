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

    if (!process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN) {
      console.warn("Paddle client token is missing!");
      return;
    }

    initializePaddle({
      environment: (process.env.NEXT_PUBLIC_PADDLE_ENV as "sandbox" | "production") || "sandbox",
      token: process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN,
    }).then((paddleInstance) => {
      if (paddleInstance && isMounted) {
        setPaddle(paddleInstance);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <PaddleContext.Provider value={{ paddle }}>
      {children}
    </PaddleContext.Provider>
  );
}

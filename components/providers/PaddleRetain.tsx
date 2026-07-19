"use client";

import { useEffect } from "react";
import { usePaddle } from "./PaddleProvider";

interface PaddleRetainProps {
  email?: string | null;
  customerId?: string | null;
}

export function PaddleRetain({ email, customerId }: PaddleRetainProps) {
  const { paddle } = usePaddle();

  useEffect(() => {
    if (!paddle) return;

    const pwCustomer: { email?: string; id?: string } = {};

    // Priorizar ID do cliente se existir (mais robusto para o Retain)
    if (customerId) {
      pwCustomer.id = customerId;
    } else if (email) {
      pwCustomer.email = email;
    }

    if (Object.keys(pwCustomer).length > 0) {
      paddle.Update({
        pwCustomer,
      });
    }
  }, [paddle, email, customerId]);

  return null;
}

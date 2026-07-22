"use client";

import { useState, useEffect } from "react";
import { usePaddle } from "@/components/providers/PaddleProvider";

export function DynamicProPrice({ fallback }: { fallback: string }) {
  const { paddle } = usePaddle();
  const [price, setPrice] = useState(fallback);

  useEffect(() => {
    const priceId = process.env.NEXT_PUBLIC_PADDLE_PRICE_ID_PRO;
    if (!paddle || !priceId) return;

    paddle.PricePreview({ items: [{ priceId, quantity: 1 }] })
      .then((preview) => {
        if (preview.data.details.lineItems.length > 0) {
          setPrice(preview.data.details.lineItems[0].formattedTotals.total);
        }
      })
      .catch(console.error);
  }, [paddle]);

  return <>{price}</>;
}

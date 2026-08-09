"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { NewsStatus } from "@prisma/client";
import { setArticleStatus } from "./actions";
import { cn } from "@/lib/utils";

const NEXT_ACTIONS: Record<NewsStatus, Array<{ to: NewsStatus; label: string; danger?: boolean }>> = {
  DRAFT: [
    { to: NewsStatus.PUBLISHED, label: "Publicar" },
    { to: NewsStatus.ARCHIVED, label: "Arquivar", danger: true },
  ],
  PUBLISHED: [{ to: NewsStatus.ARCHIVED, label: "Despublicar", danger: true }],
  ARCHIVED: [{ to: NewsStatus.PUBLISHED, label: "Republicar" }],
};

export function StatusActions({ id, status }: { id: string; status: NewsStatus }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <div className="flex items-center gap-2">
      {pending && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      {NEXT_ACTIONS[status].map(({ to, label, danger }) => (
        <button
          key={to}
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await setArticleStatus(id, to);
              router.refresh();
            })
          }
          className={cn(
            "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50",
            danger
              ? "border-border text-muted-foreground hover:border-red-500/40 hover:text-red-600"
              : "border-primary/40 text-primary hover:bg-primary/10"
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

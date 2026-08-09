"use server";

import { revalidatePath } from "next/cache";
import { NewsStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/supabase/server";
import { isPulseAdmin } from "@/lib/pulse/server";

/**
 * Muda o estado de um artigo do terminal.
 *
 * O AdminLayout já bloqueia a página, mas as Server Actions são endpoints HTTP
 * próprios e podem ser invocadas diretamente — por isso a verificação de admin
 * é repetida aqui, e não confiada ao layout.
 */
export async function setArticleStatus(id: string, status: NewsStatus) {
  const user = await getUser();
  if (!user || !isPulseAdmin(user.email)) {
    throw new Error("Não autorizado");
  }

  if (!Object.values(NewsStatus).includes(status)) {
    throw new Error("Estado inválido");
  }

  await prisma.newsArticle.update({ where: { id }, data: { status } });

  revalidatePath("/[locale]/admin/news", "page");
  revalidatePath("/[locale]/news", "page");
}

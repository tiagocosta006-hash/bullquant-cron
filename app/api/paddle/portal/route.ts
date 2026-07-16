import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { Environment, LogLevel, Paddle } from "@paddle/paddle-node-sdk";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    
    // Validar sessão no servidor
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !authUser) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    // Obter o utilizador da Base de Dados para termos o paddleCustomerId
    const user = await prisma.user.findUnique({
      where: { email: authUser.email },
      select: { paddleCustomerId: true, paddleSubscriptionId: true }
    });

    if (!user || !user.paddleCustomerId) {
      return NextResponse.json({ error: "Utilizador não tem subscrição ativa." }, { status: 400 });
    }

    // Iniciar Paddle SDK
    const paddleEnv = process.env.NEXT_PUBLIC_PADDLE_ENV === 'production' 
      ? Environment.production 
      : Environment.sandbox;

    const paddle = new Paddle(
      process.env.PADDLE_API_KEY || "",
      { environment: paddleEnv, logLevel: LogLevel.error }
    );

    // Pedir URL de sessão ao Paddle
    const subscriptionIds = user.paddleSubscriptionId ? [user.paddleSubscriptionId] : [];
    const portalSession = await paddle.customerPortalSessions.create(user.paddleCustomerId, subscriptionIds);

    return NextResponse.json({ url: portalSession.urls.general.overview });
    
  } catch (error) {
    console.error("Erro ao gerar sessão do portal:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { Environment, LogLevel, Paddle, EventName } from "@paddle/paddle-node-sdk";
import { prisma } from "@/lib/prisma";
import { sendUpgradeToProEmail } from "@/lib/resend";


// Inicializar o SDK do Paddle
const paddleEnv = process.env.NEXT_PUBLIC_PADDLE_ENV === 'production' 
  ? Environment.production 
  : Environment.sandbox;

const paddle = new Paddle(
  process.env.PADDLE_API_KEY || "",
  { environment: paddleEnv, logLevel: LogLevel.error }
);

export async function POST(request: Request) {
  const signature = request.headers.get("paddle-signature");
  const secretKey = process.env.PADDLE_WEBHOOK_SECRET_KEY;

  if (!signature || !secretKey) {
    return NextResponse.json({ error: "Missing signature or secret key" }, { status: 400 });
  }

  try {
    const rawRequestBody = await request.text();

    // Validar a assinatura e converter para um evento do Paddle
    const eventData = await paddle.webhooks.unmarshal(rawRequestBody, secretKey, signature);
    
    // Devolver status 200 IMEDIATAMENTE (requisito do Paddle de responder em menos de 5s)
    // Para não bloquear a resposta, vamos processar o evento de forma assíncrona.
    // Em Next.js App Router (Node.js runtime), código síncrono ou promessas que fiquem a correr
    // após o return podem não completar no ambiente serverless (Vercel).
    // Mas a Vercel suporta waitUntil(), vamos usar se estiver disponível, caso contrário o ideal era usar Upstash QStash,
    // Mas para este MVP, vamos simplesmente aguardar o processamento.
    // Como as transações na BD são rápidas, podemos fazer o await diretamente, mas idealmente seria deferido.

    // Para evitar timeout, fazemos o processamento
    await processPaddleEvent(eventData);

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    console.error("Erro no processamento do webhook do Paddle:", error);
    // Mesmo em caso de falha de processamento, podemos devolver 200 para evitar retries infinitos,
    // ou 400 se for erro de assinatura. A SDK atira erro se a assinatura for inválida.
    return NextResponse.json({ error: "Webhook verification failed" }, { status: 400 });
  }
}

async function processPaddleEvent(event: any) {
  const { eventType, data } = event;

  switch (eventType) {
    case EventName.TransactionCompleted:
      // A transação foi completada. É uma boa altura para capturar o Customer ID e o seu Email
      await handleTransactionCompleted(data);
      break;

    case EventName.SubscriptionCreated:
    case EventName.SubscriptionUpdated:
      // Subscrição ativada, atualizada, ou passou de trial para pago
      await handleSubscriptionChange(data);
      break;

    case EventName.SubscriptionCanceled:
      // Subscrição cancelada
      await handleSubscriptionCanceled(data);
      break;

    default:
      console.log(`Evento ${eventType} recebido mas não processado.`);
  }
}

async function handleTransactionCompleted(transaction: any) {
  const customerId = transaction.customerId;
  const userId = transaction.customData?.userId;
  if (!customerId) return;

  try {
    if (userId) {
      // Priorizar associação pelo userId seguro (passado via Checkout)
      await prisma.user.update({
        where: { id: userId },
        data: { paddleCustomerId: customerId },
      });
      return;
    }

    // Fallback: Ir buscar o email do cliente ao Paddle se não houver userId
    const customer = await paddle.customers.get(customerId);
    const email = customer.email;

    if (email) {
      // Associar o paddleCustomerId ao user pelo email
      await prisma.user.update({
        where: { email },
        data: { paddleCustomerId: customerId },
      });
    }
  } catch (error) {
    console.error("Erro a processar transaction.completed:", error);
  }
}

async function handleSubscriptionChange(subscription: any) {
  const customerId = subscription.customerId;
  const subscriptionId = subscription.id;
  const status = subscription.status; // active, past_due, trialing, etc.
  const userId = subscription.customData?.userId;
  
  let priceId = null;
  if (subscription.items && subscription.items.length > 0) {
    priceId = subscription.items[0].price?.id;
  }

  try {
    const isPro = status === "active" || status === "trialing";
    const plan = isPro ? "PRO" : "FREE";

    if (userId) {
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { plan: true, email: true, name: true } });
      const previousPlan = user?.plan;

      await prisma.user.update({
        where: { id: userId },
        data: {
          paddleCustomerId: customerId,
          paddleSubscriptionId: subscriptionId,
          paddleStatus: status,
          paddlePriceId: priceId,
          plan: plan,
        },
      });

      if (isPro && previousPlan !== "PRO" && user?.email) {
        await sendUpgradeToProEmail(user.email, user.name || "Investidor");
      }

      return;
    }

    // Fallback ao email se não vier customData
    const customer = await paddle.customers.get(customerId);
    const email = customer.email;

    if (email) {
      const user = await prisma.user.findUnique({ where: { email }, select: { plan: true, name: true } });
      const previousPlan = user?.plan;

      await prisma.user.update({
        where: { email },
        data: {
          paddleCustomerId: customerId,
          paddleSubscriptionId: subscriptionId,
          paddleStatus: status,
          paddlePriceId: priceId,
          plan: plan,
        },
      });

      if (isPro && previousPlan !== "PRO") {
        await sendUpgradeToProEmail(email, user?.name || "Investidor");
      }
    }
  } catch (error) {
    console.error("Erro a processar alteração de subscrição:", error);
  }
}

async function handleSubscriptionCanceled(subscription: any) {
  const customerId = subscription.customerId;
  const subscriptionId = subscription.id;

  try {
    // Opcional: Se quisermos usar o customerId para procurar no Prisma em vez de fazer fetch ao Paddle
    // Podemos fazer isso diretamente pois já mapeamos no transaction.completed
    await prisma.user.updateMany({
      where: { paddleSubscriptionId: subscriptionId },
      data: {
        paddleStatus: "canceled",
        plan: "FREE",
      },
    });
  } catch (error) {
    console.error("Erro a cancelar subscrição:", error);
  }
}

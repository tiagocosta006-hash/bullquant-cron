import { useTranslations } from "next-intl"
import { Lock } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"

interface ProGateProps {
  isPro: boolean
  isLoggedIn?: boolean
  ticker?: string
}

export function ProGate({ isPro, isLoggedIn = true, ticker }: ProGateProps) {
  const tGate = useTranslations("stock.proGate")

  if (isPro) return null

  return (
    <div className="absolute inset-0 z-30 bg-background/50 backdrop-blur-sm rounded-xl">
      <div className="sticky top-[20vh] flex flex-col items-center justify-center p-6 text-center">
        <div className="bg-muted p-4 rounded-full mb-4 shadow-sm border border-border/40">
          <Lock className="w-8 h-8 text-muted-foreground" />
        </div>
        {isLoggedIn ? (
          <>
            <h3 className="text-2xl font-bold mb-3">{tGate("title")}</h3>
            <p className="text-muted-foreground max-w-md mb-8 font-medium">
              {ticker ? tGate("desc", { ticker }) : tGate("descGeneric")}
            </p>
            <Link href="/pricing">
              <Button size="lg" className="font-semibold shadow-lg shadow-primary/20 px-8">
                {tGate("upgradeCta")}
              </Button>
            </Link>
          </>
        ) : (
          <>
            <h3 className="text-2xl font-bold mb-3">{tGate("guestTitle")}</h3>
            <p className="text-muted-foreground max-w-md mb-8 font-medium">
              {ticker ? tGate("guestDesc", { ticker }) : tGate("guestDescGeneric")}
            </p>
            <Link href="/register">
              <Button size="lg" className="font-semibold shadow-lg shadow-primary/20 px-8">
                {tGate("guestCta")}
              </Button>
            </Link>
          </>
        )}
      </div>
    </div>
  )
}

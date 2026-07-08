import Link from 'next/link';

export function Footer() {
  return (
    <footer className="border-t border-border/40 py-8 md:py-12 bg-background">
      <div className="container mx-auto px-4 flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="text-sm text-muted-foreground">
          © {new Date().getFullYear()} BullMetrics. Todos os direitos reservados.
        </div>
        
        <div className="flex gap-4 text-sm text-muted-foreground">
          <Link href="/terms" className="hover:text-foreground transition-colors">
            Termos de Serviço
          </Link>
          <Link href="/privacy" className="hover:text-foreground transition-colors">
            Privacidade
          </Link>
          <Link href="/refund" className="hover:text-foreground transition-colors">
            Política de Reembolso
          </Link>
        </div>
      </div>
    </footer>
  );
}

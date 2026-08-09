"use client";

import {
  Dialog,
  DialogContent,
  DialogTrigger,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Link, Camera, Mail } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";

export interface TeamMember {
  name: string;
  role: string;
  bio: string;
  initials: string;
  image?: string;
  socials?: {
    linkedin: string;
    instagram: string;
    email: string;
  };
}

export function TeamMemberModal({ member }: { member: TeamMember }) {
  const t = useTranslations("about.team");
  // Verifica que redes sociais têm dados, assumimos que "#" significa vazio de momento
  const hasLinkedin = member.socials?.linkedin && member.socials.linkedin !== "#";
  const hasInstagram = member.socials?.instagram && member.socials.instagram !== "#";
  const hasEmail = member.socials?.email && member.socials.email !== "#";
  const hasAnySocial = hasLinkedin || hasInstagram || hasEmail;

  return (
    <Dialog>
      {/* h-full nos dois níveis: sem isto, o cartão com o nome a partir em
          duas linhas ficava mais alto que os outros e a fila desalinhava em
          baixo. O grid estica o item, mas o botão e o cartão lá dentro têm
          de aceitar essa altura. */}
      <DialogTrigger className="h-full w-full text-left">
        {/* .card-lift é o primitivo partilhado (lift + borda dourada + sombra
            do sistema). Substituiu um transition-all/duration-300/shadow-2xl
            à mão, que fugia aos tokens de motion e ficava fora da cobertura de
            prefers-reduced-motion. */}
        {/* Retrato 4:5 a ocupar o topo do cartão, sem padding em cima.
            Substituiu o avatar redondo de 128px ao centro — que é o cartão de
            equipa por omissão de qualquer template. Com a fotografia à
            largura toda, a pessoa passa a ser o objeto do cartão em vez de um
            ícone dela. Escolhido pelo Alex entre 4 alternativas. */}
        <span className="card-lift glass group relative flex h-full cursor-pointer flex-col gap-5 overflow-hidden rounded-3xl pb-8">
          {/* Efeito de brilho hover no cartão pequeno */}
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>

          <div className="relative z-10 flex aspect-[4/5] w-full items-center justify-center overflow-hidden bg-secondary">
            {member.image ? (
              <Image src={member.image} alt={member.name} fill sizes="(min-width: 640px) 420px, 100vw" className="object-cover" />
            ) : (
              <span className="text-5xl font-sans text-muted-foreground/40">{member.initials}</span>
            )}
          </div>

          <div className="relative z-10 flex flex-col gap-1 px-8 text-center">
            <h3 className="font-extrabold tracking-[-0.02em] text-2xl group-hover:text-primary transition-colors">{member.name}</h3>
            <span className="text-sm text-primary font-medium tracking-wider uppercase">{member.role}</span>
          </div>

          <p className="relative z-10 px-8 text-muted-foreground text-center text-sm leading-relaxed line-clamp-3">
            {member.bio}
          </p>

          {/* mt-auto empurra o "ver perfil" para o fundo, para as três setas
              ficarem alinhadas mesmo com bios de comprimentos diferentes */}
          <div className="relative z-10 mt-auto px-8 pt-2 text-center">
            <span className="text-xs font-semibold text-primary/70 uppercase tracking-widest group-hover:text-primary flex items-center justify-center gap-2 transition-colors">
              {t("viewProfile")} <span className="text-lg leading-none">&rarr;</span>
            </span>
          </div>
        </span>
      </DialogTrigger>
      
      <DialogContent className="sm:max-w-4xl p-0 overflow-hidden border-border/50 bg-background/95 backdrop-blur-2xl shadow-2xl">
         {/* Accessibility Requirements */}
         <DialogTitle className="sr-only">{member.name}</DialogTitle>
         <DialogDescription className="sr-only">{member.bio}</DialogDescription>
         
        <div className="grid sm:grid-cols-[1fr_1.5fr] sm:min-h-[450px]">
          {/* Esquerda: a fotografia, a preencher a coluna.
              Era um círculo de 288px com uma borda de 12px a flutuar dentro de
              40px de padding, mais um blob desfocado atrás — o cartão mostrava
              um retrato retangular e ao clicar aparecia um avatar redondo, ou
              seja o modal contradizia aquilo em que se tinha clicado. Agora é
              a mesma fotografia, à sangria. */}
          <div className="relative aspect-[4/5] overflow-hidden border-b border-border/50 sm:aspect-auto sm:border-b-0 sm:border-r">
            {member.image ? (
              <Image
                src={member.image}
                alt={member.name}
                fill
                sizes="(min-width: 640px) 40vw, 100vw"
                className="object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center bg-secondary/30">
                <span className="text-6xl sm:text-7xl font-sans text-muted-foreground/30">{member.initials}</span>
              </div>
            )}
          </div>

          {/* Direita: Texto e Redes */}
          <div className="p-10 sm:p-14 flex flex-col justify-center relative">
            <h2 className="text-4xl sm:text-5xl font-extrabold tracking-[-0.02em] mb-3">{member.name}</h2>
            <p className="text-primary font-bold tracking-widest uppercase text-sm mb-8">{member.role}</p>
            
            <p className="text-muted-foreground text-lg sm:text-xl leading-relaxed mb-10">
              {member.bio}
            </p>
            
            {/* Secção dinâmica de sociais (só rende se existirem) */}
            <div className="flex flex-wrap gap-4 mt-auto">
              {hasLinkedin && (
                <a href={member.socials!.linkedin} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-4 py-2.5 bg-secondary hover:bg-primary hover:text-primary-foreground transition-colors rounded-xl text-muted-foreground font-medium text-sm">
                  <Link className="w-4 h-4" />
                  <span>LinkedIn</span>
                </a>
              )}
              {hasInstagram && (
                <a href={member.socials!.instagram} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-4 py-2.5 bg-secondary hover:bg-primary hover:text-primary-foreground transition-colors rounded-xl text-muted-foreground font-medium text-sm">
                  <Camera className="w-4 h-4" />
                  <span>Instagram</span>
                </a>
              )}
              {hasEmail && (
                <a href={`mailto:${member.socials!.email}`} className="flex items-center gap-2 px-4 py-2.5 bg-secondary hover:bg-primary hover:text-primary-foreground transition-colors rounded-xl text-muted-foreground font-medium text-sm">
                  <Mail className="w-4 h-4" />
                  <span>Email</span>
                </a>
              )}
              
              {!hasAnySocial && (
                <div className="px-4 py-2.5 bg-secondary/50 rounded-xl text-muted-foreground/60 font-medium text-sm border border-border/50 border-dashed">
                  {t("socialsSoon")}
                </div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

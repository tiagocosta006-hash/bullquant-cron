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
  // Verifica que redes sociais têm dados, assumimos que "#" significa vazio de momento
  const hasLinkedin = member.socials?.linkedin && member.socials.linkedin !== "#";
  const hasInstagram = member.socials?.instagram && member.socials.instagram !== "#";
  const hasEmail = member.socials?.email && member.socials.email !== "#";
  const hasAnySocial = hasLinkedin || hasInstagram || hasEmail;

  return (
    <Dialog>
      <DialogTrigger className="w-full text-left">
        <span className="block glass group flex flex-col gap-6 p-8 rounded-3xl transition-all duration-300 hover:-translate-y-2 cursor-pointer hover:shadow-2xl hover:border-primary/30 relative overflow-hidden">
          {/* Efeito de brilho hover no cartão pequeno */}
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
          
          {/* Placeholder/Photo for Photo (Small) */}
          <div className="w-24 h-24 rounded-full bg-secondary flex items-center justify-center border-4 border-background shadow-sm mx-auto relative z-10 overflow-hidden">
            {member.image ? (
              <Image src={member.image} alt={member.name} fill sizes="96px" className="object-cover" />
            ) : (
              <span className="text-2xl font-sans text-muted-foreground">{member.initials}</span>
            )}
          </div>
          
          <div className="text-center flex flex-col gap-1 relative z-10">
            <h3 className="font-extrabold tracking-[-0.02em] text-2xl group-hover:text-primary transition-colors">{member.name}</h3>
            <span className="text-sm text-primary font-medium tracking-wider uppercase">{member.role}</span>
          </div>
          
          <p className="text-muted-foreground text-center text-sm leading-relaxed line-clamp-3 relative z-10">
            {member.bio}
          </p>
          
          <div className="mt-4 text-center relative z-10">
            <span className="text-xs font-semibold text-primary/70 uppercase tracking-widest group-hover:text-primary flex items-center justify-center gap-2 transition-colors">
              Ver perfil <span className="text-lg leading-none">&rarr;</span>
            </span>
          </div>
        </span>
      </DialogTrigger>
      
      <DialogContent className="sm:max-w-4xl p-0 overflow-hidden border-border/50 bg-background/95 backdrop-blur-2xl shadow-2xl">
         {/* Accessibility Requirements */}
         <DialogTitle className="sr-only">{member.name}</DialogTitle>
         <DialogDescription className="sr-only">{member.bio}</DialogDescription>
         
        <div className="grid sm:grid-cols-[1fr_1.5fr] sm:min-h-[450px]">
          {/* Esquerda: Foto */}
          <div className="bg-secondary/30 p-10 flex flex-col items-center justify-center border-b sm:border-b-0 sm:border-r border-border/50 relative overflow-hidden">
             <div className="absolute top-0 right-0 -mr-20 -mt-20 w-64 h-64 bg-primary/10 blur-[80px] rounded-full pointer-events-none"></div>
             
             <div className="w-48 h-48 sm:w-64 sm:h-64 rounded-full bg-background flex items-center justify-center border-[12px] border-secondary shadow-2xl relative z-10 overflow-hidden">
               {member.image ? (
                 <Image src={member.image} alt={member.name} fill sizes="(min-width: 640px) 256px, 192px" className="object-cover" />
               ) : (
                 <span className="text-6xl sm:text-7xl font-sans text-muted-foreground/30">{member.initials}</span>
               )}
             </div>
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
                  Redes sociais a atualizar em breve
                </div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

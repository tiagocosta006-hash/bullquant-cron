/* eslint-disable @next/next/no-img-element -- WebP/JPG já pré-dimensionados pelo script (images.unoptimized) */
import { cn } from "@/lib/utils";

/** Caminho da versão escura de um print: fund-wide.v2.webp → fund-wide-dark.v2.webp */
export const darkSrc = (src: string) => src.replace(/(\.v\d+)?\.(webp|jpe?g|png)$/, "-dark$&");

/**
 * Print da plataforma no tema da página: a versão clara com o site claro e a
 * escura com o site escuro (classe .dark no <html>), para o ecrã não ficar um
 * rectângulo branco no fundo preto. Com loading="lazy", o browser só
 * descarrega a que está visível (a outra fica display:none).
 */
export function ThemedImg({ src, alt, className }: { src: string; alt: string; className?: string }) {
  return (
    <>
      <img src={src} alt={alt} loading="lazy" decoding="async" className={cn(className, "dark:hidden")} />
      <img src={darkSrc(src)} alt={alt} loading="lazy" decoding="async" className={cn(className, "hidden dark:block")} />
    </>
  );
}

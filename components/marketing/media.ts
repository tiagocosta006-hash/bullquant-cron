/**
 * Registo central dos slots de media da landing. Enquanto um slot for
 * `null`, a secção mostra o placeholder (mock em JSX) ou nem renderiza
 * (featureTour). Quando a equipa colocar os ficheiros em `public/media/`
 * (specs em public/media/README.md), basta preencher aqui o slot.
 */
export interface MediaSource {
  video?: string;
  image?: string;
  poster?: string;
}

export const LANDING_MEDIA: Record<"showcaseTerminal" | "featureTour", MediaSource | null> = {
  /** Vídeo principal do showcase (16:10) — ex.:
   *  { video: "/media/showcase-terminal.mp4", poster: "/media/showcase-terminal.jpg" } */
  showcaseTerminal: null,
  /** Tour largo (16:9) entre as stories e o bento — a secção só aparece
   *  quando este slot deixar de ser null. */
  featureTour: null,
};

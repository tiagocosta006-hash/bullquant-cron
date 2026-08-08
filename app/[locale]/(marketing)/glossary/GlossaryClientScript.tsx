'use client';

import { useEffect } from 'react';

export function GlossaryClientScript() {
  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash;
      if (hash) {
        const id = hash.substring(1);
        const el = document.getElementById(id) as HTMLDetailsElement;
        if (el && el.tagName === 'DETAILS') {
          // Abre o detalhe se estiver fechado
          el.open = true;
          // Pequeno delay para garantir que a renderização da abertura do details 
          // ocorreu antes de fazer scroll até lá.
          setTimeout(() => {
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }, 50);
        }
      }
    };

    // Corre no primeiro load (ex: se o user vier direto de um link partilhado)
    handleHash();

    // Corre sempre que clicar num link interno (que altera o #)
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  return null;
}

import { defineRouting } from 'next-intl/routing';
import { createNavigation } from 'next-intl/navigation';
 
export const routing = defineRouting({
  // PT + EN apenas. Os outros 7 locales foram cortados a 2026-08-05: estavam a
  // servir 33 chaves i18n em cru (secção de preços + FAQ inteiras) em produção,
  // porque `messages/*.json` nunca acompanhou o `marketing` namespace. Uma equipa
  // de 3 pessoas não mantém 9 idiomas — dois corretos valem mais do que nove
  // partidos. Reintroduzir um locale = adicionar aqui + traduzir o ficheiro
  // COMPLETO em messages/ (o teste em __tests__/i18n-parity.test.ts falha se faltar chave).
  locales: ['en', 'pt'],
  defaultLocale: 'en',
  localePrefix: 'as-needed'
});
 
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);

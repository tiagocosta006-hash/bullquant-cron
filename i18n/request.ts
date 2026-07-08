import { getRequestConfig } from 'next-intl/server'
import { cookies, headers } from 'next/headers'

const SUPPORTED_LOCALES = ['en', 'pt', 'es', 'fr', 'de', 'it', 'zh', 'ja', 'nl']
const DEFAULT_LOCALE = 'en'

export default getRequestConfig(async () => {
  const cookieStore = await cookies()
  let locale = cookieStore.get('NEXT_LOCALE')?.value

  // Se não houver cookie explícita, tentamos auto-detetar pelo IP ou idioma do browser
  if (!locale) {
    const headersList = await headers()
    
    // 1. Tentar pelo cabeçalho de país da Vercel (Geolocalização por IP)
    const country = headersList.get('x-vercel-ip-country')
    if (country) {
      const c = country.toUpperCase()
      if (['PT', 'BR', 'AO', 'MZ', 'CV', 'GW', 'ST'].includes(c)) locale = 'pt'
      else if (['ES', 'MX', 'AR', 'CO', 'CL', 'PE', 'VE', 'EC', 'GT', 'CU', 'BO', 'DO', 'HN', 'PY', 'SV', 'NI', 'CR', 'PA', 'UY'].includes(c)) locale = 'es'
      else if (['FR', 'BE', 'CH', 'CA', 'SN', 'CI', 'CM', 'ML', 'NE', 'BF', 'MG', 'GN', 'RW', 'BI', 'BJ', 'HT', 'TG'].includes(c)) locale = 'fr'
      else if (['DE', 'AT', 'LI', 'LU'].includes(c)) locale = 'de'
      else if (['IT', 'SM', 'VA'].includes(c)) locale = 'it'
      else if (['CN', 'TW', 'HK', 'MO', 'SG'].includes(c)) locale = 'zh'
      else if (['JP'].includes(c)) locale = 'ja'
      else if (['NL', 'SR', 'AW', 'CW', 'SX'].includes(c)) locale = 'nl'
    }
    
    // 2. Fallback para o idioma configurado no browser (Accept-Language)
    if (!locale) {
      const acceptLanguage = headersList.get('accept-language')
      if (acceptLanguage) {
        const preferredLocales = acceptLanguage
          .split(',')
          .map(lang => lang.split(';')[0].trim().split('-')[0].toLowerCase())
        
        locale = preferredLocales.find(lang => SUPPORTED_LOCALES.includes(lang))
      }
    }
  }
  
  // Validação final e fallback absoluto
  if (!locale || !SUPPORTED_LOCALES.includes(locale)) {
    locale = DEFAULT_LOCALE
  }
  
  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  }
})

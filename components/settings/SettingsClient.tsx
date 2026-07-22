"use client"

import { useEffect, useState } from 'react'

import { useTranslations } from 'next-intl'
import { UserCircle, Mail, Star, LogOut, Settings as SettingsIcon, Globe, Palette, Loader2, Check, X, FlaskConical } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { PasswordInput } from '@/components/ui/password-input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog"
import { updateProfile, setLocale, updatePasswordSettings, updateEmailSettings, deleteAccount } from '@/app/[locale]/(app)/settings/actions'
import { logout } from '@/app/[locale]/(auth)/actions'
import { PageHeader } from '@/components/layout/PageHeader'
import { usePaddle } from '@/components/providers/PaddleProvider'
import { applyTheme, currentTheme, type Theme } from '@/lib/theme'
import { userInitials } from '@/lib/utils'
import { useRouter } from '@/i18n/routing';

interface SettingsClientProps {
  user: {
    id: string
    email: string
    name: string | null
    plan: string
    hasSubscription?: boolean
  }
  locale: string
  aiUsedToday: number
  aiDailyLimit: number
  betaEnabled: boolean
}

export function SettingsClient({ user, locale, aiUsedToday, aiDailyLimit, betaEnabled }: SettingsClientProps) {
  const t = useTranslations('settings')
  const router = useRouter()

  const [name, setName] = useState(user.name || '')
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isSavingPassword, setIsSavingPassword] = useState(false)
  const [passwordMessage, setPasswordMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)

  const [currentPasswordForEmail, setCurrentPasswordForEmail] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [isSavingEmail, setIsSavingEmail] = useState(false)
  const [emailMessage, setEmailMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  // Tema (classe .dark no <html>, lida no mount para evitar mismatch)
  const [theme, setTheme] = useState<Theme | null>(null)
  useEffect(() => {
    const init = () => setTheme(currentTheme())
    init()
  }, [])

  const [isGeneratingPortal, setIsGeneratingPortal] = useState(false)
  const [portalError, setPortalError] = useState<string | null>(null)

  // Preço localizado (Paddle)
  const { paddle } = usePaddle()
  const [proPrice, setProPrice] = useState('€7')

  useEffect(() => {
    const priceId = process.env.NEXT_PUBLIC_PADDLE_PRICE_ID_PRO
    if (!paddle || !priceId) return

    paddle.PricePreview({
      items: [{ priceId, quantity: 1 }]
    })
      .then((preview) => {
        if (preview.data.details.lineItems.length > 0) {
          // Removes decimals if it's .00 for a cleaner look, or just use the exact formatted total
          setProPrice(preview.data.details.lineItems[0].formattedTotals.total)
        }
      })
      .catch(console.error)
  }, [paddle])

  // Track the initial name normalised to empty string so comparison is consistent
  const initialName = user.name || ''

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSaving(true)
    setMessage(null)
    
    const formData = new FormData()
    formData.append('name', name)
    
    const result = await updateProfile(formData)
    if (result?.error) {
      setMessage({ text: result.error, type: 'error' })
    } else {
      setMessage({ text: t('saveSuccess'), type: 'success' })
    }
    
    setIsSaving(false)
  }

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSavingPassword(true)
    setPasswordMessage(null)
    
    const formData = new FormData()
    formData.append('currentPassword', currentPassword)
    formData.append('newPassword', newPassword)
    formData.append('confirmPassword', confirmPassword)
    
    const result = await updatePasswordSettings(formData)
    if (result?.error) {
      setPasswordMessage({ text: result.error, type: 'error' })
    } else {
      setPasswordMessage({ text: t('profile.passwordSuccess'), type: 'success' })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    }
    
    setIsSavingPassword(false)
  }

  const handleDeleteAccount = async () => {
    setIsDeleting(true)
    await deleteAccount()
    // It will redirect automatically from action
  }

  const handleManageSubscription = async () => {
    setIsGeneratingPortal(true)
    setPortalError(null)

    try {
      const response = await fetch('/api/paddle/portal', {
        method: 'POST',
      })
      
      const data = await response.json()
      
      if (response.ok && data.url) {
        window.open(data.url, '_blank', 'noopener,noreferrer')
        setIsGeneratingPortal(false)
      } else {
        setPortalError(data.error || 'Ocorreu um erro ao gerar o link do portal.')
        setIsGeneratingPortal(false)
      }
    } catch (error) {
      setPortalError('Falha na comunicação com o servidor.')
      setIsGeneratingPortal(false)
    }
  }

  const handleUpdateEmail = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSavingEmail(true)
    setEmailMessage(null)
    
    const formData = new FormData()
    formData.append('currentPassword', currentPasswordForEmail)
    formData.append('newEmail', newEmail)
    
    const result = await updateEmailSettings(formData)
    if (result?.error) {
      setEmailMessage({ text: result.error, type: 'error' })
    } else {
      setEmailMessage({ text: t('profile.emailChangeSuccess'), type: 'success' })
      setCurrentPasswordForEmail('')
      setNewEmail('')
    }
    
    setIsSavingEmail(false)
  }

  const handleLanguageChange = async (newLocale: string | null) => {
    if (newLocale) {
      await setLocale(newLocale)
      // Force a full navigation so Server Components re-render with the new locale cookie
      router.refresh()
    }
  }

  const handleThemeChange = (value: string | null) => {
    if (value === 'light' || value === 'dark') {
      applyTheme(value)
      setTheme(value)
    }
  }

  const isPro = user.plan === 'PRO'

  return (
    <div className="mx-auto flex h-full max-w-4xl flex-col space-y-8">
      <PageHeader
        icon={<SettingsIcon className="h-6 w-6" />}
        title={t('title')}
        subtitle={t('subtitle')}
      />

      {/* Cartão de identidade do perfil */}
      <div className="glass flex items-center gap-4 rounded-2xl p-5">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary/10 border border-primary/15 text-lg font-extrabold text-primary">
          {userInitials(user.name, user.email)}
        </div>
        <div className="min-w-0">
          <p className="truncate text-lg font-bold text-foreground">{user.name || user.email.split('@')[0]}</p>
          <p className="truncate text-sm text-muted-foreground">{user.email}</p>
        </div>
        <div className="ml-auto flex items-center rounded-full border border-bull/20 bg-bull/10 px-3 py-1 text-sm font-bold text-bull">
          <Star className="mr-1.5 h-3 w-3 fill-current" />
          {isPro ? 'PRO' : t('planFree')}
        </div>
      </div>

      <Tabs defaultValue="profile" className="flex-1">
        <TabsList className="glass mb-8 w-full justify-start h-auto flex-wrap rounded-full p-1.5">
          <TabsTrigger value="profile" className="flex items-center gap-2 rounded-full px-6 py-2.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <UserCircle className="h-4 w-4" />
            {t('tabs.profile')}
          </TabsTrigger>
          <TabsTrigger value="preferences" className="flex items-center gap-2 rounded-full px-6 py-2.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Globe className="h-4 w-4" />
            {t('tabs.preferences')}
          </TabsTrigger>
          <TabsTrigger value="subscription" className="flex items-center gap-2 rounded-full px-6 py-2.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Star className="h-4 w-4" />
            {t('tabs.subscription')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="space-y-6">
          <div className="glass rounded-xl text-card-foreground">
            <div className="p-6">
              <h2 className="text-xl font-bold mb-6">{t('profile.title')}</h2>
              
              <form onSubmit={handleUpdateProfile} className="space-y-6 max-w-xl">
                <div className="space-y-2">
                  <Label htmlFor="email">{t('profile.email')}</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input id="email" value={user.email} disabled className="pl-9 bg-muted/50" />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="name">{t('profile.name')}</Label>
                  <Input 
                    id="name" 
                    value={name} 
                    onChange={(e) => setName(e.target.value)} 
                    placeholder={t('profile.namePlaceholder')} 
                  />
                </div>

                {message && (
                  <p className={`text-sm font-medium ${message.type === 'error' ? 'text-destructive' : 'text-bull'}`}>
                    {message.text}
                  </p>
                )}

                <Button type="submit" disabled={isSaving || name.trim() === initialName.trim() || name.trim() === ''}>
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  {t('profile.save')}
                </Button>
              </form>
            </div>
            
            <div className="border-t p-6 bg-muted/10">
              <h3 className="text-lg font-semibold mb-6">{t('profile.changeEmailTitle')}</h3>
              <form onSubmit={handleUpdateEmail} className="space-y-6 max-w-xl mb-12">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="newEmail">{t('profile.newEmail')}</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input 
                        id="newEmail" 
                        type="email"
                        value={newEmail} 
                        onChange={(e) => setNewEmail(e.target.value)} 
                        className="pl-9"
                        required 
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="currentPasswordForEmail">{t('profile.currentPassword')}</Label>
                    <PasswordInput 
                      id="currentPasswordForEmail" 
                      value={currentPasswordForEmail} 
                      onChange={(e) => setCurrentPasswordForEmail(e.target.value)} 
                      required 
                    />
                  </div>
                </div>

                {emailMessage && (
                  <p className={`text-sm font-medium ${emailMessage.type === 'error' ? 'text-destructive' : 'text-bull'}`}>
                    {emailMessage.text}
                  </p>
                )}

                <Button type="submit" disabled={isSavingEmail || !currentPasswordForEmail || !newEmail || newEmail === user.email}>
                  {isSavingEmail ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  {t('profile.confirmEmailChangeBtn')}
                </Button>
              </form>

              <h3 className="text-lg font-semibold mb-6 border-t pt-8">{t('profile.securityTitle')}</h3>
              <form onSubmit={handleUpdatePassword} className="space-y-6 max-w-xl">
                <div className="space-y-2">
                  <Label htmlFor="currentPassword">{t('profile.currentPassword')}</Label>
                  <PasswordInput 
                    id="currentPassword" 
                    value={currentPassword} 
                    onChange={(e) => setCurrentPassword(e.target.value)} 
                    required 
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="newPassword">{t('profile.newPassword')}</Label>
                    <PasswordInput 
                      id="newPassword" 
                      value={newPassword} 
                      onChange={(e) => setNewPassword(e.target.value)} 
                      required 
                      minLength={6}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">{t('profile.confirmNewPassword')}</Label>
                    <PasswordInput 
                      id="confirmPassword" 
                      value={confirmPassword} 
                      onChange={(e) => setConfirmPassword(e.target.value)} 
                      required 
                      minLength={6}
                    />
                  </div>
                </div>

                {passwordMessage && (
                  <p className={`text-sm font-medium ${passwordMessage.type === 'error' ? 'text-destructive' : 'text-bull'}`}>
                    {passwordMessage.text}
                  </p>
                )}

                <Button type="submit" disabled={isSavingPassword || !currentPassword || !newPassword || !confirmPassword}>
                  {isSavingPassword ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  {t('profile.changePasswordBtn')}
                </Button>
              </form>
            </div>
            
            <div className="border-t p-6 bg-muted/30">
              <h3 className="text-lg font-semibold text-destructive mb-2">{t('profile.dangerZone')}</h3>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex-1 max-w-xl">
                  <p className="text-sm text-muted-foreground">{t('profile.logoutDesc')}</p>
                </div>
                <div className="flex items-center gap-2">
                  <form action={logout}>
                    <Button variant="outline" type="submit" className="gap-2">
                      <LogOut className="h-4 w-4" />
                      {t('profile.logoutBtn')}
                    </Button>
                  </form>
                  <Dialog>
                    <DialogTrigger render={<Button variant="destructive" />}>
                      {t('profile.deleteAccountBtn')}
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>{t('profile.deleteAccountTitle')}</DialogTitle>
                        <DialogDescription>
                          {t('profile.deleteAccountDesc')}
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="space-y-2">
                          <Label>{t('profile.deleteAccountConfirmLabel')}</Label>
                          <Input 
                            value={deleteConfirmText}
                            onChange={(e) => setDeleteConfirmText(e.target.value)}
                            placeholder="APAGAR / DELETE"
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <DialogClose render={<Button variant="outline" />}>
                          {t('profile.deleteAccountCancel')}
                        </DialogClose>
                        <Button 
                          variant="destructive" 
                          onClick={handleDeleteAccount}
                          disabled={(deleteConfirmText !== 'APAGAR' && deleteConfirmText !== 'DELETE') || isDeleting}
                        >
                          {isDeleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                          {t('profile.deleteAccountSubmit')}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="preferences" className="space-y-6">
          <div className="glass rounded-xl text-card-foreground p-6">
            <h2 className="text-xl font-bold mb-6">{t('preferences.title')}</h2>
            
            <div className="grid gap-8 max-w-xl">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-base flex items-center gap-2">
                      <Globe className="h-4 w-4 text-primary" />
                      {t('preferences.language')}
                    </Label>
                    <p className="text-sm text-muted-foreground">{t('preferences.languageDesc')}</p>
                  </div>
                </div>
                <Select value={locale} onValueChange={handleLanguageChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English (EN)</SelectItem>
                    <SelectItem value="pt">Português (PT)</SelectItem>
                    <SelectItem value="es">Español (ES)</SelectItem>
                    <SelectItem value="fr">Français (FR)</SelectItem>
                    <SelectItem value="de">Deutsch (DE)</SelectItem>
                    <SelectItem value="it">Italiano (IT)</SelectItem>
                    <SelectItem value="nl">Nederlands (NL)</SelectItem>
                    <SelectItem value="zh">中文 (ZH)</SelectItem>
                    <SelectItem value="ja">日本語 (JA)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-base flex items-center gap-2">
                      <Palette className="h-4 w-4 text-primary" />
                      {t('preferences.theme')}
                    </Label>
                    <p className="text-sm text-muted-foreground">{t('preferences.themeDesc')}</p>
                  </div>
                </div>
                <Select value={theme ?? undefined} onValueChange={handleThemeChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="light">{t('preferences.themeLight')}</SelectItem>
                    <SelectItem value="dark">{t('preferences.themeDark')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="subscription" className="space-y-6">
          <div className="glass rounded-xl text-card-foreground p-6 space-y-8">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">{t('subscription.title')}</h2>
              <div className={`px-3 py-1 rounded-full font-bold flex items-center text-sm ${user.plan === 'PRO' ? 'bg-primary/10 text-primary border border-primary/20' : 'bg-bull/10 text-bull border border-bull/20'}`}>
                <Star className="h-3 w-3 mr-1.5 fill-current" />
                {isPro ? 'PRO' : t('planFree')}
              </div>
            </div>

            {/* Créditos de IA de hoje — Free e Pro têm limites reais (diferentes) */}
            <div className="max-w-xl">
              <div className="flex items-baseline justify-between mb-2">
                <p className="text-sm font-medium text-foreground">{t('subscription.aiUsageLabel')}</p>
                <p className="nums text-sm font-bold text-primary">
                  {aiUsedToday}/{aiDailyLimit}
                </p>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${Math.min(100, (aiUsedToday / aiDailyLimit) * 100)}%` }}
                />
              </div>
            </div>

            {user.plan === 'PRO' ? (
              /* ── Estado PRO activo ── */
              <div className="space-y-4">
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-5">
                  <p className="font-semibold text-primary mb-1">Plano PRO Activo</p>
                  <p className="text-sm text-muted-foreground">
                    Tens acesso completo a todas as funcionalidades PRO. Para gerir a tua subscrição (cancelar, actualizar dados de pagamento), utiliza o portal de faturação abaixo.
                  </p>
                </div>
                <Button
                  onClick={handleManageSubscription}
                  disabled={isGeneratingPortal || !user.hasSubscription}
                  className="gap-2"
                >
                  {isGeneratingPortal ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Gerir subscrição (Alterar/Cancelar) →
                </Button>
                {portalError && <p className="text-sm text-destructive font-medium">{portalError}</p>}
                {!user.hasSubscription && !portalError && (
                  <p className="text-xs text-muted-foreground">ID de subscrição não encontrado na base de dados.</p>
                )}
              </div>
            ) : (
              /* ── Estado FREE — mostrar comparação de planos ── */
              <div className="space-y-6">
                <p className="text-sm text-muted-foreground">{t('subscription.desc')}</p>

                <div className="grid gap-4 sm:grid-cols-2">
                  {/* Gratuito */}
                  <div className="rounded-xl border border-border bg-muted/20 p-5 flex flex-col">
                    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Gratuito</p>
                    <div className="flex items-end gap-1 mb-1">
                      <span className="text-3xl font-extrabold">€0</span>
                      <span className="mb-0.5 text-sm text-muted-foreground">/ para sempre</span>
                    </div>
                    <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                      {["S&P 500 completo", "10 anos de fundamentais", "DCF com autopreenche", "5 AI Briefs/dia", "Watchlist até 10 empresas"].map(f => (
                        <li key={f} className="flex items-center gap-2">
                          <Check className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          {f}
                        </li>
                      ))}
                    </ul>
                    <div className="mt-auto pt-5">
                      <div className="w-full rounded-lg border border-border bg-muted/30 py-2 text-center text-sm font-medium text-muted-foreground">
                        Plano atual
                      </div>
                    </div>
                  </div>

                  {/* PRO */}
                  <div className="relative rounded-xl border border-primary/40 bg-gradient-to-br from-primary/8 to-card/60 p-5 flex flex-col shadow-[0_0_30px_-8px_hsl(var(--primary)/0.2)]">
                    <div className="absolute -top-3 left-4">
                      <div className="flex items-center gap-1 rounded-full bg-primary px-3 py-0.5 text-[10px] font-bold text-primary-foreground">
                        <Star className="h-2.5 w-2.5 fill-current" />
                        Mais popular
                      </div>
                    </div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-3">PRO</p>
                    <div className="flex items-end gap-1 mb-1">
                      <span className="text-3xl font-extrabold">{proPrice}</span>
                      <span className="mb-0.5 text-sm text-muted-foreground">/ mês</span>
                    </div>
                    <ul className="mt-4 space-y-2 text-sm">
                      {["Watchlist ilimitada", "AI Brief ilimitado", "DCF analyses ilimitadas", "Screener avançado", "Exportar CSV", "Comunidade privada", "Suporte 24/7"].map(f => (
                        <li key={f} className="flex items-center gap-2">
                          <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
                          {f}
                        </li>
                      ))}
                    </ul>
                    <div className="mt-auto pt-5">
                      <a
                        href="/pricing"
                        className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-[0_4px_20px_-4px_hsl(var(--primary)/0.5)] transition-opacity hover:opacity-90"
                      >
                        {t('subscription.upgradeBtn')}
                      </a>
                    </div>
                  </div>
                </div>

                <p className="text-center text-xs text-muted-foreground/60">
                  Pagamentos seguros via Paddle · Cancela a qualquer momento
                </p>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}

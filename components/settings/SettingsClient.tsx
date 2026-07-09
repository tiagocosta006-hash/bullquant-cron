"use client"

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { UserCircle, Mail, Star, LogOut, Settings as SettingsIcon, Globe, Palette, Loader2 } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { updateProfile, setLocale } from '@/app/(app)/settings/actions'
import { logout } from '@/app/(auth)/actions'
import { PageHeader } from '@/components/layout/PageHeader'

interface SettingsClientProps {
  user: {
    id: string
    email: string
    name: string | null
    plan: string
  }
  locale: string
}

export function SettingsClient({ user, locale }: SettingsClientProps) {
  const t = useTranslations('settings')
  const router = useRouter()
  
  const [name, setName] = useState(user.name || '')
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
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

  const handleLanguageChange = async (newLocale: string | null) => {
    if (newLocale) {
      await setLocale(newLocale)
      // Force a full navigation so Server Components re-render with the new locale cookie
      router.refresh()
    }
  }

  return (
    <div className="mx-auto flex h-full max-w-4xl flex-col space-y-8">
      <PageHeader
        icon={<SettingsIcon className="h-6 w-6" />}
        title={t('title')}
        subtitle={t('subtitle')}
      />

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
            
            <div className="border-t p-6 bg-muted/30">
              <h3 className="text-lg font-semibold text-destructive mb-2">{t('profile.dangerZone')}</h3>
              <p className="text-sm text-muted-foreground mb-4">{t('profile.logoutDesc')}</p>
              <form action={logout}>
                <Button variant="destructive" type="submit" className="gap-2">
                  <LogOut className="h-4 w-4" />
                  {t('profile.logoutBtn')}
                </Button>
              </form>
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
                    <Label className="text-base flex items-center gap-2 opacity-50">
                      <Palette className="h-4 w-4 text-primary" />
                      {t('preferences.theme')}
                    </Label>
                    <p className="text-sm text-muted-foreground opacity-50">{t('preferences.themeDesc')}</p>
                  </div>
                </div>
                <Select disabled defaultValue="dark">
                  <SelectTrigger className="opacity-50">
                    <SelectValue placeholder="Dark Mode" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dark">Dark Mode</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="subscription" className="space-y-6">
          <div className="glass rounded-xl text-card-foreground p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold">{t('subscription.title')}</h2>
              <div className="bg-bull/10 text-bull border border-bull/20 px-3 py-1 rounded-full font-bold flex items-center text-sm">
                <Star className="h-3 w-3 mr-1.5 fill-current" />
                {user.plan === 'PRO' ? 'PRO' : t('planFree')}
              </div>
            </div>

            <p className="text-sm text-muted-foreground mb-6">
              {t('subscription.desc')}
            </p>
            
            <div className="bg-gradient-to-br from-primary/5 to-primary/10 rounded-lg p-6 border border-primary/20 text-center">
              <Star className="h-12 w-12 text-primary mx-auto mb-4" />
              <h3 className="text-lg font-bold text-foreground mb-2">
                {t('subscription.premiumSoonTitle')}
              </h3>
              <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
                {t('subscription.premiumSoonDesc')}
              </p>
              <Button disabled className="w-full sm:w-auto">
                {t('subscription.upgradeBtn')}
              </Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}

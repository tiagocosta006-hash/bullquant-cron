'use client'

import { useFormStatus } from 'react-dom'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'

interface SubmitButtonProps {
  label: string
  loadingLabel?: string
  className?: string
  disabled?: boolean
}

export function SubmitButton({ label, loadingLabel, className, disabled }: SubmitButtonProps) {
  const { pending } = useFormStatus()

  return (
    <Button
      type="submit"
      disabled={pending || disabled}
      className={className}
    >
      {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
      {pending ? (loadingLabel || label) : label}
    </Button>
  )
}

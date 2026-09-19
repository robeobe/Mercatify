import Image from 'next/image'
import Link from 'next/link'
import ResetPage from '@open-mercato/core/modules/auth/frontend/reset'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'

export default async function ResetRoutePage() {
  const { translate } = await resolveTranslations()
  const brandName = translate('auth.login.brandName', 'Mercatify')
  return (
    <div className="relative">
      <Link
        href="/start"
        className="absolute left-4 top-4 z-10 flex items-center gap-2 text-sm font-semibold text-foreground"
      >
        <Image alt={translate('auth.login.logoAlt', 'Mercatify logo')} src="/open-mercato.svg" width={28} height={28} />
        {brandName}
      </Link>
      <ResetPage />
    </div>
  )
}

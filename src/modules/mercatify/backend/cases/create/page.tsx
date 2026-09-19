"use client"

import { Page, PageBody, PageHeader } from '@open-mercato/ui/backend/Page'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { CaseCreateForm } from '../../../components/CaseForm'

export default function CreateInterviewCasePage() {
  const t = useT()
  return (
    <Page>
      <PageHeader
        title={t('mercatify.analysis.intake.title', 'Which tools do you pay for?')}
        description={t(
          'mercatify.analysis.intake.intro',
          'Tick the tools you have, then the modules you genuinely use — not the ones that came with the plan. Seats and monthly cost are optional, but without them we can only tell you what moves, not what it saves. It takes about four minutes.',
        )}
      />
      <PageBody>
        <CaseCreateForm />
      </PageBody>
    </Page>
  )
}

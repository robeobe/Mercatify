import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { CaseEditLoader } from '../../../components/CaseForm'

export default function InterviewCaseDetailPage({ params }: { params?: { id?: string } }) {
  const id = params?.id
  if (!id) return null

  return (
    <Page>
      <PageBody>
        <CaseEditLoader id={id} />
      </PageBody>
    </Page>
  )
}

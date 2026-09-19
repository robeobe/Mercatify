import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { CaseDetailView } from '../../../components/analysis/CaseDetailView'

export default function InterviewCaseDetailPage({ params }: { params?: { id?: string } }) {
  const id = params?.id
  if (!id) return null

  return (
    <Page>
      <PageBody>
        <CaseDetailView id={id} />
      </PageBody>
    </Page>
  )
}

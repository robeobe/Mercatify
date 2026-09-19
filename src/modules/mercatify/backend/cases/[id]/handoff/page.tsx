import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import HandoffDocumentEditor from '../../../../components/HandoffDocumentEditor'

export default function MercatifyHandoffDocumentPage({ params }: { params?: { id?: string } }) {
  const caseId = params?.id ?? ''
  return (
    <Page>
      <PageBody>
        <HandoffDocumentEditor caseId={caseId} />
      </PageBody>
    </Page>
  )
}

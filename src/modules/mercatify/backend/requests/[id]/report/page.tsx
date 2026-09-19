import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import ClientReport from '../../../../components/ClientReport'

export default function MercatifyClientReportPage({ params }: { params?: { id?: string } }) {
  const id = params?.id
  if (!id) return null

  return (
    <Page>
      <PageBody>
        <ClientReport caseId={id} />
      </PageBody>
    </Page>
  )
}

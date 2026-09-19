import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import ReportComposer from '../../../../components/ReportComposer'

export default function MercatifyReportPage({ params }: { params?: { id?: string } }) {
  const id = params?.id
  if (!id) return null

  return (
    <Page>
      <PageBody>
        <ReportComposer id={id} />
      </PageBody>
    </Page>
  )
}

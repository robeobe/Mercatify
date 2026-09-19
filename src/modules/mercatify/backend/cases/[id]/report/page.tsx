import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import ReportBuilder from '../../../../components/ReportBuilder'

export default function MercatifyReportPage({ params }: { params?: { id?: string } }) {
  const caseId = params?.id ?? ''
  return (
    <Page>
      <PageBody>
        <ReportBuilder caseId={caseId} />
      </PageBody>
    </Page>
  )
}

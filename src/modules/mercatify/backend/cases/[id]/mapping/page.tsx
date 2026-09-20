import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import MappingTable from '../../../../components/MappingTable'
import SavingsBreakdown from '../../../../components/SavingsBreakdown'

export default function MercatifyMappingPage({ params }: { params?: { id?: string } }) {
  const caseId = params?.id ?? ''
  return (
    <Page>
      <PageBody>
        <MappingTable caseId={caseId}>
          <SavingsBreakdown caseId={caseId} />
        </MappingTable>
      </PageBody>
    </Page>
  )
}

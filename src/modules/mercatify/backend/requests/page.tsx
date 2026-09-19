import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import RequestsTable from '../../components/RequestsTable'

export default function MercatifyRequestsPage() {
  return (
    <Page>
      <PageBody>
        <RequestsTable />
      </PageBody>
    </Page>
  )
}

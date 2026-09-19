import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import StackRequestsQueue from '../../components/queue/StackRequestsQueue'

export default function MercatifyCasesPage() {
  return (
    <Page>
      <PageBody>
        <StackRequestsQueue />
      </PageBody>
    </Page>
  )
}

import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import RequestCoverage from '../../../components/RequestCoverage'

export default function MercatifyRequestCoveragePage({ params }: { params?: { id?: string } }) {
  const id = params?.id
  if (!id) return null

  return (
    <Page>
      <PageBody>
        <RequestCoverage id={id} />
      </PageBody>
    </Page>
  )
}

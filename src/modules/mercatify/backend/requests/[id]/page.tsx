import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { RequestDetailLoader } from '../../../components/RequestDetail'

export default function MercatifyRequestDetailPage({ params }: { params?: { id?: string } }) {
  const id = params?.id
  if (!id) return null

  return (
    <Page>
      <PageBody>
        <RequestDetailLoader id={id} />
      </PageBody>
    </Page>
  )
}

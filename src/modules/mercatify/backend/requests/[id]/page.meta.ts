export const metadata = {
  requireAuth: true,
  requireFeatures: ['mercatify.cases.view'],
  pageTitle: 'Your request',
  pageTitleKey: 'mercatify.requests.detail.title',
  pageGroup: 'Mercatify',
  pageGroupKey: 'mercatify.nav.group',
  pageOrder: 91,
  icon: 'layers',
  navHidden: true,
  breadcrumb: [
    { label: 'My requests', labelKey: 'mercatify.requests.page.title', href: '/backend/requests' },
    { label: 'Your request', labelKey: 'mercatify.requests.detail.title' },
  ],
}

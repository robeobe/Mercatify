export const metadata = {
  requireAuth: true,
  requireFeatures: ['mercatify.requests.manage'],
  pageTitle: 'Report',
  pageTitleKey: 'mercatify.report.page.title',
  pageGroup: 'Mercatify',
  pageGroupKey: 'mercatify.nav.group',
  navHidden: true,
  breadcrumb: [
    { label: 'Stack requests', labelKey: 'mercatify.requests.page.title', href: '/backend/mercatify-requests' },
    { label: 'Report', labelKey: 'mercatify.report.page.title' },
  ],
}

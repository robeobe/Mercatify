export const metadata = {
  requireAuth: true,
  requireFeatures: ['mercatify.cases.view'],
  pageTitle: 'Your report',
  pageTitleKey: 'mercatify.clientReport.page.title',
  pageGroup: 'Mercatify',
  pageGroupKey: 'mercatify.nav.group',
  pageOrder: 92,
  icon: 'layers',
  navHidden: true,
  breadcrumb: [
    { label: 'My requests', labelKey: 'mercatify.requests.page.title', href: '/backend/requests' },
    { label: 'Your report', labelKey: 'mercatify.clientReport.page.title' },
  ],
}

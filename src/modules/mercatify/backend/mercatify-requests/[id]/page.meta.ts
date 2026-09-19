export const metadata = {
  requireAuth: true,
  requireFeatures: ['mercatify.requests.manage'],
  pageTitle: 'Module coverage',
  pageTitleKey: 'mercatify.coverage.page.title',
  pageGroup: 'Mercatify',
  pageGroupKey: 'mercatify.nav.group',
  navHidden: true,
  breadcrumb: [
    { label: 'Stack requests', labelKey: 'mercatify.requests.page.title', href: '/backend/mercatify-requests' },
    { label: 'Module coverage', labelKey: 'mercatify.coverage.page.title' },
  ],
}

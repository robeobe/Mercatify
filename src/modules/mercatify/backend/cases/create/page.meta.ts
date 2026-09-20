export const metadata = {
  requireAuth: true,
  requireFeatures: ['mercatify.cases.manage'],
  pageTitle: 'New intake',
  pageTitleKey: 'mercatify.cases.create.title',
  pageGroup: 'Mercatify',
  pageGroupKey: 'mercatify.nav.group',
  pageOrder: 101,
  icon: 'clipboard-list',
  navHidden: true,
  breadcrumb: [
    // The intake is the client's screen, so it leads back to their own
    // requests list rather than the staff queue.
    { label: 'My requests', labelKey: 'mercatify.analysis.nav.myRequests', href: '/backend/requests' },
    { label: 'New intake', labelKey: 'mercatify.cases.create.title' },
  ],
}

export const metadata = {
  requireAuth: true,
  requireFeatures: ['mercatify.report.view'],
  pageTitle: 'Client report',
  pageTitleKey: 'mercatify.report.page.title',
  pageGroup: 'Mercatify',
  pageGroupKey: 'mercatify.nav.group',
  navHidden: true,
  breadcrumb: [
    { label: 'Interview cases', labelKey: 'mercatify.cases.page.title', href: '/backend/cases' },
    { label: 'Client report', labelKey: 'mercatify.report.page.title' },
  ],
}

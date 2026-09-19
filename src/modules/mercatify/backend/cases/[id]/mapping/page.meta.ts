export const metadata = {
  requireAuth: true,
  requireFeatures: ['mercatify.mapping.view'],
  pageTitle: 'Capability mapping',
  pageTitleKey: 'mercatify.mapping.page.title',
  pageGroup: 'Mercatify',
  pageGroupKey: 'mercatify.nav.group',
  navHidden: true,
  breadcrumb: [
    { label: 'Interview cases', labelKey: 'mercatify.cases.page.title', href: '/backend/cases' },
    { label: 'Capability mapping', labelKey: 'mercatify.mapping.page.title' },
  ],
}

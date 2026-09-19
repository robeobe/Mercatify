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
    { label: 'Interview cases', labelKey: 'mercatify.cases.page.title', href: '/backend/cases' },
    { label: 'New intake', labelKey: 'mercatify.cases.create.title' },
  ],
}

export const metadata = {
  requireAuth: true,
  requireFeatures: ['mercatify.cases.manage'],
  pageTitle: 'Interview case',
  pageTitleKey: 'mercatify.cases.detail.title',
  pageGroup: 'Mercatify',
  pageGroupKey: 'mercatify.nav.group',
  pageOrder: 102,
  icon: 'clipboard-list',
  navHidden: true,
  breadcrumb: [
    { label: 'Interview cases', labelKey: 'mercatify.cases.page.title', href: '/backend/cases' },
    { label: 'Interview case', labelKey: 'mercatify.cases.detail.title' },
  ],
}

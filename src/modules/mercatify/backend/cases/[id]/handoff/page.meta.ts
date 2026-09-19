export const metadata = {
  requireAuth: true,
  requireFeatures: ['mercatify.handoff.view'],
  pageTitle: 'Handoff document',
  pageTitleKey: 'mercatify.handoff.page.title',
  pageGroup: 'Mercatify',
  pageGroupKey: 'mercatify.nav.group',
  navHidden: true,
  breadcrumb: [
    { label: 'Interview cases', labelKey: 'mercatify.cases.page.title', href: '/backend/cases' },
    { label: 'Handoff document', labelKey: 'mercatify.handoff.page.title' },
  ],
}

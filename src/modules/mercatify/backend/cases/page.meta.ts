export const metadata = {
  requireAuth: true,
  requireFeatures: ['mercatify.cases.view'],
  pageTitle: 'Interview cases',
  pageTitleKey: 'mercatify.cases.page.title',
  pageGroup: 'Mercatify',
  pageGroupKey: 'mercatify.nav.group',
  pageOrder: 100,
  // `clipboard-list` is present in the installed closed icon registry
  // (node_modules/@open-mercato/ui/dist/backend/icons/lucideRegistry.generated.js);
  // an unlisted name renders no icon at all, silently.
  icon: 'clipboard-list',
  breadcrumb: [
    { label: 'Interview cases', labelKey: 'mercatify.cases.page.title' },
  ],
}

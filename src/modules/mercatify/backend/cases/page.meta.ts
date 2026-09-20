export const metadata = {
  requireAuth: true,
  // The queue is the consultant's screen, not the client's: `mercatify.mapping.view`
  // is what separates the two personas, so the employee never sees it in the nav.
  requireFeatures: ['mercatify.mapping.view'],
  pageTitle: 'Stack requests',
  pageTitleKey: 'mercatify.queue.page.title',
  pageGroup: 'Mercatify',
  pageGroupKey: 'mercatify.nav.group',
  pageOrder: 100,
  // `clipboard-list` is present in the installed closed icon registry
  // (node_modules/@open-mercato/ui/dist/backend/icons/lucideRegistry.generated.js);
  // an unlisted name renders no icon at all, silently.
  icon: 'clipboard-list',
  breadcrumb: [
    { label: 'Stack requests', labelKey: 'mercatify.queue.page.title' },
  ],
}

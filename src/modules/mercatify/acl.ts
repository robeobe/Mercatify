export const features = [
  { id: 'mercatify.cases.view', title: 'View interview cases', module: 'mercatify' },
  {
    id: 'mercatify.cases.manage',
    title: 'Manage interview cases',
    module: 'mercatify',
    dependsOn: ['mercatify.cases.view'],
  },
  {
    id: 'mercatify.mapping.view',
    title: 'View capability mapping',
    module: 'mercatify',
    dependsOn: ['mercatify.cases.view'],
  },
  {
    id: 'mercatify.mapping.manage',
    title: 'Manage capability mapping',
    module: 'mercatify',
    dependsOn: ['mercatify.mapping.view'],
  },
  {
    id: 'mercatify.handoff.view',
    title: 'View handoff document',
    module: 'mercatify',
    dependsOn: ['mercatify.mapping.view'],
  },
  {
    id: 'mercatify.handoff.manage',
    title: 'Manage handoff document',
    module: 'mercatify',
    dependsOn: ['mercatify.handoff.view'],
  },
  // Admin-only, via `mercatify.mapping.view`: the client role holds only
  // `mercatify.cases.view`, so an unsent report can never be read by the
  // company it is about.
  {
    id: 'mercatify.report.view',
    title: 'View client report',
    module: 'mercatify',
    dependsOn: ['mercatify.mapping.view'],
  },
  {
    id: 'mercatify.report.manage',
    title: 'Build and send client report',
    module: 'mercatify',
    dependsOn: ['mercatify.report.view'],
  },
]

export default features

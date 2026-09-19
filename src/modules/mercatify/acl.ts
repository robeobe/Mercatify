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
]

export default features

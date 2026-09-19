export const features = [
  { id: 'mercatify.cases.view', title: 'View interview cases', module: 'mercatify' },
  {
    id: 'mercatify.cases.manage',
    title: 'Manage interview cases',
    module: 'mercatify',
    dependsOn: ['mercatify.cases.view'],
  },
]

export default features

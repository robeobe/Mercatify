export const features = [
  { id: 'mercatify.backend', title: 'Access Mercatify backend', module: 'mercatify' },
  { id: 'mercatify.requests.view', title: 'View own stack request', module: 'mercatify' },
  {
    id: 'mercatify.requests.submit',
    title: 'Submit a SaaS stack request',
    module: 'mercatify',
    dependsOn: ['mercatify.requests.view'],
  },
  {
    id: 'mercatify.requests.manage',
    title: 'View and map every stack request in the tenant',
    module: 'mercatify',
    dependsOn: ['mercatify.requests.view'],
  },
]

export default features

import type { Metadata } from 'next'
import MercatifyLandingContent from '@/modules/mercatify/frontend/LandingContent'

export const metadata: Metadata = {
  title: 'Mercatify — Cut your SaaS bill, keep everything it does',
  description: 'Mercatify reads your SaaS stack and shows what Open Mercato already replaces, with what confidence, and what it saves.',
}

// `/` redirects unauthenticated visitors here (src/app/page.tsx) unless the
// `start_page_dismissed` cookie is set — this is effectively the app's home
// page. Content lives in the mercatify module; see LandingContent.tsx.
export default function StartPage() {
  return <MercatifyLandingContent />
}

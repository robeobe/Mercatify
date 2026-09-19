import { createRequestContainer, type AppContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'

export const MERCATIFY_CASE_RESOURCE_KIND = 'mercatify.case' as const

export type MappingActionContext = {
  ctx: CommandRuntimeContext
  tenantId: string
  organizationId: string
  userId: string
  translate: (key: string, fallback?: string) => string
}

/**
 * Shared request-scope resolution for the mapping-rows custom action routes
 * (`generate`, `confirm`) — mirrors `warranty_claims/api/transition/route.ts`'s
 * `resolveActionContext`, adapted to mercatify's simpler single-tenant-scope
 * commands.
 */
export async function resolveMappingActionContext(req: Request): Promise<MappingActionContext> {
  const container = (await createRequestContainer()) as AppContainer
  const auth = await getAuthFromRequest(req)
  const { translate } = await resolveTranslations()
  if (!auth || !auth.tenantId || !auth.sub) {
    throw new CrudHttpError(401, { error: translate('mercatify.errors.unauthorized', 'Unauthorized') })
  }
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const organizationId = scope?.selectedId ?? auth.orgId ?? null
  if (!organizationId) {
    throw new CrudHttpError(400, { error: translate('mercatify.errors.organization_required', 'Organization context is required') })
  }
  return {
    ctx: {
      container,
      auth,
      organizationScope: scope,
      selectedOrganizationId: organizationId,
      organizationIds: scope?.filterIds ?? (auth.orgId ? [auth.orgId] : null),
      request: req,
    },
    tenantId: auth.tenantId,
    organizationId,
    userId: auth.sub,
    translate,
  }
}

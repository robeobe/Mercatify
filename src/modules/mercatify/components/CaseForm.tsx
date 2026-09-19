"use client"

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { CrudForm, type CrudField, type CrudFormGroup } from '@open-mercato/ui/backend/CrudForm'
import { ErrorMessage, RecordNotFoundState } from '@open-mercato/ui/backend/detail'
import { createCrud, fetchCrudList, updateCrud } from '@open-mercato/ui/backend/utils/crud'
import { createCrudFormError } from '@open-mercato/ui/backend/utils/serverErrors'
import { Alert, AlertDescription, AlertTitle } from '@open-mercato/ui/primitives/alert'
import { Badge } from '@open-mercato/ui/primitives/badge'
import { Button } from '@open-mercato/ui/primitives/button'
import { Checkbox } from '@open-mercato/ui/primitives/checkbox'
import { Input } from '@open-mercato/ui/primitives/input'
import { SearchInput } from '@open-mercato/ui/primitives/search-input'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import Link from 'next/link'
import { duplicateCapabilityCounts, SAAS_CATALOG } from '../data/saas-catalog'

const ENTITY_ID = 'mercatify:interview_case'
const LIST_HREF = '/backend/cases'
const REQUESTS_HREF = '/backend/requests'
const FORM_ID = 'mercatify-intake-form'
const CURRENCIES = ['EUR', 'USD', 'PLN', 'GBP'] as const

export type IntakeToolValue = {
  id?: string
  catalogToolId: string | null
  name: string
  selectedModuleIds: string[]
  customUse: string | null
  seats: number | null
  monthlyCost: number | null
}

export type CaseFormValues = {
  id?: string
  companyName: string
  industry: string
  peopleCount: number | null
  currency: string
  pains: string
  mustKeep: string
  tools: IntakeToolValue[]
  status: string
  updatedAt?: string | null
}

export type CaseRecord = CaseFormValues & {
  title?: string
}

type Translate = ReturnType<typeof useT>
type FormMode = 'create' | 'edit' | 'view'

function asTools(value: unknown): IntakeToolValue[] {
  return Array.isArray(value) ? value as IntakeToolValue[] : []
}

function toNumberOrNull(value: unknown): number | null {
  if (value == null || value === '') return null
  const numeric = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

export function toCaseFormValues(item: CaseRecord): CaseFormValues {
  return {
    id: item.id,
    companyName: item.companyName ?? '',
    industry: item.industry ?? '',
    peopleCount: item.peopleCount ?? null,
    currency: item.currency || 'EUR',
    pains: item.pains ?? '',
    mustKeep: item.mustKeep ?? '',
    tools: Array.isArray(item.tools) ? item.tools : [],
    status: item.status ?? 'draft',
    updatedAt: item.updatedAt ?? null,
  }
}

function emptyValues(): CaseFormValues {
  return {
    companyName: '',
    industry: '',
    peopleCount: null,
    currency: 'EUR',
    pains: '',
    mustKeep: '',
    tools: [],
    status: 'draft',
    updatedAt: null,
  }
}

function payloadFromValues(values: CaseFormValues, status: 'draft' | 'new') {
  return {
    id: values.id,
    companyName: values.companyName.trim() || null,
    industry: values.industry.trim() || null,
    peopleCount: toNumberOrNull(values.peopleCount),
    currency: values.currency || 'EUR',
    pains: values.pains.trim() || null,
    mustKeep: values.mustKeep.trim() || null,
    status,
    tools: values.tools
      .filter((tool) => tool.catalogToolId || tool.name.trim().length > 0)
      .map((tool) => ({
        id: tool.id,
        catalogToolId: tool.catalogToolId,
        name: tool.name.trim(),
        selectedModuleIds: tool.selectedModuleIds,
        customUse: tool.customUse?.trim() ? tool.customUse.trim() : null,
        seats: toNumberOrNull(tool.seats),
        monthlyCost: toNumberOrNull(tool.monthlyCost),
      })),
    updatedAt: values.updatedAt,
  }
}

function ToolPicker({
  values,
  setValue,
  t,
  readOnly,
}: {
  values: Record<string, unknown>
  setValue: (id: string, v: unknown) => void
  t: Translate
  readOnly: boolean
}) {
  const [query, setQuery] = React.useState('')
  const tools = asTools(values.tools)
  const dupCounts = duplicateCapabilityCounts(tools)
  const needle = query.trim().toLowerCase()

  const upsertCatalogTool = (catalogId: string, patch: Partial<IntakeToolValue> | null) => {
    const catalog = SAAS_CATALOG.find((item) => item.id === catalogId)
    if (!catalog) return
    const next = tools.filter((tool) => tool.catalogToolId !== catalogId)
    if (patch) {
      const existing = tools.find((tool) => tool.catalogToolId === catalogId)
      next.push({
        id: existing?.id,
        catalogToolId: catalogId,
        name: catalog.name,
        selectedModuleIds: existing?.selectedModuleIds ?? [],
        customUse: null,
        seats: existing?.seats ?? null,
        monthlyCost: existing?.monthlyCost ?? null,
        ...patch,
      })
    }
    setValue('tools', next)
  }

  return (
    <div className="space-y-3">
      <SearchInput
        value={query}
        onChange={setQuery}
        placeholder={t('mercatify.cases.form.search.placeholder')}
        aria-label={t('mercatify.cases.form.search.placeholder')}
        disabled={readOnly}
      />
      <div className="space-y-2">
        {SAAS_CATALOG.filter((catalog) => {
          if (!needle) return true
          const hay = [
            catalog.name,
            catalog.kind,
            ...catalog.modules.flatMap((mod) => [mod.name, mod.desc, ...mod.caps]),
          ].join(' ').toLowerCase()
          return hay.includes(needle)
        }).map((catalog) => {
          const selected = tools.find((tool) => tool.catalogToolId === catalog.id)
          const selectedCount = selected?.selectedModuleIds.length ?? 0
          return (
            <div key={catalog.id} className="rounded-lg border border-border bg-card p-3">
              <Button
                type="button"
                variant={selected ? 'secondary' : 'outline'}
                className="h-auto w-full justify-between whitespace-normal py-2 text-left"
                aria-expanded={Boolean(selected)}
                disabled={readOnly}
                onClick={() => upsertCatalogTool(catalog.id, selected ? null : { selectedModuleIds: [] })}
              >
                <span>
                  <span className="font-medium">{catalog.name}</span>
                  <span className="text-muted-foreground">{` — ${catalog.kind}`}</span>
                </span>
                <span className="text-muted-foreground">
                  {t('mercatify.cases.form.tools.modulesCount', {
                    selected: selectedCount,
                    total: catalog.modules.length,
                  })}
                </span>
              </Button>
              {selected ? (
                <div className="mt-3 space-y-3">
                  <ul className="space-y-2">
                    {catalog.modules.map((mod) => {
                      const checked = selected.selectedModuleIds.includes(mod.id)
                      const isDup = checked && mod.caps.some((cap) => (dupCounts[cap] ?? 0) > 1)
                      return (
                        <li key={mod.id} className="flex items-start gap-2">
                          <Checkbox
                            checked={checked}
                            disabled={readOnly}
                            aria-label={mod.name}
                            onCheckedChange={(state) => {
                              const on = state === true
                              const selectedModuleIds = on
                                ? [...selected.selectedModuleIds, mod.id]
                                : selected.selectedModuleIds.filter((modId) => modId !== mod.id)
                              upsertCatalogTool(catalog.id, { selectedModuleIds })
                            }}
                          />
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-medium">{mod.name}</span>
                              {isDup ? (
                                <Badge variant="warning">{t('mercatify.cases.form.badge.alsoElsewhere')}</Badge>
                              ) : null}
                            </div>
                            <p className="text-sm text-muted-foreground">{mod.desc}</p>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="space-y-1 text-sm">
                      <span>{t('mercatify.cases.form.tools.seats')}</span>
                      <Input
                        type="number"
                        min={0}
                        value={selected.seats ?? ''}
                        disabled={readOnly}
                        onChange={(event) => upsertCatalogTool(catalog.id, { seats: toNumberOrNull(event.target.value) })}
                      />
                    </label>
                    <label className="space-y-1 text-sm">
                      <span>{t('mercatify.cases.form.tools.monthly', { currency: String(values.currency || 'EUR') })}</span>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={selected.monthlyCost ?? ''}
                        disabled={readOnly}
                        onChange={(event) => upsertCatalogTool(catalog.id, { monthlyCost: toNumberOrNull(event.target.value) })}
                      />
                    </label>
                  </div>
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function CustomTools({
  values,
  setValue,
  t,
  readOnly,
}: {
  values: Record<string, unknown>
  setValue: (id: string, v: unknown) => void
  t: Translate
  readOnly: boolean
}) {
  const tools = asTools(values.tools)
  const custom = tools.filter((tool) => !tool.catalogToolId)
  const catalogTools = tools.filter((tool) => tool.catalogToolId)

  const replaceCustom = (nextCustom: IntakeToolValue[]) => {
    setValue('tools', [...catalogTools, ...nextCustom])
  }

  return (
    <div className="space-y-3">
      {custom.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('mercatify.cases.form.custom.empty')}</p>
      ) : null}
      {custom.map((tool, index) => (
        <div key={tool.id ?? `custom-${index}`} className="space-y-2 rounded-lg border border-border p-3">
          <label className="space-y-1 text-sm">
            <span>{t('mercatify.cases.form.custom.name')}</span>
            <Input
              value={tool.name}
              disabled={readOnly}
              onChange={(event) => {
                const next = custom.map((row, rowIndex) => (rowIndex === index ? { ...row, name: event.target.value } : row))
                replaceCustom(next)
              }}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span>{t('mercatify.cases.form.custom.use')}</span>
            <Textarea
              value={tool.customUse ?? ''}
              disabled={readOnly}
              onChange={(event) => {
                const next = custom.map((row, rowIndex) => (rowIndex === index ? { ...row, customUse: event.target.value } : row))
                replaceCustom(next)
              }}
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span>{t('mercatify.cases.form.tools.seats')}</span>
              <Input
                type="number"
                min={0}
                value={tool.seats ?? ''}
                disabled={readOnly}
                onChange={(event) => {
                  const next = custom.map((row, rowIndex) => (
                    rowIndex === index ? { ...row, seats: toNumberOrNull(event.target.value) } : row
                  ))
                  replaceCustom(next)
                }}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span>{t('mercatify.cases.form.tools.monthly', { currency: String(values.currency || 'EUR') })}</span>
              <Input
                type="number"
                min={0}
                value={tool.monthlyCost ?? ''}
                disabled={readOnly}
                onChange={(event) => {
                  const next = custom.map((row, rowIndex) => (
                    rowIndex === index ? { ...row, monthlyCost: toNumberOrNull(event.target.value) } : row
                  ))
                  replaceCustom(next)
                }}
              />
            </label>
          </div>
          {readOnly ? null : (
            <Button
              type="button"
              variant="outline"
              onClick={() => replaceCustom(custom.filter((_, rowIndex) => rowIndex !== index))}
            >
              {t('mercatify.cases.form.actions.removeCustomTool')}
            </Button>
          )}
        </div>
      ))}
      {readOnly ? null : (
        <Button
          type="button"
          variant="secondary"
          onClick={() => replaceCustom([...custom, {
            catalogToolId: null,
            name: '',
            selectedModuleIds: [],
            customUse: '',
            seats: null,
            monthlyCost: null,
          }])}
        >
          {t('mercatify.cases.form.actions.addCustomTool')}
        </Button>
      )}
    </div>
  )
}

function SummaryRail({ values, t }: { values: Record<string, unknown>; t: Translate }) {
  const tools = asTools(values.tools).filter((tool) => tool.catalogToolId || tool.name.trim())
  const modules = tools.reduce((sum, tool) => sum + tool.selectedModuleIds.length, 0)
  const monthly = tools.reduce((sum, tool) => sum + (tool.monthlyCost ?? 0), 0)
  const duplicates = Object.values(duplicateCapabilityCounts(tools)).filter((count) => count > 1).length
  const currency = String(values.currency || 'EUR')
  return (
    <dl className="space-y-3 text-sm">
      <div>
        <dt className="text-muted-foreground">{t('mercatify.cases.form.summary.tools')}</dt>
        <dd className="text-lg font-medium">{tools.length}</dd>
      </div>
      <div>
        <dt className="text-muted-foreground">{t('mercatify.cases.form.summary.modules')}</dt>
        <dd className="text-lg font-medium">{modules}</dd>
      </div>
      <div>
        <dt className="text-muted-foreground">{t('mercatify.cases.form.summary.monthly')}</dt>
        <dd className="text-lg font-medium">{`${currency} ${monthly.toFixed(0)}`}</dd>
      </div>
      <div>
        <dt className="text-muted-foreground">{t('mercatify.cases.form.summary.duplicates')}</dt>
        <dd className="text-lg font-medium">{duplicates}</dd>
      </div>
    </dl>
  )
}

export function CaseForm({
  mode,
  caseId,
  initial,
  isLoading,
  listHref = LIST_HREF,
  formTitle,
  showLockAlert = true,
  showCorrectedListAction = true,
  embedded = false,
}: {
  mode: FormMode
  caseId?: string
  initial?: CaseFormValues
  isLoading?: boolean
  listHref?: string
  formTitle?: string
  showLockAlert?: boolean
  /** Off on the admin case detail: "Send a corrected list" is the client's
   *  move, and it would take an admin to the client intake. */
  showCorrectedListAction?: boolean
  /** Drop the form's own back/cancel/save header — used where the page
   *  already carries a pagehead and the intake is read-only context. */
  embedded?: boolean
}) {
  const t = useT()
  const router = useRouter()
  const readOnly = mode === 'view'
  const fields = React.useMemo<CrudField[]>(() => [
    { id: 'companyName', label: t('mercatify.cases.form.fields.companyName.label'), type: 'text', disabled: readOnly },
    { id: 'industry', label: t('mercatify.cases.form.fields.industry.label'), type: 'text', disabled: readOnly },
    { id: 'peopleCount', label: t('mercatify.cases.form.fields.peopleCount.label'), type: 'number', disabled: readOnly },
    {
      id: 'currency',
      label: t('mercatify.cases.form.fields.currency.label'),
      type: 'select',
      disabled: readOnly,
      options: CURRENCIES.map((value) => ({ value, label: value })),
    },
    { id: 'pains', label: t('mercatify.cases.form.fields.pains.label'), type: 'textarea', disabled: readOnly },
    { id: 'mustKeep', label: t('mercatify.cases.form.fields.mustKeep.label'), type: 'textarea', disabled: readOnly },
  ], [readOnly, t])

  const groups = React.useMemo<CrudFormGroup[]>(() => [
    {
      id: 'company',
      title: t('mercatify.cases.form.groups.company'),
      column: 1,
      fields: ['companyName', 'industry', 'peopleCount', 'currency', 'pains', 'mustKeep'],
    },
    {
      id: 'tools',
      title: t('mercatify.cases.form.groups.tools'),
      column: 1,
      component: ({ values, setValue }) => (
        <ToolPicker values={values} setValue={setValue} t={t} readOnly={readOnly} />
      ),
    },
    {
      id: 'custom',
      title: t('mercatify.cases.form.groups.custom'),
      column: 1,
      component: ({ values, setValue }) => (
        <CustomTools values={values} setValue={setValue} t={t} readOnly={readOnly} />
      ),
    },
    {
      id: 'summary',
      title: t('mercatify.cases.form.groups.summary'),
      column: 2,
      bare: true,
      component: ({ values }) => <SummaryRail values={values} t={t} />,
    },
  ], [readOnly, t])

  const extraActions = readOnly ? (
    showCorrectedListAction ? (
      <Button asChild>
        <Link href="/backend/cases/create">{t('mercatify.cases.form.actions.correctedList')}</Link>
      </Button>
    ) : null
  ) : (
    <Button type="submit" form={FORM_ID} name="intent" value="send">
      {t('mercatify.cases.form.actions.send')}
    </Button>
  )

  return (
    <CrudForm<CaseFormValues>
      title={formTitle ?? (mode === 'create' ? t('mercatify.cases.create.title') : t('mercatify.cases.detail.title'))}
      backHref={listHref}
      entityId={ENTITY_ID}
      embedded={embedded}
      formId={FORM_ID}
      fields={fields}
      groups={groups}
      initialValues={initial ?? emptyValues()}
      submitLabel={t('mercatify.cases.form.actions.saveDraft')}
      cancelHref={listHref}
      extraActions={extraActions}
      hideFooterActions={readOnly}
      isLoading={isLoading}
      loadingMessage={t('mercatify.cases.form.loading')}
      contentHeader={readOnly && showLockAlert ? (
        <Alert>
          <AlertTitle>{t('mercatify.cases.form.sentConfirmation')}</AlertTitle>
          <AlertDescription>{t('mercatify.cases.form.sentConfirmationBody')}</AlertDescription>
        </Alert>
      ) : null}
      onSubmit={async (vals, context) => {
        const send = context?.submitter?.name === 'intent' && context.submitter.value === 'send'
        const payload = payloadFromValues(vals, send ? 'new' : 'draft')
        if (send && payload.tools.length === 0) {
          throw createCrudFormError(t('mercatify.cases.form.error.sendEmpty'))
        }
        if (mode === 'create') {
          const created = await createCrud<{ id: string }>('mercatify/cases', payload)
          const id = created.result?.id
          if (!id) {
            router.push(send ? REQUESTS_HREF : LIST_HREF)
            return
          }
          // A sent intake belongs to the client's own request thread; a saved
          // draft stays on the staff-side record it was created from.
          router.push(send ? `${REQUESTS_HREF}/${id}` : `/backend/cases/${id}`)
          return
        }
        await updateCrud('mercatify/cases', payload)
        if (send && caseId) router.push(`${REQUESTS_HREF}/${caseId}`)
        else router.refresh()
      }}
    />
  )
}

export function CaseEditLoader({ id }: { id: string }) {
  const t = useT()
  const [initial, setInitial] = React.useState<CaseFormValues | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [err, setErr] = React.useState<string | null>(null)
  const [isNotFound, setIsNotFound] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setErr(null)
      setIsNotFound(false)
      try {
        const data = await fetchCrudList<CaseRecord>('mercatify/cases', { ids: String(id), pageSize: 1 })
        const item = data?.items?.[0]
        if (!item) {
          if (!cancelled) setIsNotFound(true)
          return
        }
        if (!cancelled) setInitial(toCaseFormValues(item))
      } catch (error: unknown) {
        if (!cancelled) {
          if ((error as { status?: number }).status === 404) setIsNotFound(true)
          else {
            const message = error instanceof Error && error.message ? error.message : t('mercatify.cases.form.error.load')
            setErr(message)
          }
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [id, t])

  if (isNotFound) {
    return (
      <RecordNotFoundState
        label={t('mercatify.cases.form.error.notFound')}
        backHref={LIST_HREF}
        backLabel={t('mercatify.cases.form.actions.backToList')}
      />
    )
  }

  if (err) return <ErrorMessage label={err} />

  const mode: FormMode = initial && initial.status !== 'draft' ? 'view' : 'edit'
  return (
    <CaseForm
      mode={loading ? 'edit' : mode}
      caseId={id}
      isLoading={loading}
      initial={initial ?? { ...emptyValues(), id, updatedAt: null }}
    />
  )
}

export function CaseCreateForm() {
  // Embedded: the intake page carries the mockup's own pagehead, so the form's
  // duplicate back/cancel/save header row is dropped. The footer actions stay.
  return <CaseForm mode="create" embedded />
}

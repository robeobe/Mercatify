export type SaasCatalogModule = {
  id: string
  name: string
  desc: string
  caps: string[]
}

export type SaasCatalogTool = {
  id: string
  name: string
  kind: string
  modules: SaasCatalogModule[]
}

export const CAPABILITY_LABELS: Record<string, string> = {
  "crm.contacts": "Contact & company database",
  "crm.pipeline": "Deal pipeline",
  "crm.email": "Email sync & templates",
  "sales.forecast": "Forecasting",
  "marketing.email": "Email campaigns",
  "marketing.automation": "Marketing automation",
  "marketing.forms": "Signup forms & popups",
  "marketing.segments": "Audience segmentation",
  "marketing.sms": "SMS campaigns",
  "quotes.cpq": "Quote / configure-price-quote",
  "docs.templates": "Document templates",
  "docs.analytics": "Document analytics",
  "esignature": "E-signature",
  "workflow.approvals": "Approval workflow",
  "workflow.automation": "Rules & automation",
  "integration.ipaas": "Integrations / data sync",
  "catalog.products": "Product catalog",
  "pricing.pricelists": "Price lists & discounts",
  "b2b.accounts": "B2B company accounts",
  "ecommerce.storefront": "Storefront",
  "ecommerce.cart": "Cart & checkout",
  "orders.mgmt": "Order management",
  "fulfillment.shipping": "Fulfilment & shipping",
  "inventory.stock": "Stock levels",
  "inventory.multiwarehouse": "Multi-warehouse stock",
  "inventory.barcode": "Barcode scanning",
  "inventory.alerts": "Low-stock alerts",
  "purchasing.po": "Purchase orders",
  "support.tickets": "Ticketing / shared inbox",
  "support.sla": "SLA & routing",
  "support.kb": "Knowledge base",
  "support.chat": "Live chat / messenger",
  "support.voice": "Voice / phone",
  "onboarding.tours": "Product tours",
  "projects.tasks": "Tasks & project boards",
  "field.scheduling": "Scheduling & dispatch",
  "field.jobsheets": "Job sheets & checklists",
  "time.tracking": "Time tracking",
  "customer.portal": "Customer self-service portal",
  "forms.intake": "Intake forms",
  "data.custom": "Custom registers & fields",
  "internal.apps": "Internal apps / views",
  "files.docs": "Documents & files",
  "reporting.dashboards": "Reports & dashboards",
  "payments": "Payments",
  "billing.subscriptions": "Subscriptions & recurring billing",
  "invoicing": "Sales invoicing",
  "tax.calc": "Tax calculation",
  "accounting.ledger": "General ledger & VAT",
  "accounting.expenses": "Bills & expenses",
  "accounting.bank": "Bank reconciliation",
  "accounting.reports": "Statutory reporting",
  "hr.payroll": "Payroll",
  "cms.website": "Website / CMS"
}

export const SAAS_CATALOG: SaasCatalogTool[] = [
  {
    "id": "hubspot",
    "name": "HubSpot",
    "kind": "CRM & marketing",
    "modules": [
      {
        "id": "sales",
        "name": "Sales Hub",
        "desc": "Contacts, deals, pipeline stages, email log",
        "caps": [
          "crm.contacts",
          "crm.pipeline",
          "crm.email"
        ]
      },
      {
        "id": "marketing",
        "name": "Marketing Hub",
        "desc": "Campaigns, lists, landing pages, lead scoring",
        "caps": [
          "marketing.email",
          "marketing.automation",
          "marketing.forms"
        ]
      },
      {
        "id": "service",
        "name": "Service Hub",
        "desc": "Tickets, SLAs, knowledge base",
        "caps": [
          "support.tickets",
          "support.sla",
          "support.kb"
        ]
      },
      {
        "id": "quotes",
        "name": "Quotes & payments",
        "desc": "Quote documents and payment links",
        "caps": [
          "quotes.cpq",
          "payments"
        ]
      },
      {
        "id": "cms",
        "name": "Content Hub",
        "desc": "Website, blog, landing pages",
        "caps": [
          "cms.website"
        ]
      },
      {
        "id": "ops",
        "name": "Operations Hub",
        "desc": "Data sync, programmable automation",
        "caps": [
          "workflow.automation",
          "integration.ipaas"
        ]
      },
      {
        "id": "reporting",
        "name": "Custom reports",
        "desc": "Dashboards and attribution reports",
        "caps": [
          "reporting.dashboards"
        ]
      }
    ]
  },
  {
    "id": "salesforce",
    "name": "Salesforce",
    "kind": "CRM suite",
    "modules": [
      {
        "id": "sales",
        "name": "Sales Cloud",
        "desc": "Accounts, opportunities, forecasting",
        "caps": [
          "crm.contacts",
          "crm.pipeline",
          "sales.forecast"
        ]
      },
      {
        "id": "service",
        "name": "Service Cloud",
        "desc": "Cases, omni-channel routing, SLAs",
        "caps": [
          "support.tickets",
          "support.sla"
        ]
      },
      {
        "id": "cpq",
        "name": "CPQ",
        "desc": "Product rules, price rules, quote documents",
        "caps": [
          "quotes.cpq",
          "pricing.pricelists"
        ]
      },
      {
        "id": "pardot",
        "name": "Account Engagement",
        "desc": "Nurture programmes, lead scoring",
        "caps": [
          "marketing.email",
          "marketing.automation"
        ]
      },
      {
        "id": "exp",
        "name": "Experience Cloud",
        "desc": "Customer and partner portal",
        "caps": [
          "customer.portal"
        ]
      },
      {
        "id": "field",
        "name": "Field Service",
        "desc": "Work orders, dispatch, mobile app",
        "caps": [
          "field.scheduling",
          "field.jobsheets"
        ]
      },
      {
        "id": "reports",
        "name": "Reports & dashboards",
        "desc": "Standard and custom reporting",
        "caps": [
          "reporting.dashboards"
        ]
      }
    ]
  },
  {
    "id": "pipedrive",
    "name": "Pipedrive",
    "kind": "Sales CRM",
    "modules": [
      {
        "id": "deals",
        "name": "Deals & pipelines",
        "desc": "Stages, rotting deals, activities",
        "caps": [
          "crm.pipeline"
        ]
      },
      {
        "id": "contacts",
        "name": "Contacts & organisations",
        "desc": "People, companies, custom fields",
        "caps": [
          "crm.contacts"
        ]
      },
      {
        "id": "email",
        "name": "Email sync & templates",
        "desc": "Two-way sync, sequences",
        "caps": [
          "crm.email"
        ]
      },
      {
        "id": "products",
        "name": "Products & quotes",
        "desc": "Product list attached to deals, quote PDFs",
        "caps": [
          "catalog.products",
          "quotes.cpq"
        ]
      },
      {
        "id": "autom",
        "name": "Workflow automation",
        "desc": "Trigger-action rules",
        "caps": [
          "workflow.automation"
        ]
      },
      {
        "id": "insights",
        "name": "Insights",
        "desc": "Reports and goal tracking",
        "caps": [
          "reporting.dashboards"
        ]
      },
      {
        "id": "projects",
        "name": "Projects",
        "desc": "Post-sale delivery boards",
        "caps": [
          "projects.tasks"
        ]
      }
    ]
  },
  {
    "id": "zendesk",
    "name": "Zendesk",
    "kind": "Support",
    "modules": [
      {
        "id": "support",
        "name": "Support",
        "desc": "Ticketing, macros, SLA policies",
        "caps": [
          "support.tickets",
          "support.sla"
        ]
      },
      {
        "id": "guide",
        "name": "Guide",
        "desc": "Help centre and article base",
        "caps": [
          "support.kb"
        ]
      },
      {
        "id": "chat",
        "name": "Messaging & live chat",
        "desc": "Web widget, bots",
        "caps": [
          "support.chat"
        ]
      },
      {
        "id": "talk",
        "name": "Talk",
        "desc": "Voice channel and call recording",
        "caps": [
          "support.voice"
        ]
      },
      {
        "id": "explore",
        "name": "Explore",
        "desc": "Support reporting",
        "caps": [
          "reporting.dashboards"
        ]
      },
      {
        "id": "sell",
        "name": "Sell",
        "desc": "Light CRM for the support team",
        "caps": [
          "crm.contacts",
          "crm.pipeline"
        ]
      }
    ]
  },
  {
    "id": "intercom",
    "name": "Intercom",
    "kind": "Support & messaging",
    "modules": [
      {
        "id": "inbox",
        "name": "Inbox",
        "desc": "Shared inbox, assignment rules",
        "caps": [
          "support.tickets"
        ]
      },
      {
        "id": "messenger",
        "name": "Messenger",
        "desc": "In-app and website chat",
        "caps": [
          "support.chat"
        ]
      },
      {
        "id": "help",
        "name": "Help Center",
        "desc": "Self-serve articles",
        "caps": [
          "support.kb"
        ]
      },
      {
        "id": "outbound",
        "name": "Outbound",
        "desc": "Campaigns, emails, in-app banners",
        "caps": [
          "marketing.email",
          "marketing.automation"
        ]
      },
      {
        "id": "tours",
        "name": "Product Tours",
        "desc": "Onboarding walkthroughs",
        "caps": [
          "onboarding.tours"
        ]
      },
      {
        "id": "workflows",
        "name": "Workflows",
        "desc": "Bots and routing logic",
        "caps": [
          "workflow.automation"
        ]
      }
    ]
  },
  {
    "id": "shopify",
    "name": "Shopify",
    "kind": "Commerce",
    "modules": [
      {
        "id": "store",
        "name": "Online Store",
        "desc": "Themes, pages, navigation",
        "caps": [
          "ecommerce.storefront"
        ]
      },
      {
        "id": "products",
        "name": "Products & collections",
        "desc": "SKUs, variants, media",
        "caps": [
          "catalog.products"
        ]
      },
      {
        "id": "inventory",
        "name": "Inventory & locations",
        "desc": "Stock per location, transfers",
        "caps": [
          "inventory.stock",
          "inventory.multiwarehouse"
        ]
      },
      {
        "id": "orders",
        "name": "Orders & fulfilment",
        "desc": "Order flow, picking, shipping labels",
        "caps": [
          "orders.mgmt",
          "fulfillment.shipping"
        ]
      },
      {
        "id": "checkout",
        "name": "Checkout & payments",
        "desc": "Cart, payment providers, taxes",
        "caps": [
          "ecommerce.cart",
          "payments"
        ]
      },
      {
        "id": "b2b",
        "name": "B2B",
        "desc": "Company accounts, catalogs, price lists",
        "caps": [
          "b2b.accounts",
          "pricing.pricelists"
        ]
      },
      {
        "id": "flow",
        "name": "Shopify Flow",
        "desc": "Commerce automations",
        "caps": [
          "workflow.automation"
        ]
      }
    ]
  },
  {
    "id": "monday",
    "name": "monday.com",
    "kind": "Work management",
    "modules": [
      {
        "id": "work",
        "name": "Work management",
        "desc": "Boards, tasks, owners, statuses",
        "caps": [
          "projects.tasks"
        ]
      },
      {
        "id": "crm",
        "name": "monday CRM",
        "desc": "Leads, contacts, deal boards",
        "caps": [
          "crm.contacts",
          "crm.pipeline"
        ]
      },
      {
        "id": "forms",
        "name": "Forms",
        "desc": "Intake forms feeding boards",
        "caps": [
          "forms.intake"
        ]
      },
      {
        "id": "docs",
        "name": "Docs",
        "desc": "Shared documents and notes",
        "caps": [
          "files.docs"
        ]
      },
      {
        "id": "dash",
        "name": "Dashboards",
        "desc": "Cross-board widgets",
        "caps": [
          "reporting.dashboards"
        ]
      },
      {
        "id": "autom",
        "name": "Automations & integrations",
        "desc": "Recipes and connected apps",
        "caps": [
          "workflow.automation",
          "integration.ipaas"
        ]
      }
    ]
  },
  {
    "id": "airtable",
    "name": "Airtable",
    "kind": "Ad-hoc registers",
    "modules": [
      {
        "id": "bases",
        "name": "Bases",
        "desc": "The registers the business actually runs on",
        "caps": [
          "data.custom"
        ]
      },
      {
        "id": "iface",
        "name": "Interfaces",
        "desc": "Internal views and mini-apps",
        "caps": [
          "internal.apps"
        ]
      },
      {
        "id": "forms",
        "name": "Forms",
        "desc": "Data collection into bases",
        "caps": [
          "forms.intake"
        ]
      },
      {
        "id": "autom",
        "name": "Automations & scripts",
        "desc": "Scheduled and triggered scripts",
        "caps": [
          "workflow.automation"
        ]
      },
      {
        "id": "sync",
        "name": "Sync & integrations",
        "desc": "Two-way sync with other tools",
        "caps": [
          "integration.ipaas"
        ]
      },
      {
        "id": "charts",
        "name": "Charts & reporting",
        "desc": "Dashboards over bases",
        "caps": [
          "reporting.dashboards"
        ]
      }
    ]
  },
  {
    "id": "pandadoc",
    "name": "PandaDoc",
    "kind": "Quotes & e-signature",
    "modules": [
      {
        "id": "templates",
        "name": "Templates & quotes",
        "desc": "Quote documents from a configuration",
        "caps": [
          "quotes.cpq",
          "docs.templates"
        ]
      },
      {
        "id": "esign",
        "name": "E-signature",
        "desc": "Legally binding signature",
        "caps": [
          "esignature"
        ]
      },
      {
        "id": "approve",
        "name": "Approval workflow",
        "desc": "Internal sign-off before sending",
        "caps": [
          "workflow.approvals"
        ]
      },
      {
        "id": "analytics",
        "name": "Document analytics",
        "desc": "Who opened what, for how long",
        "caps": [
          "docs.analytics"
        ]
      },
      {
        "id": "payments",
        "name": "Payments on documents",
        "desc": "Pay from the quote",
        "caps": [
          "payments"
        ]
      },
      {
        "id": "crmsync",
        "name": "CRM integration",
        "desc": "Push signed documents back to the CRM",
        "caps": [
          "integration.ipaas"
        ]
      }
    ]
  },
  {
    "id": "inventory-app",
    "name": "Sortly / inFlow",
    "kind": "Inventory",
    "modules": [
      {
        "id": "items",
        "name": "Item catalog",
        "desc": "Items, custom fields, photos",
        "caps": [
          "catalog.products",
          "data.custom"
        ]
      },
      {
        "id": "stock",
        "name": "Stock by location",
        "desc": "Levels across warehouses and vans",
        "caps": [
          "inventory.stock",
          "inventory.multiwarehouse"
        ]
      },
      {
        "id": "barcode",
        "name": "Barcode scanning",
        "desc": "Goods-in and stock-take on a phone",
        "caps": [
          "inventory.barcode"
        ]
      },
      {
        "id": "alerts",
        "name": "Low-stock alerts",
        "desc": "Reorder points and notifications",
        "caps": [
          "inventory.alerts"
        ]
      },
      {
        "id": "po",
        "name": "Purchase orders",
        "desc": "Ordering from suppliers",
        "caps": [
          "purchasing.po"
        ]
      },
      {
        "id": "reports",
        "name": "Inventory reports",
        "desc": "Valuation and movement",
        "caps": [
          "reporting.dashboards"
        ]
      }
    ]
  },
  {
    "id": "jobber",
    "name": "Jobber / ServiceTitan",
    "kind": "Field service",
    "modules": [
      {
        "id": "sched",
        "name": "Scheduling & dispatch",
        "desc": "Crew calendar, route, assignment",
        "caps": [
          "field.scheduling"
        ]
      },
      {
        "id": "jobs",
        "name": "Job sheets & checklists",
        "desc": "On-site forms, photos, sign-off",
        "caps": [
          "field.jobsheets"
        ]
      },
      {
        "id": "quotes",
        "name": "Quotes",
        "desc": "On-site estimates",
        "caps": [
          "quotes.cpq"
        ]
      },
      {
        "id": "invoice",
        "name": "Invoicing & payments",
        "desc": "Invoice on completion, card payment",
        "caps": [
          "invoicing",
          "payments"
        ]
      },
      {
        "id": "hub",
        "name": "Client hub",
        "desc": "Customer sees quotes, visits, invoices",
        "caps": [
          "customer.portal"
        ]
      },
      {
        "id": "time",
        "name": "Time tracking",
        "desc": "Hours per job and per crew",
        "caps": [
          "time.tracking"
        ]
      }
    ]
  },
  {
    "id": "emailmkt",
    "name": "Mailchimp / Klaviyo",
    "kind": "Email marketing",
    "modules": [
      {
        "id": "camp",
        "name": "Campaigns",
        "desc": "Newsletters and broadcasts",
        "caps": [
          "marketing.email"
        ]
      },
      {
        "id": "flows",
        "name": "Automations / flows",
        "desc": "Abandoned cart, win-back, onboarding",
        "caps": [
          "marketing.automation"
        ]
      },
      {
        "id": "seg",
        "name": "Segments",
        "desc": "Audience slices from behaviour",
        "caps": [
          "marketing.segments"
        ]
      },
      {
        "id": "forms",
        "name": "Forms & popups",
        "desc": "Signup capture on the site",
        "caps": [
          "marketing.forms"
        ]
      },
      {
        "id": "sms",
        "name": "SMS",
        "desc": "Text campaigns and alerts",
        "caps": [
          "marketing.sms"
        ]
      },
      {
        "id": "reports",
        "name": "Campaign reporting",
        "desc": "Opens, clicks, revenue attribution",
        "caps": [
          "reporting.dashboards"
        ]
      }
    ]
  },
  {
    "id": "stripe",
    "name": "Stripe Billing",
    "kind": "Payments & billing",
    "modules": [
      {
        "id": "pay",
        "name": "Payments & checkout",
        "desc": "Card acquiring, payment links",
        "caps": [
          "payments"
        ]
      },
      {
        "id": "subs",
        "name": "Subscriptions",
        "desc": "Plans, trials, proration",
        "caps": [
          "billing.subscriptions"
        ]
      },
      {
        "id": "inv",
        "name": "Invoices & dunning",
        "desc": "Invoice issue, retries, reminders",
        "caps": [
          "invoicing"
        ]
      },
      {
        "id": "tax",
        "name": "Tax",
        "desc": "Rate determination and filing data",
        "caps": [
          "tax.calc"
        ]
      },
      {
        "id": "portal",
        "name": "Customer billing portal",
        "desc": "Self-service plan and card changes",
        "caps": [
          "customer.portal"
        ]
      },
      {
        "id": "rev",
        "name": "Revenue reporting",
        "desc": "MRR, churn, cohorts",
        "caps": [
          "reporting.dashboards"
        ]
      }
    ]
  },
  {
    "id": "accounting",
    "name": "Xero / QuickBooks",
    "kind": "Accounting",
    "modules": [
      {
        "id": "ledger",
        "name": "General ledger & VAT",
        "desc": "Statutory books and filings",
        "caps": [
          "accounting.ledger"
        ]
      },
      {
        "id": "inv",
        "name": "Sales invoices",
        "desc": "Issuing and chasing invoices",
        "caps": [
          "invoicing"
        ]
      },
      {
        "id": "bills",
        "name": "Bills & expenses",
        "desc": "Supplier bills, receipts",
        "caps": [
          "accounting.expenses"
        ]
      },
      {
        "id": "bank",
        "name": "Bank reconciliation",
        "desc": "Feeds and matching",
        "caps": [
          "accounting.bank"
        ]
      },
      {
        "id": "payroll",
        "name": "Payroll",
        "desc": "Salaries and contributions",
        "caps": [
          "hr.payroll"
        ]
      },
      {
        "id": "reports",
        "name": "Financial reports",
        "desc": "P&L, balance sheet",
        "caps": [
          "accounting.reports"
        ]
      }
    ]
  }
]

export function capabilityLabel(slug: string): string {
  return CAPABILITY_LABELS[slug] ?? slug
}

export function findCatalogTool(id: string): SaasCatalogTool | undefined {
  return SAAS_CATALOG.find((tool) => tool.id === id)
}

export function duplicateCapabilityCounts(
  selected: Array<{ catalogToolId: string | null | undefined; selectedModuleIds: string[] }>,
): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const row of selected) {
    if (!row.catalogToolId) continue
    const catalog = findCatalogTool(row.catalogToolId)
    if (!catalog) continue
    const seen = new Set<string>()
    for (const mod of catalog.modules) {
      if (!row.selectedModuleIds.includes(mod.id)) continue
      for (const cap of mod.caps) seen.add(cap)
    }
    for (const cap of seen) counts[cap] = (counts[cap] ?? 0) + 1
  }
  return counts
}

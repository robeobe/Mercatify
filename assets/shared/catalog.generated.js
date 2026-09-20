/* WYGENEROWANE - nie edytuj ręcznie.
   Źródło: mercatify-labs/src/catalogData.json (werdykty) złączone ze
   strukturą modułów z assets/stack-tool/catalog.js (id, nazwa, opis,
   grupowanie slugów - tego JSON nie ma gdzie trzymać).
   Odśwież: cd mercatify-labs && npm run catalog:generate
   Pilnuje tego mercatify-labs/src/__tests__/catalogIntegrity.test.ts.

   Wystawia na globalny zasięg:
     CATALOG_CAPABILITIES  płasko: narzędzie -> slug -> werdykt
     CATALOG_TOOLS         to, co czytają strony: narzędzia -> moduły ->
                           caps + om/verdict/conf prosto z JSON-a

   Wszystko siedzi w IIFE i wychodzi na zewnątrz tylko pod tymi dwiema
   nazwami. CAPS i OM_TARGETS NIE lądują na globalu z rozmysłu: te nazwy
   należą do `assets/stack-tool/catalog.js`, gdzie są `const`, a drugie
   `var` o tej samej nazwie wywaliłoby parser całego skryptu. */
(function (globalScope) {
  var CAPS = {
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
    "cms.website": "Website / CMS",
    "sales.sequences": "Email sequences / cadences",
    "surveys.nps": "Surveys & NPS",
    "forms.conversational": "Conversational / branching forms",
    "integration.longtail": "Long-tail app connectors",
    "scheduling.bookingpage": "Public self-service booking page",
    "notifications": "Internal notifications & alerts",
    "collab.teamchat": "Internal team chat",
    "collab.sharedviews": "Externally shared views"
  };

  var OM_TARGETS = [
    "customers",
    "customers + sales",
    "sales",
    "sales — quotes",
    "sales — orders",
    "sales — invoices",
    "catalog",
    "catalog — prices",
    "wms",
    "checkout",
    "payment_gateways",
    "shipping_carriers",
    "messages",
    "messages + inbox_ops",
    "phone_calls",
    "warranty_claims",
    "planner — availabilities",
    "business_rules",
    "workflows",
    "portal + customer_accounts",
    "entities — custom entities & fields",
    "documents",
    "notifications",
    "content",
    "dashboards",
    "search",
    "integrations",
    "data_sync",
    "staff",
    "agent_orchestrator (enterprise)",
    "stays external, wired in",
    "not our business — keep it",
    "no module yet — build",
    "business_rules + data_sync",
    "business_rules + integrations",
    "business_rules + notifications",
    "catalog + sales — quotes",
    "content + portal",
    "sales — orders + shipping_carriers",
    "sales — invoices + payment_gateways",
    "checkout + payment_gateways",
    "payment_gateways + checkout",
    "customers + catalog — prices"
  ];

  var CATALOG_CAPABILITIES = {
    "HubSpot": {
      "capabilities": {
        "crm.contacts": {
          "target": "customers + sales",
          "decision": "native",
          "confidence": "high"
        },
        "crm.pipeline": {
          "target": "customers + sales",
          "decision": "native",
          "confidence": "high"
        },
        "crm.email": {
          "target": "customers + sales",
          "decision": "native",
          "confidence": "high"
        },
        "marketing.email": {
          "target": "stays external, wired in",
          "decision": "integrate",
          "confidence": "medium"
        },
        "marketing.automation": {
          "target": "stays external, wired in",
          "decision": "integrate",
          "confidence": "medium"
        },
        "marketing.forms": {
          "target": "stays external, wired in",
          "decision": "integrate",
          "confidence": "medium"
        },
        "support.tickets": {
          "target": "messages + inbox_ops",
          "decision": "configure",
          "confidence": "medium"
        },
        "support.sla": {
          "target": "messages + inbox_ops",
          "decision": "configure",
          "confidence": "medium"
        },
        "support.kb": {
          "target": "messages + inbox_ops",
          "decision": "configure",
          "confidence": "medium"
        },
        "quotes.cpq": {
          "target": "sales — quotes",
          "decision": "build",
          "confidence": "medium"
        },
        "payments": {
          "target": "payment_gateways",
          "decision": "native",
          "confidence": "medium"
        },
        "cms.website": {
          "target": "not our business — keep it",
          "decision": "keep",
          "confidence": "high"
        },
        "workflow.automation": {
          "target": "business_rules + data_sync",
          "decision": "configure",
          "confidence": "medium"
        },
        "integration.ipaas": {
          "target": "business_rules + data_sync",
          "decision": "configure",
          "confidence": "medium"
        },
        "reporting.dashboards": {
          "target": "dashboards",
          "decision": "configure",
          "confidence": "medium"
        },
        "sales.sequences": {
          "target": "not our business — keep it",
          "decision": "keep",
          "confidence": "high"
        }
      }
    },
    "Salesforce": {
      "capabilities": {
        "crm.contacts": {
          "target": "customers + sales",
          "decision": "configure",
          "confidence": "medium"
        },
        "crm.pipeline": {
          "target": "customers + sales",
          "decision": "configure",
          "confidence": "medium"
        },
        "sales.forecast": {
          "target": "customers + sales",
          "decision": "configure",
          "confidence": "medium"
        },
        "support.tickets": {
          "target": "messages + inbox_ops",
          "decision": "configure",
          "confidence": "medium"
        },
        "support.sla": {
          "target": "messages + inbox_ops",
          "decision": "configure",
          "confidence": "medium"
        },
        "quotes.cpq": {
          "target": "sales — quotes",
          "decision": "build",
          "confidence": "medium"
        },
        "pricing.pricelists": {
          "target": "catalog — prices",
          "decision": "configure",
          "confidence": "medium"
        },
        "marketing.email": {
          "target": "stays external, wired in",
          "decision": "integrate",
          "confidence": "medium"
        },
        "marketing.automation": {
          "target": "stays external, wired in",
          "decision": "integrate",
          "confidence": "medium"
        },
        "customer.portal": {
          "target": "portal + customer_accounts",
          "decision": "configure",
          "confidence": "medium"
        },
        "field.scheduling": {
          "target": "no module yet — build",
          "decision": "build",
          "confidence": "low"
        },
        "field.jobsheets": {
          "target": "no module yet — build",
          "decision": "build",
          "confidence": "low"
        },
        "reporting.dashboards": {
          "target": "dashboards",
          "decision": "configure",
          "confidence": "medium"
        }
      }
    },
    "Pipedrive": {
      "capabilities": {
        "crm.pipeline": {
          "target": "sales",
          "decision": "native",
          "confidence": "high"
        },
        "crm.contacts": {
          "target": "customers",
          "decision": "native",
          "confidence": "high"
        },
        "crm.email": {
          "target": "messages",
          "decision": "configure",
          "confidence": "medium"
        },
        "catalog.products": {
          "target": "catalog",
          "decision": "native",
          "confidence": "medium"
        },
        "quotes.cpq": {
          "target": "sales — quotes",
          "decision": "build",
          "confidence": "medium"
        },
        "workflow.automation": {
          "target": "business_rules",
          "decision": "configure",
          "confidence": "high"
        },
        "reporting.dashboards": {
          "target": "dashboards",
          "decision": "configure",
          "confidence": "medium"
        },
        "projects.tasks": {
          "target": "entities — custom entities & fields",
          "decision": "build",
          "confidence": "low"
        }
      }
    },
    "Zendesk": {
      "capabilities": {
        "support.tickets": {
          "target": "messages + inbox_ops",
          "decision": "configure",
          "confidence": "medium"
        },
        "support.sla": {
          "target": "messages + inbox_ops",
          "decision": "configure",
          "confidence": "medium"
        },
        "support.kb": {
          "target": "content + portal",
          "decision": "configure",
          "confidence": "low"
        },
        "support.chat": {
          "target": "stays external, wired in",
          "decision": "integrate",
          "confidence": "medium"
        },
        "support.voice": {
          "target": "phone_calls",
          "decision": "integrate",
          "confidence": "medium"
        },
        "reporting.dashboards": {
          "target": "dashboards",
          "decision": "configure",
          "confidence": "medium"
        },
        "crm.contacts": {
          "target": "customers + sales",
          "decision": "native",
          "confidence": "high"
        },
        "crm.pipeline": {
          "target": "customers + sales",
          "decision": "native",
          "confidence": "high"
        }
      }
    },
    "Intercom": {
      "capabilities": {
        "support.tickets": {
          "target": "messages + inbox_ops",
          "decision": "configure",
          "confidence": "medium"
        },
        "support.chat": {
          "target": "stays external, wired in",
          "decision": "integrate",
          "confidence": "medium"
        },
        "support.kb": {
          "target": "content + portal",
          "decision": "configure",
          "confidence": "low"
        },
        "marketing.email": {
          "target": "stays external, wired in",
          "decision": "integrate",
          "confidence": "medium"
        },
        "marketing.automation": {
          "target": "stays external, wired in",
          "decision": "integrate",
          "confidence": "medium"
        },
        "onboarding.tours": {
          "target": "not our business — keep it",
          "decision": "native",
          "confidence": "low",
          "reportVerdict": "drop"
        },
        "workflow.automation": {
          "target": "business_rules",
          "decision": "configure",
          "confidence": "medium"
        }
      }
    },
    "Shopify": {
      "capabilities": {
        "ecommerce.storefront": {
          "target": "stays external, wired in",
          "decision": "integrate",
          "confidence": "medium"
        },
        "catalog.products": {
          "target": "catalog",
          "decision": "native",
          "confidence": "high"
        },
        "inventory.stock": {
          "target": "wms",
          "decision": "native",
          "confidence": "high"
        },
        "inventory.multiwarehouse": {
          "target": "wms",
          "decision": "native",
          "confidence": "high"
        },
        "orders.mgmt": {
          "target": "sales — orders + shipping_carriers",
          "decision": "native",
          "confidence": "high"
        },
        "fulfillment.shipping": {
          "target": "sales — orders + shipping_carriers",
          "decision": "native",
          "confidence": "high"
        },
        "ecommerce.cart": {
          "target": "checkout + payment_gateways",
          "decision": "configure",
          "confidence": "medium"
        },
        "payments": {
          "target": "checkout + payment_gateways",
          "decision": "configure",
          "confidence": "medium"
        },
        "b2b.accounts": {
          "target": "customers + catalog — prices",
          "decision": "configure",
          "confidence": "medium"
        },
        "pricing.pricelists": {
          "target": "customers + catalog — prices",
          "decision": "configure",
          "confidence": "medium"
        },
        "workflow.automation": {
          "target": "business_rules",
          "decision": "configure",
          "confidence": "high"
        }
      }
    },
    "monday.com": {
      "capabilities": {
        "projects.tasks": {
          "target": "entities — custom entities & fields",
          "decision": "build",
          "confidence": "low"
        },
        "crm.contacts": {
          "target": "customers + sales",
          "decision": "native",
          "confidence": "high"
        },
        "crm.pipeline": {
          "target": "customers + sales",
          "decision": "native",
          "confidence": "high"
        },
        "forms.intake": {
          "target": "entities — custom entities & fields",
          "decision": "configure",
          "confidence": "medium"
        },
        "files.docs": {
          "target": "documents",
          "decision": "native",
          "confidence": "high"
        },
        "reporting.dashboards": {
          "target": "dashboards",
          "decision": "configure",
          "confidence": "medium"
        },
        "workflow.automation": {
          "target": "business_rules + integrations",
          "decision": "configure",
          "confidence": "medium"
        },
        "integration.ipaas": {
          "target": "business_rules + integrations",
          "decision": "configure",
          "confidence": "medium"
        }
      }
    },
    "Airtable": {
      "capabilities": {
        "data.custom": {
          "target": "entities — custom entities & fields",
          "decision": "native",
          "confidence": "high"
        },
        "internal.apps": {
          "target": "entities — custom entities & fields",
          "decision": "configure",
          "confidence": "medium"
        },
        "forms.intake": {
          "target": "entities — custom entities & fields",
          "decision": "configure",
          "confidence": "medium"
        },
        "workflow.automation": {
          "target": "business_rules",
          "decision": "configure",
          "confidence": "medium"
        },
        "integration.ipaas": {
          "target": "data_sync",
          "decision": "configure",
          "confidence": "medium"
        },
        "reporting.dashboards": {
          "target": "dashboards",
          "decision": "configure",
          "confidence": "medium"
        },
        "collab.sharedviews": {
          "target": "not our business — keep it",
          "decision": "keep",
          "confidence": "low"
        }
      }
    },
    "PandaDoc": {
      "capabilities": {
        "quotes.cpq": {
          "target": "sales — quotes",
          "decision": "build",
          "confidence": "medium"
        },
        "docs.templates": {
          "target": "documents",
          "decision": "configure",
          "confidence": "medium"
        },
        "esignature": {
          "target": "stays external, wired in",
          "decision": "integrate",
          "confidence": "high"
        },
        "workflow.approvals": {
          "target": "workflows",
          "decision": "configure",
          "confidence": "medium"
        },
        "docs.analytics": {
          "target": "not our business — keep it",
          "decision": "native",
          "confidence": "low",
          "reportVerdict": "drop"
        },
        "payments": {
          "target": "payment_gateways + checkout",
          "decision": "configure",
          "confidence": "medium"
        },
        "integration.ipaas": {
          "target": "integrations",
          "decision": "configure",
          "confidence": "high"
        }
      }
    },
    "Sortly / inFlow": {
      "capabilities": {
        "catalog.products": {
          "target": "catalog",
          "decision": "native",
          "confidence": "high"
        },
        "data.custom": {
          "target": "catalog",
          "decision": "native",
          "confidence": "high"
        },
        "inventory.stock": {
          "target": "wms",
          "decision": "native",
          "confidence": "high"
        },
        "inventory.multiwarehouse": {
          "target": "wms",
          "decision": "native",
          "confidence": "high"
        },
        "inventory.barcode": {
          "target": "wms",
          "decision": "configure",
          "confidence": "medium"
        },
        "inventory.alerts": {
          "target": "business_rules + notifications",
          "decision": "configure",
          "confidence": "high"
        },
        "purchasing.po": {
          "target": "no module yet — build",
          "decision": "build",
          "confidence": "low"
        },
        "reporting.dashboards": {
          "target": "dashboards",
          "decision": "configure",
          "confidence": "medium"
        }
      }
    },
    "Jobber / ServiceTitan": {
      "capabilities": {
        "field.scheduling": {
          "target": "planner — availabilities",
          "decision": "configure",
          "confidence": "low"
        },
        "field.jobsheets": {
          "target": "entities — custom entities & fields",
          "decision": "build",
          "confidence": "low"
        },
        "quotes.cpq": {
          "target": "sales — quotes",
          "decision": "build",
          "confidence": "medium"
        },
        "invoicing": {
          "target": "sales — invoices + payment_gateways",
          "decision": "configure",
          "confidence": "medium"
        },
        "payments": {
          "target": "sales — invoices + payment_gateways",
          "decision": "configure",
          "confidence": "medium"
        },
        "customer.portal": {
          "target": "portal + customer_accounts",
          "decision": "configure",
          "confidence": "medium"
        },
        "time.tracking": {
          "target": "no module yet — build",
          "decision": "build",
          "confidence": "low"
        }
      }
    },
    "Mailchimp / Klaviyo": {
      "capabilities": {
        "marketing.email": {
          "target": "stays external, wired in",
          "decision": "integrate",
          "confidence": "high"
        },
        "marketing.automation": {
          "target": "stays external, wired in",
          "decision": "integrate",
          "confidence": "medium"
        },
        "marketing.segments": {
          "target": "customers",
          "decision": "configure",
          "confidence": "medium"
        },
        "marketing.forms": {
          "target": "stays external, wired in",
          "decision": "integrate",
          "confidence": "medium"
        },
        "marketing.sms": {
          "target": "stays external, wired in",
          "decision": "integrate",
          "confidence": "high"
        },
        "reporting.dashboards": {
          "target": "dashboards",
          "decision": "configure",
          "confidence": "low"
        }
      }
    },
    "Stripe Billing": {
      "capabilities": {
        "payments": {
          "target": "payment_gateways",
          "decision": "integrate",
          "confidence": "high"
        },
        "billing.subscriptions": {
          "target": "no module yet — build",
          "decision": "build",
          "confidence": "low"
        },
        "invoicing": {
          "target": "sales — invoices",
          "decision": "configure",
          "confidence": "medium"
        },
        "tax.calc": {
          "target": "stays external, wired in",
          "decision": "integrate",
          "confidence": "high"
        },
        "customer.portal": {
          "target": "portal + customer_accounts",
          "decision": "configure",
          "confidence": "medium"
        },
        "reporting.dashboards": {
          "target": "dashboards",
          "decision": "configure",
          "confidence": "low"
        }
      }
    },
    "Xero / QuickBooks": {
      "capabilities": {
        "accounting.ledger": {
          "target": "not our business — keep it",
          "decision": "keep",
          "confidence": "high"
        },
        "invoicing": {
          "target": "sales — invoices",
          "decision": "configure",
          "confidence": "medium"
        },
        "accounting.expenses": {
          "target": "not our business — keep it",
          "decision": "keep",
          "confidence": "high"
        },
        "accounting.bank": {
          "target": "not our business — keep it",
          "decision": "keep",
          "confidence": "high"
        },
        "hr.payroll": {
          "target": "not our business — keep it",
          "decision": "keep",
          "confidence": "high"
        },
        "accounting.reports": {
          "target": "not our business — keep it",
          "decision": "keep",
          "confidence": "high"
        }
      }
    },
    "Typeform": {
      "capabilities": {
        "forms.intake": {
          "target": "entities — custom entities & fields",
          "decision": "native",
          "confidence": "high"
        },
        "surveys.nps": {
          "target": "entities — custom entities & fields",
          "decision": "configure",
          "confidence": "medium"
        },
        "forms.conversational": {
          "target": "not our business — keep it",
          "decision": "keep",
          "confidence": "medium"
        }
      }
    },
    "Zapier": {
      "capabilities": {
        "workflow.automation": {
          "target": "business_rules",
          "decision": "native",
          "confidence": "high"
        },
        "integration.ipaas": {
          "target": "integrations",
          "decision": "native",
          "confidence": "high"
        },
        "integration.longtail": {
          "target": "stays external, wired in",
          "decision": "integrate",
          "confidence": "medium"
        }
      }
    },
    "Calendly": {
      "capabilities": {
        "field.scheduling": {
          "target": "planner — availabilities",
          "decision": "configure",
          "confidence": "medium"
        },
        "scheduling.bookingpage": {
          "target": "not our business — keep it",
          "decision": "keep",
          "confidence": "medium"
        }
      }
    },
    "Slack": {
      "capabilities": {
        "notifications": {
          "target": "notifications",
          "decision": "native",
          "confidence": "high"
        },
        "collab.teamchat": {
          "target": "not our business — keep it",
          "decision": "keep",
          "confidence": "high"
        }
      }
    }
  };

  var CATALOG_TOOLS = [
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
          ],
          "om": "customers + sales",
          "verdict": "native",
          "conf": "high"
        },
        {
          "id": "marketing",
          "name": "Marketing Hub",
          "desc": "Campaigns, lists, landing pages, lead scoring",
          "caps": [
            "marketing.email",
            "marketing.automation",
            "marketing.forms"
          ],
          "om": "stays external, wired in",
          "verdict": "integrate",
          "conf": "medium"
        },
        {
          "id": "service",
          "name": "Service Hub",
          "desc": "Tickets, SLAs, knowledge base",
          "caps": [
            "support.tickets",
            "support.sla",
            "support.kb"
          ],
          "om": "messages + inbox_ops",
          "verdict": "configure",
          "conf": "medium"
        },
        {
          "id": "quotes",
          "name": "Quote builder",
          "desc": "Quote documents from a product configuration",
          "caps": [
            "quotes.cpq"
          ],
          "om": "sales — quotes",
          "verdict": "build",
          "conf": "medium"
        },
        {
          "id": "paylinks",
          "name": "Payment links",
          "desc": "Payment links on a quote",
          "caps": [
            "payments"
          ],
          "om": "payment_gateways",
          "verdict": "native",
          "conf": "medium"
        },
        {
          "id": "cms",
          "name": "Content Hub",
          "desc": "Website, blog, landing pages",
          "caps": [
            "cms.website"
          ],
          "om": "not our business — keep it",
          "verdict": "keep",
          "conf": "high"
        },
        {
          "id": "ops",
          "name": "Operations Hub",
          "desc": "Data sync, programmable automation",
          "caps": [
            "workflow.automation",
            "integration.ipaas"
          ],
          "om": "business_rules + data_sync",
          "verdict": "configure",
          "conf": "medium"
        },
        {
          "id": "reporting",
          "name": "Custom reports",
          "desc": "Dashboards and attribution reports",
          "caps": [
            "reporting.dashboards"
          ],
          "om": "dashboards",
          "verdict": "configure",
          "conf": "medium"
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
          ],
          "om": "customers + sales",
          "verdict": "configure",
          "conf": "medium"
        },
        {
          "id": "service",
          "name": "Service Cloud",
          "desc": "Cases, omni-channel routing, SLAs",
          "caps": [
            "support.tickets",
            "support.sla"
          ],
          "om": "messages + inbox_ops",
          "verdict": "configure",
          "conf": "medium"
        },
        {
          "id": "cpq",
          "name": "CPQ",
          "desc": "Quote documents from product and price rules",
          "caps": [
            "quotes.cpq"
          ],
          "om": "sales — quotes",
          "verdict": "build",
          "conf": "medium"
        },
        {
          "id": "pricerules",
          "name": "Price rules",
          "desc": "Price lists and discount rules",
          "caps": [
            "pricing.pricelists"
          ],
          "om": "catalog — prices",
          "verdict": "configure",
          "conf": "medium"
        },
        {
          "id": "pardot",
          "name": "Account Engagement",
          "desc": "Nurture programmes, lead scoring",
          "caps": [
            "marketing.email",
            "marketing.automation"
          ],
          "om": "stays external, wired in",
          "verdict": "integrate",
          "conf": "medium"
        },
        {
          "id": "exp",
          "name": "Experience Cloud",
          "desc": "Customer and partner portal",
          "caps": [
            "customer.portal"
          ],
          "om": "portal + customer_accounts",
          "verdict": "configure",
          "conf": "medium"
        },
        {
          "id": "field",
          "name": "Field Service",
          "desc": "Work orders, dispatch, mobile app",
          "caps": [
            "field.scheduling",
            "field.jobsheets"
          ],
          "om": "no module yet — build",
          "verdict": "build",
          "conf": "low"
        },
        {
          "id": "reports",
          "name": "Reports & dashboards",
          "desc": "Standard and custom reporting",
          "caps": [
            "reporting.dashboards"
          ],
          "om": "dashboards",
          "verdict": "configure",
          "conf": "medium"
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
          ],
          "om": "sales",
          "verdict": "native",
          "conf": "high"
        },
        {
          "id": "contacts",
          "name": "Contacts & organisations",
          "desc": "People, companies, custom fields",
          "caps": [
            "crm.contacts"
          ],
          "om": "customers",
          "verdict": "native",
          "conf": "high"
        },
        {
          "id": "email",
          "name": "Email sync & templates",
          "desc": "Two-way sync, sequences",
          "caps": [
            "crm.email"
          ],
          "om": "messages",
          "verdict": "configure",
          "conf": "medium"
        },
        {
          "id": "products",
          "name": "Product list",
          "desc": "Product list attached to deals",
          "caps": [
            "catalog.products"
          ],
          "om": "catalog",
          "verdict": "native",
          "conf": "medium"
        },
        {
          "id": "quotedocs",
          "name": "Quote documents",
          "desc": "Quote PDFs from the deal product list",
          "caps": [
            "quotes.cpq"
          ],
          "om": "sales — quotes",
          "verdict": "build",
          "conf": "medium"
        },
        {
          "id": "autom",
          "name": "Workflow automation",
          "desc": "Trigger-action rules",
          "caps": [
            "workflow.automation"
          ],
          "om": "business_rules",
          "verdict": "configure",
          "conf": "high"
        },
        {
          "id": "insights",
          "name": "Insights",
          "desc": "Reports and goal tracking",
          "caps": [
            "reporting.dashboards"
          ],
          "om": "dashboards",
          "verdict": "configure",
          "conf": "medium"
        },
        {
          "id": "projects",
          "name": "Projects",
          "desc": "Post-sale delivery boards",
          "caps": [
            "projects.tasks"
          ],
          "om": "entities — custom entities & fields",
          "verdict": "build",
          "conf": "low"
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
          ],
          "om": "messages + inbox_ops",
          "verdict": "configure",
          "conf": "medium"
        },
        {
          "id": "guide",
          "name": "Guide",
          "desc": "Help centre and article base",
          "caps": [
            "support.kb"
          ],
          "om": "content + portal",
          "verdict": "configure",
          "conf": "low"
        },
        {
          "id": "chat",
          "name": "Messaging & live chat",
          "desc": "Web widget, bots",
          "caps": [
            "support.chat"
          ],
          "om": "stays external, wired in",
          "verdict": "integrate",
          "conf": "medium"
        },
        {
          "id": "talk",
          "name": "Talk",
          "desc": "Voice channel and call recording",
          "caps": [
            "support.voice"
          ],
          "om": "phone_calls",
          "verdict": "integrate",
          "conf": "medium"
        },
        {
          "id": "explore",
          "name": "Explore",
          "desc": "Support reporting",
          "caps": [
            "reporting.dashboards"
          ],
          "om": "dashboards",
          "verdict": "configure",
          "conf": "medium"
        },
        {
          "id": "sell",
          "name": "Sell",
          "desc": "Light CRM for the support team",
          "caps": [
            "crm.contacts",
            "crm.pipeline"
          ],
          "om": "customers + sales",
          "verdict": "native",
          "conf": "high"
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
          ],
          "om": "messages + inbox_ops",
          "verdict": "configure",
          "conf": "medium"
        },
        {
          "id": "messenger",
          "name": "Messenger",
          "desc": "In-app and website chat",
          "caps": [
            "support.chat"
          ],
          "om": "stays external, wired in",
          "verdict": "integrate",
          "conf": "medium"
        },
        {
          "id": "help",
          "name": "Help Center",
          "desc": "Self-serve articles",
          "caps": [
            "support.kb"
          ],
          "om": "content + portal",
          "verdict": "configure",
          "conf": "low"
        },
        {
          "id": "outbound",
          "name": "Outbound",
          "desc": "Campaigns, emails, in-app banners",
          "caps": [
            "marketing.email",
            "marketing.automation"
          ],
          "om": "stays external, wired in",
          "verdict": "integrate",
          "conf": "medium"
        },
        {
          "id": "tours",
          "name": "Product Tours",
          "desc": "Onboarding walkthroughs",
          "caps": [
            "onboarding.tours"
          ],
          "om": "not our business — keep it",
          "verdict": "drop",
          "conf": "low"
        },
        {
          "id": "workflows",
          "name": "Workflows",
          "desc": "Bots and routing logic",
          "caps": [
            "workflow.automation"
          ],
          "om": "business_rules",
          "verdict": "configure",
          "conf": "medium"
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
          ],
          "om": "stays external, wired in",
          "verdict": "integrate",
          "conf": "medium"
        },
        {
          "id": "products",
          "name": "Products & collections",
          "desc": "SKUs, variants, media",
          "caps": [
            "catalog.products"
          ],
          "om": "catalog",
          "verdict": "native",
          "conf": "high"
        },
        {
          "id": "inventory",
          "name": "Inventory & locations",
          "desc": "Stock per location, transfers",
          "caps": [
            "inventory.stock",
            "inventory.multiwarehouse"
          ],
          "om": "wms",
          "verdict": "native",
          "conf": "high"
        },
        {
          "id": "orders",
          "name": "Orders & fulfilment",
          "desc": "Order flow, picking, shipping labels",
          "caps": [
            "orders.mgmt",
            "fulfillment.shipping"
          ],
          "om": "sales — orders + shipping_carriers",
          "verdict": "native",
          "conf": "high"
        },
        {
          "id": "checkout",
          "name": "Checkout & payments",
          "desc": "Cart, payment providers, taxes",
          "caps": [
            "ecommerce.cart",
            "payments"
          ],
          "om": "checkout + payment_gateways",
          "verdict": "configure",
          "conf": "medium"
        },
        {
          "id": "b2b",
          "name": "B2B",
          "desc": "Company accounts, catalogs, price lists",
          "caps": [
            "b2b.accounts",
            "pricing.pricelists"
          ],
          "om": "customers + catalog — prices",
          "verdict": "configure",
          "conf": "medium"
        },
        {
          "id": "flow",
          "name": "Shopify Flow",
          "desc": "Commerce automations",
          "caps": [
            "workflow.automation"
          ],
          "om": "business_rules",
          "verdict": "configure",
          "conf": "high"
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
          ],
          "om": "entities — custom entities & fields",
          "verdict": "build",
          "conf": "low"
        },
        {
          "id": "crm",
          "name": "monday CRM",
          "desc": "Leads, contacts, deal boards",
          "caps": [
            "crm.contacts",
            "crm.pipeline"
          ],
          "om": "customers + sales",
          "verdict": "native",
          "conf": "high"
        },
        {
          "id": "forms",
          "name": "Forms",
          "desc": "Intake forms feeding boards",
          "caps": [
            "forms.intake"
          ],
          "om": "entities — custom entities & fields",
          "verdict": "configure",
          "conf": "medium"
        },
        {
          "id": "docs",
          "name": "Docs",
          "desc": "Shared documents and notes",
          "caps": [
            "files.docs"
          ],
          "om": "documents",
          "verdict": "native",
          "conf": "high"
        },
        {
          "id": "dash",
          "name": "Dashboards",
          "desc": "Cross-board widgets",
          "caps": [
            "reporting.dashboards"
          ],
          "om": "dashboards",
          "verdict": "configure",
          "conf": "medium"
        },
        {
          "id": "autom",
          "name": "Automations & integrations",
          "desc": "Recipes and connected apps",
          "caps": [
            "workflow.automation",
            "integration.ipaas"
          ],
          "om": "business_rules + integrations",
          "verdict": "configure",
          "conf": "medium"
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
          ],
          "om": "entities — custom entities & fields",
          "verdict": "native",
          "conf": "high"
        },
        {
          "id": "iface",
          "name": "Interfaces",
          "desc": "Internal views and mini-apps",
          "caps": [
            "internal.apps"
          ],
          "om": "entities — custom entities & fields",
          "verdict": "configure",
          "conf": "medium"
        },
        {
          "id": "forms",
          "name": "Forms",
          "desc": "Data collection into bases",
          "caps": [
            "forms.intake"
          ],
          "om": "entities — custom entities & fields",
          "verdict": "configure",
          "conf": "medium"
        },
        {
          "id": "autom",
          "name": "Automations & scripts",
          "desc": "Scheduled and triggered scripts",
          "caps": [
            "workflow.automation"
          ],
          "om": "business_rules",
          "verdict": "configure",
          "conf": "medium"
        },
        {
          "id": "sync",
          "name": "Sync & integrations",
          "desc": "Two-way sync with other tools",
          "caps": [
            "integration.ipaas"
          ],
          "om": "data_sync",
          "verdict": "configure",
          "conf": "medium"
        },
        {
          "id": "charts",
          "name": "Charts & reporting",
          "desc": "Dashboards over bases",
          "caps": [
            "reporting.dashboards"
          ],
          "om": "dashboards",
          "verdict": "configure",
          "conf": "medium"
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
          "name": "Document templates",
          "desc": "Reusable document templates",
          "caps": [
            "docs.templates"
          ],
          "om": "documents",
          "verdict": "configure",
          "conf": "medium"
        },
        {
          "id": "quotebuild",
          "name": "Quote builder",
          "desc": "Quote documents from a panel-and-inverter configuration",
          "caps": [
            "quotes.cpq"
          ],
          "om": "sales — quotes",
          "verdict": "build",
          "conf": "medium"
        },
        {
          "id": "esign",
          "name": "E-signature",
          "desc": "Legally binding signature",
          "caps": [
            "esignature"
          ],
          "om": "stays external, wired in",
          "verdict": "integrate",
          "conf": "high"
        },
        {
          "id": "approve",
          "name": "Approval workflow",
          "desc": "Internal sign-off before sending",
          "caps": [
            "workflow.approvals"
          ],
          "om": "workflows",
          "verdict": "configure",
          "conf": "medium"
        },
        {
          "id": "analytics",
          "name": "Document analytics",
          "desc": "Who opened what, for how long",
          "caps": [
            "docs.analytics"
          ],
          "om": "not our business — keep it",
          "verdict": "drop",
          "conf": "low"
        },
        {
          "id": "payments",
          "name": "Payments on documents",
          "desc": "Pay from the quote",
          "caps": [
            "payments"
          ],
          "om": "payment_gateways + checkout",
          "verdict": "configure",
          "conf": "medium"
        },
        {
          "id": "crmsync",
          "name": "CRM integration",
          "desc": "Push signed documents back to the CRM",
          "caps": [
            "integration.ipaas"
          ],
          "om": "integrations",
          "verdict": "configure",
          "conf": "high"
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
          ],
          "om": "catalog",
          "verdict": "native",
          "conf": "high"
        },
        {
          "id": "stock",
          "name": "Stock by location",
          "desc": "Levels across warehouses and vans",
          "caps": [
            "inventory.stock",
            "inventory.multiwarehouse"
          ],
          "om": "wms",
          "verdict": "native",
          "conf": "high"
        },
        {
          "id": "barcode",
          "name": "Barcode scanning",
          "desc": "Goods-in and stock-take on a phone",
          "caps": [
            "inventory.barcode"
          ],
          "om": "wms",
          "verdict": "configure",
          "conf": "medium"
        },
        {
          "id": "alerts",
          "name": "Low-stock alerts",
          "desc": "Reorder points and notifications",
          "caps": [
            "inventory.alerts"
          ],
          "om": "business_rules + notifications",
          "verdict": "configure",
          "conf": "high"
        },
        {
          "id": "po",
          "name": "Purchase orders",
          "desc": "Ordering from suppliers",
          "caps": [
            "purchasing.po"
          ],
          "om": "no module yet — build",
          "verdict": "build",
          "conf": "low"
        },
        {
          "id": "reports",
          "name": "Inventory reports",
          "desc": "Valuation and movement",
          "caps": [
            "reporting.dashboards"
          ],
          "om": "dashboards",
          "verdict": "configure",
          "conf": "medium"
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
          ],
          "om": "planner — availabilities",
          "verdict": "configure",
          "conf": "low"
        },
        {
          "id": "jobs",
          "name": "Job sheets & checklists",
          "desc": "On-site forms, photos, sign-off",
          "caps": [
            "field.jobsheets"
          ],
          "om": "entities — custom entities & fields",
          "verdict": "build",
          "conf": "low"
        },
        {
          "id": "quotes",
          "name": "Quotes",
          "desc": "On-site estimates",
          "caps": [
            "quotes.cpq"
          ],
          "om": "sales — quotes",
          "verdict": "build",
          "conf": "medium"
        },
        {
          "id": "invoice",
          "name": "Invoicing & payments",
          "desc": "Invoice on completion, card payment",
          "caps": [
            "invoicing",
            "payments"
          ],
          "om": "sales — invoices + payment_gateways",
          "verdict": "configure",
          "conf": "medium"
        },
        {
          "id": "hub",
          "name": "Client hub",
          "desc": "Customer sees quotes, visits, invoices",
          "caps": [
            "customer.portal"
          ],
          "om": "portal + customer_accounts",
          "verdict": "configure",
          "conf": "medium"
        },
        {
          "id": "time",
          "name": "Time tracking",
          "desc": "Hours per job and per crew",
          "caps": [
            "time.tracking"
          ],
          "om": "no module yet — build",
          "verdict": "build",
          "conf": "low"
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
          ],
          "om": "stays external, wired in",
          "verdict": "integrate",
          "conf": "high"
        },
        {
          "id": "flows",
          "name": "Automations / flows",
          "desc": "Abandoned cart, win-back, onboarding",
          "caps": [
            "marketing.automation"
          ],
          "om": "stays external, wired in",
          "verdict": "integrate",
          "conf": "medium"
        },
        {
          "id": "seg",
          "name": "Segments",
          "desc": "Audience slices from behaviour",
          "caps": [
            "marketing.segments"
          ],
          "om": "customers",
          "verdict": "configure",
          "conf": "medium"
        },
        {
          "id": "forms",
          "name": "Forms & popups",
          "desc": "Signup capture on the site",
          "caps": [
            "marketing.forms"
          ],
          "om": "stays external, wired in",
          "verdict": "integrate",
          "conf": "medium"
        },
        {
          "id": "sms",
          "name": "SMS",
          "desc": "Text campaigns and alerts",
          "caps": [
            "marketing.sms"
          ],
          "om": "stays external, wired in",
          "verdict": "integrate",
          "conf": "high"
        },
        {
          "id": "reports",
          "name": "Campaign reporting",
          "desc": "Opens, clicks, revenue attribution",
          "caps": [
            "reporting.dashboards"
          ],
          "om": "dashboards",
          "verdict": "configure",
          "conf": "low"
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
          ],
          "om": "payment_gateways",
          "verdict": "integrate",
          "conf": "high"
        },
        {
          "id": "subs",
          "name": "Subscriptions",
          "desc": "Plans, trials, proration",
          "caps": [
            "billing.subscriptions"
          ],
          "om": "no module yet — build",
          "verdict": "build",
          "conf": "low"
        },
        {
          "id": "inv",
          "name": "Invoices & dunning",
          "desc": "Invoice issue, retries, reminders",
          "caps": [
            "invoicing"
          ],
          "om": "sales — invoices",
          "verdict": "configure",
          "conf": "medium"
        },
        {
          "id": "tax",
          "name": "Tax",
          "desc": "Rate determination and filing data",
          "caps": [
            "tax.calc"
          ],
          "om": "stays external, wired in",
          "verdict": "integrate",
          "conf": "high"
        },
        {
          "id": "portal",
          "name": "Customer billing portal",
          "desc": "Self-service plan and card changes",
          "caps": [
            "customer.portal"
          ],
          "om": "portal + customer_accounts",
          "verdict": "configure",
          "conf": "medium"
        },
        {
          "id": "rev",
          "name": "Revenue reporting",
          "desc": "MRR, churn, cohorts",
          "caps": [
            "reporting.dashboards"
          ],
          "om": "dashboards",
          "verdict": "configure",
          "conf": "low"
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
          ],
          "om": "not our business — keep it",
          "verdict": "keep",
          "conf": "high"
        },
        {
          "id": "inv",
          "name": "Sales invoices",
          "desc": "Issuing and chasing invoices",
          "caps": [
            "invoicing"
          ],
          "om": "sales — invoices",
          "verdict": "configure",
          "conf": "medium"
        },
        {
          "id": "bills",
          "name": "Bills & expenses",
          "desc": "Supplier bills, receipts",
          "caps": [
            "accounting.expenses"
          ],
          "om": "not our business — keep it",
          "verdict": "keep",
          "conf": "high"
        },
        {
          "id": "bank",
          "name": "Bank reconciliation",
          "desc": "Feeds and matching",
          "caps": [
            "accounting.bank"
          ],
          "om": "not our business — keep it",
          "verdict": "keep",
          "conf": "high"
        },
        {
          "id": "payroll",
          "name": "Payroll",
          "desc": "Salaries and contributions",
          "caps": [
            "hr.payroll"
          ],
          "om": "not our business — keep it",
          "verdict": "keep",
          "conf": "high"
        },
        {
          "id": "reports",
          "name": "Financial reports",
          "desc": "P&L, balance sheet",
          "caps": [
            "accounting.reports"
          ],
          "om": "not our business — keep it",
          "verdict": "keep",
          "conf": "high"
        }
      ]
    }
  ];

  globalScope.CATALOG_CAPABILITIES = CATALOG_CAPABILITIES;
  globalScope.CATALOG_TOOLS = CATALOG_TOOLS;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      CAPS: CAPS,
      OM_TARGETS: OM_TARGETS,
      CATALOG_CAPABILITIES: CATALOG_CAPABILITIES,
      CATALOG_TOOLS: CATALOG_TOOLS
    };
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);

import type { OmModule } from './moduleMap'

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase()
  return (words[0]![0]! + words[1]![0]!).toUpperCase()
}

/**
 * Renders a static "empty shell" mockup of Open Mercato configured for one
 * client: their name where the product's own brand mark normally sits, and
 * a sidebar listing only the modules their accepted stack actually turns
 * on (native + configure verdicts — see `moduleMap.ts`). No real data, no
 * scripts, nothing clickable beyond CSS `:hover` — this is a sales preview,
 * never a working install, and must never be mistaken for one.
 */
export function buildWorkspacePreviewHtml(company: string, modules: OmModule[]): string {
  const groups = new Map<string, OmModule[]>()
  for (const m of modules) {
    const list = groups.get(m.group) ?? []
    list.push(m)
    groups.set(m.group, list)
  }
  const groupOrder = ['Sales', 'Catalog & stock', 'Service', 'Operations', 'Platform']
  const orderedGroups = Array.from(groups.keys()).sort((a, b) => {
    const ai = groupOrder.indexOf(a)
    const bi = groupOrder.indexOf(b)
    return (ai === -1 ? groupOrder.length : ai) - (bi === -1 ? groupOrder.length : bi)
  })

  const navHtml = orderedGroups
    .map((group) => {
      const items = (groups.get(group) ?? [])
        .slice()
        .sort((a, b) => a.label.localeCompare(b.label))
        .map((m) => `<li class="nav-item">${escapeHtml(m.label)}</li>`)
        .join('')
      return `<div class="nav-group"><div class="nav-group-label">${escapeHtml(group)}</div><ul class="nav-list">${items}</ul></div>`
    })
    .join('')

  const safeCompany = escapeHtml(company)
  const initials = escapeHtml(initialsOf(company))
  const moduleCount = modules.length

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${safeCompany} — workspace preview</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif; color: #1a1a1a; background: #fff; }
  .shell { display: flex; min-height: 100vh; }
  .sidebar { width: 240px; flex: 0 0 240px; background: #111318; color: #e6e7eb; display: flex; flex-direction: column; }
  .brand { display: flex; align-items: center; gap: 10px; padding: 18px 16px; border-bottom: 1px solid rgba(255,255,255,0.08); }
  .brand-mark { width: 32px; height: 32px; border-radius: 8px; background: linear-gradient(135deg, #a3e635, #65a30d); display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 13px; color: #14210a; flex: none; }
  .brand-name { font-weight: 600; font-size: 14px; line-height: 1.2; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .nav { flex: 1; overflow-y: auto; padding: 12px 0; }
  .nav-group { padding: 8px 16px 14px; }
  .nav-group-label { font-size: 10px; letter-spacing: 0.06em; text-transform: uppercase; color: #8b8f99; margin-bottom: 6px; padding: 0 6px; }
  .nav-list { list-style: none; margin: 0; padding: 0; }
  .nav-item { padding: 7px 10px; border-radius: 6px; font-size: 13.5px; color: #d4d6db; cursor: default; }
  .nav-item:hover { background: rgba(255,255,255,0.06); color: #fff; }
  .sidebar-footer { padding: 12px 16px; font-size: 11px; color: #6b6f79; border-top: 1px solid rgba(255,255,255,0.08); }
  .main { flex: 1; display: flex; flex-direction: column; background: #f7f7f8; }
  .topbar { height: 56px; flex: none; background: #fff; border-bottom: 1px solid #e8e8ea; display: flex; align-items: center; padding: 0 24px; font-size: 13px; color: #6b6f79; }
  .content { flex: 1; padding: 40px; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
  .content h1 { font-size: 22px; margin: 0 0 8px; }
  .content p { max-width: 460px; color: #555; font-size: 14px; line-height: 1.5; margin: 0 0 4px; }
  .badge { display: inline-block; margin-top: 18px; padding: 6px 14px; border-radius: 999px; background: #ecfccb; color: #365314; font-size: 12px; font-weight: 600; }
  .watermark { position: fixed; bottom: 14px; right: 18px; font-size: 11px; color: #b4b6bd; }
</style>
</head>
<body>
  <div class="shell">
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-mark">${initials}</div>
        <div class="brand-name">${safeCompany}</div>
      </div>
      <nav class="nav">${navHtml}</nav>
      <div class="sidebar-footer">Preview — not a live workspace</div>
    </aside>
    <div class="main">
      <div class="topbar">${safeCompany} workspace · preview</div>
      <div class="content">
        <h1>This is a first look at your workspace.</h1>
        <p>Every item on the left is a real Open Mercato module your accepted stack turns on — ${moduleCount} in total. Nothing here is live yet; a consultant sets this up for real once you're ready.</p>
        <span class="badge">${moduleCount} module${moduleCount === 1 ? '' : 's'} enabled</span>
      </div>
    </div>
  </div>
  <div class="watermark">Mercatify · workspace preview</div>
</body>
</html>`
}

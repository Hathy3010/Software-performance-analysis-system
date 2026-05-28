---
name: frontend-impeccable
description: Enforces impeccable frontend design standards for React + TypeScript + TailwindCSS + Shadcn/UI projects. Use when building any UI component, page, layout, form, table, dashboard, or any frontend feature that must meet premium SaaS quality.
---

# Frontend Impeccable Rules

## Stack

- React + TypeScript
- TailwindCSS
- Shadcn/UI (`@/components/ui`)
- Lucide React icons

---

## Step 1: Design Before Code

Before writing a single line, answer:

1. **What is the user trying to do?** — derive the primary action
2. **What is the hierarchy?** — primary / secondary / tertiary elements
3. **What state does this component have?** — loading, empty, error, populated
4. **Where does it live?** — standalone page, modal, sidebar panel, card

Only then write code.

---

## Step 2: Visual Standards

### Palette

Use Slate/Zinc neutrals by default. Never pick colors arbitrarily.

```
Background      bg-zinc-950 / bg-slate-950
Surface         bg-zinc-900 / bg-slate-900
Surface raised  bg-zinc-800 / bg-slate-800
Border          border-zinc-800 / border-zinc-700
Text primary    text-zinc-50
Text secondary  text-zinc-400
Text muted      text-zinc-500
Accent          text-blue-500 / bg-blue-600   (primary action)
Success         text-emerald-500
Warning         text-amber-500
Danger          text-red-500
```

### Typography

```
Page title      text-2xl font-semibold tracking-tight text-zinc-50
Section title   text-lg font-medium text-zinc-100
Label           text-sm font-medium text-zinc-300
Body            text-sm text-zinc-400
Caption/meta    text-xs text-zinc-500
```

### Spacing

- Page padding: `p-6` or `px-6 py-5`
- Card padding: `p-4` or `p-5`
- Gap between sections: `space-y-6`
- Gap between related items: `space-y-3` or `space-y-2`
- Inline gap: `gap-2` or `gap-3`
- Never mix padding scales within the same component

### Borders & Shadows

```
Card border     border border-zinc-800
Subtle divide   divide-zinc-800
Hover ring      ring-1 ring-zinc-700
Focus ring      ring-2 ring-blue-500 ring-offset-2 ring-offset-zinc-950
Elevation       shadow-sm   (cards)
                shadow-lg   (dropdowns, popovers)
                shadow-2xl  (modals)
```

### Border Radius

```
Buttons / badges    rounded-md
Cards               rounded-lg
Modals / sheets     rounded-xl
Avatars             rounded-full
Inputs              rounded-md
Avoid rounded-3xl or above except avatars
```

---

## Step 3: Layout Patterns

### Sidebar + Header + Content (dashboard shell)

```tsx
export function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-50 overflow-hidden">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0">
        <Header />
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
```

### Page Header

```tsx
<div className="flex items-center justify-between mb-6">
  <div>
    <h1 className="text-2xl font-semibold tracking-tight text-zinc-50">{title}</h1>
    <p className="text-sm text-zinc-400 mt-0.5">{subtitle}</p>
  </div>
  <div className="flex items-center gap-2">
    {/* Primary action button */}
  </div>
</div>
```

### Stat Cards Row

```tsx
<div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
  {stats.map(stat => (
    <div key={stat.label} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-zinc-400">{stat.label}</p>
        <stat.icon className="h-4 w-4 text-zinc-500" />
      </div>
      <p className="text-2xl font-semibold text-zinc-50">{stat.value}</p>
      <p className="text-xs text-zinc-500 mt-1">{stat.delta}</p>
    </div>
  ))}
</div>
```

### Search + Filter + Actions Toolbar

```tsx
<div className="flex items-center gap-3 mb-4">
  <div className="relative flex-1 max-w-sm">
    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
    <Input
      placeholder="Search..."
      className="pl-9 bg-zinc-900 border-zinc-800 text-zinc-50 placeholder:text-zinc-500"
    />
  </div>
  <Button variant="outline" size="sm" className="border-zinc-700 text-zinc-300 hover:bg-zinc-800">
    <Filter className="h-4 w-4 mr-2" />
    Filter
  </Button>
  <div className="ml-auto">
    <Button size="sm">
      <Plus className="h-4 w-4 mr-2" />
      New item
    </Button>
  </div>
</div>
```

### Data Table

```tsx
<div className="rounded-lg border border-zinc-800 overflow-hidden">
  <Table>
    <TableHeader>
      <TableRow className="border-zinc-800 hover:bg-transparent">
        <TableHead className="text-zinc-400 font-medium text-xs uppercase tracking-wider">
          {column}
        </TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      <TableRow className="border-zinc-800 hover:bg-zinc-800/50 transition-colors">
        <TableCell className="text-zinc-200">{value}</TableCell>
      </TableRow>
    </TableBody>
  </Table>
</div>
```

### Clean Form

```tsx
<form className="space-y-5">
  <div className="space-y-4 rounded-lg border border-zinc-800 bg-zinc-900 p-5">
    <h3 className="text-sm font-medium text-zinc-200">Section title</h3>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div className="space-y-1.5">
        <Label className="text-zinc-300">Field label</Label>
        <Input className="bg-zinc-950 border-zinc-700 text-zinc-50 placeholder:text-zinc-500" />
        <p className="text-xs text-zinc-500">Helper text</p>
      </div>
    </div>
  </div>
  <div className="flex items-center justify-end gap-2">
    <Button variant="ghost" type="button">Cancel</Button>
    <Button type="submit">Save changes</Button>
  </div>
</form>
```

---

## Step 4: Component Rules

### TypeScript Props

```tsx
// Always explicit interfaces — no `any`, no inline object types on function signature
interface CardProps {
  title: string
  description?: string
  icon?: React.ComponentType<{ className?: string }>
  variant?: 'default' | 'danger' | 'success'
  className?: string
  children?: React.ReactNode
}
```

### State Handling — always handle all states

```tsx
if (isLoading) return <Skeleton className="h-32 w-full rounded-lg" />

if (error) return (
  <div className="rounded-lg border border-red-900/50 bg-red-950/20 p-4 text-sm text-red-400">
    <AlertCircle className="inline h-4 w-4 mr-2" />
    {error.message}
  </div>
)

if (items.length === 0) return (
  <div className="flex flex-col items-center justify-center py-12 text-center">
    <Icon className="h-8 w-8 text-zinc-600 mb-3" />
    <p className="text-sm font-medium text-zinc-400">No items yet</p>
    <p className="text-xs text-zinc-500 mt-1">Get started by creating one.</p>
    <Button size="sm" className="mt-4">Create first item</Button>
  </div>
)
```

### Badges / Status Chips

```tsx
const statusStyles = {
  active:   'bg-emerald-950 text-emerald-400 border-emerald-900',
  inactive: 'bg-zinc-800 text-zinc-400 border-zinc-700',
  warning:  'bg-amber-950 text-amber-400 border-amber-900',
  error:    'bg-red-950 text-red-400 border-red-900',
} as const

<span className={cn(
  'inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border',
  statusStyles[status]
)}>
  {status}
</span>
```

---

## Step 5: What to Avoid

| Anti-pattern | Replace with |
|---|---|
| `rounded-3xl` on cards | `rounded-lg` |
| Random gradient backgrounds | Flat zinc/slate surfaces |
| `text-gray-*` mixed with `text-zinc-*` | Pick one neutral family and stick to it |
| Inline `style=` for colors | Tailwind classes only |
| `className` strings > 10 tokens inline | Extract to a named variable or component |
| Skipping loading/empty/error states | Always handle all three |
| `any` in TypeScript props | Explicit interfaces |
| Hardcoded pixel values | Tailwind spacing scale |
| Icon-only buttons without tooltip | Add `title` or Shadcn `Tooltip` |
| Form without validation feedback | Show inline error below each field |

---

## Step 6: Final Polish Checklist

Run this before every output:

- [ ] Spacing is consistent — same scale used throughout
- [ ] Typography hierarchy is clear — titles vs labels vs body vs captions
- [ ] All interactive elements have hover + focus states
- [ ] Loading, empty, and error states are all handled
- [ ] No hardcoded colors — only Tailwind palette tokens
- [ ] No `any` types — all props typed with interfaces
- [ ] Components are reusable — no one-off logic baked in
- [ ] Mobile layout works — test at `sm:` and below
- [ ] Imports are clean — Lucide icons, Shadcn from `@/components/ui`
- [ ] A senior product designer would not wince at this

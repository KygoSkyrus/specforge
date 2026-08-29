# SpecForge UI Design System v1.0

Blueprint Noir + Reference Dashboards — Production-Ready Component Library

---

## Design Tokens

### Color Palette

```typescript
// packages/ui/src/theme.ts
export const palette = {
  surface: {
    0: '#0B0D10',    // Page background (darkest)
    50: '#12151A',   // Card background
    100: '#1A1E26',  // Hover state
    200: '#242A35',  // Border, disabled
  },
  
  primary: '#5EE7FF',    // Cyan (primary actions, highlights)
  secondary: '#8B7CFF',  // Purple (secondary actions)
  accent: '#10B981',     // Green (success, positive)
  
  text: {
    primary: '#F4F5F7',     // Main text
    secondary: '#9BA3B0',   // Secondary text
    muted: '#5A6270',       // Disabled, muted
    inverted: '#0B0D10',    // Text on light background
  },
  
  semantic: {
    success: '#10B981',
    warning: '#F59E0B',
    error: '#EF4444',
    info: '#3B82F6',
  },
  
  border: '#242A35',
  divider: 'rgba(244, 245, 247, 0.1)',
}
```

### Typography

```typescript
export const typography = {
  fontFamily: {
    sans: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    mono: '"Fira Code", monospace',
  },
  
  fontSize: {
    xs: '12px',      // Labels, badges
    sm: '14px',      // Secondary text
    base: '16px',    // Body text
    lg: '18px',      // Subheadings
    xl: '20px',      // Section headings
    '2xl': '24px',   // Page titles
    '3xl': '32px',   // Large headings
  },
  
  fontWeight: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
  
  lineHeight: {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.75,
  },
}
```

### Spacing

```typescript
export const spacing = {
  xs: '4px',
  sm: '8px',
  md: '12px',
  lg: '16px',
  xl: '24px',
  '2xl': '32px',
  '3xl': '48px',
}
```

### Shadows & Borders

```typescript
export const shadow = {
  sm: '0 1px 2px rgba(0,0,0,0.05)',
  md: '0 4px 6px rgba(0,0,0,0.1)',
  lg: '0 10px 15px rgba(0,0,0,0.1)',
  xl: '0 20px 25px rgba(0,0,0,0.1)',
  'glow-primary': '0 0 20px rgba(94, 231, 255, 0.2)',
  'glow-secondary': '0 0 20px rgba(139, 124, 255, 0.2)',
}

export const radius = {
  sm: '4px',
  md: '8px',
  lg: '12px',
  full: '9999px',
}
```

---

## Component Library

### Core Components

#### Button

```tsx
<Button
  variant="primary|secondary|outline|ghost"
  size="sm|md|lg"
  disabled={false}
  loading={false}
  icon={<Icon />}
  onClick={() => {}}
>
  Click me
</Button>
```

#### Card

```tsx
<Card className="p-lg">
  <Card.Header>
    <Card.Title>Title</Card.Title>
    <Card.Description>Optional description</Card.Description>
  </Card.Header>
  <Card.Content>Content goes here</Card.Content>
  <Card.Footer>Optional footer</Card.Footer>
</Card>
```

#### Input

```tsx
<Input
  type="text|password|email|number"
  placeholder="Enter text..."
  error={error && "Error message"}
  hint="Optional hint text"
  icon={<Icon />}
  disabled={false}
/>
```

#### DataTable

```tsx
<DataTable
  columns={[
    { key: 'id', label: 'ID', sortable: true },
    { key: 'name', label: 'Name', sortable: true },
    { key: 'status', label: 'Status', render: (v) => <Badge>{v}</Badge> },
  ]}
  data={items}
  selectable={true}
  loading={false}
  pagination={{ page: 1, limit: 20, total: 100 }}
  onSort={(column) => {}}
  onPageChange={(page) => {}}
/>
```

#### Modal / Dialog

```tsx
<Modal open={isOpen} onClose={onClose} size="md">
  <Modal.Header>
    <Modal.Title>Modal Title</Modal.Title>
  </Modal.Header>
  <Modal.Content>Content</Modal.Content>
  <Modal.Footer>
    <Button variant="outline" onClick={onClose}>Cancel</Button>
    <Button variant="primary" onClick={onConfirm}>Confirm</Button>
  </Modal.Footer>
</Modal>
```

#### Tabs

```tsx
<Tabs defaultValue="overview">
  <Tabs.List>
    <Tabs.Trigger value="overview">Overview</Tabs.Trigger>
    <Tabs.Trigger value="details">Details</Tabs.Trigger>
  </Tabs.List>
  <Tabs.Content value="overview">Content 1</Tabs.Content>
  <Tabs.Content value="details">Content 2</Tabs.Content>
</Tabs>
```

#### Chart (using Recharts)

```tsx
<AreaChart data={data} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
  <defs>
    <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
      <stop offset="5%" stopColor="#5EE7FF" stopOpacity={0.3}/>
      <stop offset="95%" stopColor="#5EE7FF" stopOpacity={0}/>
    </linearGradient>
  </defs>
  <XAxis dataKey="name" stroke="#5A6270" />
  <YAxis stroke="#5A6270" />
  <Tooltip contentStyle={{ backgroundColor: '#12151A', border: '1px solid #242A35' }} />
  <Area type="monotone" dataKey="value" stroke="#5EE7FF" fillOpacity={1} fill="url(#colorValue)" />
</AreaChart>
```

#### Empty State

```tsx
<EmptyState
  icon={<Icon />}
  title="No specs yet"
  description="Create your first spec to get started"
  action={<Button onClick={onCreate}>Create Spec</Button>}
/>
```

#### Skeleton Loader

```tsx
<div className="space-y-3">
  <Skeleton className="h-12 w-full" />
  <Skeleton className="h-4 w-3/4" />
  <Skeleton className="h-4 w-1/2" />
</div>
```

---

## Page Templates

### Dashboard Layout

```tsx
export function DashboardLayout({ children }) {
  return (
    <div className="min-h-screen bg-surface-0">
      <Sidebar />
      <div className="lg:pl-64 flex flex-col">
        <TopNav />
        <main className="flex-1 overflow-y-auto bg-surface-0">
          <div className="container mx-auto px-lg py-xl">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
```

### Spec Workspace Layout

```tsx
export function SpecWorkspace() {
  return (
    <div className="grid grid-cols-[300px_1fr_350px] gap-0 h-screen bg-surface-0">
      <div className="border-r border-divider overflow-y-auto">
        {/* Outline panel */}
      </div>
      <div className="border-r border-divider overflow-y-auto">
        {/* Editor panel */}
      </div>
      <div className="overflow-y-auto">
        {/* AI rail */}
      </div>
    </div>
  )
}
```

### Backlog Board Layout

```tsx
export function BacklogBoard() {
  return (
    <div className="h-screen bg-surface-0 flex flex-col">
      <div className="flex-none border-b border-divider p-lg">
        {/* Filters */}
      </div>
      <div className="flex-1 overflow-x-auto">
        <div className="grid grid-cols-5 gap-lg p-lg">
          <KanbanColumn status="backlog" />
          <KanbanColumn status="selected" />
          <KanbanColumn status="in-progress" />
          <KanbanColumn status="review" />
          <KanbanColumn status="done" />
        </div>
      </div>
    </div>
  )
}
```

### Delivery Timeline (Gantt)

```tsx
export function DeliveryTimeline({ plan }) {
  return (
    <div className="h-screen bg-surface-0 flex">
      <div className="w-80 border-r border-divider overflow-y-auto p-lg">
        {/* Scope editor, cost breakdown */}
      </div>
      <div className="flex-1 overflow-x-auto">
        <GanttChart
          phases={plan.phases}
          milestones={plan.milestones}
          criticalPath={plan.criticalPath}
          onDragMilestone={(id, newDate) => {}}
        />
      </div>
    </div>
  )
}
```

### Deal Room

```tsx
export function DealRoom({ dealRoom }) {
  const [scrolled, setScrolled] = useState(false)
  
  return (
    <div className="min-h-screen bg-surface-0">
      <div className="grid grid-cols-[1fr_300px] gap-0">
        <div className="overflow-y-auto">
          {/* Cover section */}
          {/* Understanding & Goals */}
          {/* Approach */}
          {/* Scope In/Out */}
          {/* Timeline */}
          {/* Cost & Commercial */}
          {/* Team */}
          {/* Assumptions & Risks */}
          {/* Call to Action */}
        </div>
        <div className="border-l border-divider p-lg">
          {/* Comments sidebar */}
          {/* Approval button */}
        </div>
      </div>
    </div>
  )
}
```

---

## Dark Theme CSS Variables

```css
/* styles/theme.css */
:root {
  --color-surface-0: #0B0D10;
  --color-surface-50: #12151A;
  --color-surface-100: #1A1E26;
  --color-surface-200: #242A35;
  
  --color-primary: #5EE7FF;
  --color-secondary: #8B7CFF;
  --color-accent: #10B981;
  
  --color-text-primary: #F4F5F7;
  --color-text-secondary: #9BA3B0;
  --color-text-muted: #5A6270;
  
  --color-error: #EF4444;
  --color-warning: #F59E0B;
  --color-success: #10B981;
  --color-info: #3B82F6;
  
  --color-border: #242A35;
  --color-divider: rgba(244, 245, 247, 0.1);
  
  --font-sans: Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif;
  --font-mono: Fira Code, monospace;
  
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-full: 9999px;
  
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.05);
  --shadow-md: 0 4px 6px rgba(0,0,0,0.1);
  --shadow-lg: 0 10px 15px rgba(0,0,0,0.1);
}

body {
  background-color: var(--color-surface-0);
  color: var(--color-text-primary);
  font-family: var(--font-sans);
}

.card {
  background-color: var(--color-surface-50);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
}

.button-primary {
  background-color: var(--color-primary);
  color: var(--color-surface-0);
}

.button-primary:hover {
  box-shadow: var(--shadow-lg), 0 0 20px rgba(94, 231, 255, 0.2);
}
```

---

## Accessibility

- [ ] All buttons have `aria-label` for screen readers
- [ ] Form inputs have associated `<label>` elements
- [ ] Color contrast ratio ≥ 4.5:1 for text
- [ ] Keyboard navigation support (Tab, Enter, Escape)
- [ ] Focus indicators visible (ring-2 ring-primary)
- [ ] Loading states with `aria-busy="true"`
- [ ] Semantic HTML (use `<button>` not `<div>`

)

---

## Performance

- Code split by route (Next.js automatic)
- Component lazy loading for modals, charts
- Image optimization with Next.js Image component
- CSS-in-JS with CSS Modules for smaller bundles
- Bundle analysis: `next build --analyze`


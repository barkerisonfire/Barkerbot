import {
  Badge,
  Body1,
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Spinner,
  makeStyles,
  tokens
} from '@fluentui/react-components'
import {
  CheckmarkCircle20Filled,
  Circle20Regular,
  DismissCircle20Filled,
  SubtractCircle20Regular
} from '@fluentui/react-icons'
import type { ReactNode } from 'react'
import type { ObjectSource, WorkflowStep } from '@shared/types'
import { useApp, type Page } from '../AppContext'

const useStyles = makeStyles({
  crumbs: { fontSize: '14px', color: tokens.colorNeutralForeground2, marginBottom: '8px' },
  crumbLink: {
    cursor: 'pointer',
    color: tokens.colorNeutralForeground2,
    ':hover': { textDecoration: 'underline', color: tokens.colorBrandForeground1 }
  },
  title: { fontSize: '28px', fontWeight: 600, margin: '0 0 4px', lineHeight: '36px' },
  desc: { color: tokens.colorNeutralForeground2, marginBottom: '16px', display: 'block', maxWidth: '900px' },
  steps: { display: 'flex', flexDirection: 'column', gap: '10px' },
  step: { display: 'flex', gap: '10px', alignItems: 'flex-start' },
  stepMsg: { fontSize: '12px', color: tokens.colorNeutralForeground3 },
  stepFail: { fontSize: '12px', color: tokens.colorPaletteRedForeground1 }
})

export function PageHeader({ crumb, title, description }: { crumb?: { label: string; page: Page }[]; title: string; description?: ReactNode }) {
  const s = useStyles()
  const { navigate } = useApp()
  const trail = [{ label: 'Home', page: 'home' as Page }, ...(crumb ?? [])]
  return (
    <div>
      <div className={s.crumbs}>
        {trail.map((c) => (
          <span key={c.label}>
            <span className={s.crumbLink} onClick={() => navigate(c.page)}>
              {c.label}
            </span>
            {' > '}
          </span>
        ))}
        <span>{title}</span>
      </div>
      <h1 className={s.title}>{title}</h1>
      {description && <Body1 className={s.desc}>{description}</Body1>}
    </div>
  )
}

const SOURCE: Record<ObjectSource, { label: string; color: 'brand' | 'informative' | 'warning' }> = {
  cloud: { label: 'Cloud', color: 'brand' },
  synced: { label: 'Synced from AD', color: 'informative' },
  onprem: { label: 'On-prem only', color: 'warning' }
}

export function SourceBadge({ source, pending }: { source: ObjectSource; pending?: boolean }) {
  return (
    <span style={{ display: 'inline-flex', gap: 4 }}>
      <Badge appearance="tint" color={SOURCE[source].color} shape="rounded">
        {SOURCE[source].label}
      </Badge>
      {pending && (
        <Badge appearance="outline" color="warning" shape="rounded" title="Changed on-prem, waiting for Entra Connect">
          Sync pending
        </Badge>
      )}
    </span>
  )
}

export function StatusBadge({ enabled }: { enabled: boolean }) {
  return enabled ? (
    <Badge appearance="ghost" color="success" icon={<CheckmarkCircle20Filled />}>
      Active
    </Badge>
  ) : (
    <Badge appearance="ghost" color="danger" icon={<SubtractCircle20Regular />}>
      Sign-in blocked
    </Badge>
  )
}

export function StepList({ steps }: { steps: WorkflowStep[] }) {
  const s = useStyles()
  return (
    <div className={s.steps}>
      {steps.map((st) => (
        <div key={st.id} className={s.step}>
          {st.status === 'running' ? (
            <Spinner size="extra-tiny" style={{ width: 20, height: 20 }} />
          ) : st.status === 'done' ? (
            <CheckmarkCircle20Filled color={tokens.colorPaletteGreenForeground1} />
          ) : st.status === 'failed' ? (
            <DismissCircle20Filled color={tokens.colorPaletteRedForeground1} />
          ) : (
            <Circle20Regular color={tokens.colorNeutralForeground4} />
          )}
          <div>
            <div style={{ color: st.status === 'skipped' ? tokens.colorNeutralForeground4 : undefined }}>{st.label}</div>
            {st.message && <div className={st.status === 'failed' ? s.stepFail : s.stepMsg}>{st.message}</div>}
          </div>
        </div>
      ))}
    </div>
  )
}

export function ConfirmDialog(props: {
  open: boolean
  title: string
  children: ReactNode
  confirmLabel: string
  danger?: boolean
  busy?: boolean
  onConfirm(): void
  onCancel(): void
}) {
  // Only mount while open: a closed Dialog nested in a Drawer marks the drawer aria-hidden.
  if (!props.open) return null
  return (
    <Dialog open onOpenChange={(_, d) => !d.open && props.onCancel()}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>{props.title}</DialogTitle>
          <DialogContent>{props.children}</DialogContent>
          <DialogActions>
            <Button
              appearance="primary"
              disabled={props.busy}
              onClick={props.onConfirm}
              style={props.danger ? { backgroundColor: tokens.colorPaletteRedBackground3 } : undefined}
            >
              {props.busy ? <Spinner size="tiny" /> : props.confirmLabel}
            </Button>
            <Button onClick={props.onCancel}>Cancel</Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}

export function relTime(iso?: string): string {
  if (!iso) return 'Never'
  const d = (Date.now() - new Date(iso).getTime()) / 1000
  if (d < 60) return 'Just now'
  if (d < 3600) return `${Math.round(d / 60)} min ago`
  if (d < 86400) return `${Math.round(d / 3600)} hr ago`
  const days = Math.round(d / 86400)
  return days === 1 ? 'Yesterday' : `${days} days ago`
}

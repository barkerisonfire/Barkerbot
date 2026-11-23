import { Button, makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import {
  ClipboardTaskListLtr20Regular,
  Home20Regular,
  Navigation20Regular,
  People20Regular,
  PeopleTeam20Regular,
  PersonAdd20Regular,
  PersonArrowRight20Regular,
  Settings20Regular
} from '@fluentui/react-icons'
import type { ReactElement } from 'react'
import { useApp, type Page } from '../AppContext'

const useStyles = makeStyles({
  nav: {
    flexShrink: 0,
    backgroundColor: '#f0f0f0',
    borderRight: `1px solid ${tokens.colorNeutralStroke2}`,
    display: 'flex',
    flexDirection: 'column',
    paddingTop: '4px',
    transition: 'width 120ms ease',
    overflowX: 'hidden'
  },
  open: { width: '228px' },
  closed: { width: '48px' },
  section: {
    fontSize: '12px',
    fontWeight: 600,
    color: tokens.colorNeutralForeground3,
    padding: '14px 16px 4px',
    whiteSpace: 'nowrap'
  },
  item: {
    justifyContent: 'flex-start',
    height: '40px',
    borderRadius: 0,
    fontWeight: 400,
    paddingLeft: '14px',
    whiteSpace: 'nowrap',
    position: 'relative',
    minWidth: 0
  },
  selected: {
    fontWeight: 600,
    backgroundColor: tokens.colorNeutralBackground1,
    '::before': {
      content: '""',
      position: 'absolute',
      left: 0,
      top: '8px',
      bottom: '8px',
      width: '3px',
      borderRadius: '2px',
      backgroundColor: tokens.colorBrandBackground
    }
  },
  spacer: { flex: 1 }
})

const items: { page: Page; label: string; icon: ReactElement; section?: string }[] = [
  { page: 'home', label: 'Home', icon: <Home20Regular /> },
  { page: 'users', label: 'Active users', icon: <People20Regular />, section: 'Directory' },
  { page: 'groups', label: 'Groups', icon: <PeopleTeam20Regular /> },
  { page: 'onboarding', label: 'Onboard a user', icon: <PersonAdd20Regular />, section: 'Lifecycle' },
  { page: 'offboarding', label: 'Offboard a user', icon: <PersonArrowRight20Regular /> },
  { page: 'templates', label: 'Role templates', icon: <ClipboardTaskListLtr20Regular /> }
]

export function NavRail({ open, onToggle }: { open: boolean; onToggle(): void }) {
  const s = useStyles()
  const { page, navigate } = useApp()
  const btn = (p: Page, label: string, icon: ReactElement) => (
    <Button
      key={p}
      appearance="subtle"
      icon={icon}
      className={mergeClasses(s.item, page === p && s.selected)}
      onClick={() => navigate(p)}
      title={label}
      aria-current={page === p ? 'page' : undefined}
    >
      {open && label}
    </Button>
  )
  return (
    <nav className={mergeClasses(s.nav, open ? s.open : s.closed)}>
      <Button appearance="subtle" icon={<Navigation20Regular />} className={s.item} onClick={onToggle} aria-label="Toggle navigation" />
      {items.map((i) => (
        <div key={i.page} style={{ display: 'contents' }}>
          {open && i.section && <div className={s.section}>{i.section}</div>}
          {btn(i.page, i.label, i.icon)}
        </div>
      ))}
      <div className={s.spacer} />
      {btn('settings', 'Settings', <Settings20Regular />)}
    </nav>
  )
}

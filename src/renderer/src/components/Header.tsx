import {
  Avatar,
  Button,
  Input,
  Menu,
  MenuItem,
  MenuList,
  MenuPopover,
  MenuTrigger,
  Tooltip,
  makeStyles
} from '@fluentui/react-components'
import { ArrowSync20Regular, GridDots20Regular, Question20Regular, Search20Regular, Settings20Regular } from '@fluentui/react-icons'
import { useState } from 'react'
import { useApp } from '../AppContext'
import { api } from '../api'
import { HEADER_BG } from '../theme'

const useStyles = makeStyles({
  bar: {
    height: '48px',
    flexShrink: 0,
    backgroundColor: HEADER_BG,
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    paddingRight: '8px'
  },
  waffle: { width: '48px', height: '48px', minWidth: '48px', color: '#fff', borderRadius: 0 },
  title: { fontSize: '16px', fontWeight: 600, paddingLeft: '4px', whiteSpace: 'nowrap' },
  sub: { fontWeight: 400, opacity: 0.9, marginLeft: '6px' },
  searchWrap: { flex: 1, display: 'flex', justifyContent: 'center', padding: '0 16px' },
  search: { width: '100%', maxWidth: '468px' },
  icon: { color: '#fff', minWidth: '40px', height: '40px' },
  demo: {
    fontSize: '12px',
    padding: '2px 8px',
    borderRadius: '10px',
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginRight: '8px',
    whiteSpace: 'nowrap'
  }
})

export function Header() {
  const s = useStyles()
  const { status, navigate, setSearch, search, attempt, reload, refreshStatus } = useApp()
  const [syncing, setSyncing] = useState(false)
  const account = status?.entra.account ?? 'Not signed in'

  const sync = async () => {
    setSyncing(true)
    await attempt(() => api.triggerSync(), 'Delta sync completed')
    setSyncing(false)
    refreshStatus()
    reload()
  }

  return (
    <header className={s.bar}>
      <Button className={s.waffle} appearance="transparent" icon={<GridDots20Regular />} aria-label="App launcher" />
      <div className={s.title}>
        Barkerbot<span className={s.sub}>Admin</span>
      </div>
      <div className={s.searchWrap}>
        <Input
          className={s.search}
          contentBefore={<Search20Regular />}
          placeholder="Search users and groups"
          value={search}
          onChange={(_, d) => setSearch(d.value)}
          onKeyDown={(e) => e.key === 'Enter' && navigate('users')}
          appearance="filled-lighter"
        />
      </div>
      {status?.mode === 'demo' && <span className={s.demo}>Demo tenant</span>}
      <Tooltip content="Run Entra Connect delta sync" relationship="label">
        <Button
          className={s.icon}
          appearance="transparent"
          icon={<ArrowSync20Regular style={syncing ? { animation: 'spin 1s linear infinite' } : undefined} />}
          disabled={syncing || !status?.sync.available}
          onClick={sync}
        />
      </Tooltip>
      <Tooltip content="Settings" relationship="label">
        <Button className={s.icon} appearance="transparent" icon={<Settings20Regular />} onClick={() => navigate('settings')} />
      </Tooltip>
      <Tooltip content="Help" relationship="label">
        <Button className={s.icon} appearance="transparent" icon={<Question20Regular />} />
      </Tooltip>
      <Menu>
        <MenuTrigger disableButtonEnhancement>
          <Button appearance="transparent" className={s.icon} aria-label={account}>
            <Avatar name={account} size={32} color="colorful" />
          </Button>
        </MenuTrigger>
        <MenuPopover>
          <MenuList>
            <MenuItem disabled>{account}</MenuItem>
            {status?.mode === 'live' && (
              <MenuItem onClick={() => attempt(() => api.signIn(), 'Signed in').then(() => { refreshStatus(); reload() })}>
                Sign in again
              </MenuItem>
            )}
            {status?.mode === 'live' && (
              <MenuItem onClick={() => attempt(() => api.signOut(), 'Signed out').then(refreshStatus)}>Sign out</MenuItem>
            )}
            <MenuItem onClick={() => navigate('settings')}>Connection settings</MenuItem>
          </MenuList>
        </MenuPopover>
      </Menu>
    </header>
  )
}

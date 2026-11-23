import { Badge, Button, Card, CardHeader, ProgressBar, Text, makeStyles, tokens } from '@fluentui/react-components'
import {
  ArrowSync20Regular,
  CheckmarkCircle20Filled,
  Cloud20Regular,
  ErrorCircle20Filled,
  Key20Regular,
  PersonAdd20Regular,
  PersonArrowRight20Regular,
  Server20Regular
} from '@fluentui/react-icons'
import { useState } from 'react'
import { useApp } from '../AppContext'
import { api } from '../api'
import { StepList, relTime } from '../components/common'

const useStyles = makeStyles({
  hello: { fontSize: '28px', fontWeight: 600, margin: '8px 0 20px' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '20px' },
  card: { padding: '20px' },
  cardTitle: { fontSize: '16px', fontWeight: 600 },
  stat: { display: 'flex', justifyContent: 'space-between', padding: '6px 0' },
  big: { fontSize: '32px', fontWeight: 600, lineHeight: '40px' },
  tiles: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginTop: '8px' },
  tile: { display: 'flex', flexDirection: 'column' },
  sub: { color: tokens.colorNeutralForeground3, fontSize: '12px' },
  actions: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '4px' },
  conn: { display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0' }
})

export function HomePage() {
  const s = useStyles()
  const { users, licenses, status, navigate, attempt, reload, refreshStatus, history } = useApp()
  const [syncing, setSyncing] = useState(false)
  const count = (src: string) => users.filter((u) => u.source === src).length
  const blocked = users.filter((u) => !u.accountEnabled).length
  const pending = users.filter((u) => u.pendingSync).length
  const wasted = users.filter((u) => !u.accountEnabled && u.licenses.length > 0).length

  const Conn = ({ ok, label, detail, icon }: { ok: boolean; label: string; detail?: string; icon: JSX.Element }) => (
    <div className={s.conn}>
      {icon}
      <div style={{ flex: 1 }}>
        <div>{label}</div>
        <div className={s.sub}>{detail}</div>
      </div>
      {ok ? <CheckmarkCircle20Filled color={tokens.colorPaletteGreenForeground1} /> : <ErrorCircle20Filled color={tokens.colorPaletteRedForeground1} />}
    </div>
  )

  return (
    <>
      <div className={s.hello}>{status?.entra.tenantName ?? 'Barkerbot'}</div>
      <div className={s.grid}>
        <Card className={s.card}>
          <CardHeader header={<Text className={s.cardTitle}>Users</Text>} />
          <div className={s.big}>{users.length}</div>
          <div className={s.tiles}>
            <div className={s.tile}>
              <Text weight="semibold">{count('synced')}</Text>
              <span className={s.sub}>Synced from AD</span>
            </div>
            <div className={s.tile}>
              <Text weight="semibold">{count('cloud')}</Text>
              <span className={s.sub}>Cloud only</span>
            </div>
            <div className={s.tile}>
              <Text weight="semibold">{count('onprem')}</Text>
              <span className={s.sub}>On-prem only</span>
            </div>
          </div>
          <div className={s.stat} style={{ marginTop: 8 }}>
            <span>Sign-in blocked</span>
            <Badge appearance="tint" color={blocked ? 'danger' : 'success'}>
              {blocked}
            </Badge>
          </div>
          <div className={s.stat}>
            <span>Blocked but still licensed</span>
            <Badge appearance="tint" color={wasted ? 'warning' : 'success'}>
              {wasted}
            </Badge>
          </div>
          <Button appearance="transparent" onClick={() => navigate('users')} style={{ alignSelf: 'flex-start', padding: 0 }}>
            Go to active users
          </Button>
        </Card>

        <Card className={s.card}>
          <CardHeader header={<Text className={s.cardTitle}>User management</Text>} />
          <div className={s.actions}>
            <Button appearance="subtle" icon={<PersonAdd20Regular />} onClick={() => navigate('onboarding')}>
              Onboard a user from a template
            </Button>
            <Button appearance="subtle" icon={<PersonArrowRight20Regular />} onClick={() => navigate('offboarding')}>
              Offboard a user
            </Button>
            <Button appearance="subtle" icon={<Key20Regular />} onClick={() => navigate('users')}>
              Reset a password
            </Button>
          </div>
        </Card>

        <Card className={s.card}>
          <CardHeader header={<Text className={s.cardTitle}>Hybrid connection</Text>} />
          <Conn
            ok={!!status?.entra.connected}
            icon={<Cloud20Regular />}
            label="Microsoft Entra ID"
            detail={status?.entra.connected ? status.entra.account : status?.entra.error}
          />
          <Conn
            ok={!!status?.ad.connected}
            icon={<Server20Regular />}
            label="Active Directory"
            detail={status?.ad.connected ? status.ad.domain : status?.ad.error}
          />
          <Conn
            ok={!!status?.sync.available}
            icon={<ArrowSync20Regular />}
            label="Entra Connect"
            detail={`Last delta sync: ${relTime(status?.sync.lastSync)}${pending ? ` · ${pending} change(s) pending` : ''}`}
          />
          <Button
            icon={<ArrowSync20Regular />}
            disabled={syncing || !status?.sync.available}
            style={{ alignSelf: 'flex-start', marginTop: 8 }}
            onClick={async () => {
              setSyncing(true)
              await attempt(() => api.triggerSync(), 'Delta sync completed')
              setSyncing(false)
              refreshStatus()
              reload()
            }}
          >
            {syncing ? 'Syncing…' : 'Sync now'}
          </Button>
        </Card>

        <Card className={s.card}>
          <CardHeader header={<Text className={s.cardTitle}>Licenses</Text>} />
          {licenses.map((l) => (
            <div key={l.skuId} style={{ padding: '4px 0' }}>
              <div className={s.stat} style={{ padding: 0 }}>
                <span>{l.friendlyName}</span>
                <span className={s.sub}>
                  {l.consumed}/{l.total}
                </span>
              </div>
              <ProgressBar
                value={l.total ? l.consumed / l.total : 0}
                color={l.consumed >= l.total ? 'error' : l.consumed / l.total > 0.85 ? 'warning' : 'brand'}
              />
            </div>
          ))}
        </Card>

        {history.length > 0 && (
          <Card className={s.card}>
            <CardHeader header={<Text className={s.cardTitle}>Recent lifecycle runs</Text>} />
            {history.slice(0, 3).map((h) => (
              <div key={h.runId} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Text weight="semibold">
                    {h.kind === 'onboarding' ? 'Onboarded' : 'Offboarded'} {h.subject}
                  </Text>
                  <Badge color={h.success ? 'success' : 'danger'} appearance="tint">
                    {h.success ? 'Completed' : 'Issues'}
                  </Badge>
                </div>
                {!h.success && <StepList steps={h.steps.filter((st) => st.status === 'failed')} />}
              </div>
            ))}
          </Card>
        )}
      </div>
    </>
  )
}

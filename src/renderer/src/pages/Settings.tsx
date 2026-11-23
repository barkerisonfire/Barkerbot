import {
  Button,
  Card,
  Field,
  Input,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Radio,
  RadioGroup,
  Switch,
  Text,
  makeStyles,
  tokens
} from '@fluentui/react-components'
import { useEffect, useState } from 'react'
import type { Settings } from '@shared/types'
import { useApp } from '../AppContext'
import { api, isDesktop } from '../api'
import { PageHeader } from '../components/common'

const useStyles = makeStyles({
  col: { display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '760px' },
  card: { padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' },
  h: { fontSize: '16px', fontWeight: 600 },
  code: { fontFamily: 'Consolas, monospace', fontSize: '12px', color: tokens.colorNeutralForeground2 }
})

export function SettingsPage() {
  const s = useStyles()
  const { settings, setSettings, status, attempt, refreshStatus, reload } = useApp()
  const [f, setF] = useState<Settings | null>(settings)
  useEffect(() => setF(settings), [settings])
  if (!f) return null

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setF({ ...f, [k]: v })
  const dirty = JSON.stringify(f) !== JSON.stringify(settings)

  return (
    <>
      <PageHeader title="Settings" description="Connect Barkerbot to your Entra ID tenant and on-premises Active Directory." />
      <div className={s.col}>
        <Card className={s.card}>
          <Text className={s.h}>Mode</Text>
          <RadioGroup value={f.mode} onChange={(_, d) => set('mode', d.value as Settings['mode'])}>
            <Radio value="demo" label="Demo tenant: sample hybrid data in memory, safe to experiment" />
            <Radio value="live" label="Live: connect to my tenant and domain" disabled={!isDesktop} />
          </RadioGroup>
          {!isDesktop && (
            <MessageBar layout="multiline" intent="info">
              <MessageBarBody>You're in the browser preview. Live mode needs the Windows desktop app.</MessageBarBody>
            </MessageBar>
          )}
        </Card>

        {f.mode === 'live' && (
          <>
            <Card className={s.card}>
              <Text className={s.h}>Microsoft Entra ID</Text>
              <MessageBar layout="multiline" intent="info">
                <MessageBarBody>
                  <MessageBarTitle>App registration</MessageBarTitle>
                  In the Entra admin center, create an app registration with platform <b>Mobile and desktop
                  applications</b> and redirect URI <code>http://localhost</code>. Add these delegated Microsoft Graph
                  permissions, then grant admin consent: User.ReadWrite.All, Group.ReadWrite.All,
                  Directory.ReadWrite.All, AuditLog.Read.All and Organization.Read.All. For mailbox steps, also add
                  Office 365 Exchange Online → Exchange.Manage.
                </MessageBarBody>
              </MessageBar>
              <Field label="Tenant ID">
                <Input value={f.tenantId} onChange={(_, d) => set('tenantId', d.value.trim())} placeholder="00000000-0000-0000-0000-000000000000" />
              </Field>
              <Field label="Application (client) ID">
                <Input value={f.clientId} onChange={(_, d) => set('clientId', d.value.trim())} />
              </Field>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <Button
                  disabled={dirty || !f.tenantId || !f.clientId}
                  onClick={async () => {
                    if (await attempt(() => api.signIn(), 'Signed in')) {
                      await refreshStatus()
                      reload()
                    }
                  }}
                >
                  Sign in
                </Button>
                <Text size={200}>{status?.entra.connected ? `Connected as ${status.entra.account} (${status.entra.tenantName})` : status?.entra.error}</Text>
              </div>
              <Switch
                checked={f.exchangeEnabled}
                onChange={(_, d) => set('exchangeEnabled', d.checked)}
                label="Use Exchange Online PowerShell for mailbox actions (needs the ExchangeOnlineManagement module)"
              />
            </Card>

            <Card className={s.card}>
              <Text className={s.h}>On-premises Active Directory</Text>
              <Switch
                checked={f.adEnabled}
                onChange={(_, d) => set('adEnabled', d.checked)}
                label="Manage on-prem AD (needs RSAT: ActiveDirectory PowerShell module)"
              />
              {f.adEnabled && (
                <>
                  <Field label="Domain controller (optional)" hint="Leave blank to use the nearest DC">
                    <Input value={f.adServer} onChange={(_, d) => set('adServer', d.value)} placeholder="dc01.contoso.local" />
                  </Field>
                  <Field label="Default OU for new users and groups">
                    <Input value={f.defaultOu} onChange={(_, d) => set('defaultOu', d.value)} />
                  </Field>
                  <Field label="Disabled users OU (offboarding)">
                    <Input value={f.disabledOu} onChange={(_, d) => set('disabledOu', d.value)} />
                  </Field>
                  <Field
                    label="Entra Connect server"
                    hint="Runs Start-ADSyncSyncCycle over WinRM. Leave blank if Entra Connect is on this machine."
                  >
                    <Input value={f.syncServer} onChange={(_, d) => set('syncServer', d.value)} placeholder="aadconnect01" />
                  </Field>
                  <Switch
                    checked={f.autoSync}
                    onChange={(_, d) => set('autoSync', d.checked)}
                    label="Run a delta sync automatically 15 seconds after on-prem changes"
                  />
                  <Text size={200}>
                    AD: {status?.ad.connected ? `connected to ${status.ad.domain}` : status?.ad.error ?? 'not checked'}
                  </Text>
                </>
              )}
            </Card>
          </>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <Button appearance="primary" disabled={!dirty} onClick={() => attempt(() => setSettings(f), 'Settings saved')}>
            Save
          </Button>
          <Button disabled={!dirty} onClick={() => setF(settings)}>
            Discard changes
          </Button>
        </div>
      </div>
    </>
  )
}

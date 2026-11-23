import {
  Avatar,
  Button,
  Card,
  Checkbox,
  Field,
  MessageBar,
  MessageBarBody,
  Text,
  makeStyles,
  tokens
} from '@fluentui/react-components'
import { useEffect, useState } from 'react'
import type { OffboardingOptions, WorkflowResult, WorkflowStep } from '@shared/types'
import { useApp } from '../AppContext'
import { api, errMsg } from '../api'
import { ConfirmDialog, PageHeader, SourceBadge, StepList } from '../components/common'
import { Picker } from '../components/Picker'

const useStyles = makeStyles({
  wrap: { display: 'grid', gridTemplateColumns: 'minmax(0, 640px) minmax(0, 420px)', gap: '32px', alignItems: 'start' },
  card: { padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' },
  group: { fontWeight: 600, marginTop: '8px' },
  opt: { marginLeft: '-6px' },
  hint: { fontSize: '12px', color: tokens.colorNeutralForeground3, marginLeft: '28px', marginTop: '-6px' },
  user: { display: 'flex', gap: '12px', alignItems: 'center' }
})

type Toggles = Omit<OffboardingOptions, 'userId' | 'forwardTo'>
const DEFAULTS: Toggles = {
  disableAccount: true,
  resetPassword: true,
  revokeSessions: true,
  removeGroups: true,
  removeLicenses: true,
  convertToShared: true,
  hideFromGal: true,
  moveToDisabledOu: true
}

export function OffboardingPage() {
  const s = useStyles()
  const { users, pageParam, settings, reload, addHistory } = useApp()
  const [userId, setUserId] = useState<string | null>(pageParam ?? null)
  const [opts, setOpts] = useState(DEFAULTS)
  const [forward, setForward] = useState<string | null>(null)
  const [confirm, setConfirm] = useState(false)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<WorkflowStep[]>([])
  const [result, setResult] = useState<WorkflowResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => api.onWorkflowProgress((p) => setProgress(p.steps)), [])
  useEffect(() => {
    if (pageParam) setUserId(pageParam)
  }, [pageParam])

  const user = users.find((u) => u.id === userId)
  const cloud = user && user.source !== 'onprem'
  const ad = user && user.source !== 'cloud'

  const opt = (k: keyof typeof DEFAULTS, label: string, hint?: string, disabled?: boolean) => (
    <>
      <Checkbox className={s.opt} label={label} checked={!disabled && opts[k]} disabled={disabled || running} onChange={(_, d) => setOpts({ ...opts, [k]: !!d.checked })} />
      {hint && <div className={s.hint}>{hint}</div>}
    </>
  )

  const run = async () => {
    setConfirm(false)
    setRunning(true)
    setResult(null)
    setError(null)
    setProgress([])
    try {
      const fwd = users.find((u) => u.id === forward)?.mail
      const r = await api.runOffboarding({ ...opts, userId: userId!, forwardTo: fwd })
      setResult(r)
      setProgress(r.steps)
      addHistory(r)
      reload()
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setRunning(false)
    }
  }

  return (
    <>
      <PageHeader
        crumb={[{ label: 'Active users', page: 'users' }]}
        title="Offboard a user"
        description="Securely remove a leaver's access. Steps run in the right order: block sign-in first, convert the mailbox before removing licenses, then sync."
      />
      <div className={s.wrap}>
        <Card className={s.card}>
          <Field label="User to offboard" required>
            <Picker
              value={userId}
              onChange={(id) => {
                setUserId(id)
                setResult(null)
                setProgress([])
              }}
              placeholder="Search for a user"
              items={users.map((u) => ({ id: u.id, label: u.displayName, secondary: u.userPrincipalName }))}
            />
          </Field>
          {user && (
            <div className={s.user}>
              <Avatar name={user.displayName} size={40} color="colorful" />
              <div>
                <Text weight="semibold">{user.displayName}</Text>
                <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
                  <SourceBadge source={user.source} />
                  <Text size={200}>
                    {user.licenses.length} license(s) · {user.groupIds.length} group(s)
                  </Text>
                </div>
              </div>
            </div>
          )}

          <div className={s.group}>Account</div>
          {opt('disableAccount', 'Block sign-in', ad ? 'Disables the AD account. Entra ID follows on the next sync.' : undefined)}
          {opt('resetPassword', 'Reset password to a random value')}
          {opt('revokeSessions', 'Sign out of all Microsoft 365 sessions', undefined, !cloud)}
          {opt('moveToDisabledOu', 'Move to the disabled users OU', settings?.disabledOu, !ad)}

          <div className={s.group}>Email</div>
          {opt('convertToShared', 'Convert mailbox to a shared mailbox', 'Keeps the mail without a license (under 50 GB)', !cloud)}
          {opt('hideFromGal', 'Hide from the global address list')}
          <Field label="Forward new email to (optional)">
            <Picker
              clearable
              value={forward}
              onChange={setForward}
              placeholder="Choose a recipient"
              items={users.filter((u) => u.id !== userId && u.mail).map((u) => ({ id: u.id, label: u.displayName, secondary: u.mail }))}
            />
          </Field>

          <div className={s.group}>Access</div>
          {opt('removeGroups', 'Remove from all groups', 'Cloud groups via Entra ID, AD groups via Active Directory')}
          {opt('removeLicenses', 'Remove all licenses and free them up', undefined, !cloud)}

          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <Button appearance="primary" disabled={!user || running} onClick={() => setConfirm(true)}>
              Offboard user
            </Button>
          </div>
        </Card>

        {(running || progress.length > 0 || error) && (
          <Card className={s.card}>
            <Text weight="semibold" size={400}>
              {running ? 'Offboarding…' : result?.success ? 'Offboarding complete' : 'Finished with issues'}
            </Text>
            {error && (
              <MessageBar layout="multiline" intent="error">
                <MessageBarBody>{error}</MessageBarBody>
              </MessageBar>
            )}
            <StepList steps={progress} />
          </Card>
        )}
      </div>

      <ConfirmDialog
        open={confirm}
        title={`Offboard ${user?.displayName}?`}
        confirmLabel="Offboard"
        danger
        onCancel={() => setConfirm(false)}
        onConfirm={run}
      >
        This immediately removes {user?.displayName}'s access. Groups and licenses that are removed aren't restored
        automatically.
      </ConfirmDialog>
    </>
  )
}

import {
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Field,
  Input,
  MessageBar,
  MessageBarBody,
  Spinner
} from '@fluentui/react-components'
import { Copy20Regular } from '@fluentui/react-icons'
import { useState } from 'react'
import type { DirUser } from '@shared/types'
import { generatePassword } from '@shared/password'
import { useApp } from '../AppContext'
import { api, errMsg } from '../api'

export function ResetPasswordDialog({ users, onClose }: { users: DirUser[]; onClose(): void }) {
  const { reload, notify } = useApp()
  const [auto, setAuto] = useState(true)
  const [pw, setPw] = useState('')
  const [force, setForce] = useState(true)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<{ user: string; password: string }[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = async () => {
    setBusy(true)
    setError(null)
    const results: { user: string; password: string }[] = []
    try {
      for (const u of users) {
        const p = auto ? generatePassword() : pw
        await api.resetPassword(u.id, p, force)
        results.push({ user: u.userPrincipalName, password: p })
      }
      setDone(results)
      reload()
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  const where = users.some((u) => u.source !== 'cloud') ? ' Synced users are reset in Active Directory.' : ''

  return (
    <Dialog open onOpenChange={(_, d) => !d.open && onClose()}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>Reset password{users.length > 1 ? ` for ${users.length} users` : ` for ${users[0].displayName}`}</DialogTitle>
          <DialogContent style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {error && (
              <MessageBar layout="multiline" intent="error">
                <MessageBarBody>{error}</MessageBarBody>
              </MessageBar>
            )}
            {done ? (
              done.map((r) => (
                <Field key={r.user} label={r.user}>
                  <Input
                    readOnly
                    value={r.password}
                    contentAfter={
                      <Button
                        appearance="transparent"
                        icon={<Copy20Regular />}
                        size="small"
                        onClick={() => {
                          navigator.clipboard.writeText(r.password)
                          notify('Copied to clipboard')
                        }}
                      />
                    }
                  />
                </Field>
              ))
            ) : (
              <>
                <Checkbox checked={auto} onChange={(_, d) => setAuto(!!d.checked)} label="Automatically create a password" />
                {!auto && (
                  <Field label="Password" required hint="At least 8 characters with upper, lower, number and symbol">
                    <Input type="password" value={pw} onChange={(_, d) => setPw(d.value)} />
                  </Field>
                )}
                <Checkbox
                  checked={force}
                  onChange={(_, d) => setForce(!!d.checked)}
                  label="Require this user to change their password when they first sign in"
                />
                <span style={{ fontSize: 12 }}>{where}</span>
              </>
            )}
          </DialogContent>
          <DialogActions>
            {done ? (
              <Button appearance="primary" onClick={onClose}>
                Close
              </Button>
            ) : (
              <>
                <Button appearance="primary" disabled={busy || (!auto && pw.length < 8)} onClick={run}>
                  {busy ? <Spinner size="tiny" /> : 'Reset password'}
                </Button>
                <Button onClick={onClose}>Cancel</Button>
              </>
            )}
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}

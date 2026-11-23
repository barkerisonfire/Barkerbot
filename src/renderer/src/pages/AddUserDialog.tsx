import {
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Dropdown,
  Field,
  Input,
  MessageBar,
  MessageBarBody,
  Option,
  Radio,
  RadioGroup,
  Spinner,
  makeStyles
} from '@fluentui/react-components'
import { useState } from 'react'
import type { NewUserInput } from '@shared/types'
import { generatePassword } from '@shared/password'
import { useApp } from '../AppContext'
import { api, errMsg } from '../api'

const useStyles = makeStyles({
  form: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px' },
  full: { gridColumn: '1 / -1' },
  upn: { display: 'flex', gap: '4px', alignItems: 'center' }
})

export function AddUserDialog({ onClose }: { onClose(): void }) {
  const s = useStyles()
  const { status, settings, reload, notify } = useApp()
  const domains = status?.domains ?? []
  const [target, setTarget] = useState<'cloud' | 'onprem'>(status?.ad.connected ? 'onprem' : 'cloud')
  const [f, setF] = useState({
    givenName: '',
    surname: '',
    displayName: '',
    alias: '',
    domain: domains[0] ?? '',
    jobTitle: '',
    department: '',
    officeLocation: '',
    usageLocation: 'GB',
    ou: settings?.defaultOu ?? ''
  })
  const [autoPw, setAutoPw] = useState(true)
  const [pw, setPw] = useState('')
  const [force, setForce] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<{ upn: string; password: string } | null>(null)

  const set = (k: keyof typeof f) => (_: unknown, d: { value: string }) =>
    setF((prev) => {
      const next = { ...prev, [k]: d.value }
      if (k === 'givenName' || k === 'surname') {
        next.displayName = `${next.givenName} ${next.surname}`.trim()
        next.alias = `${next.givenName}${next.surname ? '.' + next.surname : ''}`.toLowerCase().replace(/[^a-z0-9.]/g, '')
      }
      return next
    })

  const submit = async () => {
    setBusy(true)
    setError(null)
    const password = autoPw ? generatePassword() : pw
    const input: NewUserInput = { ...f, target, password, forceChangePassword: force }
    try {
      await api.createUser(input)
      setCreated({ upn: `${f.alias}@${f.domain}`, password })
      notify('User added', target === 'onprem' ? 'Created in Active Directory. It appears in Entra ID after the next sync.' : undefined)
      reload()
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  const valid = f.givenName && f.displayName && f.alias && f.domain && (autoPw || pw.length >= 8)

  return (
    <Dialog open onOpenChange={(_, d) => !d.open && onClose()}>
      <DialogSurface style={{ maxWidth: 680 }}>
        <DialogBody>
          <DialogTitle>Add a user</DialogTitle>
          <DialogContent>
            {created ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <MessageBar layout="multiline" intent="success">
                  <MessageBarBody>{created.upn} was created.</MessageBarBody>
                </MessageBar>
                <Field label="Temporary password">
                  <Input readOnly value={created.password} />
                </Field>
              </div>
            ) : (
              <div className={s.form}>
                {error && (
                  <MessageBar layout="multiline" intent="error" className={s.full}>
                    <MessageBarBody>{error}</MessageBarBody>
                  </MessageBar>
                )}
                <Field label="Where should this account live?" className={s.full}>
                  <RadioGroup layout="horizontal" value={target} onChange={(_, d) => setTarget(d.value as 'cloud' | 'onprem')}>
                    <Radio value="onprem" label="On-prem AD (synced to Entra ID)" disabled={!status?.ad.connected} />
                    <Radio value="cloud" label="Cloud only (Entra ID)" disabled={!status?.entra.connected} />
                  </RadioGroup>
                </Field>
                <Field label="First name" required>
                  <Input value={f.givenName} onChange={set('givenName')} />
                </Field>
                <Field label="Last name">
                  <Input value={f.surname} onChange={set('surname')} />
                </Field>
                <Field label="Display name" required className={s.full}>
                  <Input value={f.displayName} onChange={set('displayName')} />
                </Field>
                <Field label="Username" required className={s.full}>
                  <div className={s.upn}>
                    <Input value={f.alias} onChange={set('alias')} style={{ flex: 1 }} />
                    <span>@</span>
                    <Dropdown
                      value={f.domain}
                      selectedOptions={[f.domain]}
                      onOptionSelect={(_, d) => setF({ ...f, domain: d.optionValue! })}
                      style={{ minWidth: 220 }}
                    >
                      {domains.map((d) => (
                        <Option key={d}>{d}</Option>
                      ))}
                    </Dropdown>
                  </div>
                </Field>
                {target === 'onprem' && (
                  <Field label="Organizational unit" className={s.full} hint="Must be in Entra Connect sync scope to reach the cloud">
                    <Input value={f.ou} onChange={set('ou')} />
                  </Field>
                )}
                <Field label="Job title">
                  <Input value={f.jobTitle} onChange={set('jobTitle')} />
                </Field>
                <Field label="Department">
                  <Input value={f.department} onChange={set('department')} />
                </Field>
                <Field label="Office">
                  <Input value={f.officeLocation} onChange={set('officeLocation')} />
                </Field>
                <Field label="Usage location" hint="Two-letter country code, needed for licensing">
                  <Input value={f.usageLocation} onChange={set('usageLocation')} maxLength={2} />
                </Field>
                <Checkbox className={s.full} checked={autoPw} onChange={(_, d) => setAutoPw(!!d.checked)} label="Automatically create a password" />
                {!autoPw && (
                  <Field label="Password" required className={s.full}>
                    <Input type="password" value={pw} onChange={(_, d) => setPw(d.value)} />
                  </Field>
                )}
                <Checkbox
                  className={s.full}
                  checked={force}
                  onChange={(_, d) => setForce(!!d.checked)}
                  label="Require this user to change their password when they first sign in"
                />
              </div>
            )}
          </DialogContent>
          <DialogActions>
            {created ? (
              <Button appearance="primary" onClick={onClose}>
                Close
              </Button>
            ) : (
              <>
                <Button appearance="primary" disabled={!valid || busy} onClick={submit}>
                  {busy ? <Spinner size="tiny" /> : 'Add user'}
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

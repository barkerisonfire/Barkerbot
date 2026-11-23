import {
  Avatar,
  Button,
  Checkbox,
  DrawerBody,
  DrawerHeader,
  DrawerHeaderTitle,
  Field,
  Input,
  Link,
  MessageBar,
  MessageBarBody,
  OverlayDrawer,
  ProgressBar,
  Spinner,
  Tab,
  TabList,
  makeStyles,
  tokens
} from '@fluentui/react-components'
import {
  Delete20Regular,
  Dismiss24Regular,
  Edit20Regular,
  Key20Regular,
  LockOpen20Regular,
  Prohibited20Regular,
  SignOut20Regular
} from '@fluentui/react-icons'
import { useEffect, useState } from 'react'
import type { DirUser, UserPatch } from '@shared/types'
import { useApp } from '../AppContext'
import { api } from '../api'
import { ConfirmDialog, SourceBadge, StatusBadge, relTime } from '../components/common'
import { Picker } from '../components/Picker'

const useStyles = makeStyles({
  head: { display: 'flex', gap: '16px', alignItems: 'center', marginBottom: '12px' },
  name: { fontSize: '20px', fontWeight: 600 },
  upn: { color: tokens.colorNeutralForeground2 },
  actions: { display: 'flex', flexWrap: 'wrap', gap: '4px', margin: '4px 0 12px' },
  section: { padding: '16px 0', display: 'flex', flexDirection: 'column', gap: '12px' },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px' },
  prop: { display: 'flex', flexDirection: 'column', gap: '2px' },
  label: { fontWeight: 600, fontSize: '14px' },
  value: { color: tokens.colorNeutralForeground2, wordBreak: 'break-all' },
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 0',
    borderBottom: `1px solid ${tokens.colorNeutralStroke3}`
  }
})

type TabId = 'account' | 'licenses' | 'groups' | 'onprem'

export function UserPanel({ userId, onClose, onResetPassword }: { userId: string; onClose(): void; onResetPassword(u: DirUser): void }) {
  const s = useStyles()
  const { users, groups, licenses, attempt, reload, navigate } = useApp()
  const [user, setUser] = useState<DirUser | null>(null)
  const [tab, setTab] = useState<TabId>('account')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<UserPatch & { managerId?: string | null }>({})
  const [lic, setLic] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [addGroup, setAddGroup] = useState<string | null>(null)

  const load = async () => {
    const u = await api.getUser(userId)
    setUser(u)
    setLic(new Set(u.licenses))
  }
  useEffect(() => {
    load().catch(() => onClose())
  }, [userId])

  const act = async (fn: () => Promise<unknown>, msg: string) => {
    setBusy(true)
    const ok = await attempt(fn, msg)
    setBusy(false)
    if (ok) {
      await load()
      reload()
    }
    return ok
  }

  if (!user)
    return (
null
    )

  const manager = users.find((u) => u.id === user.managerId)
  const memberOf = groups.filter((g) => user.groupIds.includes(g.id))
  const joinable = groups.filter(
    (g) =>
      !user.groupIds.includes(g.id) &&
      (g.source === 'cloud' ? user.source !== 'onprem' : user.source !== 'cloud')
  )
  const fields: [keyof UserPatch, string][] = [
    ['displayName', 'Display name'],
    ['givenName', 'First name'],
    ['surname', 'Last name'],
    ['jobTitle', 'Job title'],
    ['department', 'Department'],
    ['officeLocation', 'Office'],
    ['mobilePhone', 'Mobile phone'],
    ['usageLocation', 'Usage location']
  ]

  const saveEdits = async () => {
    const { managerId, ...patch } = draft
    const changed = Object.fromEntries(Object.entries(patch).filter(([k, v]) => (user as any)[k] !== v)) as UserPatch
    const ok = await act(async () => {
      if (Object.keys(changed).length) await api.updateUser(user.id, changed)
      if (managerId !== undefined && managerId !== (user.managerId ?? null)) await api.setManager(user.id, managerId)
    }, 'Changes saved')
    if (ok) setEditing(false)
  }

  const saveLicenses = () => {
    const add = [...lic].filter((l) => !user.licenses.includes(l))
    const remove = user.licenses.filter((l) => !lic.has(l))
    return act(() => api.setUserLicenses(user.id, add, remove), 'Licenses updated')
  }

  return (
    <PanelShell onClose={onClose}>
      <DrawerHeader>
        <DrawerHeaderTitle action={<Button appearance="subtle" icon={<Dismiss24Regular />} onClick={onClose} aria-label="Close" />}>
          <span />
        </DrawerHeaderTitle>
        <div className={s.head}>
          <Avatar name={user.displayName} size={72} color="colorful" />
          <div>
            <div className={s.name}>{user.displayName}</div>
            <div className={s.upn}>{user.userPrincipalName}</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <SourceBadge source={user.source} pending={user.pendingSync} />
              <StatusBadge enabled={user.accountEnabled} />
            </div>
          </div>
        </div>
        <div className={s.actions}>
          <Button appearance="subtle" icon={<Key20Regular />} onClick={() => onResetPassword(user)} disabled={busy}>
            Reset password
          </Button>
          {user.accountEnabled ? (
            <Button appearance="subtle" icon={<Prohibited20Regular />} disabled={busy} onClick={() => act(() => api.setUserEnabled(user.id, false), 'Sign-in blocked')}>
              Block sign-in
            </Button>
          ) : (
            <Button appearance="subtle" icon={<LockOpen20Regular />} disabled={busy} onClick={() => act(() => api.setUserEnabled(user.id, true), 'Sign-in unblocked')}>
              Unblock sign-in
            </Button>
          )}
          {user.source !== 'onprem' && (
            <Button appearance="subtle" icon={<SignOut20Regular />} disabled={busy} onClick={() => act(() => api.revokeSessions(user.id), 'Signed out of all sessions')}>
              Sign out of all sessions
            </Button>
          )}
          <Button appearance="subtle" icon={<Delete20Regular />} disabled={busy} onClick={() => setConfirmDelete(true)}>
            Delete user
          </Button>
        </div>
        <TabList selectedValue={tab} onTabSelect={(_, d) => setTab(d.value as TabId)}>
          <Tab value="account">Account</Tab>
          <Tab value="licenses" disabled={user.source === 'onprem'}>
            Licenses and apps
          </Tab>
          <Tab value="groups">Groups</Tab>
          {user.source !== 'cloud' && <Tab value="onprem">On-premises</Tab>}
        </TabList>
        {busy && <ProgressBar thickness="medium" />}
      </DrawerHeader>

      <DrawerBody>
        {tab === 'account' && (
          <div className={s.section}>
            {user.source === 'synced' && (
              <MessageBar layout="multiline" intent="info">
                <MessageBarBody>
                  This user is synced from on-premises AD. Changes here are written to Active Directory, then synced to
                  Entra ID by Entra Connect.
                </MessageBarBody>
              </MessageBar>
            )}
            {!editing ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <Button
                    icon={<Edit20Regular />}
                    appearance="subtle"
                    onClick={() => {
                      setDraft({ ...Object.fromEntries(fields.map(([k]) => [k, user[k] ?? ''])), managerId: user.managerId ?? null })
                      setEditing(true)
                    }}
                  >
                    Manage contact information
                  </Button>
                </div>
                <div className={s.grid}>
                  {fields.map(([k, label]) => (
                    <div key={k} className={s.prop}>
                      <span className={s.label}>{label}</span>
                      <span className={s.value}>{user[k] || '—'}</span>
                    </div>
                  ))}
                  <div className={s.prop}>
                    <span className={s.label}>Manager</span>
                    <span className={s.value}>{manager?.displayName ?? '—'}</span>
                  </div>
                  <div className={s.prop}>
                    <span className={s.label}>Last sign-in</span>
                    <span className={s.value}>{relTime(user.lastSignInDateTime)}</span>
                  </div>
                  <div className={s.prop}>
                    <span className={s.label}>Created</span>
                    <span className={s.value}>{user.createdDateTime ? new Date(user.createdDateTime).toLocaleDateString() : '—'}</span>
                  </div>
                </div>
                <Link onClick={() => navigate('offboarding', user.id)}>Offboard this user…</Link>
              </>
            ) : (
              <>
                <div className={s.grid}>
                  {fields.map(([k, label]) => (
                    <Field key={k} label={label}>
                      <Input value={(draft[k] as string) ?? ''} onChange={(_, d) => setDraft({ ...draft, [k]: d.value })} />
                    </Field>
                  ))}
                  <Field label="Manager" style={{ gridColumn: '1 / -1' }}>
                    <Picker
                      clearable
                      value={draft.managerId}
                      onChange={(id) => setDraft({ ...draft, managerId: id })}
                      items={users.filter((u) => u.id !== user.id).map((u) => ({ id: u.id, label: u.displayName, secondary: u.userPrincipalName }))}
                    />
                  </Field>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button appearance="primary" onClick={saveEdits} disabled={busy}>
                    Save changes
                  </Button>
                  <Button onClick={() => setEditing(false)}>Cancel</Button>
                </div>
              </>
            )}
          </div>
        )}

        {tab === 'licenses' && (
          <div className={s.section}>
            {!user.usageLocation && (
              <MessageBar layout="multiline" intent="warning">
                <MessageBarBody>Set a usage location on the Account tab before assigning licenses.</MessageBarBody>
              </MessageBar>
            )}
            {licenses.map((l) => {
              const available = l.total - l.consumed
              return (
                <div key={l.skuId} className={s.row}>
                  <Checkbox
                    checked={lic.has(l.skuPartNumber)}
                    label={l.friendlyName}
                    disabled={!lic.has(l.skuPartNumber) && available <= 0}
                    onChange={(_, d) => {
                      const n = new Set(lic)
                      d.checked ? n.add(l.skuPartNumber) : n.delete(l.skuPartNumber)
                      setLic(n)
                    }}
                  />
                  <span className={s.value}>
                    {available} of {l.total} available
                  </span>
                </div>
              )
            })}
            <div>
              <Button appearance="primary" onClick={saveLicenses} disabled={busy}>
                Save changes
              </Button>
            </div>
          </div>
        )}

        {tab === 'groups' && (
          <div className={s.section}>
            <div style={{ display: 'flex', gap: 8 }}>
              <Picker
                style={{ flex: 1 }}
                placeholder="Add to a group…"
                value={addGroup}
                onChange={setAddGroup}
                items={joinable.map((g) => ({ id: g.id, label: g.displayName, secondary: g.source === 'cloud' ? 'Cloud group' : 'AD group' }))}
              />
              <Button
                appearance="primary"
                disabled={!addGroup || busy}
                onClick={async () => {
                  if (await act(() => api.addGroupMember(addGroup!, user.id), 'Added to group')) setAddGroup(null)
                }}
              >
                Add
              </Button>
            </div>
            {memberOf.length === 0 && <span className={s.value}>Not a member of any groups.</span>}
            {memberOf.map((g) => (
              <div key={g.id} className={s.row}>
                <div>
                  <div>{g.displayName}</div>
                  <SourceBadge source={g.source} />
                </div>
                <Button size="small" disabled={busy} onClick={() => act(() => api.removeGroupMember(g.id, user.id), `Removed from ${g.displayName}`)}>
                  Remove
                </Button>
              </div>
            ))}
          </div>
        )}

        {tab === 'onprem' && (
          <div className={s.section}>
            <div className={s.grid}>
              {(
                [
                  ['sAMAccountName', user.samAccountName],
                  ['Distinguished name', user.distinguishedName],
                  ['AD object GUID', user.adGuid],
                  ['Entra object ID', user.entraId ?? 'Not synced']
                ] as const
              ).map(([k, v]) => (
                <div key={k} className={s.prop} style={k === 'Distinguished name' ? { gridColumn: '1 / -1' } : undefined}>
                  <span className={s.label}>{k}</span>
                  <span className={s.value}>{v || '—'}</span>
                </div>
              ))}
            </div>
            {user.source === 'onprem' && (
              <MessageBar layout="multiline" intent="warning">
                <MessageBarBody>
                  This account isn't in Entra ID. If its OU is in sync scope, run a delta sync to create it in the cloud.
                </MessageBarBody>
              </MessageBar>
            )}
            <div>
              <Button onClick={() => act(() => api.triggerSync(), 'Delta sync completed')} disabled={busy}>
                Run delta sync now
              </Button>
            </div>
          </div>
        )}
      </DrawerBody>

      <ConfirmDialog
        open={confirmDelete}
        title={`Delete ${user.displayName}?`}
        confirmLabel="Delete user"
        danger
        busy={busy}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          setBusy(true)
          const ok = await attempt(() => api.deleteUser(user.id), 'User deleted')
          setBusy(false)
          if (ok) {
            reload()
            onClose()
          }
        }}
      >
        {user.source === 'cloud'
          ? 'The user goes to deleted users and can be restored for 30 days.'
          : 'The AD account is deleted. The Entra ID object is removed on the next sync.'}
      </ConfirmDialog>
    </PanelShell>
  )
}

/** Single drawer instance for both loading and loaded states (avoids remounting the modal). */
function PanelShell({ onClose, children }: { onClose(): void; children: React.ReactNode }) {
  return (
    <OverlayDrawer open position="end" size="medium" style={{ width: 620 }} onOpenChange={(_, d) => !d.open && onClose()}>
      {children}
    </OverlayDrawer>
  )
}

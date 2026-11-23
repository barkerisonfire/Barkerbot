import {
  Avatar,
  Body1,
  Button,
  DataGrid,
  DataGridBody,
  DataGridCell,
  DataGridHeader,
  DataGridHeaderCell,
  DataGridRow,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  DrawerBody,
  DrawerHeader,
  DrawerHeaderTitle,
  Dropdown,
  Field,
  Input,
  Link,
  MessageBar,
  MessageBarBody,
  Option,
  OverlayDrawer,
  Radio,
  RadioGroup,
  Spinner,
  TableCellLayout,
  Textarea,
  Toolbar,
  ToolbarButton,
  createTableColumn,
  makeStyles,
  tokens,
  type TableColumnDefinition
} from '@fluentui/react-components'
import { Add20Regular, ArrowClockwise20Regular, Dismiss24Regular, PeopleTeam20Regular, Search20Regular } from '@fluentui/react-icons'
import { useEffect, useMemo, useState } from 'react'
import type { DirGroup, DirUser, GroupType, NewGroupInput } from '@shared/types'
import { useApp } from '../AppContext'
import { api, errMsg } from '../api'
import { PageHeader, SourceBadge } from '../components/common'
import { Picker } from '../components/Picker'

const TYPE_LABEL: Record<GroupType, string> = {
  m365: 'Microsoft 365',
  security: 'Security',
  distribution: 'Distribution list',
  mailSecurity: 'Mail-enabled security'
}

const useStyles = makeStyles({
  bar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    marginBottom: '4px'
  },
  right: { display: 'flex', alignItems: 'center', gap: '12px' },
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 0',
    borderBottom: `1px solid ${tokens.colorNeutralStroke3}`
  },
  sub: { fontSize: '12px', color: tokens.colorNeutralForeground3 }
})

export function GroupsPage() {
  const s = useStyles()
  const { groups, loading, reload } = useApp()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const items = useMemo(
    () =>
      groups
        .filter((g) => !q || g.displayName.toLowerCase().includes(q.toLowerCase()) || g.mail?.includes(q.toLowerCase()))
        .sort((a, b) => a.displayName.localeCompare(b.displayName)),
    [groups, q]
  )

  const columns: TableColumnDefinition<DirGroup>[] = [
    createTableColumn<DirGroup>({
      columnId: 'name',
      compare: (a, b) => a.displayName.localeCompare(b.displayName),
      renderHeaderCell: () => 'Group name',
      renderCell: (g) => (
        <TableCellLayout media={<Avatar icon={<PeopleTeam20Regular />} shape="square" size={28} color="brand" />}>
          <Link onClick={() => setOpen(g.id)}>{g.displayName}</Link>
        </TableCellLayout>
      )
    }),
    createTableColumn<DirGroup>({
      columnId: 'mail',
      renderHeaderCell: () => 'Email',
      renderCell: (g) => <TableCellLayout truncate>{g.mail ?? ''}</TableCellLayout>
    }),
    createTableColumn<DirGroup>({
      columnId: 'type',
      compare: (a, b) => a.groupType.localeCompare(b.groupType),
      renderHeaderCell: () => 'Group type',
      renderCell: (g) => TYPE_LABEL[g.groupType]
    }),
    createTableColumn<DirGroup>({
      columnId: 'source',
      compare: (a, b) => a.source.localeCompare(b.source),
      renderHeaderCell: () => 'Source',
      renderCell: (g) => <SourceBadge source={g.source} />
    }),
    createTableColumn<DirGroup>({
      columnId: 'members',
      compare: (a, b) => a.memberCount - b.memberCount,
      renderHeaderCell: () => 'Members',
      renderCell: (g) => g.memberCount
    })
  ]

  return (
    <>
      <PageHeader title="Groups" description="Microsoft 365, security and distribution groups, from Entra ID and on-premises AD." />
      <div className={s.bar}>
        <Toolbar>
          <ToolbarButton icon={<Add20Regular />} onClick={() => setAdding(true)}>
            Add a group
          </ToolbarButton>
          <ToolbarButton icon={<ArrowClockwise20Regular />} onClick={reload}>
            Refresh
          </ToolbarButton>
        </Toolbar>
        <div className={s.right}>
          {loading ? <Spinner size="tiny" /> : <Body1>{items.length} items</Body1>}
          <Input contentBefore={<Search20Regular />} placeholder="Search groups" value={q} onChange={(_, d) => setQ(d.value)} appearance="underline" />
        </div>
      </div>
      <DataGrid items={items} columns={columns} sortable getRowId={(g: DirGroup) => g.id} size="medium">
        <DataGridHeader>
          <DataGridRow>{({ renderHeaderCell }) => <DataGridHeaderCell>{renderHeaderCell()}</DataGridHeaderCell>}</DataGridRow>
        </DataGridHeader>
        <DataGridBody<DirGroup>>
          {({ item, rowId }) => (
            <DataGridRow<DirGroup> key={rowId}>{({ renderCell }) => <DataGridCell>{renderCell(item)}</DataGridCell>}</DataGridRow>
          )}
        </DataGridBody>
      </DataGrid>
      {open && <GroupPanel groupId={open} onClose={() => setOpen(null)} />}
      {adding && <AddGroupDialog onClose={() => setAdding(false)} />}
    </>
  )
}

function GroupPanel({ groupId, onClose }: { groupId: string; onClose(): void }) {
  const s = useStyles()
  const { groups, users, attempt, reload } = useApp()
  const group = groups.find((g) => g.id === groupId)!
  const [members, setMembers] = useState<DirUser[] | null>(null)
  const [pick, setPick] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = () => api.getGroupMembers(groupId).then(setMembers)
  useEffect(() => {
    load()
  }, [groupId])

  const act = async (fn: () => Promise<unknown>, msg: string) => {
    setBusy(true)
    if (await attempt(fn, msg)) {
      await load()
      reload()
    }
    setBusy(false)
  }

  const eligible = users.filter(
    (u) =>
      !members?.some((m) => m.id === u.id) && (group.source === 'cloud' ? u.source !== 'onprem' : u.source !== 'cloud')
  )

  return (
    <OverlayDrawer open position="end" size="medium" onOpenChange={(_, d) => !d.open && onClose()}>
      <DrawerHeader>
        <DrawerHeaderTitle action={<Button appearance="subtle" icon={<Dismiss24Regular />} onClick={onClose} />}>
          {group.displayName}
        </DrawerHeaderTitle>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <SourceBadge source={group.source} />
          <span className={s.sub}>{TYPE_LABEL[group.groupType]}</span>
        </div>
        {group.description && <Body1 style={{ marginTop: 8 }}>{group.description}</Body1>}
        {group.distinguishedName && <div className={s.sub} style={{ marginTop: 4 }}>{group.distinguishedName}</div>}
      </DrawerHeader>
      <DrawerBody>
        {group.source === 'synced' && (
          <MessageBar layout="multiline" intent="info" style={{ marginBottom: 12 }}>
            <MessageBarBody>Membership of this group is managed in on-prem AD and synced to Entra ID.</MessageBarBody>
          </MessageBar>
        )}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <Picker
            style={{ flex: 1 }}
            placeholder="Add a member…"
            value={pick}
            onChange={setPick}
            items={eligible.map((u) => ({ id: u.id, label: u.displayName, secondary: u.userPrincipalName }))}
          />
          <Button
            appearance="primary"
            disabled={!pick || busy}
            onClick={() => act(() => api.addGroupMember(groupId, pick!), 'Member added').then(() => setPick(null))}
          >
            Add
          </Button>
        </div>
        <h3 style={{ margin: '8px 0' }}>Members ({members?.length ?? '…'})</h3>
        {!members ? (
          <Spinner />
        ) : (
          members.map((m) => (
            <div key={m.id} className={s.row}>
              <TableCellLayout media={<Avatar name={m.displayName} size={28} color="colorful" />} description={m.userPrincipalName}>
                {m.displayName}
              </TableCellLayout>
              <Button size="small" disabled={busy} onClick={() => act(() => api.removeGroupMember(groupId, m.id), 'Member removed')}>
                Remove
              </Button>
            </div>
          ))
        )}
      </DrawerBody>
    </OverlayDrawer>
  )
}

function AddGroupDialog({ onClose }: { onClose(): void }) {
  const { status, settings, reload, notify } = useApp()
  const [f, setF] = useState<NewGroupInput>({
    target: 'cloud',
    displayName: '',
    description: '',
    groupType: 'security',
    mailNickname: '',
    ou: settings?.defaultOu
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const types: GroupType[] = f.target === 'cloud' ? ['security', 'm365'] : ['security', 'distribution']

  const submit = async () => {
    setBusy(true)
    try {
      await api.createGroup(f)
      notify('Group created', f.displayName)
      reload()
      onClose()
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(_, d) => !d.open && onClose()}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>Add a group</DialogTitle>
          <DialogContent style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {error && (
              <MessageBar layout="multiline" intent="error">
                <MessageBarBody>{error}</MessageBarBody>
              </MessageBar>
            )}
            <Field label="Create in">
              <RadioGroup
                layout="horizontal"
                value={f.target}
                onChange={(_, d) => setF({ ...f, target: d.value as 'cloud' | 'onprem', groupType: 'security' })}
              >
                <Radio value="cloud" label="Entra ID" disabled={!status?.entra.connected} />
                <Radio value="onprem" label="On-prem AD" disabled={!status?.ad.connected} />
              </RadioGroup>
            </Field>
            <Field label="Group type">
              <Dropdown
                value={TYPE_LABEL[f.groupType]}
                selectedOptions={[f.groupType]}
                onOptionSelect={(_, d) => setF({ ...f, groupType: d.optionValue as GroupType })}
              >
                {types.map((t) => (
                  <Option key={t} value={t}>
                    {TYPE_LABEL[t]}
                  </Option>
                ))}
              </Dropdown>
            </Field>
            <Field label="Name" required>
              <Input
                value={f.displayName}
                onChange={(_, d) => setF({ ...f, displayName: d.value, mailNickname: d.value.replace(/[^A-Za-z0-9-]/g, '') })}
              />
            </Field>
            <Field label={f.target === 'onprem' ? 'sAMAccountName' : 'Mail nickname'} required>
              <Input value={f.mailNickname} onChange={(_, d) => setF({ ...f, mailNickname: d.value })} />
            </Field>
            {f.target === 'onprem' && (
              <Field label="Organizational unit">
                <Input value={f.ou ?? ''} onChange={(_, d) => setF({ ...f, ou: d.value })} />
              </Field>
            )}
            <Field label="Description">
              <Textarea value={f.description} onChange={(_, d) => setF({ ...f, description: d.value })} />
            </Field>
          </DialogContent>
          <DialogActions>
            <Button appearance="primary" disabled={!f.displayName || !f.mailNickname || busy} onClick={submit}>
              {busy ? <Spinner size="tiny" /> : 'Create group'}
            </Button>
            <Button onClick={onClose}>Cancel</Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}

import {
  Avatar,
  Body1,
  DataGrid,
  DataGridBody,
  DataGridCell,
  DataGridHeader,
  DataGridHeaderCell,
  DataGridRow,
  Dropdown,
  Input,
  Link,
  MessageBar,
  MessageBarBody,
  Option,
  Spinner,
  TableCellLayout,
  Toolbar,
  ToolbarButton,
  ToolbarDivider,
  createTableColumn,
  makeStyles,
  tokens,
  type TableColumnDefinition,
  type TableRowId
} from '@fluentui/react-components'
import {
  ArrowClockwise20Regular,
  Delete20Regular,
  Key20Regular,
  PersonAdd20Regular,
  PersonArrowRight20Regular,
  Prohibited20Regular,
  Search20Regular,
  LockOpen20Regular
} from '@fluentui/react-icons'
import { useMemo, useState } from 'react'
import type { DirUser, ObjectSource } from '@shared/types'
import { useApp } from '../AppContext'
import { api } from '../api'
import { ConfirmDialog, PageHeader, SourceBadge, StatusBadge, relTime } from '../components/common'
import { AddUserDialog } from './AddUserDialog'
import { ResetPasswordDialog } from './ResetPasswordDialog'
import { UserPanel } from './UserPanel'

const useStyles = makeStyles({
  bar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    marginBottom: '4px',
    gap: '8px',
    flexWrap: 'wrap'
  },
  right: { display: 'flex', alignItems: 'center', gap: '12px', color: tokens.colorNeutralForeground2 },
  grid: { minWidth: '900px' },
  sub: { fontSize: '12px', color: tokens.colorNeutralForeground3 }
})

export function UsersPage() {
  const s = useStyles()
  const { users, licenses, loading, loadError, reload, search, setSearch, attempt, navigate } = useApp()
  const [filter, setFilter] = useState<'all' | ObjectSource | 'blocked' | 'unlicensed'>('all')
  const [selected, setSelected] = useState<Set<TableRowId>>(new Set())
  const [openUser, setOpenUser] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [resetFor, setResetFor] = useState<DirUser[] | null>(null)
  const [deleting, setDeleting] = useState<DirUser[] | null>(null)
  const [busy, setBusy] = useState(false)

  const skuName = (p: string) => licenses.find((l) => l.skuPartNumber === p)?.friendlyName ?? p

  const items = useMemo(() => {
    const q = search.trim().toLowerCase()
    return users
      .filter((u) => {
        if (filter === 'blocked') return !u.accountEnabled
        if (filter === 'unlicensed') return u.source !== 'onprem' && u.licenses.length === 0
        return filter === 'all' || u.source === filter
      })
      .filter(
        (u) =>
          !q ||
          [u.displayName, u.userPrincipalName, u.department, u.jobTitle, u.samAccountName]
            .filter(Boolean)
            .some((v) => v!.toLowerCase().includes(q))
      )
      .sort((a, b) => a.displayName.localeCompare(b.displayName))
  }, [users, search, filter])

  const sel = users.filter((u) => selected.has(u.id))

  const columns: TableColumnDefinition<DirUser>[] = [
    createTableColumn<DirUser>({
      columnId: 'name',
      compare: (a, b) => a.displayName.localeCompare(b.displayName),
      renderHeaderCell: () => 'Display name',
      renderCell: (u) => (
        <TableCellLayout media={<Avatar name={u.displayName} size={28} color="colorful" />}>
          <Link
            onClick={(e) => {
              e.stopPropagation()
              setOpenUser(u.id)
            }}
          >
            {u.displayName}
          </Link>
        </TableCellLayout>
      )
    }),
    createTableColumn<DirUser>({
      columnId: 'upn',
      compare: (a, b) => a.userPrincipalName.localeCompare(b.userPrincipalName),
      renderHeaderCell: () => 'Username',
      renderCell: (u) => <TableCellLayout truncate>{u.userPrincipalName}</TableCellLayout>
    }),
    createTableColumn<DirUser>({
      columnId: 'licenses',
      renderHeaderCell: () => 'Licenses',
      renderCell: (u) => (
        <TableCellLayout truncate>
          {u.source === 'onprem' ? (
            <span className={s.sub}>Not in Entra ID</span>
          ) : u.licenses.length ? (
            u.licenses.map(skuName).join(', ')
          ) : (
            'Unlicensed'
          )}
        </TableCellLayout>
      )
    }),
    createTableColumn<DirUser>({
      columnId: 'source',
      compare: (a, b) => a.source.localeCompare(b.source),
      renderHeaderCell: () => 'Source',
      renderCell: (u) => <SourceBadge source={u.source} pending={u.pendingSync} />
    }),
    createTableColumn<DirUser>({
      columnId: 'status',
      compare: (a, b) => Number(b.accountEnabled) - Number(a.accountEnabled),
      renderHeaderCell: () => 'Status',
      renderCell: (u) => <StatusBadge enabled={u.accountEnabled} />
    }),
    createTableColumn<DirUser>({
      columnId: 'dept',
      compare: (a, b) => (a.department ?? '').localeCompare(b.department ?? ''),
      renderHeaderCell: () => 'Department',
      renderCell: (u) => <TableCellLayout truncate>{u.department}</TableCellLayout>
    }),
    createTableColumn<DirUser>({
      columnId: 'signin',
      compare: (a, b) => (a.lastSignInDateTime ?? '').localeCompare(b.lastSignInDateTime ?? ''),
      renderHeaderCell: () => 'Last sign-in',
      renderCell: (u) => <span className={s.sub}>{relTime(u.lastSignInDateTime)}</span>
    })
  ]

  const bulk = async (fn: (u: DirUser) => Promise<unknown>, msg: string) => {
    setBusy(true)
    const ok = await attempt(async () => {
      for (const u of sel) await fn(u)
    }, msg)
    setBusy(false)
    if (ok) setSelected(new Set())
    reload()
  }

  const filterLabel: Record<string, string> = {
    all: 'All users',
    cloud: 'Cloud-only',
    synced: 'Synced from AD',
    onprem: 'On-prem only',
    blocked: 'Sign-in blocked',
    unlicensed: 'Unlicensed'
  }

  return (
    <>
      <PageHeader
        crumb={[]}
        title="Active users"
        description="Cloud, synced and on-premises accounts in one list. Changes to synced users are written to Active Directory and replicated by Entra Connect."
      />
      {loadError && (
        <MessageBar layout="multiline" intent="error" style={{ marginBottom: 12 }}>
          <MessageBarBody>{loadError}</MessageBarBody>
        </MessageBar>
      )}
      <div className={s.bar}>
        <Toolbar>
          <ToolbarButton icon={<PersonAdd20Regular />} onClick={() => setAdding(true)}>
            Add a user
          </ToolbarButton>
          <ToolbarButton icon={<ArrowClockwise20Regular />} onClick={reload}>
            Refresh
          </ToolbarButton>
          {sel.length > 0 && (
            <>
              <ToolbarDivider />
              <ToolbarButton icon={<Key20Regular />} onClick={() => setResetFor(sel)} disabled={busy}>
                Reset password
              </ToolbarButton>
              {sel.some((u) => u.accountEnabled) ? (
                <ToolbarButton
                  icon={<Prohibited20Regular />}
                  disabled={busy}
                  onClick={() => bulk((u) => api.setUserEnabled(u.id, false), `Blocked sign-in for ${sel.length} user(s)`)}
                >
                  Block sign-in
                </ToolbarButton>
              ) : (
                <ToolbarButton
                  icon={<LockOpen20Regular />}
                  disabled={busy}
                  onClick={() => bulk((u) => api.setUserEnabled(u.id, true), `Unblocked ${sel.length} user(s)`)}
                >
                  Unblock sign-in
                </ToolbarButton>
              )}
              {sel.length === 1 && (
                <ToolbarButton icon={<PersonArrowRight20Regular />} onClick={() => navigate('offboarding', sel[0].id)}>
                  Offboard
                </ToolbarButton>
              )}
              <ToolbarButton icon={<Delete20Regular />} onClick={() => setDeleting(sel)} disabled={busy}>
                Delete user
              </ToolbarButton>
            </>
          )}
        </Toolbar>
        <div className={s.right}>
          {loading ? <Spinner size="tiny" /> : <Body1>{items.length} items</Body1>}
          <Dropdown
            value={filterLabel[filter]}
            selectedOptions={[filter]}
            onOptionSelect={(_, d) => setFilter(d.optionValue as typeof filter)}
            style={{ minWidth: 160 }}
            appearance="underline"
          >
            {Object.entries(filterLabel).map(([k, v]) => (
              <Option key={k} value={k}>
                {v}
              </Option>
            ))}
          </Dropdown>
          <Input
            contentBefore={<Search20Regular />}
            placeholder="Search active users list"
            value={search}
            onChange={(_, d) => setSearch(d.value)}
            appearance="underline"
          />
        </div>
      </div>

      <DataGrid
        className={s.grid}
        items={items}
        columns={columns}
        sortable
        selectionMode="multiselect"
        selectedItems={selected}
        onSelectionChange={(_, d) => setSelected(d.selectedItems)}
        getRowId={(u: DirUser) => u.id}
        size="medium"
      >
        <DataGridHeader>
          <DataGridRow selectionCell={{ checkboxIndicator: { 'aria-label': 'Select all rows' } }}>
            {({ renderHeaderCell }) => <DataGridHeaderCell>{renderHeaderCell()}</DataGridHeaderCell>}
          </DataGridRow>
        </DataGridHeader>
        <DataGridBody<DirUser>>
          {({ item, rowId }) => (
            <DataGridRow<DirUser> key={rowId} selectionCell={{ checkboxIndicator: { 'aria-label': 'Select row' } }}>
              {({ renderCell }) => <DataGridCell>{renderCell(item)}</DataGridCell>}
            </DataGridRow>
          )}
        </DataGridBody>
      </DataGrid>

      {openUser && <UserPanel userId={openUser} onClose={() => setOpenUser(null)} onResetPassword={(u) => setResetFor([u])} />}
      {adding && <AddUserDialog onClose={() => setAdding(false)} />}
      {resetFor && <ResetPasswordDialog users={resetFor} onClose={() => setResetFor(null)} />}
      <ConfirmDialog
        open={!!deleting}
        title={`Delete ${deleting?.length === 1 ? deleting[0].displayName : `${deleting?.length} users`}?`}
        confirmLabel="Delete"
        danger
        busy={busy}
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          await bulk((u) => api.deleteUser(u.id), 'User(s) deleted')
          setDeleting(null)
        }}
      >
        Synced and on-prem users are deleted from Active Directory, and the Entra ID object is removed on the next
        sync. Cloud users go to Entra ID deleted users for 30 days.
      </ConfirmDialog>
    </>
  )
}

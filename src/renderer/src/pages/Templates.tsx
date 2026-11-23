import {
  Badge,
  Button,
  Card,
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
  Option,
  Radio,
  RadioGroup,
  Text,
  Textarea,
  Toolbar,
  ToolbarButton,
  makeStyles,
  tokens
} from '@fluentui/react-components'
import { Add20Regular, Delete20Regular, Edit20Regular } from '@fluentui/react-icons'
import { useEffect, useState } from 'react'
import type { OnboardingTemplate } from '@shared/types'
import { makeRunId } from '@shared/password'
import { useApp } from '../AppContext'
import { api } from '../api'
import { ConfirmDialog, PageHeader, SourceBadge } from '../components/common'

const useStyles = makeStyles({
  cards: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px', marginTop: '12px' },
  card: { padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' },
  sub: { color: tokens.colorNeutralForeground3, fontSize: '12px' },
  chips: { display: 'flex', flexWrap: 'wrap', gap: '4px' },
  form: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px' },
  full: { gridColumn: '1 / -1' },
  list: {
    maxHeight: '180px',
    overflowY: 'auto',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    padding: '4px 8px',
    display: 'flex',
    flexDirection: 'column'
  }
})

export function TemplatesPage() {
  const s = useStyles()
  const { groups, licenses, attempt } = useApp()
  const [templates, setTemplates] = useState<OnboardingTemplate[]>([])
  const [editing, setEditing] = useState<OnboardingTemplate | null>(null)
  const [deleting, setDeleting] = useState<OnboardingTemplate | null>(null)

  const load = () => api.listTemplates().then(setTemplates)
  useEffect(() => {
    load()
  }, [])

  const skuName = (p: string) => licenses.find((l) => l.skuPartNumber === p)?.friendlyName ?? p

  return (
    <>
      <PageHeader
        crumb={[{ label: 'Onboard a user', page: 'onboarding' }]}
        title="Role templates"
        description="Templates define where a new starter's account lives, plus their attributes, groups and licenses, so onboarding takes one click."
      />
      <Toolbar>
        <ToolbarButton icon={<Add20Regular />} onClick={() => setEditing(blankTemplate())}>
          New template
        </ToolbarButton>
      </Toolbar>
      <div className={s.cards}>
        {templates.map((t) => (
          <Card key={t.id} className={s.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <Text weight="semibold" size={400}>
                  {t.name}
                </Text>
                <div className={s.sub}>{t.description}</div>
              </div>
              <div>
                <Button appearance="subtle" icon={<Edit20Regular />} onClick={() => setEditing(t)} aria-label="Edit" />
                <Button appearance="subtle" icon={<Delete20Regular />} onClick={() => setDeleting(t)} aria-label="Delete" />
              </div>
            </div>
            <SourceBadge source={t.target === 'onprem' ? 'synced' : 'cloud'} />
            <div className={s.sub}>
              {[t.jobTitle, t.department, t.officeLocation].filter(Boolean).join(' · ')} · @{t.domain}
            </div>
            <div className={s.chips}>
              {groups
                .filter((g) => t.groupIds.includes(g.id))
                .map((g) => (
                  <Badge key={g.id} appearance="tint" color={g.source === 'cloud' ? 'brand' : 'informative'}>
                    {g.displayName}
                  </Badge>
                ))}
            </div>
            <div className={s.chips}>
              {t.licenseSkus.map((l) => (
                <Badge key={l} appearance="outline" color="success">
                  {skuName(l)}
                </Badge>
              ))}
            </div>
          </Card>
        ))}
      </div>
      {editing && (
        <TemplateDialog
          template={editing}
          onClose={() => setEditing(null)}
          onSave={async (t) => {
            if (await attempt(() => api.saveTemplate(t), 'Template saved')) {
              setEditing(null)
              load()
            }
          }}
        />
      )}
      <ConfirmDialog
        open={!!deleting}
        title={`Delete template "${deleting?.name}"?`}
        confirmLabel="Delete"
        danger
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          await attempt(() => api.deleteTemplate(deleting!.id), 'Template deleted')
          setDeleting(null)
          load()
        }}
      >
        Existing users aren't affected.
      </ConfirmDialog>
    </>
  )
}

function blankTemplate(): OnboardingTemplate {
  return {
    id: `t-${makeRunId()}`,
    name: '',
    description: '',
    target: 'onprem',
    usageLocation: 'GB',
    domain: '',
    groupIds: [],
    licenseSkus: []
  }
}

function TemplateDialog({ template, onClose, onSave }: { template: OnboardingTemplate; onClose(): void; onSave(t: OnboardingTemplate): void }) {
  const s = useStyles()
  const { groups, licenses, status, settings } = useApp()
  const [t, setT] = useState<OnboardingTemplate>({
    ...template,
    domain: template.domain || status?.domains[0] || '',
    ou: template.ou ?? settings?.defaultOu
  })
  const set = (k: keyof OnboardingTemplate) => (_: unknown, d: { value: string }) => setT({ ...t, [k]: d.value })
  const toggle = (k: 'groupIds' | 'licenseSkus', v: string, on: boolean) =>
    setT({ ...t, [k]: on ? [...t[k], v] : t[k].filter((x) => x !== v) })
  // Cloud-only users can't join AD groups.
  const groupChoices = groups.filter((g) => t.target === 'onprem' || g.source === 'cloud')

  return (
    <Dialog open onOpenChange={(_, d) => !d.open && onClose()}>
      <DialogSurface style={{ maxWidth: 720 }}>
        <DialogBody>
          <DialogTitle>{template.name ? `Edit ${template.name}` : 'New role template'}</DialogTitle>
          <DialogContent>
            <div className={s.form}>
              <Field label="Template name" required className={s.full}>
                <Input value={t.name} onChange={set('name')} />
              </Field>
              <Field label="Description" className={s.full}>
                <Textarea value={t.description} onChange={set('description')} rows={2} />
              </Field>
              <Field label="Account type" className={s.full}>
                <RadioGroup
                  layout="horizontal"
                  value={t.target}
                  onChange={(_, d) =>
                    setT({
                      ...t,
                      target: d.value as 'cloud' | 'onprem',
                      groupIds: d.value === 'cloud' ? t.groupIds.filter((id) => groups.find((g) => g.id === id)?.source === 'cloud') : t.groupIds
                    })
                  }
                >
                  <Radio value="onprem" label="On-prem AD, synced to Entra ID" />
                  <Radio value="cloud" label="Cloud only" />
                </RadioGroup>
              </Field>
              {t.target === 'onprem' && (
                <Field label="Organizational unit" className={s.full}>
                  <Input value={t.ou ?? ''} onChange={set('ou')} />
                </Field>
              )}
              <Field label="Domain">
                <Dropdown value={t.domain} selectedOptions={[t.domain]} onOptionSelect={(_, d) => setT({ ...t, domain: d.optionValue! })}>
                  {(status?.domains ?? []).map((d) => (
                    <Option key={d}>{d}</Option>
                  ))}
                </Dropdown>
              </Field>
              <Field label="Usage location">
                <Input value={t.usageLocation} onChange={set('usageLocation')} maxLength={2} />
              </Field>
              <Field label="Job title">
                <Input value={t.jobTitle ?? ''} onChange={set('jobTitle')} />
              </Field>
              <Field label="Department">
                <Input value={t.department ?? ''} onChange={set('department')} />
              </Field>
              <Field label="Office">
                <Input value={t.officeLocation ?? ''} onChange={set('officeLocation')} />
              </Field>
              <div />
              <Field label="Groups">
                <div className={s.list}>
                  {groupChoices.map((g) => (
                    <Checkbox
                      key={g.id}
                      label={`${g.displayName}${g.source === 'cloud' ? '' : ' (AD)'}`}
                      checked={t.groupIds.includes(g.id)}
                      onChange={(_, d) => toggle('groupIds', g.id, !!d.checked)}
                    />
                  ))}
                </div>
              </Field>
              <Field label="Licenses">
                <div className={s.list}>
                  {licenses.map((l) => (
                    <Checkbox
                      key={l.skuId}
                      label={l.friendlyName}
                      checked={t.licenseSkus.includes(l.skuPartNumber)}
                      onChange={(_, d) => toggle('licenseSkus', l.skuPartNumber, !!d.checked)}
                    />
                  ))}
                </div>
              </Field>
            </div>
          </DialogContent>
          <DialogActions>
            <Button appearance="primary" disabled={!t.name || !t.domain} onClick={() => onSave(t)}>
              Save
            </Button>
            <Button onClick={onClose}>Cancel</Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}

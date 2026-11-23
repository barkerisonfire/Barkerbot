import {
  Badge,
  Button,
  Card,
  Field,
  Input,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Text,
  makeStyles,
  mergeClasses,
  tokens
} from '@fluentui/react-components'
import { CheckmarkCircle20Filled, Copy20Regular } from '@fluentui/react-icons'
import { useEffect, useState } from 'react'
import type { OnboardingRequest, OnboardingTemplate, WorkflowResult, WorkflowStep } from '@shared/types'
import { useApp } from '../AppContext'
import { api, errMsg } from '../api'
import { PageHeader, SourceBadge, StepList } from '../components/common'
import { Picker } from '../components/Picker'

const useStyles = makeStyles({
  wrap: { display: 'flex', gap: '32px', alignItems: 'flex-start' },
  stepper: { width: '200px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '4px', paddingTop: '8px' },
  stepItem: { display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', color: tokens.colorNeutralForeground3 },
  stepActive: { color: tokens.colorNeutralForeground1, fontWeight: 600 },
  dot: {
    width: '20px',
    height: '20px',
    borderRadius: '50%',
    border: `2px solid ${tokens.colorNeutralStroke1}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '11px'
  },
  dotActive: { border: `2px solid ${tokens.colorBrandStroke1}`, color: tokens.colorBrandForeground1 },
  content: { flex: 1, maxWidth: '760px' },
  h2: { fontSize: '20px', fontWeight: 600, margin: '0 0 16px' },
  cards: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: '12px' },
  tcard: { cursor: 'pointer', padding: '16px', minHeight: '130px' },
  tsel: { outline: `2px solid ${tokens.colorBrandStroke1}` },
  form: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px' },
  footer: {
    display: 'flex',
    gap: '8px',
    marginTop: '24px',
    paddingTop: '16px',
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`
  },
  review: { display: 'grid', gridTemplateColumns: '180px 1fr', gap: '8px 16px' },
  k: { fontWeight: 600 },
  sub: { color: tokens.colorNeutralForeground3, fontSize: '12px' }
})

const STEPS = ['Choose a template', 'User details', 'Review', 'Finish']

export function OnboardingPage() {
  const s = useStyles()
  const { users, groups, licenses, status, reload, addHistory, navigate } = useApp()
  const [templates, setTemplates] = useState<OnboardingTemplate[]>([])
  const [step, setStep] = useState(0)
  const [tpl, setTpl] = useState<OnboardingTemplate | null>(null)
  const [req, setReq] = useState<Omit<OnboardingRequest, 'templateId'>>({ givenName: '', surname: '', alias: '' })
  const [progress, setProgress] = useState<WorkflowStep[]>([])
  const [result, setResult] = useState<WorkflowResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)

  useEffect(() => {
    api.listTemplates().then(setTemplates)
    return api.onWorkflowProgress((p) => setProgress(p.steps))
  }, [])

  const setName = (k: 'givenName' | 'surname', v: string) => {
    const n = { ...req, [k]: v }
    n.alias = `${n.givenName}${n.surname ? '.' + n.surname : ''}`.toLowerCase().replace(/[^a-z0-9.]/g, '')
    setReq(n)
  }

  const run = async () => {
    setStep(3)
    setRunning(true)
    setError(null)
    setProgress([])
    try {
      const r = await api.runOnboarding({ ...req, templateId: tpl!.id })
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

  const reset = () => {
    setStep(0)
    setTpl(null)
    setReq({ givenName: '', surname: '', alias: '' })
    setResult(null)
    setProgress([])
  }

  const groupNames = (ids: string[]) => groups.filter((g) => ids.includes(g.id))
  const skuName = (p: string) => licenses.find((l) => l.skuPartNumber === p)?.friendlyName ?? p
  const upnTaken = !!tpl && users.some((u) => u.userPrincipalName === `${req.alias}@${tpl.domain}`)

  return (
    <>
      <PageHeader
        title="Onboard a user"
        description="Create a fully provisioned account from a role template: AD or cloud account, groups, licenses, and the Entra Connect sync in between."
      />
      <div className={s.wrap}>
        <div className={s.stepper}>
          {STEPS.map((label, i) => (
            <div key={label} className={mergeClasses(s.stepItem, i === step && s.stepActive)}>
              <span className={mergeClasses(s.dot, i <= step && s.dotActive)}>
                {i < step ? <CheckmarkCircle20Filled /> : i + 1}
              </span>
              {label}
            </div>
          ))}
        </div>

        <div className={s.content}>
          {step === 0 && (
            <>
              <h2 className={s.h2}>Choose a role template</h2>
              <div className={s.cards}>
                {templates.map((t) => (
                  <Card key={t.id} className={mergeClasses(s.tcard, tpl?.id === t.id && s.tsel)} onClick={() => setTpl(t)}>
                    <Text weight="semibold">{t.name}</Text>
                    <span className={s.sub}>{t.description}</span>
                    <div style={{ marginTop: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <SourceBadge source={t.target === 'onprem' ? 'synced' : 'cloud'} />
                      <Badge appearance="outline">{t.licenseSkus.length} license(s)</Badge>
                      <Badge appearance="outline">{t.groupIds.length} group(s)</Badge>
                    </div>
                  </Card>
                ))}
              </div>
              {!templates.length && <Text>No templates yet. Create one under Role templates.</Text>}
              <div className={s.footer}>
                <Button appearance="primary" disabled={!tpl} onClick={() => setStep(1)}>
                  Next
                </Button>
                <Button onClick={() => navigate('templates')}>Manage templates</Button>
              </div>
            </>
          )}

          {step === 1 && tpl && (
            <>
              <h2 className={s.h2}>Set up the basics</h2>
              <div className={s.form}>
                <Field label="First name" required>
                  <Input value={req.givenName} onChange={(_, d) => setName('givenName', d.value)} />
                </Field>
                <Field label="Last name" required>
                  <Input value={req.surname} onChange={(_, d) => setName('surname', d.value)} />
                </Field>
                <Field
                  label="Username"
                  required
                  style={{ gridColumn: '1 / -1' }}
                  validationMessage={upnTaken ? 'This username is already in use' : undefined}
                >
                  <Input value={req.alias} onChange={(_, d) => setReq({ ...req, alias: d.value })} contentAfter={<span className={s.sub}>@{tpl.domain}</span>} />
                </Field>
                <Field label="Job title" hint={`Template default: ${tpl.jobTitle ?? 'none'}`}>
                  <Input value={req.jobTitleOverride ?? ''} placeholder={tpl.jobTitle} onChange={(_, d) => setReq({ ...req, jobTitleOverride: d.value })} />
                </Field>
                <Field label="Mobile phone">
                  <Input value={req.mobilePhone ?? ''} onChange={(_, d) => setReq({ ...req, mobilePhone: d.value })} />
                </Field>
                <Field label="Manager" style={{ gridColumn: '1 / -1' }}>
                  <Picker
                    clearable
                    value={req.managerId}
                    onChange={(id) => setReq({ ...req, managerId: id ?? undefined })}
                    items={users
                      .filter((u) => (tpl.target === 'onprem' ? u.source !== 'cloud' : u.source !== 'onprem'))
                      .map((u) => ({ id: u.id, label: u.displayName, secondary: u.jobTitle }))}
                  />
                </Field>
              </div>
              <div className={s.footer}>
                <Button onClick={() => setStep(0)}>Back</Button>
                <Button appearance="primary" disabled={!req.givenName || !req.surname || !req.alias || upnTaken} onClick={() => setStep(2)}>
                  Next
                </Button>
              </div>
            </>
          )}

          {step === 2 && tpl && (
            <>
              <h2 className={s.h2}>Review and finish</h2>
              {tpl.target === 'onprem' && !status?.ad.connected && (
                <MessageBar layout="multiline" intent="error" style={{ marginBottom: 12 }}>
                  <MessageBarBody>This template creates an on-prem account, but Active Directory isn't connected.</MessageBarBody>
                </MessageBar>
              )}
              <div className={s.review}>
                <span className={s.k}>Name</span>
                <span>
                  {req.givenName} {req.surname}
                </span>
                <span className={s.k}>Username</span>
                <span>
                  {req.alias}@{tpl.domain}
                </span>
                <span className={s.k}>Account type</span>
                <span>{tpl.target === 'onprem' ? `Active Directory → synced to Entra ID` : 'Cloud only (Entra ID)'}</span>
                {tpl.ou && (
                  <>
                    <span className={s.k}>OU</span>
                    <span>{tpl.ou}</span>
                  </>
                )}
                <span className={s.k}>Job title / department</span>
                <span>
                  {req.jobTitleOverride || tpl.jobTitle} · {tpl.department}
                </span>
                <span className={s.k}>Manager</span>
                <span>{users.find((u) => u.id === req.managerId)?.displayName ?? 'None'}</span>
                <span className={s.k}>Groups</span>
                <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {groupNames(tpl.groupIds).map((g) => (
                    <Badge key={g.id} appearance="tint" color={g.source === 'cloud' ? 'brand' : 'informative'}>
                      {g.displayName}
                    </Badge>
                  ))}
                </span>
                <span className={s.k}>Licenses</span>
                <span>{tpl.licenseSkus.map(skuName).join(', ') || 'None'}</span>
                <span className={s.k}>Usage location</span>
                <span>{tpl.usageLocation}</span>
              </div>
              <div className={s.footer}>
                <Button onClick={() => setStep(1)}>Back</Button>
                <Button appearance="primary" onClick={run}>
                  Finish adding
                </Button>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <h2 className={s.h2}>{running ? 'Provisioning…' : result?.success ? `${result.subject} is ready` : 'Finished with issues'}</h2>
              {error && (
                <MessageBar layout="multiline" intent="error" style={{ marginBottom: 12 }}>
                  <MessageBarBody>{error}</MessageBarBody>
                </MessageBar>
              )}
              <StepList steps={progress} />
              {result?.output && (
                <MessageBar layout="multiline" intent={result.success ? 'success' : 'warning'} style={{ marginTop: 20 }}>
                  <MessageBarBody>
                    <MessageBarTitle>Sign-in details</MessageBarTitle>
                    {Object.entries(result.output).map(([k, v]) => (
                      <div key={k}>
                        {k}: <code>{v}</code>
                      </div>
                    ))}
                  </MessageBarBody>
                  <Button
                    icon={<Copy20Regular />}
                    appearance="transparent"
                    onClick={() =>
                      navigator.clipboard.writeText(
                        Object.entries(result.output!)
                          .map(([k, v]) => `${k}: ${v}`)
                          .join('\n')
                      )
                    }
                  />
                </MessageBar>
              )}
              {!running && (
                <div className={s.footer}>
                  <Button appearance="primary" onClick={reset}>
                    Onboard another user
                  </Button>
                  <Button onClick={() => navigate('users')}>Go to active users</Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  )
}

// On-prem Active Directory via the RSAT ActiveDirectory PowerShell module.
// All objects are addressed by ObjectGUID.
import { runPs } from '../powershell'
import type { GroupType, UserPatch } from '@shared/types'

export interface AdUser {
  guid: string
  /** base64 ObjectGUID = Entra onPremisesImmutableId */
  immutableId: string
  sam: string
  upn: string
  dn: string
  displayName?: string
  givenName?: string
  surname?: string
  mail?: string
  title?: string
  department?: string
  office?: string
  mobile?: string
  enabled: boolean
  managerDn?: string
  memberOf: string[]
  created?: string
  lastLogon?: string
}

export interface AdGroup {
  guid: string
  sid: string
  name: string
  dn: string
  description?: string
  mail?: string
  category: 'Security' | 'Distribution'
  memberCount: number
}

const PRELUDE = `
Import-Module ActiveDirectory -ErrorAction Stop
if ($p.server) { $PSDefaultParameterValues['*-AD*:Server'] = $p.server }
`

const asArray = <T>(v: T | T[] | null | undefined): T[] => (v == null ? [] : Array.isArray(v) ? v : [v])

export class AdClient {
  constructor(private server: string) {}

  private ps<T>(script: string, params: Record<string, unknown> = {}): Promise<T> {
    return runPs<T>(PRELUDE + script, { server: this.server, ...params })
  }

  async domain(): Promise<string> {
    return this.ps<string>('(Get-ADDomain).DNSRoot')
  }

  async listUsers(): Promise<AdUser[]> {
    const res = await this.ps<AdUser[] | AdUser>(`
Get-ADUser -Filter * -Properties DisplayName,mail,Title,Department,physicalDeliveryOfficeName,mobile,Manager,MemberOf,whenCreated,LastLogonDate |
  ForEach-Object {
    [pscustomobject]@{
      guid = $_.ObjectGUID.ToString()
      immutableId = [Convert]::ToBase64String($_.ObjectGUID.ToByteArray())
      sam = $_.SamAccountName; upn = $_.UserPrincipalName; dn = $_.DistinguishedName
      displayName = $_.DisplayName; givenName = $_.GivenName; surname = $_.Surname; mail = $_.mail
      title = $_.Title; department = $_.Department; office = $_.physicalDeliveryOfficeName; mobile = $_.mobile
      enabled = [bool]$_.Enabled; managerDn = $_.Manager; memberOf = @($_.MemberOf)
      created = if ($_.whenCreated) { $_.whenCreated.ToString('o') } else { $null }
      lastLogon = if ($_.LastLogonDate) { $_.LastLogonDate.ToString('o') } else { $null }
    }
  }`)
    return asArray(res).map((u) => ({ ...u, memberOf: asArray(u.memberOf) }))
  }

  async listGroups(): Promise<AdGroup[]> {
    const res = await this.ps<AdGroup[] | AdGroup>(`
Get-ADGroup -Filter * -Properties Description,mail,member |
  Where-Object { -not $_.isCriticalSystemObject } |
  ForEach-Object {
    [pscustomobject]@{
      guid = $_.ObjectGUID.ToString(); sid = $_.SID.Value; name = $_.Name; dn = $_.DistinguishedName
      description = $_.Description; mail = $_.mail; category = $_.GroupCategory.ToString()
      memberCount = @($_.member).Count
    }
  }`)
    return asArray(res)
  }

  async createUser(i: {
    name: string
    givenName: string
    surname: string
    sam: string
    upn: string
    ou: string
    password: string
    forceChange: boolean
    title?: string
    department?: string
    office?: string
    mobile?: string
    mail?: string
  }): Promise<string> {
    return this.ps<string>(
      `
$a = @{
  Name = $p.i.name; DisplayName = $p.i.name; GivenName = $p.i.givenName; Surname = $p.i.surname
  SamAccountName = $p.i.sam; UserPrincipalName = $p.i.upn; Path = $p.i.ou
  AccountPassword = (ConvertTo-SecureString $p.i.password -AsPlainText -Force)
  Enabled = $true; ChangePasswordAtLogon = [bool]$p.i.forceChange; PassThru = $true
}
foreach ($k in 'title','department','office','mobile') {
  if ($p.i.$k) { $a[@{title='Title';department='Department';office='Office';mobile='MobilePhone'}[$k]] = $p.i.$k }
}
if ($p.i.mail) { $a.EmailAddress = $p.i.mail }
(New-ADUser @a).ObjectGUID.ToString()`,
      { i }
    )
  }

  async updateUser(guid: string, patch: UserPatch): Promise<void> {
    const map: Record<string, string> = {
      displayName: 'displayName',
      givenName: 'givenName',
      surname: 'sn',
      jobTitle: 'title',
      department: 'department',
      officeLocation: 'physicalDeliveryOfficeName',
      mobilePhone: 'mobile'
    }
    const replace: Record<string, string> = {}
    const clear: string[] = []
    for (const [k, v] of Object.entries(patch)) {
      const attr = map[k]
      if (!attr) continue
      if (v) replace[attr] = v
      else clear.push(attr)
    }
    if (!Object.keys(replace).length && !clear.length) return
    await this.ps(
      `
$r = @{}; $p.replace.PSObject.Properties | ForEach-Object { $r[$_.Name] = $_.Value }
$a = @{ Identity = $p.guid }
if ($r.Count) { $a.Replace = $r }
if (@($p.clear).Count) { $a.Clear = @($p.clear) }
Set-ADUser @a`,
      { guid, replace, clear }
    )
  }

  setManager(guid: string, managerGuid: string | null): Promise<void> {
    return this.ps(
      `if ($p.m) { Set-ADUser -Identity $p.guid -Manager $p.m } else { Set-ADUser -Identity $p.guid -Clear manager }`,
      { guid, m: managerGuid }
    )
  }

  setEnabled(guid: string, enabled: boolean): Promise<void> {
    return this.ps(`if ($p.e) { Enable-ADAccount -Identity $p.guid } else { Disable-ADAccount -Identity $p.guid }`, {
      guid,
      e: enabled
    })
  }

  resetPassword(guid: string, password: string, force: boolean): Promise<void> {
    return this.ps(
      `
Set-ADAccountPassword -Identity $p.guid -Reset -NewPassword (ConvertTo-SecureString $p.pw -AsPlainText -Force)
Set-ADUser -Identity $p.guid -ChangePasswordAtLogon ([bool]$p.force)`,
      { guid, pw: password, force }
    )
  }

  deleteUser(guid: string): Promise<void> {
    return this.ps(`Remove-ADUser -Identity $p.guid -Confirm:$false`, { guid })
  }

  move(guid: string, ou: string): Promise<void> {
    return this.ps(`Move-ADObject -Identity $p.guid -TargetPath $p.ou`, { guid, ou })
  }

  setHiddenFromGal(guid: string, hidden: boolean): Promise<void> {
    return this.ps(`Set-ADUser -Identity $p.guid -Replace @{ msExchHideFromAddressLists = [bool]$p.h }`, {
      guid,
      h: hidden
    })
  }

  addMember(groupGuid: string, userGuid: string): Promise<void> {
    return this.ps(`Add-ADGroupMember -Identity $p.g -Members $p.u`, { g: groupGuid, u: userGuid })
  }

  removeMember(groupGuid: string, userGuid: string): Promise<void> {
    return this.ps(`Remove-ADGroupMember -Identity $p.g -Members $p.u -Confirm:$false`, { g: groupGuid, u: userGuid })
  }

  async groupMemberGuids(groupGuid: string): Promise<string[]> {
    const r = await this.ps<string[] | string>(
      `@(Get-ADGroupMember -Identity $p.g | Where-Object objectClass -eq 'user' | ForEach-Object { $_.ObjectGUID.ToString() })`,
      { g: groupGuid }
    )
    return asArray(r)
  }

  createGroup(name: string, sam: string, ou: string, description: string | undefined, type: GroupType): Promise<string> {
    return this.ps<string>(
      `
$a = @{ Name = $p.name; SamAccountName = $p.sam; Path = $p.ou; GroupScope = 'Global'; PassThru = $true
        GroupCategory = $(if ($p.dist) { 'Distribution' } else { 'Security' }) }
if ($p.desc) { $a.Description = $p.desc }
(New-ADGroup @a).ObjectGUID.ToString()`,
      { name, sam, ou, desc: description, dist: type === 'distribution' }
    )
  }

  /** Entra Connect delta sync, locally or on the sync server via WinRM. */
  triggerSync(syncServer: string): Promise<void> {
    return runPs(
      `
$sb = { Import-Module ADSync; Start-ADSyncSyncCycle -PolicyType Delta | Out-Null }
if ($p.host) { Invoke-Command -ComputerName $p.host -ScriptBlock $sb } else { & $sb }`,
      { host: syncServer }
    )
  }
}

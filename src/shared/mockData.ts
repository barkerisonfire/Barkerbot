import type { DirGroup, DirUser, LicenseSku, OnboardingTemplate } from './types'

export const DEMO_DOMAINS = ['contoso.com', 'contoso.onmicrosoft.com']
export const DEMO_BASE_DN = 'OU=Company,DC=contoso,DC=local'

export const demoLicenses: LicenseSku[] = [
  { skuId: 'sku-e3', skuPartNumber: 'SPE_E3', friendlyName: 'Microsoft 365 E3', total: 40, consumed: 0 },
  { skuId: 'sku-e5', skuPartNumber: 'SPE_E5', friendlyName: 'Microsoft 365 E5', total: 5, consumed: 0 },
  { skuId: 'sku-bp', skuPartNumber: 'SPB', friendlyName: 'Microsoft 365 Business Premium', total: 15, consumed: 0 },
  { skuId: 'sku-exo', skuPartNumber: 'EXCHANGESTANDARD', friendlyName: 'Exchange Online (Plan 1)', total: 10, consumed: 0 },
  { skuId: 'sku-pbi', skuPartNumber: 'POWER_BI_PRO', friendlyName: 'Power BI Pro', total: 10, consumed: 0 },
  { skuId: 'sku-visio', skuPartNumber: 'VISIOCLIENT', friendlyName: 'Visio Plan 2', total: 3, consumed: 0 },
  { skuId: 'sku-phone', skuPartNumber: 'MCOEV', friendlyName: 'Teams Phone Standard', total: 10, consumed: 0 }
]

export const demoGroups: DirGroup[] = [
  { id: 'g-all', source: 'cloud', displayName: 'All Company', groupType: 'm365', mail: 'allcompany@contoso.com', description: 'Everyone at Contoso', memberCount: 0 },
  { id: 'g-sales', source: 'synced', adGuid: 'a1', displayName: 'SG-Sales', groupType: 'security', description: 'Sales department', memberCount: 0, distinguishedName: `CN=SG-Sales,OU=Groups,${DEMO_BASE_DN}` },
  { id: 'g-fin', source: 'synced', adGuid: 'a2', displayName: 'SG-Finance', groupType: 'security', description: 'Finance department', memberCount: 0, distinguishedName: `CN=SG-Finance,OU=Groups,${DEMO_BASE_DN}` },
  { id: 'g-it', source: 'synced', adGuid: 'a3', displayName: 'SG-IT', groupType: 'security', description: 'IT department', memberCount: 0, distinguishedName: `CN=SG-IT,OU=Groups,${DEMO_BASE_DN}` },
  { id: 'g-vpn', source: 'onprem', adGuid: 'a4', displayName: 'VPN Users', groupType: 'security', description: 'Allowed to use always-on VPN', memberCount: 0, distinguishedName: `CN=VPN Users,OU=Groups,DC=contoso,DC=local` },
  { id: 'g-fs', source: 'onprem', adGuid: 'a5', displayName: 'FS-Shared-Modify', groupType: 'security', description: 'File server share access', memberCount: 0, distinguishedName: `CN=FS-Shared-Modify,OU=Groups,DC=contoso,DC=local` },
  { id: 'g-mkt', source: 'cloud', displayName: 'Marketing Team', groupType: 'm365', mail: 'marketing@contoso.com', description: 'Marketing Teams team', memberCount: 0 },
  { id: 'g-dl-news', source: 'synced', adGuid: 'a6', displayName: 'DL-Newsletter', groupType: 'distribution', mail: 'newsletter@contoso.com', memberCount: 0, distinguishedName: `CN=DL-Newsletter,OU=Groups,${DEMO_BASE_DN}` },
  { id: 'g-mfa', source: 'cloud', displayName: 'CA-Require-MFA', groupType: 'security', description: 'Conditional Access: require MFA', memberCount: 0 },
  { id: 'g-intune', source: 'cloud', displayName: 'Intune Pilot', groupType: 'security', description: 'Intune policy pilot ring', memberCount: 0 }
]

const people: [string, string, string, string, string][] = [
  // given, surname, title, dept, office
  ['Adele', 'Vance', 'Retail Manager', 'Sales', 'London'],
  ['Alex', 'Wilber', 'Marketing Assistant', 'Marketing', 'London'],
  ['Allan', 'Deyoung', 'IT Administrator', 'IT', 'Manchester'],
  ['Christie', 'Cline', 'Buyer', 'Sales', 'Leeds'],
  ['Debra', 'Berger', 'Administrative Assistant', 'Executive', 'London'],
  ['Diego', 'Siciliani', 'HR Manager', 'HR', 'Manchester'],
  ['Emily', 'Braun', 'Budget Analyst', 'Finance', 'London'],
  ['Enrico', 'Cattaneo', 'Attorney', 'Legal', 'London'],
  ['Grady', 'Archie', 'Designer', 'Marketing', 'Leeds'],
  ['Henrietta', 'Mueller', 'Developer', 'IT', 'Manchester'],
  ['Irvin', 'Sayers', 'Director', 'Executive', 'London'],
  ['Isaiah', 'Langer', 'Sales Rep', 'Sales', 'Leeds'],
  ['Johanna', 'Lorenz', 'Senior Engineer', 'IT', 'Manchester'],
  ['Joni', 'Sherman', 'Paralegal', 'Legal', 'London'],
  ['Lee', 'Gu', 'Director', 'Finance', 'London'],
  ['Lidia', 'Holloway', 'Product Manager', 'Marketing', 'London'],
  ['Lynne', 'Robbins', 'Planner', 'Finance', 'Leeds'],
  ['Megan', 'Bowen', 'Marketing Manager', 'Marketing', 'London'],
  ['Miriam', 'Graham', 'Director', 'Sales', 'London'],
  ['Nestor', 'Wilke', 'Director', 'Operations', 'Manchester'],
  ['Patti', 'Fernandez', 'President', 'Executive', 'London'],
  ['Pradeep', 'Gupta', 'Accountant', 'Finance', 'Leeds'],
  ['Mahmoud', 'Haddad', 'Service Desk Analyst', 'IT', 'Manchester'],
  ['Sofia', 'Ramirez', 'Sales Rep', 'Sales', 'Manchester'],
  ['Tomasz', 'Nowak', 'Warehouse Lead', 'Operations', 'Leeds'],
  ['Aisha', 'Okafor', 'Payroll Specialist', 'Finance', 'London']
]

const deptGroups: Record<string, string[]> = {
  Sales: ['g-sales', 'g-vpn'],
  Finance: ['g-fin', 'g-fs'],
  IT: ['g-it', 'g-vpn', 'g-intune'],
  Marketing: ['g-mkt', 'g-dl-news'],
  Executive: ['g-dl-news', 'g-vpn'],
  HR: ['g-fs'],
  Legal: ['g-fs'],
  Operations: ['g-fs']
}

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86400_000).toISOString()
}

export function buildDemoUsers(): DirUser[] {
  return people.map(([given, sur, title, dept, office], i) => {
    // Mix of sources: mostly synced, some cloud-only, a few on-prem only.
    const source = i % 9 === 4 ? 'cloud' : i % 11 === 7 ? 'onprem' : 'synced'
    const alias = `${given}${sur[0]}`.toLowerCase()
    const sku = dept === 'Executive' ? 'SPE_E5' : dept === 'Operations' ? 'SPB' : 'SPE_E3'
    const licenses = source === 'onprem' ? [] : [sku]
    if (dept === 'Finance' && source !== 'onprem') licenses.push('POWER_BI_PRO')
    const groupIds = [...(source === 'onprem' ? [] : ['g-all', 'g-mfa']), ...(deptGroups[dept] ?? [])].filter(
      (g) => source !== 'onprem' || demoGroups.find((x) => x.id === g)?.source !== 'cloud'
    )
    const enabled = !(i === 13 || i === 24)
    return {
      id: `u-${i + 1}`,
      entraId: source === 'onprem' ? undefined : `e-${i + 1}`,
      adGuid: source === 'cloud' ? undefined : `ad-${i + 1}`,
      source,
      displayName: `${given} ${sur}`,
      givenName: given,
      surname: sur,
      userPrincipalName: `${alias}@contoso.com`,
      mail: source === 'onprem' ? undefined : `${alias}@contoso.com`,
      samAccountName: source === 'cloud' ? undefined : `${given[0]}${sur}`.toLowerCase(),
      // On-prem-only demo users live in an OU outside Entra Connect sync scope.
      distinguishedName:
        source === 'cloud'
          ? undefined
          : source === 'onprem'
            ? `CN=${given} ${sur},OU=Unsynced Users,DC=contoso,DC=local`
            : `CN=${given} ${sur},OU=${enabled ? 'Users' : 'Disabled Users'},${DEMO_BASE_DN}`,
      jobTitle: title,
      department: dept,
      officeLocation: office,
      mobilePhone: `+44 7700 9${String(100 + i * 37).padStart(5, '0')}`,
      usageLocation: 'GB',
      managerId: i > 0 && title !== 'Director' && title !== 'President' ? 'u-21' : undefined,
      accountEnabled: enabled,
      licenses: enabled ? licenses : [],
      groupIds,
      createdDateTime: daysAgo(30 + i * 23),
      lastSignInDateTime: source === 'onprem' ? undefined : daysAgo(i % 5 === 0 ? 45 : i % 3)
    } satisfies DirUser
  })
}

export const demoTemplates: OnboardingTemplate[] = [
  {
    id: 't-sales',
    name: 'Sales Representative',
    description: 'Hybrid account in the Sales OU with VPN, E3 and Sales groups',
    target: 'onprem',
    ou: `OU=Users,${DEMO_BASE_DN}`,
    jobTitle: 'Sales Rep',
    department: 'Sales',
    officeLocation: 'London',
    usageLocation: 'GB',
    domain: 'contoso.com',
    groupIds: ['g-sales', 'g-vpn', 'g-all', 'g-mfa'],
    licenseSkus: ['SPE_E3']
  },
  {
    id: 't-fin',
    name: 'Finance Analyst',
    description: 'Hybrid account with file share access, E3 and Power BI Pro',
    target: 'onprem',
    ou: `OU=Users,${DEMO_BASE_DN}`,
    jobTitle: 'Analyst',
    department: 'Finance',
    officeLocation: 'London',
    usageLocation: 'GB',
    domain: 'contoso.com',
    groupIds: ['g-fin', 'g-fs', 'g-all', 'g-mfa'],
    licenseSkus: ['SPE_E3', 'POWER_BI_PRO']
  },
  {
    id: 't-contractor',
    name: 'Cloud-only Contractor',
    description: 'Entra ID only account with Exchange Online Plan 1',
    target: 'cloud',
    jobTitle: 'Contractor',
    department: 'Operations',
    usageLocation: 'GB',
    domain: 'contoso.com',
    groupIds: ['g-mfa'],
    licenseSkus: ['EXCHANGESTANDARD']
  }
]

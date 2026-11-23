// Exchange Online mailbox operations (ExchangeOnlineManagement module v3+),
// authenticated with a delegated token from the same MSAL session.
import { runPs } from '../powershell'

export class ExchangeClient {
  constructor(
    private getToken: () => Promise<string>,
    private organization: () => Promise<string>
  ) {}

  private async exo(script: string, params: Record<string, unknown>): Promise<void> {
    const token = await this.getToken()
    const org = await this.organization()
    await runPs(
      `
Import-Module ExchangeOnlineManagement -ErrorAction Stop
Connect-ExchangeOnline -AccessToken $p.token -Organization $p.org -ShowBanner:$false | Out-Null
try {
${script}
} finally { Disconnect-ExchangeOnline -Confirm:$false | Out-Null }`,
      { token, org, ...params }
    )
  }

  convertToShared(upn: string): Promise<void> {
    return this.exo(`Set-Mailbox -Identity $p.upn -Type Shared`, { upn })
  }

  setForwarding(upn: string, address: string): Promise<void> {
    return this.exo(`Set-Mailbox -Identity $p.upn -ForwardingSmtpAddress $p.addr -DeliverToMailboxAndForward $true`, {
      upn,
      addr: address
    })
  }

  hideFromGal(upn: string, hidden: boolean): Promise<void> {
    return this.exo(`Set-Mailbox -Identity $p.upn -HiddenFromAddressListsEnabled ([bool]$p.h)`, { upn, h: hidden })
  }
}

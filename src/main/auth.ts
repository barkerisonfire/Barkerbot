// Microsoft Entra sign-in for Graph using MSAL Node (interactive loopback flow).
// App registration: "Mobile and desktop applications" platform with redirect
// URI http://localhost, and the delegated Graph scopes below.
import { app, safeStorage, shell } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { PublicClientApplication, type AccountInfo, type ICachePlugin } from '@azure/msal-node'

export const GRAPH_SCOPES = [
  'User.ReadWrite.All',
  'Group.ReadWrite.All',
  'Directory.ReadWrite.All',
  'AuditLog.Read.All',
  'Organization.Read.All'
]

const cacheFile = () => join(app.getPath('userData'), 'msal-cache.bin')

const cachePlugin: ICachePlugin = {
  async beforeCacheAccess(ctx) {
    if (!existsSync(cacheFile())) return
    try {
      const raw = readFileSync(cacheFile())
      ctx.tokenCache.deserialize(safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(raw) : raw.toString())
    } catch {
      /* corrupt cache: ignore, user re-authenticates */
    }
  },
  async afterCacheAccess(ctx) {
    if (!ctx.cacheHasChanged) return
    const data = ctx.tokenCache.serialize()
    writeFileSync(cacheFile(), safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(data) : data)
  }
}

export class GraphAuth {
  private pca: PublicClientApplication
  private account: AccountInfo | null = null

  constructor(tenantId: string, clientId: string) {
    this.pca = new PublicClientApplication({
      auth: { clientId, authority: `https://login.microsoftonline.com/${tenantId}` },
      cache: { cachePlugin }
    })
  }

  get accountName(): string | undefined {
    return this.account?.username
  }

  async signIn(): Promise<void> {
    const res = await this.pca.acquireTokenInteractive({
      scopes: GRAPH_SCOPES,
      openBrowser: async (url) => {
        await shell.openExternal(url)
      },
      successTemplate: '<h2>Signed in. You can close this window and return to Barkerbot.</h2>',
      errorTemplate: '<h2>Sign-in failed: {{error}}</h2>'
    })
    this.account = res.account
  }

  async signOut(): Promise<void> {
    const cache = this.pca.getTokenCache()
    for (const a of await cache.getAllAccounts()) await cache.removeAccount(a)
    this.account = null
  }

  /** Returns a Graph token silently, or throws if the user must sign in. */
  token(): Promise<string> {
    return this.tokenFor(GRAPH_SCOPES)
  }

  /** Token for another resource, e.g. Exchange Online (needs admin consent). */
  async tokenFor(scopes: string[]): Promise<string> {
    if (!this.account) {
      const accounts = await this.pca.getTokenCache().getAllAccounts()
      this.account = accounts[0] ?? null
    }
    if (!this.account) throw new Error('Not signed in to Microsoft Entra ID')
    const res = await this.pca.acquireTokenSilent({ account: this.account, scopes })
    return res.accessToken
  }
}

import { Toaster, makeStyles, tokens } from '@fluentui/react-components'
import { useState } from 'react'
import { AppProvider, TOASTER_ID, useApp } from './AppContext'
import { Header } from './components/Header'
import { NavRail } from './components/NavRail'
import { HomePage } from './pages/Home'
import { UsersPage } from './pages/Users'
import { GroupsPage } from './pages/Groups'
import { OnboardingPage } from './pages/Onboarding'
import { OffboardingPage } from './pages/Offboarding'
import { TemplatesPage } from './pages/Templates'
import { SettingsPage } from './pages/Settings'

const useStyles = makeStyles({
  shell: { display: 'flex', flexDirection: 'column', height: '100%' },
  body: { display: 'flex', flex: 1, minHeight: 0 },
  main: {
    flex: 1,
    overflow: 'auto',
    backgroundColor: tokens.colorNeutralBackground1,
    padding: '20px 32px 32px'
  }
})

function Shell() {
  const s = useStyles()
  const { page } = useApp()
  const [navOpen, setNavOpen] = useState(true)
  return (
    <div className={s.shell}>
      <Header />
      <div className={s.body}>
        <NavRail open={navOpen} onToggle={() => setNavOpen((o) => !o)} />
        <main className={s.main}>
          {page === 'home' && <HomePage />}
          {page === 'users' && <UsersPage />}
          {page === 'groups' && <GroupsPage />}
          {page === 'onboarding' && <OnboardingPage />}
          {page === 'offboarding' && <OffboardingPage />}
          {page === 'templates' && <TemplatesPage />}
          {page === 'settings' && <SettingsPage />}
        </main>
      </div>
    </div>
  )
}

export function App() {
  return (
    <>
      <Toaster toasterId={TOASTER_ID} position="top-end" pauseOnHover />
      <AppProvider>
        <Shell />
      </AppProvider>
    </>
  )
}

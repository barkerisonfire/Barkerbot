import React from 'react'
import { createRoot } from 'react-dom/client'
import { FluentProvider } from '@fluentui/react-components'
import { App } from './App'
import { theme } from './theme'
import './global.css'

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <FluentProvider theme={theme} style={{ height: '100%' }}>
      <App />
    </FluentProvider>
  </React.StrictMode>
)

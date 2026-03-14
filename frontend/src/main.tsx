import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

const savedTheme = localStorage.getItem('devora-theme')
const parsed = savedTheme ? JSON.parse(savedTheme) : null
const theme = parsed?.state?.theme ?? 'dark'
document.documentElement.setAttribute('data-theme', theme)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

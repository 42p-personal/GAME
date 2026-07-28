/// <reference types="vite/client" />
import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import { TamerArenaDemo } from './tamerengine/TamerArenaDemo'
import { validateDesign } from './validate'
import './styles.css'

if (import.meta.env.DEV) validateDesign()

// DEV ROUTE: `?tamerarena` opens the standalone tamerengine field-battle renderer,
// entirely outside the game/tournament flow — a test-branch preview of the new
// battle engine, not wired into the real loop.
const Root = window.location.search.includes('tamerarena') ? TamerArenaDemo : App

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
)

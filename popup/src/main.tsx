import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { App } from "@/App"
import "@/index.css"

const darkScheme = window.matchMedia("(prefers-color-scheme: dark)")
const applyScheme = () => document.documentElement.classList.toggle("dark", darkScheme.matches)
applyScheme()
darkScheme.addEventListener("change", applyScheme)

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
)

import "../../limits.js"

export const PROVIDERS = [
  { value: "auto", label: "Automático" },
  { value: "catbox", label: "catbox.moe (permanente)" },
  { value: "pomf", label: "pomf.lain.la (permanente)" },
  { value: "uguu", label: "uguu.se (temporário)" },
  { value: "litterbox", label: "litterbox (temporário, até 72h)" },
  { value: "tmpfiles", label: "tmpfiles.org (temporário)" },
  { value: "imgur", label: "Imgur (só com Client-ID antigo)" },
] as const

export type ProviderId = (typeof PROVIDERS)[number]["value"]
export type Format = "html" | "markdown"
export type ChainProviderId = Exclude<ProviderId, "auto" | "imgur">

// limits.js owns the default chain for the service worker too.
export const AUTO_ORDER: readonly ChainProviderId[] =
  (globalThis as { PastePicLimits?: { autoOrder: ChainProviderId[] } }).PastePicLimits!.autoOrder

export const providerLabel = (value: ProviderId) => PROVIDERS.find((p) => p.value === value)!.label
export type Settings = {
  provider: ProviderId
  format: Format
  imgurClientId: string
  sameProviderOnly: boolean
  autoOrder: ChainProviderId[]
}

export const DEFAULTS: Settings = {
  provider: "auto",
  format: "html",
  imgurClientId: "",
  sameProviderOnly: false,
  autoOrder: [...AUTO_ORDER],
}

type StorageArea = {
  get(defaults: Settings, callback: (items: Record<string, unknown>) => void): void
  set(items: Settings, callback: () => void): void
}

type ExtensionApi = { storage: { sync: StorageArea } }

function storage(): StorageArea {
  const g = globalThis as { chrome?: ExtensionApi; browser?: ExtensionApi }
  return (g.chrome ?? g.browser)!.storage.sync
}

const isProvider = (v: unknown): v is ProviderId => PROVIDERS.some((p) => p.value === v)
// Same rule as resolveAutoOrder in background.js: drop unknown or repeated
// names, then append any chain host the stored order does not name.
export function resolveAutoOrder(stored: unknown): ChainProviderId[] {
  const picked = Array.isArray(stored)
    ? [...new Set(stored)].filter((name): name is ChainProviderId => AUTO_ORDER.includes(name))
    : []
  return [...picked, ...AUTO_ORDER.filter((name) => !picked.includes(name))]
}

export const isDefaultOrder = (order: readonly ChainProviderId[]) =>
  order.every((name, i) => name === AUTO_ORDER[i])

const isFormat = (v: unknown): v is Format => v === "html" || v === "markdown"

function parseSettings(items: Record<string, unknown>): Settings {
  return {
    provider: isProvider(items.provider) ? items.provider : DEFAULTS.provider,
    format: isFormat(items.format) ? items.format : DEFAULTS.format,
    imgurClientId: typeof items.imgurClientId === "string" ? items.imgurClientId : DEFAULTS.imgurClientId,
    sameProviderOnly: items.sameProviderOnly === true,
    autoOrder: resolveAutoOrder(items.autoOrder),
  }
}

export function loadSettings(): Promise<Settings> {
  return new Promise((resolve) => storage().get(DEFAULTS, (items) => resolve(parseSettings(items))))
}

export function saveSettings(settings: Settings): Promise<void> {
  return new Promise((resolve) =>
    storage().set({ ...settings, imgurClientId: settings.imgurClientId.trim() }, resolve)
  )
}

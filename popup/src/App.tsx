import { useEffect, useState, type ReactNode } from "react"
import { CircleHelp, Info } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { PROVIDERS, loadSettings, saveSettings, type Format, type Settings } from "@/settings"

const fieldLabel = "font-heading text-xs font-normal tracking-wider"
const hint = "text-xs leading-normal text-muted-foreground"

function HelpButton({ controls, label, open, onToggle, children }: {
  controls: string
  label: string
  open: boolean
  onToggle: () => void
  children: ReactNode
}) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className="size-6"
      aria-label={label}
      title={label}
      aria-expanded={open}
      aria-controls={controls}
      onClick={onToggle}
    >
      {children}
    </Button>
  )
}

export function App() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [imgurHelpOpen, setImgurHelpOpen] = useState(false)
  const [reuseHelpOpen, setReuseHelpOpen] = useState(false)
  const [status, setStatus] = useState("")

  useEffect(() => {
    loadSettings().then(setSettings)
  }, [])

  if (!settings) return null
  const update = (patch: Partial<Settings>) => setSettings({ ...settings, ...patch })

  const save = async () => {
    await saveSettings(settings)
    setStatus("Salvo!")
    setTimeout(() => window.close(), 600)
  }

  return (
    <main className="flex w-[312px] flex-col gap-2.5 px-4 pt-3.5 pb-4 text-[13px] leading-normal">
      <header className="flex flex-col gap-1">
        <h1 className="font-heading text-base">PastePic</h1>
        <p className={hint}>Cole uma imagem no editor: upload + tag no cursor.</p>
      </header>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="provider" className={fieldLabel}>Servidor de imagens</Label>
        <Select
          items={PROVIDERS}
          value={settings.provider}
          onValueChange={(provider) => provider && update({ provider })}
        >
          <SelectTrigger id="provider" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PROVIDERS.map((p) => (
              <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className={hint}>
          No modo automático: catbox → pomf → uguu → litterbox → tmpfiles. Se o catbox estiver pausado, cai para o próximo.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <span id="format-label" className={fieldLabel}>Formato inserido no comentário</span>
        <RadioGroup
          aria-labelledby="format-label"
          value={settings.format}
          onValueChange={(format) => update({ format: format as Format })}
          className="gap-1.5"
        >
          <Label className="font-normal">
            <RadioGroupItem value="html" /> HTML: <code className="font-mono text-xs">&lt;img src="..."&gt;</code>
          </Label>
          <Label className="font-normal">
            <RadioGroupItem value="markdown" /> Markdown: <code className="font-mono text-xs">![](...)</code>
          </Label>
        </RadioGroup>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-1">
          <Label htmlFor="imgurClientId" className={fieldLabel}>Imgur Client-ID (opcional)</Label>
          <HelpButton
            controls="imgurHelpText"
            label="Sobre o Imgur Client-ID"
            open={imgurHelpOpen}
            onToggle={() => setImgurHelpOpen(!imgurHelpOpen)}
          >
            <Info />
          </HelpButton>
        </div>
        <Input
          id="imgurClientId"
          placeholder="só se você já tem um"
          autoComplete="off"
          spellCheck={false}
          value={settings.imgurClientId}
          onChange={(e) => update({ imgurClientId: e.target.value })}
        />
        <p id="imgurHelpText" className={hint} hidden={!imgurHelpOpen}>
          O Imgur <b>fechou novos registros de aplicativo</b> — a página de registro redireciona para a home e não há previsão de reabertura. Este campo serve apenas para quem já possui um Client-ID antigo (nesse caso, o Imgur entra primeiro no modo automático e é permanente).
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-1">
          <Label className="font-normal leading-snug">
            <Checkbox
              checked={settings.sameProviderOnly}
              onCheckedChange={(sameProviderOnly) => update({ sameProviderOnly })}
            />
            Não reaproveitar uploads de outros provedores
          </Label>
          <HelpButton
            controls="reuseHelpText"
            label="Sobre o reaproveitamento de uploads"
            open={reuseHelpOpen}
            onToggle={() => setReuseHelpOpen(!reuseHelpOpen)}
          >
            <CircleHelp />
          </HelpButton>
        </div>
        <p id="reuseHelpText" className={hint} hidden={!reuseHelpOpen}>
          Quando você cola uma imagem que já enviou antes, o PastePic reaproveita o link anterior em vez de subir de novo, mesmo que ela esteja em outro provedor. Links de hosts temporários só são reaproveitados enquanto não expiram. Marque esta opção para reaproveitar só links do provedor escolhido acima (no modo automático, de qualquer provedor da lista); se não houver, a imagem é enviada de novo.
        </p>
      </div>

      <Button className="w-full" onClick={save}>Salvar</Button>
      <div role="status" className="min-h-4 text-xs text-link">{status}</div>
    </main>
  )
}

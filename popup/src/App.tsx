import { useEffect, useId, useState, type ReactNode } from "react"
import { Collapsible } from "@base-ui/react/collapsible"
import { ChevronDown, CircleHelp, Info } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DEFAULTS, PROVIDERS, loadSettings, saveSettings, type Format, type Settings } from "@/settings"

const fieldLabel = "font-heading text-xs font-normal tracking-wider"

function Help({ label, icon, children }: { label: string; icon: ReactNode; children: ReactNode }) {
  const id = useId()
  return (
    <Tooltip>
      <TooltipTrigger
        render={<Button variant="ghost" size="icon-sm" className="size-6" aria-label={label} aria-describedby={id} />}
      >
        {icon}
      </TooltipTrigger>
      <TooltipContent id={id} role="tooltip" side="bottom" className="flex max-w-[280px] flex-col items-start gap-2 leading-normal">
        {children}
      </TooltipContent>
    </Tooltip>
  )
}

export function App() {
  const [settings, setSettings] = useState<Settings | null>(null)
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
      <h1 className="font-heading text-base">PastePic</h1>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-1">
          <Label htmlFor="provider" className={fieldLabel}>Servidor de imagens</Label>
          <Help label="Sobre o modo automático" icon={<Info />}>
            <p>No modo automático: catbox → pomf → uguu → litterbox → tmpfiles.</p>
            <p>Se o catbox estiver pausado, cai para o próximo.</p>
          </Help>
        </div>
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
      </div>

      <div className="flex flex-col gap-1.5">
        <span id="format-label" className={fieldLabel}>Formato</span>
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

      <Collapsible.Root
        defaultOpen={
          settings.imgurClientId !== DEFAULTS.imgurClientId ||
          settings.sameProviderOnly !== DEFAULTS.sameProviderOnly
        }
        className="flex flex-col gap-2.5"
      >
        <Collapsible.Trigger
          render={<Button variant="ghost" size="sm" className="group self-start px-1 -mx-1" />}
        >
          Opções avançadas
          <ChevronDown className="transition-transform group-data-[panel-open]:rotate-180" />
        </Collapsible.Trigger>
        <Collapsible.Panel className="flex flex-col gap-2.5">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-1">
              <Label htmlFor="imgurClientId" className={fieldLabel}>Imgur Client-ID (opcional)</Label>
              <Help label="Sobre o Imgur Client-ID" icon={<Info />}>
                <p>O Imgur <b>fechou novos registros de aplicativo</b> — a página de registro redireciona para a home e não há previsão de reabertura.</p>
                <p>Este campo serve apenas para quem já possui um Client-ID antigo (nesse caso, o Imgur entra primeiro no modo automático e é permanente).</p>
              </Help>
            </div>
            <Input
              id="imgurClientId"
              placeholder="só se você já tem um"
              autoComplete="off"
              spellCheck={false}
              value={settings.imgurClientId}
              onChange={(e) => update({ imgurClientId: e.target.value })}
            />
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
              <Help label="Sobre o reaproveitamento de uploads" icon={<CircleHelp />}>
                <p>Quando você cola uma imagem que já enviou antes, o PastePic reaproveita o link anterior em vez de subir de novo, mesmo que ela esteja em outro provedor.</p>
                <p>Links de hosts temporários só são reaproveitados enquanto não expiram.</p>
                <p>Marque esta opção para reaproveitar só links do provedor escolhido acima (no modo automático, de qualquer provedor da lista); se não houver, a imagem é enviada de novo.</p>
              </Help>
            </div>
          </div>
        </Collapsible.Panel>
      </Collapsible.Root>

      <Button className="w-full" onClick={save}>Salvar</Button>
      <div role="status" className="min-h-4 text-xs text-link">{status}</div>
    </main>
  )
}

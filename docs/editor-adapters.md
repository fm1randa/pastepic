# Camada de adaptadores de editor

Status: implementada (v2.0.0) para CM5, textarea/input e contenteditable.
CM6, ProseMirror/TipTap e Monaco são reconhecidos e reportados como
`unsupported` até ganharem adapter próprio.

## Problema

O paste precisa virar texto no documento do editor que tinha o foco, e o
placeholder `⏳` precisa sair de verdade quando o upload não vira tag. Antes
desta camada havia dois escritores: `content.js` mantinha um CodeMirror 5
inteiro que, em produção, nunca enxergava `element.CodeMirror` (mundo isolado),
e `page-bridge.js` escrevia sem saber em qual editor o usuário colou — pegava o
primeiro `.CodeMirror` do documento. A limpeza do placeholder era
fire-and-forget, e a trava de resposta (180s) era menor que o pior caso da
cadeia automática (5 × 60s).

Qualquer desenho que mantenha dois escritores, ou que devolva o documento
inteiro para o chamador decidir, reintroduz esses defeitos.

## Uso (visão do chamador)

`content.js` é o único chamador. Ele não conhece editor, mundo, retry nem
readback.

```js
const opened = await PastePicEditor.open(event.target);
if (!opened.ok) return toast(openMessage(opened.code, opened.kind), true);

try {
  for (const image of images) {
    const placed = await opened.session.insert(placeholder);
    if (!placed.ok) return;
    // ... upload ...
    const swapped = await opened.session.swap(placeholder, tag);
    if (swapped.ok) toast(`Imagem inserida via ${provider}.`, false);
  }
} finally {
  await opened.session.release();
}
```

Superfície pública: `open(target)` → `{ ok, session } | { ok: false, code, kind }`,
e a sessão com `kind`, `insert(text)`, `swap(needle, text)`, `release()`.

Nenhum tipo de transporte (`op`, `id`, `anchor`, `CustomEvent`, JSON) aparece
aqui. O chamador não sabe se escreveu num CodeMirror 5 ou num `<textarea>`.

## Forma

Duas chaves de identidade, em dois momentos:

- **Antes de escrever**, a âncora: `data-pastepic-anchor` no elemento que
  recebeu o paste. Atributo atravessa a fronteira de mundos; expando não.
- **Depois de escrever**, a agulha: o próprio placeholder, com token. Um
  remount do React mata a instância e pode matar o nó; o texto sobrevive.

A sessão guarda uma agulha pendente, não um registro de editores. Elemento não
serve de chave porque ele morre no remount.

```js
/** @typedef {'plain'|'contenteditable'|'cm5'|'cm6'|'prosemirror'|'monaco'} EditorKind */

/**
 * Handle interno do adapter. Não cruza o evento, não é tipo público.
 * @typedef {Object} EditorHandle
 * @property {EditorKind} kind
 * @property {Element} root
 * @property {(needle: string) => boolean} contains
 * @property {(text: string) => void} insertAtSelection
 * @property {(needle: string, text: string) => boolean} replaceNeedle  // false: não escreveu
 */
```

A busca mora no adapter, não no core. Um offset de string não mapeia 1:1 para
uma posição de ProseMirror; forçar um sistema de coordenadas único seria uma
mentira com perda.

Detecção é uma função, nesta ordem, no mundo MAIN. A primeira casca que resolve
ganha:

1. `.monaco-editor` → `monaco.editor.getEditors()` por contenção (v2: `unsupported`)
2. `.cm-editor` → expando `cmTile`/`cmView` (v2: `unsupported`)
3. `.ProseMirror` → `dom.editor.view` do TipTap (v2: `unsupported`)
4. `.CodeMirror` → `wrap.CodeMirror`
5. `textarea`/`input` fora de casca de editor
6. `[contenteditable]` fora de casca de editor

Casca reconhecida sem instância responde `unsupported`, nunca desce para o
adapter de baixo: escrever no textarea escondido do CM5 ou no `.inputarea` do
Monaco dessincroniza o modelo real.

**Protocolo** (escondido, JSON em `CustomEvent`): `open`, `insert`, `swap`,
`withdraw`. O host devolve código, nunca o documento. `ok` significa readback
conferido, não "a API não lançou".

**Invariantes**

- `open` não escreve: alvo inválido falha antes de aparecer `⏳`.
- Uma sessão por página (`busy`); o cursor é recurso compartilhado.
- `insert` descarta agulha pendente antes de escrever. Não empilha `⏳`.
- `swap` reencontra o editor pela âncora ou, morta esta, pelo único editor
  daquele `kind` cujo texto contém a agulha. Zero ou duas ocorrências: `lost`,
  sem escrita.
- `swap` com a agulha já trocada devolve `already-swapped` e não escreve.
- `release` é o único closer e é idempotente; com agulha pendente, apaga e relê.

**Arquivos**

| Arquivo | Mundo | Papel |
| --- | --- | --- |
| `content.js` | ISOLATED | Gate do paste, upload, toast. Zero API de editor. |
| `editor-session.js` | ISOLATED | `PastePicEditor.open`, retry de `swap`, âncora |
| `page-bridge.js` | MAIN | Detecção, adapters, protocolo. Único escritor. |
| `limits.js` | ISOLATED + worker | `autoOrder` e timeouts; a trava é derivada |
| `background.js` | worker | Upload |

A trava de resposta é `uploadTimeoutMs × (autoOrder.length + 1) + guardSlackMs`
— 375s hoje, derivada, nunca um literal.

## Decisão de síntese

Base: candidato B (`open`/`insert`/`swap`/`release`, âncora + agulha, readback
no contrato, um escritor só). Venceu porque a interface é mais profunda no ponto
que importa: o chamador não orquestra fallback nenhum, e "inserir no cursor
quando a agulha sumiu" deixa de existir como opção.

Enxertado do candidato A:

- a trava derivada em `limits.js` (o A chegou à mesma conclusão por outro
  caminho);
- a cerca estrutural: `content.js` e `editor-session.js` não podem conter
  `CodeMirror`, `cmView`, `cmTile`, `pmViewDesc`, `monaco`, `execCommand` nem
  `replaceRange` — se alguém reintroduzir um escritor no mundo isolado, o grep
  falha;
- a exigência de o harness provar a fronteira de mundos, não só o fluxo visível.

Rejeitado do A:

- contrato uniforme de offsets de caractere (`text`/`splice`): perde para
  ProseMirror, onde posição de documento não é índice de string;
- `janitor` com TTL no mundo MAIN: cobre o caso de o mundo isolado morrer, mas
  adiciona timer e estado para um cenário que o `finally` já cobre na prática;
  fica como opção se aparecer placeholder órfão em produção;
- `chrome.scripting.registerContentScripts` com uma lista única de sites: exige
  `host_permissions` amplo e sai do escopo desta camada.

## Tradeoffs aceitos

- Plain e contenteditable dão uma volta pelo mundo MAIN sem precisar. Custo de
  um evento; ganho de um escritor só, e um fixture que não passa por atalho
  morto.
- `lost` não insere a tag no cursor. A URL vai para o toast — o comportamento
  anterior escrevia no editor errado.
- CM6/ProseMirror/Monaco respondem `unsupported` em vez de melhor esforço. Não
  há site habilitado que use esses editores hoje; melhor recusar do que
  dessincronizar.
- `release` esquecido trava o próximo paste em `busy`, em vez de corromper o
  documento. Barulhento de propósito.

## Alternativas consideradas

**Adapters partidos por mundo** (plain/contenteditable no isolado, CM5+ no
MAIN, com fallback local se a ponte falhar). É o desenho anterior com tipos por
cima. Perde porque o harness continua podendo passar sem a ponte, a política de
"agulha sumiu" ganha duas implementações, e class name não é instância.

**Registro de editores preenchido no `open`.** O elemento que seria a chave
morre no remount; "indexa de novo depois" é o mapa que a estrutura evitava. A
agulha já é o índice.

## Perguntas em aberto e riscos

- `.cm-content` → `cmTile` é expando interno e pode mudar entre versões do CM6.
  O adapter precisa de teste contra uma página CM6 real antes de sair de
  `unsupported`.
- Monaco costuma viver em iframe: exige `all_frames: true` e sessão por frame.
- Shadow DOM: `closest()` não atravessa shadow roots. Hoje o sintoma é
  `not-editable`, não escrita no lugar errado.
- As duas listas de `matches` do manifest continuam sincronizadas à mão.

## Próximo passo

Adapter de CM6 (`cmTile` e `cmView`), com um fixture próprio e um teste de
regressão que garanta que os adapters existentes continuam verdes.

## Migração — estado

| Passo | Estado |
| --- | --- |
| 1. `limits.js` com trava derivada | feito |
| 2. Um escritor: `editor-session.js` + host com CM5/plain/contenteditable | feito |
| 3. Regressão dos dois editores | feito (`two-editors`) |
| 4. Limpeza verificada no contrato | feito (`release` com readback) |
| 5. CM6, ProseMirror/TipTap, Monaco | pendente |
| 6. Cerca permanente no doctor | pendente (grep documentado, não automatizado) |

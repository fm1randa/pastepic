<!-- translated from README.md @ 42fab85 (base: 42fab85; readme-blob: 5f6a6d1751b2b73842b832dc6d7eb06a4846a335); when README.md changes, sync this file and update the SHA and readme-blob (git hash-object README.md) -->
[English](README.md) · **Português (Brasil)**

> A [README.md](README.md) em inglês é a versão de referência; esta tradução pode ficar atrás dela.

# PastePic

Extensão para Chrome (Manifest V3) que cola imagens do clipboard direto no editor de texto:

1. Copie uma imagem (print, `Cmd+Shift+Ctrl+4`, botão direito → Copiar imagem, etc.).
2. Clique no editor e pressione **Cmd+V** (macOS) ou **Ctrl+V**.
3. A extensão faz upload da imagem para um host gratuito **sem precisar de conta** e insere automaticamente a tag `<img src="...">` (ou Markdown) onde estava o cursor.

Paste de texto continua funcionando normalmente — a extensão só age quando o clipboard contém imagem.

Hoje vem habilitada para **TabNews** e **curso.dev**, onde foi testada de ponta a ponta. A lógica é genérica (qualquer `textarea`, `input` ou `contenteditable`; e editores ByteMD/CodeMirror 5 via ponte), então outros sites podem ser adicionados em `manifest.json` — veja "Adicionar outros sites".

## Compatibilidade com o editor (ByteMD/CodeMirror)

O campo de comentário do TabNews e do curso.dev não é um `<textarea>` comum: é o editor ByteMD (CodeMirror 5 por baixo). Content scripts do Chrome rodam num mundo isolado e **não enxergam** a propriedade `elemento.CodeMirror` que a página criou — por isso existe `page-bridge.js`, declarado com `"world": "MAIN"`, que roda como script da página e executa a API nativa do editor (`replaceRange`/`markText`). O `content.js` conversa com ele por eventos DOM com payload JSON. Em campos de texto comuns, a inserção é via `value` + eventos `input`/`change` (compatível com React); em CodeMirror 6/`contenteditable`, usa `execCommand('insertText')` como melhor esforço.

## Como funciona

- `content.js` escuta o evento `paste` no documento. Achou imagem? Cancela o paste, mostra `⏳ Enviando imagem...` no lugar do cursor e envia os bytes ao `background.js`.
- `page-bridge.js` (mundo da página) executa a troca do placeholder pela tag na instância real do CodeMirror 5.
- `background.js` (service worker) faz o upload. O upload roda na extensão (não na página) porque hosts como o catbox.moe não liberam CORS para sites — com `host_permissions` a extensão pode chamar a API direto.
- Ordem no modo **automático**: `catbox.moe` → `pomf.lain.la` → `uguu.se` → `litterbox` (72h) → `tmpfiles.org`. Se um estiver fora do ar (o catbox e o 0x0.st estavam pausados em nov/2026), tenta o próximo.
- Colar de novo a mesma imagem reaproveita o link em vez de enviá-la outra vez. O `background.js` guarda um SHA-256 de cada imagem enviada com a URL no `chrome.storage.local`, só neste dispositivo, e reaproveita o link enquanto o serviço ainda mantém o arquivo (validade por serviço em `limits.js`). A imagem em si não é guardada. O link pode vir de um serviço diferente do escolhido; a opção **Não reaproveitar uploads de outros provedores** no popup (desligada por padrão) limita o reaproveitamento ao serviço escolhido, ou à cadeia automática.
- Opcional: se você possui um **Client-ID antigo do Imgur**, configure-o no popup para uploads permanentes via Imgur. Atenção: o Imgur **fechou novos registros de aplicativo** (a página `api.imgur.com/oauth2/addclient` redireciona para a home, sem previsão de reabertura), então não é mais possível criar um Client-ID novo.
- Formato de inserção configurável no popup: HTML `<img src="...">` (padrão) ou Markdown `![](...)`.

## Instalação (modo desenvolvedor)

1. Baixe/descompacte esta pasta (ou o `pastepic.zip`).
2. Abra `chrome://extensions`.
3. Ative **Modo do desenvolvedor** (canto superior direito).
4. Clique em **Carregar sem compactação** e selecione a pasta `pastepic`.
5. Abra um conteúdo do TabNews ou uma aula do curso.dev (logado), clique no campo de comentário e cole a imagem com Cmd/Ctrl+V.

Para atualizar após editar os arquivos: clique no ícone ⟳ (recarregar) do cartão da extensão em `chrome://extensions`.

## Adicionar outros sites

A extensão já é genérica; o que limita são os domínios listados em `manifest.json`, nas duas entradas de `content_scripts` (a do `page-bridge.js` e a do `content.js`). Para habilitar um site novo:

1. Acrescente o padrão de URL nas **duas** listas `matches` (ex.: `"https://exemplo.com/*"`).
2. Recarregue a extensão em `chrome://extensions` e recarregue a página (o content script já injetado não é atualizado).
3. Cole uma imagem e observe o console: `[PastePic] swap {...}` diz qual `kind` de editor foi usado (`cm5`, `plain`, `contenteditable`) e o código do resultado.

Se a inserção falhar, o toast mostra a URL para colar manualmente. Editores suportados hoje: ByteMD/CodeMirror 5 (via ponte), `<textarea>`/`<input>` e `contenteditable`. CodeMirror 6, ProseMirror/TipTap e Monaco são reconhecidos mas respondem `unsupported` — o toast avisa e nada é escrito no lugar errado.

Evite habilitar em sites que já tratam paste de imagem nativamente (GitHub, GitLab, Discourse, Notion): a extensão interceptaria o paste e mandaria para os hosts dela em vez do upload nativo do site.

## Arquivos

| Arquivo          | Papel                                                          |
| ---------------- | -------------------------------------------------------------- |
| `manifest.json`  | Manifesto MV3: permissões, content scripts, popup               |
| `content.js`     | Intercepta o paste, abre a sessão, faz upload, avisa (toast)     |
| `editor-session.js` | Sessão de edição: âncora, retry da troca, `release` verificado |
| `page-bridge.js` | Mundo da página: detecção de editor, adapters, único escritor   |
| `limits.js`      | Cadeia de provedores e timeouts (a trava de resposta é derivada) |
| `background.js`  | Upload para os hosts gratuitos + fallback                       |
| `popup.html/js`  | Escolha de provedor, formato e Client-ID do Imgur               |

## Limites e solução de problemas

- Imagens de até 20 MB (limite da extensão; cada host tem o seu).
- Hosts temporários (uguu, litterbox, tmpfiles) apagam o arquivo depois de horas — para comentários permanentes, prefira catbox/pomf/Imgur.
- Cada tentativa de upload tem timeout de 60s: se um servidor travar, o modo automático passa para o próximo em vez de deixar o `⏳ Enviando imagem...` preso. A trava total de resposta é derivada da cadeia (`60s × (provedores + 1) + 15s`), hoje 375s.
- Se o placeholder ficar preso ou der erro: abra `chrome://extensions`, clique em **recarregar (⟳)** no cartão da extensão e tente de novo. Para ver o erro exato, em `chrome://extensions` ative o modo desenvolvedor e clique em **service worker** no cartão da extensão para abrir o console (os erros saem com o prefixo `[PastePic]`).

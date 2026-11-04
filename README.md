# TabNews Paste Image

Extensão para Chrome (Manifest V3) que cola imagens do clipboard direto nos comentários do [TabNews](https://www.tabnews.com.br) e nas aulas do [curso.dev](https://curso.dev):

1. Copie uma imagem (print, `Cmd+Shift+Ctrl+4`, botão direito → Copiar imagem, etc.).
2. Clique no campo de comentário do TabNews e pressione **Cmd+V** (macOS) ou **Ctrl+V**.
3. A extensão faz upload da imagem para um host gratuito **sem precisar de conta** e insere automaticamente a tag `<img src="...">` onde estava o cursor.

Paste de texto continua funcionando normalmente — a extensão só age quando o clipboard contém imagem.

## Compatibilidade com o editor (ByteMD/CodeMirror)

O campo de comentário do TabNews e do curso.dev não é um `<textarea>` comum: é o editor ByteMD (CodeMirror por baixo). A extensão detecta isso e insere o texto via `execCommand('insertText')` — o mesmo caminho que funciona no CodeMirror 5, 6 e em `contenteditable` — em vez de manipular `.value`, o que corromperia o estado do editor. Em campos de texto comuns, mantém a inserção via `value` + eventos `input`/`change` (compatível com React).

## Como funciona

- `content.js` escuta o evento `paste` nos campos de texto do TabNews. Achou imagem? Cancela o paste, mostra `⏳ Enviando imagem...` no lugar do cursor e envia os bytes ao `background.js`.
- `background.js` (service worker) faz o upload. O upload roda na extensão (não na página) porque hosts como o catbox.moe não liberam CORS para sites — com `host_permissions` a extensão pode chamar a API direto.
- Ordem no modo **automático**: `catbox.moe` → `pomf.lain.la` → `uguu.se` → `litterbox` (72h) → `tmpfiles.org`. Se um estiver fora do ar (o catbox e o 0x0.st estavam pausados em nov/2026), tenta o próximo.
- Opcional: se você possui um **Client-ID antigo do Imgur**, configure-o no popup para uploads permanentes via Imgur. Atenção: o Imgur **fechou novos registros de aplicativo** (a página `api.imgur.com/oauth2/addclient` redireciona para a home, sem previsão de reabertura), então não é mais possível criar um Client-ID novo.
- Formato de inserção configurável no popup: HTML `<img src="...">` (padrão) ou Markdown `![](...)`.

## Instalação (modo desenvolvedor)

1. Baixe/descompacte esta pasta (ou o `tabnews-paste-image.zip`).
2. Abra `chrome://extensions`.
3. Ative **Modo do desenvolvedor** (canto superior direito).
4. Clique em **Carregar sem compactação** e selecione a pasta `tabnews-paste-image`.
5. Abra um conteúdo do TabNews ou uma aula do curso.dev (logado), clique no campo de comentário e cole a imagem com Cmd/Ctrl+V.

Para atualizar após editar os arquivos: clique no ícone ⟳ (recarregar) do cartão da extensão em `chrome://extensions`.

## Arquivos

| Arquivo         | Papel                                                        |
| --------------- | ------------------------------------------------------------ |
| `manifest.json` | Manifesto MV3: permissões, content script, popup             |
| `content.js`    | Intercepta o paste, placeholder, insere a tag, avisos (toast)|
| `background.js` | Upload para os hosts gratuitos + fallback                    |
| `popup.html/js` | Escolha de provedor, formato e Client-ID do Imgur            |

## Limites e solução de problemas

- Imagens de até 20 MB (limite da extensão; cada host tem o seu).
- Hosts temporários (uguu, litterbox, tmpfiles) apagam o arquivo depois de horas — para comentários permanentes, prefira catbox/pomf/Imgur.
- Cada tentativa de upload tem timeout de 60s: se um servidor travar, o modo automático passa para o próximo em vez de deixar o `⏳ Enviando imagem...` preso. Há ainda uma trava de segurança de 3 min no total.
- Se o placeholder ficar preso ou der erro: abra `chrome://extensions`, clique em **recarregar (⟳)** no cartão da extensão e tente de novo. Para ver o erro exato, em `chrome://extensions` ative o modo desenvolvedor e clique em **service worker** no cartão da extensão para abrir o console (os erros saem com o prefixo `[TabNews Paste Image]`).

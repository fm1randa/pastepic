# Publicação na Chrome Web Store

Tudo que dá para preparar sem a conta de desenvolvedor está pronto. O que
depende de você está marcado como **você**.

## Arquivos

| Arquivo | Uso |
| --- | --- |
| `store/pastepic-2.2.0.zip` | pacote para upload (manifest na raiz), gerado por `npm run package` |
| `store/screenshot-1.png`, `store/screenshot-2.png` | 1280×800 |
| `icons/icon128.png` | ícone da loja |
| `PRIVACY.md` | política de privacidade — publicada em https://fm1randa.github.io/pastepic/privacy.html |

## Campos da listagem (copiar e colar)

**Nome** (máx. 45): `PastePic`

**Descrição curta** (máx. 132):
`Cole imagens no editor: upload automatico e tag <img> ou Markdown no cursor. Sem conta, sem cadastro.`

**Descrição completa:**

```
Cole um print direto no comentario. O PastePic intercepta o Cmd+V / Ctrl+V
quando o clipboard tem imagem, envia para um servico de hospedagem gratuito e
insere a tag no lugar do cursor — sem conta, sem cadastro e sem sair da pagina.

COMO FUNCIONA
1. Copie uma imagem (print, "Copiar imagem", etc.).
2. Cole no editor com Cmd+V / Ctrl+V.
3. A extensao mostra "Enviando imagem...", faz o upload e troca o marcador pela
   tag <img src="..."> (ou Markdown ![](...), se voce preferir).

RECURSOS
- Funciona com CodeMirror 5 / ByteMD (o editor do TabNews e do curso.dev),
  textareas comuns e campos contenteditable.
- Escolha entre HTML e Markdown no popup.
- Varios servidores com fallback automatico: se um estiver fora do ar, tenta o
  proximo. Voce tambem pode fixar um servidor.
- Se a insercao falhar, a extensao mostra a URL para colar manualmente em vez de
  fingir sucesso.
- Paste de texto continua normal: a extensao so age quando ha imagem.

LIMITES
- Imagens ate 20 MB.
- Servidores temporarios (uguu.se, litterbox, tmpfiles.org) apagam o arquivo
  depois de horas ou dias. Para links permanentes, prefira catbox.moe ou
  pomf.lain.la.
- Editores CodeMirror 6, ProseMirror e Monaco ainda nao tem suporte: a extensao
  avisa e nao escreve nada.

PRIVACIDADE
Nenhum dado e enviado ao desenvolvedor. A imagem vai do seu navegador direto
para o servico de hospedagem escolhido. As preferencias ficam no
chrome.storage.sync da sua conta.
```

**Categoria:** Produtividade
**Idioma:** Português (Brasil)

## Aba Privacidade (questionário)

- **Single purpose:** "Colar imagens em editores de texto na web, enviando a
  imagem para um serviço de hospedagem e inserindo o link no cursor."
- **Justificativa de `storage`:** guardar as preferências do popup.
- **Justificativa de host permissions:** enviar a imagem aos serviços de
  hospedagem (eles não liberam CORS para páginas comuns).
- **Justificativa de acesso aos sites:** interceptar a colagem nos editores do
  TabNews e do curso.dev.
- **Código remoto:** Não.
- **Coleta de dados:** o desenvolvedor não coleta nada. A imagem colada é
  transmitida a um terceiro escolhido pelo usuário — declare isso em "dados
  transmitidos a terceiros" e aponte a política.
- **URL da política de privacidade:** `https://fm1randa.github.io/pastepic/privacy.html` (já publicada via GitHub Pages)

## O que só você pode fazer

1. **Conta de desenvolvedor** — uma taxa única de US$ 5 em
   https://chrome.google.com/webstore/devconsole
2. **Upload e envio** — "New item", enviar o zip, preencher os campos acima,
   anexar as duas screenshots e o ícone, e clicar em "Submit for review".
3. **Revisão** — costuma levar de algumas horas a poucos dias. O primeiro envio
   passa por revisão mais cuidadosa.

## Antes de enviar

- [ ] Rodar `npm run package` e conferir que `node .agents/skills/verify-pastepic/helpers/verify.mjs --level full`
      passa (o T0 compara o zip com a árvore de trabalho).
- [ ] Testar a v2.2.0 no curso.dev com a extensão carregada (o harness prova o
      contrato, não a página real).
- [ ] Abrir o popup da extensão carregada e salvar uma configuração (o harness
      prova o popup compilado fora da extensão).
- [ ] Testar no TabNews.
- [ ] Confirmar que o zip tem `manifest.json` na raiz.
- [ ] Conferir que não há `node_modules`, `popup/` (código-fonte), `store/`, `tools/` nem `.agents/` no zip;
      do popup só entra `dist/popup/`.

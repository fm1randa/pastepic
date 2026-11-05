# Política de privacidade — PastePic

Última atualização: 5 de novembro de 2026.

O PastePic é uma extensão de navegador que permite colar imagens em editores
de texto na web: ela envia a imagem para um serviço de hospedagem gratuito e
insere o link resultante no editor, no ponto do cursor.

## O que a extensão faz com os seus dados

- **Imagem colada.** Quando você cola uma imagem, os bytes dessa imagem são
  enviados diretamente do seu navegador para o serviço de hospedagem escolhido
  (por padrão, um da lista: catbox.moe, pomf.lain.la, uguu.se, litterbox ou
  tmpfiles.org; opcionalmente Imgur, se você configurar um Client-ID próprio).
  O desenvolvedor da extensão não recebe, não armazena e não tem acesso a essas
  imagens. O serviço escolhido passa a ser o controlador daquele arquivo e
  aplica a própria política de privacidade e os próprios prazos de expiração.
- **Texto do editor.** A extensão lê e escreve o texto do campo em que você
  colou, apenas para inserir o marcador de envio e depois a tag da imagem. Esse
  texto não é transmitido a nenhum servidor e não é armazenado.
- **Preferências.** As opções do popup (servidor de imagens, formato HTML ou
  Markdown e, se você preencher, o Client-ID do Imgur) são gravadas no
  `chrome.storage.sync` do seu navegador. Elas ficam na sua conta do Chrome e
  não são enviadas ao desenvolvedor.

## O que a extensão não faz

- Não cria contas, não pede login e não coleta identificadores pessoais.
- Não usa analytics, telemetria, rastreamento ou anúncios.
- Não lê nem transmite o conteúdo de outras páginas.
- Não executa código remoto: todo o código está no pacote da extensão.

## Permissões e por quê

- `storage`: guardar as preferências do popup.
- Acesso aos domínios dos serviços de hospedagem: necessário para enviar a
  imagem diretamente do navegador, já que esses serviços não liberam CORS para
  páginas comuns.
- Acesso a `tabnews.com.br` e `curso.dev`: necessário para interceptar a colagem
  de imagem nos editores desses sites.

## Serviços de terceiros

Os arquivos enviados ficam sujeitos aos termos e às políticas dos serviços
escolhidos. Links de serviços temporários (uguu.se, litterbox, tmpfiles.org)
expiram — de horas a alguns dias — e o arquivo é apagado pelo próprio serviço.

## Alterações

Mudanças nesta política serão publicadas nesta página, com a data atualizada.

## Contato

Dúvidas ou pedidos de remoção: abra uma issue no repositório do projeto ou
escreva para o endereço indicado na página da extensão na Chrome Web Store.

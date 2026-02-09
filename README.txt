# Mabres Negócios Imobiliários — Site estático

## Como publicar (Netlify — mais fácil)
1. Entre no Netlify e clique em **Add new site** → **Deploy manually**.
2. Arraste a pasta deste projeto (onde está o `index.html`).
3. O site vai abrir em um domínio do Netlify.

## Conectar seu domínio
No Netlify: **Site settings** → **Domain management** → **Add domain**
- mabresnegociosimobiliarios.com.br
- www.mabresnegociosimobiliarios.com.br

Siga as instruções de DNS que o próprio Netlify mostrar (ele dá exatamente os registros para copiar no seu registrador).

## Editar imóveis
Edite somente: `js/listings.js`

## Trocar fotos
Coloque as imagens em `assets/` e no `js/listings.js` troque o campo `cover`.

# Corrigir redirect do blog (Cloudflare) — passo a passo

O blog **novo** está em **https://www.evolutto.com/blog/**.

O blog **antigo** (WordPress) ainda responde em **https://blog.evolutto.com/**.

Hoje existe uma **regra no Cloudflare** que faz:

`https://evolutto.com/blog/` → redireciona para `https://blog.evolutto.com/` (site antigo)

Isso **não dá para corrigir só no código** — precisa de alguém com login no Cloudflare.

---

## O que fazer (15 minutos)

### 1. Entrar no Cloudflare

1. Acesse https://dash.cloudflare.com
2. Clique no domínio **evolutto.com**

### 2. Apagar a regra velha do blog

1. Menu lateral: **Rules** → **Redirect Rules** (ou **Page Rules**, se for o que vocês usam)
2. Procure regra que mencione **blog** ou que redirecione `/blog` para **blog.evolutto.com**
3. **Delete** essa regra

### 3. Criar redirect do subdomínio antigo → blog novo

Ainda em **Redirect Rules**, criar regra nova:

| Campo | Valor |
|-------|--------|
| Nome | Blog antigo → blog novo |
| Quando | Hostname equals `blog.evolutto.com` |
| Então | Redirect 301 para `https://www.evolutto.com/blog/${uri.path}` |

(Se o painel usar “Dynamic redirect”, a URL de destino é: `https://www.evolutto.com/blog` + caminho da URL antiga.)

### 4. (Opcional) Forçar sempre `www`

Se quiser que **evolutto.com** vire **www.evolutto.com** em tudo:

| Quando | Hostname equals `evolutto.com` |
| Então | Redirect 301 para `https://www.evolutto.com${uri.path}` |

**Importante:** a regra do passo 3 (blog.evolutto.com) deve existir **mesmo** com esta.

### 5. Limpar cache

1. Menu **Caching** → **Configuration**
2. **Purge Everything** (ou purge só `www.evolutto.com` e `evolutto.com`)

---

## Como saber se deu certo

1. Abra **https://www.evolutto.com** → menu **Aprenda → Blog**
2. A URL deve ser **www.evolutto.com/blog** (não `blog.evolutto.com`)
3. Os cards do blog têm **capas azuis editoriais** (não fotos grandes como no print antigo)
4. Teste também: **https://blog.evolutto.com/** deve ir para **www.evolutto.com/blog/**

---

## Mensagem pronta para mandar pro time de infra

> Precisamos ajustar redirects no Cloudflare do evolutto.com:
> 1) Remover regra que manda evolutto.com/blog para blog.evolutto.com
> 2) Criar 301 de blog.evolutto.com/* para https://www.evolutto.com/blog/*
> 3) Purge cache do Cloudflare
>
> O blog novo já está no ar em www.evolutto.com/blog (Cloudflare Pages).

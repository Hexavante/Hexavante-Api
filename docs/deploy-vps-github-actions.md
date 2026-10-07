# GitHub Actions: deploy na VPS

Cada push em `main` aciona somente o deploy deste repositório. O workflow permanece inativo até `ENABLE_VPS_DEPLOY=true` nas variáveis do repositório.

## Configuração no GitHub

Em **Settings → Secrets and variables → Actions**, cadastre em cada um dos quatro repositórios:

- Secret `VPS_HOST`: `187.127.54.55`
- Secret `VPS_USER`: `hexavante-deploy`
- Secret `VPS_PORT`: `22`
- Secret `VPS_SSH_KEY`: chave privada Ed25519 dedicada à automação

Adicione também a variável de repositório `ENABLE_VPS_DEPLOY` com valor `true`. Não cadastre senha SSH nem `DEPLOY_PATH`. O workflow fixa a chave pública do host em `known_hosts`; essa chave precisa ser atualizada no workflow se a chave de host da VPS for rotacionada.

Use o mesmo conjunto nos quatro repositórios. A chave privada deve ficar apenas em GitHub Actions Secrets, nunca no repositório, em arquivos de workflow ou em logs. A chave pública da VPS é limitada a um comando de deploy validado.

## Caminhos e portas

| Repositório | Caminho na VPS | Porta publicada |
| --- | --- | ---: |
| `Hexavante-Api` | `/opt/hexavante/api` | `3045` |
| `Hexavante-Web` | `/opt/hexavante/web` | `3000` |
| `Hexavante-landing` | `/opt/hexavante/landing` | `3001` |
| `Hexavante-admin` | `/opt/hexavante/admin` | `3002` |

## Verificação e rollback

O servidor busca exatamente o SHA do push, constrói a imagem antes de parar o container atual e verifica uma instância candidata em uma porta local temporária. Só então troca o container da aplicação. Se a verificação pós-troca falhar, restaura o container anterior. A configuração do container e os mounts atuais são preservados.

Os workflows não executam Compose e não iniciam MariaDB/Redis. A API inicia diretamente o servidor; não roda `prisma db push` automaticamente durante o deploy. Migrações de banco devem ser planejadas e executadas separadamente. Nginx, containers de banco e volumes de dados não são alterados.

Após cadastrar os secrets e instalar a chave pública restrita na VPS, teste cada workflow separadamente por **Actions → Deploy → Run workflow** antes de depender dos pushes em `main`.

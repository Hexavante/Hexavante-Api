# Hexavante API (Go Service)

Serviço de API em Go de alta performance projetado para atender aos clientes **Web**, **Desktop** e **Mobile**, com latência reduzida e conexão direta com o MySQL/MariaDB unificado.

> **Não é a API inteira.** Em produção o nginx divide `/api/v1/*` entre este
> serviço (notes, visual, study, health) e a Fastify (auth, cursos, loja,
> pagamentos, notificações). Mapa completo e ordem de deploy em
> [`docs/arquitetura-apis.md`](../docs/arquitetura-apis.md).

## Recursos Implementados

1. **Smart Notes**:
   - `GET /api/v1/notes/lesson?lessonId={id}`: Carrega nota da aula.
   - `POST /api/v1/notes/lesson`: Salva nota via upsert otimizado com debounce/autosave no cliente.
   - `GET /api/v1/notes?q={busca}&limit={n}`: Biblioteca centralizada de notas com pesquisa em tempo real.
   - `PATCH /api/v1/notes/{id}/favorite`: Favorita/desfavorita uma nota.

2. **Visual Learning**:
   - `GET /api/v1/visual/preferences`: Recupera preferências do aluno (tipo de diagrama, detalhamento, animações).
   - `PUT /api/v1/visual/preferences`: Atualiza preferências de estudo.

3. **Study & Progress**:
   - `POST /api/v1/study/complete-lesson`: Conclusão idempotente e instantânea de aula, eliminando o delay de Server Actions do Next.js.

## Variáveis de Ambiente

Crie um arquivo `.env` na raiz ou defina as variáveis:

```env
PORT=3050
DATABASE_URL=usuario:senha@tcp(127.0.0.1:3306)/hexavante?parseTime=true
FRONTEND_URL=http://localhost:3000
NODE_ENV=development
```

## Como Rodar

Após instalar o Go 1.22+:

```bash
cd Webs/Hexavante-api/go-service
go mod download
go run cmd/server/main.go
```

## Testes

```bash
go vet ./...
go test ./...
```

Não use `Webs/Hexavante-api-go/` como fonte: é uma cópia sem git do mesmo
código. Edite sempre `go-service/`.

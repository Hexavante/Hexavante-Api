# Multi-stage build para a API Go Hexavante (extremamente leve e rápida)
FROM golang:1.22-alpine AS builder

WORKDIR /app

# Instalar dependências de build
RUN apk add --no-cache git ca-certificates

# Cachear módulos Go
COPY go.mod go.sum ./
RUN go mod download

# Copiar código-fonte
COPY . .

# Compilar binário estático sem dependências externas
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o server cmd/server/main.go

# Imagem final de produção mínima (Scratch ou Alpine enxuto)
FROM alpine:3.19

RUN apk --no-cache add ca-certificates tzdata wget

WORKDIR /app

# Copiar binário da etapa de build
COPY --from=builder /app/server /app/server

# Porta interna padrão da Go API em produção (substitui Fastify :3045).
# Pode ser sobrescrita via env PORT; o compose mapeia 3045:3045.
ENV PORT=3045
EXPOSE 3045

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:${PORT:-3045}/health || exit 1

CMD ["/app/server"]

# =============================================================================
# Stage 1: Build the Go binary
# =============================================================================
FROM golang:1.26-alpine AS builder

RUN apk add --no-cache ca-certificates tzdata

WORKDIR /src

# Cache module dependencies
COPY go.mod go.sum ./
RUN go mod download

# Build
COPY backend ./backend
RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o /app/server ./backend/cmd/server

# =============================================================================
# Stage 2: Minimal runtime image
# =============================================================================
FROM alpine:3.20

RUN apk add --no-cache ca-certificates tzdata curl

# Create non-root user
RUN addgroup -S app && adduser -S app -G app

WORKDIR /app
COPY --from=builder /app/server .
COPY backend/migrations ./migrations

USER app

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/api/v1/health || exit 1

ENTRYPOINT ["/app/server"]

# Builder stage
FROM rust:1.75-slim as builder

WORKDIR /usr/src/app

# Install OpenSSL development dependencies
RUN apt-get update && \
    apt-get install -y pkg-config libssl-dev && \
    rm -rf /var/lib/apt/lists/*

# Copy manifests
COPY Cargo.toml ./

# Copy source code
COPY src ./src
COPY config ./config

# Build for release
RUN cargo build --release

# Runtime stage
FROM debian:stable-slim

WORKDIR /app

# Install SSL certificates and other runtime dependencies
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*

# Copy the built binary
COPY --from=builder /usr/src/app/target/release/history-server .
COPY --from=builder /usr/src/app/config ./config

# Environment variables with defaults
ENV APP__ELASTICSEARCH__URL=http://elasticsearch:9200
ENV APP__SERVER__HOST=0.0.0.0
ENV APP__SERVER__PORT=8080

EXPOSE 8080

CMD ["./history-server"] 
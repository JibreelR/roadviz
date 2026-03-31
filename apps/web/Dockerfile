FROM node:20-bookworm-slim

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-workspace.yaml ./
COPY apps/web/package.json ./apps/web/package.json

RUN pnpm install --frozen-lockfile=false

COPY apps/web ./apps/web

ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL}

WORKDIR /app/apps/web

EXPOSE 3000

CMD ["pnpm", "dev", "--hostname", "0.0.0.0", "--port", "3000"]

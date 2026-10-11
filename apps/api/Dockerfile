# Backend API image. Build from the repo ROOT:
#   docker build -f apps/api/Dockerfile -t fik-api .
# Production runs on AWS Graviton (ARM), so CI builds it with --platform linux/arm64.
FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml turbo.json ./
COPY packages ./packages
COPY apps/api ./apps/api
# Only the API and the workspace packages it depends on.
RUN pnpm install --frozen-lockfile --filter "@finance/api..."
# prisma.config.ts requires a DATABASE_URL just to load; generating the client never connects.
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" \
    pnpm --filter @finance/api exec prisma generate
# Order matters: contracts imports money.
RUN pnpm --filter @finance/money build \
 && pnpm --filter @finance/contracts build \
 && pnpm --filter @finance/api build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /repo /repo
WORKDIR /repo/apps/api
# Never run as root inside the container.
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]

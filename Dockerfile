# The multi-platform index includes linux/arm64 for the initial ol-infra host.
FROM node:24.18.0-bookworm-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d AS dependencies
WORKDIR /app
RUN apt-get update && apt-get install --no-install-recommends -y age=1.1.1-1+b3 ca-certificates && rm -rf /var/lib/apt/lists/*
RUN npm install --global pnpm@11.20.0 --ignore-scripts --no-audit --no-fund
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY vendor-patches ./vendor-patches
RUN pnpm install --frozen-lockfile --ignore-scripts --strict-peer-dependencies

FROM dependencies AS build
COPY . .
ARG APP_BUILD_REVISION
ARG APP_BUILD_DATE
ENV APP_BUILD_REVISION=${APP_BUILD_REVISION} APP_BUILD_DATE=${APP_BUILD_DATE}
# Existing build checks and the bounded runtime/gateway checks, not the paused full campaign.
RUN pnpm build
# Exercise filesystem ownership and child/worker processes as the runtime UID too.
USER 65532:65532
RUN node --test --test-timeout=15000 test/public-runtime/*.test.mjs test/account-application/gateway.test.mjs
RUN node --test --test-timeout=20000 test/public-backup/*.test.mjs

FROM dependencies AS production-dependencies
RUN pnpm prune --prod --ignore-scripts

FROM node:24.18.0-bookworm-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d AS runtime
WORKDIR /app
RUN apt-get update && apt-get install --no-install-recommends -y age=1.1.1-1+b3 ca-certificates && rm -rf /var/lib/apt/lists/*
ARG APP_BUILD_REVISION
ARG APP_BUILD_DATE
LABEL org.opencontainers.image.source="https://github.com/thomasingalls/done" \
      org.opencontainers.image.revision=${APP_BUILD_REVISION}
ENV NODE_ENV=production DONE_SOURCE_REVISION=${APP_BUILD_REVISION}
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/dist ./dist
COPY --from=build /app/account-service ./account-service
COPY --from=build /app/account-protocol ./account-protocol
COPY --from=build /app/scripts/public-account.mjs /app/scripts/public-healthcheck.mjs ./scripts/
COPY --from=build /app/scripts/lib/account-gateway.mjs /app/scripts/lib/packaged-application.mjs ./scripts/lib/
RUN mkdir /data && chown 65532:65532 /data && chmod 0770 /data
USER 65532:65532
EXPOSE 8080
STOPSIGNAL SIGTERM
ENTRYPOINT ["node", "scripts/public-account.mjs"]
CMD ["app"]

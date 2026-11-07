# The multi-platform index includes linux/arm64 for the initial ol-infra host.
FROM node:24.22.1-bookworm-slim@sha256:be8204d4bd327363357f532187b752ff62759c31bedf98e9e18fc08c9cbd605c AS dependencies
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
ARG VITE_ACCOUNT_LEDGER
ARG VITE_ACCOUNT_BATCH
ARG VITE_ACCOUNT_RETENTION_AUTO=0
ARG VITE_ACCOUNT_RETENTION_RESUME=0
ARG VITE_ACCOUNT_HISTORY_AUTO=0
ARG VITE_ACCOUNT_RANGE_RECEIVE=0
ENV APP_BUILD_REVISION=${APP_BUILD_REVISION} APP_BUILD_DATE=${APP_BUILD_DATE}
ENV VITE_ACCOUNT_LEDGER=${VITE_ACCOUNT_LEDGER}
ENV VITE_ACCOUNT_BATCH=${VITE_ACCOUNT_BATCH}
ENV VITE_ACCOUNT_RETENTION_AUTO=${VITE_ACCOUNT_RETENTION_AUTO}
ENV VITE_ACCOUNT_RETENTION_RESUME=${VITE_ACCOUNT_RETENTION_RESUME}
ENV VITE_ACCOUNT_HISTORY_AUTO=${VITE_ACCOUNT_HISTORY_AUTO}
ENV VITE_ACCOUNT_RANGE_RECEIVE=${VITE_ACCOUNT_RANGE_RECEIVE}
# Existing build checks and the bounded runtime/gateway checks, not the paused full campaign.
RUN pnpm build
# Exercise filesystem ownership and child/worker processes as the runtime UID too.
USER 65532:65532
RUN node --test --test-timeout=15000 test/public-runtime/*.test.mjs test/account-application/gateway.test.mjs
RUN node --test --test-timeout=20000 test/public-backup/*.test.mjs
RUN node --test --test-timeout=20000 test/public-restore/*.test.mjs
RUN node --test --test-timeout=20000 test/public-maintenance/*.test.mjs

FROM dependencies AS production-dependencies
RUN pnpm prune --prod --ignore-scripts

FROM golang:1.27.3-alpine@sha256:b8c9b82affbbb82a020bbcf998dad2ba9516944ac7e883524642a481a9505e9c AS age-build
# A static, versioned age binary: no Go toolchain, Alpine libraries or plugins in runtime.
ENV CGO_ENABLED=0 GOTOOLCHAIN=local
RUN set -eu; go install -trimpath filippo.io/age/cmd/age@v1.3.2 \
    && mkdir -p /out/usr/local/bin /out/usr/local/share/doc/age \
    && cp /go/bin/age /out/usr/local/bin/age \
    && go version -m /go/bin/age > /out/usr/local/share/doc/age/build-info.txt \
    && cp /go/pkg/mod/filippo.io/age@v1.3.2/LICENSE /out/usr/local/share/doc/age/LICENSE \
    && for module in $(go version -m /go/bin/age | awk '$1 == "dep" { print $2 "@" $3 }'); do \
         mkdir -p "/out/usr/local/share/doc/age/dependencies/$module" \
         && cp "/go/pkg/mod/$module/LICENSE" "/out/usr/local/share/doc/age/dependencies/$module/LICENSE"; \
       done

FROM dependencies AS runtime-files
# Keep the tested Node version without copying npm, shells or the builder's libc.
RUN mkdir -p /runtime/usr/local/bin /runtime/usr/local/share/doc/node /data \
    && cp /usr/local/bin/node /runtime/usr/local/bin/ \
    && cp /usr/local/LICENSE /runtime/usr/local/share/doc/node/LICENSE \
    && chmod 0770 /data

FROM gcr.io/distroless/cc-debian13:nonroot@sha256:83b9b50586253821cf63ffcec87d3d94265a093ad30da232039af962dd8f4edf AS runtime
WORKDIR /app
ARG APP_BUILD_REVISION
ARG APP_BUILD_DATE
LABEL org.opencontainers.image.source="https://github.com/thomasingalls/done" \
      org.opencontainers.image.revision=${APP_BUILD_REVISION}
ENV NODE_ENV=production DONE_SOURCE_REVISION=${APP_BUILD_REVISION}
COPY --from=runtime-files /runtime/ /
COPY --from=age-build /out/ /
COPY --from=runtime-files --chown=65532:65532 --chmod=0770 /data/ /data/
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/dist ./dist
COPY --from=build /app/account-service ./account-service
COPY --from=build /app/account-protocol ./account-protocol
COPY --from=build /app/scripts/public-account.mjs /app/scripts/public-healthcheck.mjs ./scripts/
COPY --from=build /app/scripts/lib/account-gateway.mjs /app/scripts/lib/packaged-application.mjs ./scripts/lib/
USER 65532:65532
EXPOSE 8080
STOPSIGNAL SIGTERM
ENTRYPOINT ["node", "scripts/public-account.mjs"]
CMD ["app"]

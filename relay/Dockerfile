# The relay, as one small process (TRD §7.2).
#
# Two stages so the runtime image carries neither the TypeScript compiler nor
# the test client. `--no-optional` skips `@y/websocket-server`'s optional
# y-leveldb (a native build this does not use — persistence here is a file) and
# its optional ws@6 (superseded by the direct dependency).

FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./
RUN pnpm install --frozen-lockfile --no-optional
COPY src ./src
RUN pnpm build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --no-optional --prod
COPY --from=build /app/dist ./dist

# The state directory is a volume in compose.yaml. It is a cache of what one
# device sent while the other was away, not a backup — every device holds a
# full replica and the app's export is the backup story (TRD §7.2, §10.5).
ENV PORT=1234 HOST=0.0.0.0 RELAY_DATA_DIR=/data
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 1234

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server.js"]

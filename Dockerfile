# ui-tests serve: the collector, the player, the shared report and the tag's script, as one server.
# Build from the repository root: docker build -t ghcr.io/miguel-perez/ui-tests .
FROM node:24-slim
WORKDIR /app

# The workspace's lockfile names both workspaces, so both manifests come in; only ui-tests is installed.
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY packages/ui-tests/ packages/ui-tests/
RUN npm ci --omit=dev --workspace ui-tests && npm cache clean --force

# Runs and recordings live on the volume (SQLite unless UI_TESTS_DATABASE_URL names a database).
RUN mkdir -p /data && chown node:node /data
ENV PORT=4300 UI_TESTS_DATA_DIR=/data
VOLUME /data
USER node
EXPOSE 4300
HEALTHCHECK CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "packages/ui-tests/bin/ui-tests.mjs", "serve"]

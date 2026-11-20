# Build context: repository root.  docker build -f apps/web/Dockerfile .
FROM node:24-alpine AS base
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/scripture-guide/package.json packages/scripture-guide/
COPY apps/web/package.json apps/web/
COPY apps/chrome-extension/package.json apps/chrome-extension/

FROM base AS pkg
RUN npm ci -w scripture-guide
COPY packages/scripture-guide packages/scripture-guide
RUN npm run build -w scripture-guide

FROM base AS deps
RUN npm ci --omit=dev -w @scripture-guide/web

FROM node:24-alpine
RUN apk add --no-cache ffmpeg
ENV NODE_ENV=production
COPY --from=deps /repo /repo
COPY --from=pkg /repo/packages/scripture-guide/dist /repo/packages/scripture-guide/dist
COPY apps/web /repo/apps/web
WORKDIR /repo/apps/web
# Set by CI (release.yml) so /healthz shows which commit is live. Declared after the COPY
# lines, so a new commit value invalidates only the metadata layers below it.
ARG SG_COMMIT=dev
ENV SG_COMMIT=$SG_COMMIT
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://localhost:3000/health || exit 1
CMD ["node", "src/app.js"]

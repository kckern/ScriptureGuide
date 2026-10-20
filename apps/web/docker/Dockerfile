FROM node:20-alpine AS base

# Install ffmpeg for audio processing
RUN apk add --no-cache ffmpeg

WORKDIR /app

# Dependencies
FROM base AS deps
COPY package*.json ./
RUN npm ci --only=production

# Runner
FROM base AS runner
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "src/app.js"]

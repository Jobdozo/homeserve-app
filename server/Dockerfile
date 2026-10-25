# Node 24: its built-in SQLite (node:sqlite) holds the server's own records (see src/jsonStore.js).
FROM node:24-alpine
WORKDIR /app
# fontconfig lets the image library load the bundled brand fonts (src/assets/fonts) for the text on
# carousel slides and Stories (socialCards.js). Not fatal: without it a carousel goes out as one picture.
RUN apk add --no-cache fontconfig || echo "fontconfig not installed — carousels fall back to single pictures"
# ffmpeg makes the Reels / YouTube Shorts (socialVideo.js). Not fatal: without it no Reels are made.
RUN apk add --no-cache ffmpeg || echo "ffmpeg not installed — no Reels"
COPY package*.json ./
# The VPS build network is slow to reach the npm registry: generous timeouts/retries, IPv4 first.
RUN NODE_OPTIONS=--dns-result-order=ipv4first npm ci --omit=dev --no-audit --no-fund --fetch-retries=5 --fetch-retry-mintimeout=3000 --fetch-timeout=120000
COPY src ./src
EXPOSE 4000
CMD ["node", "src/index.js"]

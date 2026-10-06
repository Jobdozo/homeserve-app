FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
# The VPS build network is slow to reach the npm registry: generous timeouts/retries, IPv4 first.
RUN NODE_OPTIONS=--dns-result-order=ipv4first npm ci --omit=dev --no-audit --no-fund --fetch-retries=5 --fetch-retry-mintimeout=3000 --fetch-timeout=120000
COPY src ./src
EXPOSE 4000
CMD ["node", "src/index.js"]

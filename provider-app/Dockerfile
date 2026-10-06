FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
# npm 10.8 (bundled with this image) can quit mid-install with "Exit handler never
# called!" and leave a half-installed node_modules while still exiting 0.
# 10.9 does not, and the check below makes any partial install fail right here
# instead of later as "vite: not found". The VPS's build network is slow to reach
# the npm registry, hence the generous timeouts/retries and IPv4-first lookups.
RUN NODE_OPTIONS=--dns-result-order=ipv4first npm install -g npm@10.9.9 --no-audit --no-fund --fetch-retries=5 --fetch-retry-mintimeout=3000 --fetch-timeout=120000
RUN NODE_OPTIONS=--dns-result-order=ipv4first npm ci --no-audit --no-fund --fetch-retries=5 --fetch-retry-mintimeout=3000 --fetch-timeout=120000 \
 && test -x node_modules/.bin/vite
COPY . .
ARG VITE_SERVER_URL
ENV VITE_SERVER_URL=$VITE_SERVER_URL
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80

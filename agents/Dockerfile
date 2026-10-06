FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
COPY src ./src
# No npm dependencies; state lives on a mounted volume.
RUN mkdir -p /app/state && chown -R node:node /app
USER node
CMD ["node", "src/index.js"]

FROM node:20-alpine

RUN mkdir -p /usr/src/node-app && chown -R node:node /usr/src/node-app

WORKDIR /usr/src/node-app

# Disable husky in container (no git hooks needed in production)
ENV HUSKY=0

# Use npm (project has package-lock.json, not yarn.lock)
COPY package.json package-lock.json ./

USER node

RUN npm ci --omit=dev

COPY --chown=node:node . .

EXPOSE 3000

CMD ["node", "src/index.js"]

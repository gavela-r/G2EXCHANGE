FROM node:22

WORKDIR /app/valuation_engine

COPY valuation_engine/package*.json ./
RUN npm ci
COPY valuation_engine/ ./

WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci
COPY server/ ./

RUN npm run build

CMD ["npm", "run", "start"]

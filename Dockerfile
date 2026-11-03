FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --ignore-scripts
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build -- --webpack
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
RUN groupadd --gid 1001 dattier && useradd --uid 1001 --gid dattier --create-home dattier
COPY --from=build --chown=dattier:dattier /app .
USER dattier
EXPOSE 3000
CMD ["npm","run","start","--","--hostname","0.0.0.0"]

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY prisma ./prisma
RUN npx prisma generate
COPY --from=build /app/dist ./dist
COPY views ./views
COPY public ./public

RUN useradd --system --create-home --shell /usr/sbin/nologin appuser \
  && mkdir -p /var/lib/b2b-portal/storage \
  && chown -R appuser:appuser /app /var/lib/b2b-portal
USER appuser

EXPOSE 3000
CMD ["node", "dist/main.js"]

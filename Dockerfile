# ---- Build stage -------------------------------------------------------------
FROM node:24-alpine AS build
WORKDIR /app
# Dependencies first so they cache independently of source changes.
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- Runtime dependencies ----------------------------------------------------
# A second npm pass keeps devDependencies (Vite, TypeScript, React) out of the
# final image. The server needs only Express and Multer — SQLite comes from
# Node's built-in node:sqlite, so there is no native module to compile and no
# build toolchain in the runtime image.
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# ---- Runtime stage -----------------------------------------------------------
FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY server ./server
COPY package.json ./

# The SQLite database and uploaded files live here. Created before dropping
# privileges so a named volume mounted at this path inherits the right owner;
# bind mounts must be writable by uid 1000.
RUN mkdir -p /data && chown -R node:node /data
USER node

ENV PORT=8080 \
    FORMFLOW_DATA_DIR=/data
VOLUME ["/data"]

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:8080/api/health || exit 1

CMD ["node", "server/index.mjs"]

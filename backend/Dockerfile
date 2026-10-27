# Imagem usada pelo docker-compose.yml (ambiente local). O Render não usa este
# arquivo: lá o build é o nativo do Node (ver DEPLOY.md).

# Estágio 1: Build
FROM node:20-alpine AS builder

# Prisma Client requer openssl no Alpine
RUN apk add --no-cache openssl

WORKDIR /app

# Copia arquivos de configuração e a pasta prisma primeiro (para o postinstall funcionar)
COPY package.json package-lock.json* ./
COPY prisma ./prisma/

# Instala todas as dependências (devDependencies necessárias para build).
# O postinstall roda o prisma generate. O serviço `migrate` do compose usa este
# estágio porque precisa do CLI do Prisma.
RUN npm ci

# Copia o restante do código fonte
COPY . .

# Realiza o build do projeto (TypeScript -> dist)
RUN npm run build

# Tira as devDependencies, mantendo o Prisma Client já gerado em node_modules/.prisma
RUN npm prune --omit=dev && npm cache clean --force

# Estágio 2: Produção
FROM node:20-alpine AS runner

# Prisma Client requer openssl no Alpine
RUN apk add --no-cache openssl

WORKDIR /app

ENV NODE_ENV=production

# Copia apenas o necessário para rodar. Não reinstala: o postinstall (prisma
# generate) falharia sem o CLI do Prisma, que é devDependency.
COPY package.json ./
COPY prisma ./prisma/
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

# Configuração de segurança (usuário não-root)
RUN addgroup --system --gid 1001 appgroup && \
    adduser --system --uid 1001 appuser
USER appuser

EXPOSE 5000

# Só sobe o servidor. As migrações rodam antes, no serviço `migrate` do compose.
CMD ["npm", "start"]

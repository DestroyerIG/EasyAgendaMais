# Imagem usada pelo docker-compose.yml (ambiente local). A Vercel não usa este arquivo.
FROM node:20-alpine AS base

# O next.config.js usa a pasta pai como outputFileTracingRoot. Com o app em
# /app/frontend, o standalone sai em .next/standalone/frontend/server.js.
WORKDIR /app/frontend

FROM base AS build
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_GOOGLE_LOGIN_ATIVO
ARG NEXT_PUBLIC_WHATSAPP_CONTACT_URL
ARG NEXT_PUBLIC_SUPPORT_WHATSAPP
ARG BACKEND_ORIGIN
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_PUBLIC_GOOGLE_LOGIN_ATIVO=$NEXT_PUBLIC_GOOGLE_LOGIN_ATIVO \
    NEXT_PUBLIC_WHATSAPP_CONTACT_URL=$NEXT_PUBLIC_WHATSAPP_CONTACT_URL \
    NEXT_PUBLIC_SUPPORT_WHATSAPP=$NEXT_PUBLIC_SUPPORT_WHATSAPP \
    BACKEND_ORIGIN=$BACKEND_ORIGIN
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
RUN npm run build

# Production image
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=build --chown=nextjs:nodejs /app/frontend/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/frontend/.next/static ./frontend/.next/static
COPY --from=build --chown=nextjs:nodejs /app/frontend/public ./frontend/public

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "frontend/server.js"]

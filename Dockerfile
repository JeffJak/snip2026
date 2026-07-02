FROM oven/bun:1-alpine

WORKDIR /app
COPY bundle/ ./

ENV PORT=3000
EXPOSE 3000

CMD ["bun", "server.js"]

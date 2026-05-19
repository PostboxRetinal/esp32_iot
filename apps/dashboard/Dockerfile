FROM oven/bun:1

WORKDIR /app

COPY package.json ./
RUN bun install

COPY tsconfig.json vite.config.ts index.html ./
COPY src ./src

EXPOSE 5173

CMD ["bun", "run", "dev"]

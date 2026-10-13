# Fleet HQ · agent-hq — sovereign foreman container.
# Keys are passed at runtime via `docker run -e` (or a mounted/baked .env volume) —
# they are NEVER committed to git. The data dir should be a mounted clone of
# roshpinacare-sys/Domain (-v /path/to/Domain:/data -e AGENT_HQ_DATA_DIR=/data)
# so the office's books + memory persist by committing to that clone.
FROM oven/bun:1

WORKDIR /app

COPY package.json bun.lock tsconfig.json index.ts ./
COPY src ./src
COPY demo-data ./demo-data

RUN bun install

ENV AGENT_HQ_PORT=3010
EXPOSE 3010

CMD ["bun", "run", "index.ts"]

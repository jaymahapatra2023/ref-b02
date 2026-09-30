# Nothing from a package registry: Node 22's standard library has the HTTP server and the test
# runner this needs, so the build is a copy and works without network access.
FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json ./
COPY src ./src
COPY test ./test
ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080
CMD ["node", "src/server.js"]

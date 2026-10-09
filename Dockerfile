FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000 DATA_DIR=/data
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY src ./src
COPY public ./public
COPY scripts ./scripts
# يعمل بصلاحية الجذر لأن أقراص Railway الدائمة تركب مملوكة للجذر
RUN mkdir -p /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:3000/health || exit 1
CMD ["node", "--no-warnings=ExperimentalWarning", "src/server.js"]

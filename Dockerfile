FROM oven/bun:1.4.2
WORKDIR /app
COPY package.json server.js ./
COPY src ./src
COPY data ./data
COPY public ./public
COPY scripts ./scripts
COPY ["index.html", "helios_ai_landing_page.html", "helios_100_frontend_demo.html", "helios-unified.html", "health_wealth_of_nations.html", "communal_science_lab_webgpu (1).html", "./"]
COPY docker-entrypoint.sh /usr/local/bin/helios-entrypoint
RUN chmod +x /usr/local/bin/helios-entrypoint
ENV NODE_ENV=production PORT=8080 DATABASE_PATH=/data/helios.sqlite
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/helios-entrypoint"]

# MySQL preloaded with the public-domain seeds. Build context: repository root.
#   docker build -f infra/seed/Dockerfile -t scripture-guide-seed .
FROM mysql:8.0
ENV MYSQL_DATABASE=scripture_guide
COPY data/seeds/schema.sql /docker-entrypoint-initdb.d/00-schema.sql
COPY data/seeds/*.sql.gz /docker-entrypoint-initdb.d/

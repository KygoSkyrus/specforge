.PHONY: dev infra-up infra-down install build test typecheck db-migrate db-generate

install:
	pnpm install

infra-up:
	docker compose -f infra/docker/docker-compose.yml up -d

infra-down:
	docker compose -f infra/docker/docker-compose.yml down

db-generate:
	pnpm db:generate

db-migrate:
	cp apps/api/.env.example apps/api/.env 2>/dev/null || true
	pnpm db:migrate

dev: infra-up
	pnpm dev

build:
	pnpm build

test:
	pnpm test

typecheck:
	pnpm typecheck

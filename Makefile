.PHONY: help setup dev build test test-contracts lint format clean db-up db-down db-migrate db-seed db-studio

## help: Show this help message
help:
	@echo "OpenClaw Platform - Available Targets:"
	@echo ""
	@grep -E '^## ' $(MAKEFILE_LIST) | sed 's/## /  /'
	@echo ""

## setup: Install all dependencies and setup dev environment
setup:
	npm ci
	npx prisma generate --schema=prisma/schema.prisma
	cp -n .env.example .env 2>/dev/null || true
	@echo "Setup complete. Edit .env with your configuration."

## dev: Start the full development stack (docker services + Next.js + agent runtime)
dev: db-up
	npx turbo dev

## build: Build all packages and applications
build:
	npx turbo build

## test: Run all TypeScript tests
test:
	npx turbo test

## test-contracts: Run Foundry smart contract tests with gas report
test-contracts:
	cd contracts && forge test -vvv --gas-report

## lint: Run ESLint across the entire project
lint:
	npx turbo lint

## format: Format all files with Prettier
format:
	npx prettier --write "**/*.{ts,tsx,js,jsx,json,css,md,yml,yaml}"

## clean: Remove all build artifacts and node_modules
clean:
	rm -rf node_modules
	rm -rf apps/web/.next
	rm -rf apps/web/node_modules
	rm -rf apps/agent-runtime/dist
	rm -rf apps/agent-runtime/node_modules
	rm -rf packages/shared/dist
	rm -rf packages/shared/node_modules
	rm -rf packages/contract-abis/node_modules
	rm -rf contracts/out
	rm -rf contracts/cache
	@echo "Clean complete."

## db-up: Start PostgreSQL and Redis containers
db-up:
	docker compose up -d postgres redis
	@echo "Waiting for services to be healthy..."
	@docker compose exec postgres pg_isready -U openclaw -d openclaw > /dev/null 2>&1 || sleep 3
	@echo "Database services are running."

## db-down: Stop and remove database containers
db-down:
	docker compose down

## db-migrate: Run Prisma database migrations
db-migrate:
	npx prisma migrate dev --schema=prisma/schema.prisma

## db-seed: Seed the database with initial data
db-seed:
	npx prisma db seed

## db-studio: Open Prisma Studio for database management
db-studio:
	npx prisma studio --schema=prisma/schema.prisma

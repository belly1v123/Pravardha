.PHONY: help install migrate deploy-fn web anchor test clean

help:
	@echo "Pravardha - IoT Environmental Monitoring with Solana"
	@echo ""
	@echo "Targets:"
	@echo "  install       - Install all dependencies"
	@echo "  migrate       - Run Supabase migrations"
	@echo "  deploy-fn     - Deploy Supabase Edge Functions"
	@echo "  web           - Run web dashboard (dev mode)"
	@echo "  anchor        - Build and deploy Anchor program"
	@echo "  seed          - Seed a test device"
	@echo "  test          - Run tests"
	@echo "  clean         - Clean build artifacts"

install:
	@echo "Installing dependencies..."
	cd web && npm install
	cd scripts && npm install
	cd chain && npm install
	@echo "✅ Dependencies installed"

migrate:
	@echo "Running Supabase migrations..."
	supabase db push
	@echo "✅ Migrations complete"

deploy-fn:
	@echo "Deploying Supabase Edge Functions..."
	supabase functions deploy ingest --no-verify-jwt
	supabase functions deploy cron_rollup --no-verify-jwt
	@echo "✅ Functions deployed"

web:
	@echo "Starting web dashboard..."
	cd web && npm run dev

anchor:
	@echo "Building and deploying Anchor program..."
	cd chain && anchor build && anchor deploy
	@echo "✅ Anchor program deployed"
	@echo "⚠️  Update PRAVARDHA_PROGRAM_ID in .env with the new program ID"

seed:
	@echo "Seeding test device..."
	cd scripts && npx tsx seed_device.ts

test:
	@echo "Running tests..."
	cd web && npm test
	@echo "✅ Tests complete"

clean:
	@echo "Cleaning build artifacts..."
	rm -rf web/dist web/node_modules
	rm -rf scripts/node_modules
	rm -rf chain/target chain/.anchor chain/node_modules
	@echo "✅ Clean complete"

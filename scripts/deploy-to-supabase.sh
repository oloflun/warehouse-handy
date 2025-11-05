#!/bin/bash

# Deploy Warehouse Handy Backend to Supabase
# This script helps you deploy all migrations and Edge Functions to your Supabase project
#
# Prerequisites:
# 1. Supabase CLI installed (https://supabase.com/docs/guides/cli)
# 2. .env file with credentials
# 3. PostgreSQL client (psql) for database migrations

set -e  # Exit on error

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

PROJECT_REF="sublzjeyxfaxiekacfme"
PROJECT_URL="https://sublzjeyxfaxiekacfme.supabase.co"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Warehouse Handy - Supabase Deployment${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo "Project: Logic WMS"
echo "Project ID: $PROJECT_REF"
echo "URL: $PROJECT_URL"
echo ""

# Check prerequisites
echo -e "${BLUE}Checking prerequisites...${NC}"
echo ""

# Check for .env file
if [ ! -f ".env" ]; then
    echo -e "${RED}✗ .env file not found${NC}"
    echo "  Please create .env file from .env.example"
    exit 1
fi
echo -e "${GREEN}✓ .env file found${NC}"

# Load environment variables
source .env

# Check for required variables
if [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
    echo -e "${RED}✗ SUPABASE_SERVICE_ROLE_KEY not set in .env${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Service role key loaded${NC}"

# Check for psql
if ! command -v psql &> /dev/null; then
    echo -e "${YELLOW}⚠ psql not found - database migrations cannot be run automatically${NC}"
    echo "  Install PostgreSQL client: sudo apt-get install postgresql-client"
    PSQL_AVAILABLE=false
else
    echo -e "${GREEN}✓ psql (PostgreSQL client) found${NC}"
    PSQL_AVAILABLE=true
fi

# Check for supabase CLI
if ! command -v supabase &> /dev/null; then
    echo -e "${YELLOW}⚠ Supabase CLI not found - Edge Functions cannot be deployed automatically${NC}"
    echo "  Install: https://supabase.com/docs/guides/cli#installing-the-cli"
    SUPABASE_CLI_AVAILABLE=false
else
    echo -e "${GREEN}✓ Supabase CLI found${NC}"
    SUPABASE_CLI_AVAILABLE=true
fi

echo ""

# Ask what to deploy
echo -e "${BLUE}What would you like to deploy?${NC}"
echo "1) Database migrations only"
echo "2) Edge Functions only"
echo "3) Both migrations and Edge Functions"
echo "4) View deployment status"
echo ""
read -p "Enter choice [1-4]: " choice

case $choice in
    1)
        DEPLOY_MIGRATIONS=true
        DEPLOY_FUNCTIONS=false
        ;;
    2)
        DEPLOY_MIGRATIONS=false
        DEPLOY_FUNCTIONS=true
        ;;
    3)
        DEPLOY_MIGRATIONS=true
        DEPLOY_FUNCTIONS=true
        ;;
    4)
        echo ""
        echo -e "${BLUE}========================================${NC}"
        echo -e "${BLUE}Deployment Status Check${NC}"
        echo -e "${BLUE}========================================${NC}"
        echo ""
        
        echo -e "${YELLOW}Database Migrations:${NC}"
        echo "Total migration files: $(ls -1 supabase/migrations/*.sql 2>/dev/null | wc -l)"
        echo ""
        ls -1 supabase/migrations/*.sql 2>/dev/null | sed 's/.*\//  /' || echo "  No migration files found"
        echo ""
        
        echo -e "${YELLOW}Edge Functions:${NC}"
        echo "Total functions: $(ls -d supabase/functions/*/ 2>/dev/null | grep -v "_shared" | wc -l)"
        echo ""
        ls -d supabase/functions/*/ 2>/dev/null | grep -v "_shared" | sed 's/.*\///;s/\///' | sed 's/^/  /' || echo "  No functions found"
        echo ""
        
        exit 0
        ;;
    *)
        echo "Invalid choice"
        exit 1
        ;;
esac

echo ""

# Deploy Database Migrations
if [ "$DEPLOY_MIGRATIONS" = true ]; then
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}Deploying Database Migrations${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
    
    if [ "$PSQL_AVAILABLE" = false ]; then
        echo -e "${RED}Cannot deploy migrations: psql not available${NC}"
        echo ""
        echo "Manual deployment instructions:"
        echo "1. Get database connection string from Supabase Dashboard"
        echo "2. Run each migration file manually:"
        echo ""
        for migration in supabase/migrations/*.sql; do
            echo "   psql \"postgresql://postgres:[PASSWORD]@db.$PROJECT_REF.supabase.co:5432/postgres\" < $migration"
        done
        echo ""
    else
        echo "Found $(ls -1 supabase/migrations/*.sql 2>/dev/null | wc -l) migration files"
        echo ""
        
        # Build connection string
        read -sp "Enter database password (from Supabase Dashboard → Settings → Database): " DB_PASSWORD
        echo ""
        
        CONNECTION_STRING="postgresql://postgres:$DB_PASSWORD@db.$PROJECT_REF.supabase.co:5432/postgres"
        
        echo ""
        echo "Applying migrations..."
        echo ""
        
        MIGRATION_COUNT=0
        MIGRATION_SUCCESS=0
        MIGRATION_FAILED=0
        
        for migration in supabase/migrations/*.sql; do
            MIGRATION_COUNT=$((MIGRATION_COUNT + 1))
            MIGRATION_NAME=$(basename "$migration")
            
            echo -n "[$MIGRATION_COUNT] $MIGRATION_NAME ... "
            
            if psql "$CONNECTION_STRING" -f "$migration" > /dev/null 2>&1; then
                echo -e "${GREEN}✓${NC}"
                MIGRATION_SUCCESS=$((MIGRATION_SUCCESS + 1))
            else
                echo -e "${RED}✗${NC}"
                MIGRATION_FAILED=$((MIGRATION_FAILED + 1))
                echo "    (may already be applied - this is okay)"
            fi
        done
        
        echo ""
        echo "Summary:"
        echo "  Total: $MIGRATION_COUNT"
        echo "  Success: $MIGRATION_SUCCESS"
        echo "  Failed/Skipped: $MIGRATION_FAILED"
        echo ""
    fi
fi

# Deploy Edge Functions
if [ "$DEPLOY_FUNCTIONS" = true ]; then
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}Deploying Edge Functions${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
    
    if [ "$SUPABASE_CLI_AVAILABLE" = false ]; then
        echo -e "${RED}Cannot deploy functions: Supabase CLI not available${NC}"
        echo ""
        echo "Manual deployment instructions:"
        echo "1. Install Supabase CLI: https://supabase.com/docs/guides/cli"
        echo "2. Login: supabase login"
        echo "3. Link project: supabase link --project-ref $PROJECT_REF"
        echo "4. Deploy all functions: supabase functions deploy"
        echo ""
    else
        FUNCTION_COUNT=$(ls -d supabase/functions/*/ 2>/dev/null | grep -v "_shared" | wc -l)
        echo "Found $FUNCTION_COUNT Edge Functions"
        echo ""
        
        read -p "Deploy all functions? (y/N) " -n 1 -r
        echo
        
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            echo ""
            echo "Deploying all Edge Functions to project $PROJECT_REF..."
            echo ""
            
            if supabase functions deploy --project-ref "$PROJECT_REF"; then
                echo ""
                echo -e "${GREEN}✓ All functions deployed successfully${NC}"
            else
                echo ""
                echo -e "${RED}✗ Function deployment failed${NC}"
                echo "Check the error messages above"
            fi
        fi
    fi
fi

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}Deployment Complete!${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo "Next steps:"
echo "1. Verify migrations in Supabase Dashboard → Database → Migrations"
echo "2. Test Edge Functions in Supabase Dashboard → Edge Functions"
echo "3. Deploy frontend using QUICK_START.md"
echo "4. Update Supabase Auth URLs with your deployment URL"
echo ""
echo "For help, see docs/DEPLOYMENT_GUIDE.md"
echo ""

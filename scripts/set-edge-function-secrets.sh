#!/bin/bash

# Set Supabase Edge Function Secrets
# This script helps you securely set environment variables for Edge Functions
#
# Usage: ./scripts/set-edge-function-secrets.sh

set -e  # Exit on error

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_REF="sublzjeyxfaxiekacfme"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Supabase Edge Function Secrets Setup${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Check if supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo -e "${RED}Error: Supabase CLI not found${NC}"
    echo "Install it with: npm install -g supabase"
    exit 1
fi

echo -e "${GREEN}✓ Supabase CLI found${NC}"
echo ""

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo -e "${RED}Error: .env file not found${NC}"
    echo "Copy .env.example to .env and fill in your keys first"
    exit 1
fi

echo -e "${GREEN}✓ .env file found${NC}"
echo ""

# Load service role key from .env
source .env

# Check if service role key is set
if [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
    echo -e "${RED}Error: SUPABASE_SERVICE_ROLE_KEY not found in .env${NC}"
    echo "Add your service_role key to .env file"
    exit 1
fi

echo -e "${GREEN}✓ Service role key loaded from .env${NC}"
echo ""

# Warning message
echo -e "${YELLOW}⚠️  WARNING: This will set secrets for Edge Functions${NC}"
echo -e "${YELLOW}   These secrets will be available to all Edge Functions${NC}"
echo ""
echo "Project: $PROJECT_REF"
echo ""
read -p "Continue? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Cancelled"
    exit 0
fi

echo ""
echo -e "${BLUE}Setting Edge Function secrets...${NC}"
echo ""

# Set service role key
echo "1. Setting SUPABASE_SERVICE_ROLE_KEY..."
if supabase secrets set SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" --project-ref "$PROJECT_REF"; then
    echo -e "${GREEN}   ✓ SUPABASE_SERVICE_ROLE_KEY set${NC}"
else
    echo -e "${RED}   ✗ Failed to set SUPABASE_SERVICE_ROLE_KEY${NC}"
fi
echo ""

# Set URL
echo "2. Setting SUPABASE_URL..."
if supabase secrets set SUPABASE_URL="$VITE_SUPABASE_URL" --project-ref "$PROJECT_REF"; then
    echo -e "${GREEN}   ✓ SUPABASE_URL set${NC}"
else
    echo -e "${RED}   ✗ Failed to set SUPABASE_URL${NC}"
fi
echo ""

# Set anon key (for Edge Functions that need it)
echo "3. Setting SUPABASE_ANON_KEY..."
if supabase secrets set SUPABASE_ANON_KEY="$VITE_SUPABASE_PUBLISHABLE_KEY" --project-ref "$PROJECT_REF"; then
    echo -e "${GREEN}   ✓ SUPABASE_ANON_KEY set${NC}"
else
    echo -e "${RED}   ✗ Failed to set SUPABASE_ANON_KEY${NC}"
fi
echo ""

# Add any additional secrets needed by your Edge Functions
# Example: OpenAI API key (if used)
# if [ -n "$OPENAI_API_KEY" ]; then
#     echo "4. Setting OPENAI_API_KEY..."
#     supabase secrets set OPENAI_API_KEY="$OPENAI_API_KEY" --project-ref "$PROJECT_REF"
#     echo -e "${GREEN}   ✓ OPENAI_API_KEY set${NC}"
# fi

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}✓ Secrets configuration complete!${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo "To verify secrets were set:"
echo "  supabase secrets list --project-ref $PROJECT_REF"
echo ""
echo "To unset a secret:"
echo "  supabase secrets unset SECRET_NAME --project-ref $PROJECT_REF"
echo ""
echo -e "${YELLOW}Note: Changes take effect immediately for new function invocations${NC}"
echo ""

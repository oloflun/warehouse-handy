#!/bin/bash

# Warehouse Handy - Database Backup Script
# This script creates a backup of the Supabase database and configurations
#
# Usage: ./scripts/backup.sh [backup-dir]
#
# Environment variables required:
#   SUPABASE_DB_URL - PostgreSQL connection string
#   or individual components:
#   SUPABASE_PROJECT_REF - Project reference (e.g., sublzjeyxfaxiekacfme)
#   SUPABASE_DB_PASSWORD - Database password

set -e  # Exit on error
set -u  # Exit on undefined variable

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="${1:-$PROJECT_ROOT/backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="warehouse_handy_backup_$TIMESTAMP"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_requirements() {
    log_info "Checking requirements..."
    
    # Check for required tools
    if ! command -v pg_dump &> /dev/null; then
        log_error "pg_dump not found. Please install PostgreSQL client tools."
        exit 1
    fi
    
    if ! command -v git &> /dev/null; then
        log_error "git not found. Please install git."
        exit 1
    fi
    
    log_info "All required tools found."
}

setup_backup_dir() {
    log_info "Setting up backup directory: $BACKUP_DIR/$BACKUP_NAME"
    mkdir -p "$BACKUP_DIR/$BACKUP_NAME"
    cd "$BACKUP_DIR/$BACKUP_NAME"
}

backup_database() {
    log_info "Starting database backup..."
    
    # Build connection string
    if [ -z "${SUPABASE_DB_URL:-}" ]; then
        if [ -z "${SUPABASE_PROJECT_REF:-}" ] || [ -z "${SUPABASE_DB_PASSWORD:-}" ]; then
            log_error "Either SUPABASE_DB_URL or (SUPABASE_PROJECT_REF and SUPABASE_DB_PASSWORD) must be set"
            exit 1
        fi
        DB_URL="postgresql://postgres:${SUPABASE_DB_PASSWORD}@db.${SUPABASE_PROJECT_REF}.supabase.co:5432/postgres"
    else
        DB_URL="$SUPABASE_DB_URL"
    fi
    
    # Full database dump
    log_info "Creating full database dump..."
    pg_dump "$DB_URL" > "database_full.sql"
    
    # Schema-only dump
    log_info "Creating schema-only dump..."
    pg_dump --schema-only "$DB_URL" > "database_schema.sql"
    
    # Data-only dump
    log_info "Creating data-only dump..."
    pg_dump --data-only "$DB_URL" > "database_data.sql"
    
    # Dump specific critical tables
    log_info "Creating critical tables backup..."
    pg_dump "$DB_URL" \
        -t public.products \
        -t public.inventory \
        -t public.orders \
        -t public.order_lines \
        -t public.delivery_notes \
        -t public.delivery_note_items \
        -t public.user_roles \
        -t public.branches \
        > "critical_tables.sql"
    
    log_info "Database backup completed."
}

backup_migrations() {
    log_info "Backing up migrations..."
    mkdir -p migrations
    if [ -d "$PROJECT_ROOT/supabase/migrations" ] && [ "$(ls -A "$PROJECT_ROOT/supabase/migrations/"*.sql 2>/dev/null)" ]; then
        cp "$PROJECT_ROOT/supabase/migrations/"*.sql migrations/
    else
        log_warn "No migrations found"
    fi
    log_info "Migrations backed up."
}

backup_functions() {
    log_info "Backing up Edge Functions..."
    mkdir -p functions
    cp -r "$PROJECT_ROOT/supabase/functions/"* functions/ 2>/dev/null || log_warn "No functions found"
    log_info "Edge Functions backed up."
}

backup_config() {
    log_info "Backing up configuration..."
    
    # Copy config.toml
    if [ -f "$PROJECT_ROOT/supabase/config.toml" ]; then
        cp "$PROJECT_ROOT/supabase/config.toml" config.toml
    fi
    
    # Copy package.json for dependencies
    if [ -f "$PROJECT_ROOT/package.json" ]; then
        cp "$PROJECT_ROOT/package.json" package.json
    fi
    
    # Create a configuration summary (without secrets)
    cat > configuration_summary.txt << EOF
Warehouse Handy - Configuration Summary
Generated: $(date)
=====================================

Project Structure:
- Frontend: React + Vite + TypeScript
- Backend: Supabase (PostgreSQL + Edge Functions)
- Authentication: Supabase Auth

Database Tables:
$(grep "CREATE TABLE" "$PROJECT_ROOT/supabase/migrations/"*.sql 2>/dev/null | sed 's/.*CREATE TABLE /- /' | sed 's/ (.*//' | sort -u || echo "  (see database dump)")

Edge Functions:
$(ls -1 "$PROJECT_ROOT/supabase/functions/" 2>/dev/null | grep -v "^_" | sed 's/^/- /' || echo "  (see functions backup)")

Environment Variables Required:
- VITE_SUPABASE_PROJECT_ID
- VITE_SUPABASE_PUBLISHABLE_KEY
- VITE_SUPABASE_URL

Additional Configuration:
- See docs/EMAIL_CONFIGURATION.md for SMTP setup
- See docs/USER_MANAGEMENT_CHANGES.md for user system details
- See docs/BACKUP_AND_RESTORE.md for full restore instructions

EOF
    
    log_info "Configuration backed up."
}

backup_documentation() {
    log_info "Backing up documentation..."
    mkdir -p docs
    cp -r "$PROJECT_ROOT/docs/"*.md docs/ 2>/dev/null || log_warn "No documentation found"
    log_info "Documentation backed up."
}

create_manifest() {
    log_info "Creating backup manifest..."
    
    cat > MANIFEST.txt << EOF
Warehouse Handy Backup Manifest
================================
Backup Date: $(date)
Backup Name: $BACKUP_NAME

Contents:
---------
✓ database_full.sql         - Complete database dump (schema + data)
✓ database_schema.sql       - Database schema only
✓ database_data.sql         - Database data only
✓ critical_tables.sql       - Critical tables backup
✓ migrations/               - All database migrations
✓ functions/                - All Supabase Edge Functions
✓ docs/                     - Project documentation
✓ config.toml               - Supabase function configuration
✓ package.json              - Frontend dependencies
✓ configuration_summary.txt - Configuration overview
✓ MANIFEST.txt             - This file

Restore Instructions:
--------------------
1. Read docs/BACKUP_AND_RESTORE.md for detailed instructions
2. Create a new Supabase project
3. Restore database: psql [connection-string] < database_full.sql
4. Deploy functions: supabase functions deploy
5. Update environment variables
6. Test the application

File Sizes:
-----------
EOF
    
    # Add file sizes
    du -h * 2>/dev/null | sed 's/^/  /' >> MANIFEST.txt || true
    
    echo "" >> MANIFEST.txt
    echo "Total backup size: $(du -sh . | cut -f1)" >> MANIFEST.txt
    
    log_info "Manifest created."
}

compress_backup() {
    log_info "Compressing backup..."
    cd "$BACKUP_DIR"
    tar -czf "${BACKUP_NAME}.tar.gz" "$BACKUP_NAME"
    COMPRESSED_SIZE=$(du -h "${BACKUP_NAME}.tar.gz" | cut -f1)
    log_info "Backup compressed to ${BACKUP_NAME}.tar.gz (${COMPRESSED_SIZE})"
}

cleanup() {
    log_info "Cleaning up temporary files..."
    cd "$BACKUP_DIR"
    rm -rf "$BACKUP_NAME"
    log_info "Cleanup completed."
}

print_summary() {
    echo ""
    echo "======================================"
    echo "Backup Summary"
    echo "======================================"
    echo "Backup created: $BACKUP_DIR/${BACKUP_NAME}.tar.gz"
    echo "Backup size: $(du -h "$BACKUP_DIR/${BACKUP_NAME}.tar.gz" | cut -f1)"
    echo "Timestamp: $TIMESTAMP"
    echo ""
    echo "To extract:"
    echo "  tar -xzf ${BACKUP_NAME}.tar.gz"
    echo ""
    echo "To restore:"
    echo "  See docs/BACKUP_AND_RESTORE.md for detailed instructions"
    echo "======================================"
}

# Main execution
main() {
    log_info "Starting Warehouse Handy backup process..."
    log_info "Backup timestamp: $TIMESTAMP"
    
    check_requirements
    setup_backup_dir
    backup_database
    backup_migrations
    backup_functions
    backup_config
    backup_documentation
    create_manifest
    compress_backup
    cleanup
    print_summary
    
    log_info "Backup process completed successfully!"
}

# Run main function
main "$@"

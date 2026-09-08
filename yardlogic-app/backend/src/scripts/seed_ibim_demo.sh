#!/bin/bash
# seed_ibim_demo.sh
# Quick helper to seed iBIM demo data
# Usage: ./seed_ibim_demo.sh <business_id> [db_host] [db_user] [db_name]

set -e

if [ -z "$1" ]; then
    echo "Usage: $0 <business_id> [db_host] [db_user] [db_name]"
    echo ""
    echo "Find your iBIM business ID with:"
    echo "  psql -h your-host -U your_user -d your_database -c \"SELECT id, name FROM \\\"Business\\\" WHERE \\\"applicationId\\\" = 'IBIM';\""
    echo ""
    echo "Example:"
    echo "  $0 2197c8f8-f0bf-48e4-bf65-8d01278a341d localhost postgres yardlogic"
    exit 1
fi

BUSINESS_ID="$1"
DB_HOST="${2:-localhost}"
DB_USER="${3:-postgres}"
DB_NAME="${4:-yardlogic}"

echo "🌱 Seeding iBIM demo data..."
echo "   Business ID: $BUSINESS_ID"
echo "   Database: $DB_HOST / $DB_NAME"
echo ""

# Run the seed script with the business ID variable
psql \
    -h "$DB_HOST" \
    -U "$DB_USER" \
    -d "$DB_NAME" \
    -v business_id="$BUSINESS_ID" \
    -f "$(dirname "$0")/seed_ibim_demo_flexible.sql"

echo ""
echo "✅ iBIM demo data seeded successfully!"
echo ""
echo "To verify in your dashboard:"
echo "  - Log in to your iBIM business"
echo "  - Navigate to Members section"
echo "  - You should see 100 members with references starting with DEMO-"

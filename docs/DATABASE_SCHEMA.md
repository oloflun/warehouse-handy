# Database Schema Documentation

Complete documentation of the Warehouse Handy database schema, including all tables, relationships, functions, and policies.

## Overview

The database uses PostgreSQL 15+ with the following Supabase extensions:
- `uuid-ossp` - UUID generation
- `pgcrypto` - Cryptographic functions
- Row Level Security (RLS) - Fine-grained access control

## Database Diagram

```
┌─────────────┐         ┌──────────────┐         ┌──────────────┐
│  products   │◄────────┤  inventory   │────────►│  locations   │
└─────────────┘         └──────────────┘         └──────────────┘
       │                       │
       │                       │
       ▼                       ▼
┌──────────────┐         ┌──────────────┐
│ transactions │         │ order_lines  │
└──────────────┘         └──────────────┘
                               │
                               ▼
                         ┌──────────────┐
                         │   orders     │
                         └──────────────┘

┌──────────────────┐     ┌─────────────────────┐
│ delivery_notes   │◄────┤ delivery_note_items │
└──────────────────┘     └─────────────────────┘

┌──────────────┐
│   profiles   │
└──────────────┘
       │
       ▼
┌──────────────┐         ┌──────────────┐
│  user_roles  │────────►│   branches   │
└──────────────┘         └──────────────┘
```

## Tables

### Core Inventory Tables

#### products
Primary product catalog table.

```sql
CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  barcode text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  category text,
  unit text DEFAULT 'st',
  min_stock integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

**Columns:**
- `id` - Unique product identifier (UUID)
- `barcode` - Product barcode (unique, indexed)
- `name` - Product name
- `description` - Detailed product description
- `category` - Product category/classification
- `unit` - Unit of measure (default: 'st' for pieces)
- `min_stock` - Minimum stock level threshold
- `created_at` - Record creation timestamp
- `updated_at` - Last update timestamp

**Indexes:**
- Primary key on `id`
- Unique index on `barcode`

**RLS Policies:**
- SELECT: Authenticated users can read
- INSERT/UPDATE: Non-limited users can write
- DELETE: Admin users only

#### locations
Storage locations/warehouses.

```sql
CREATE TABLE public.locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  description text,
  created_at timestamptz DEFAULT now()
);
```

**Columns:**
- `id` - Unique location identifier
- `name` - Location name (unique)
- `description` - Location description
- `created_at` - Record creation timestamp

#### inventory
Current stock levels per product per location.

```sql
CREATE TABLE public.inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
  location_id uuid REFERENCES public.locations(id) ON DELETE CASCADE NOT NULL,
  quantity integer DEFAULT 0 NOT NULL CHECK (quantity >= 0),
  last_updated timestamptz DEFAULT now(),
  UNIQUE(product_id, location_id)
);
```

**Columns:**
- `id` - Unique inventory record identifier
- `product_id` - Reference to product
- `location_id` - Reference to location
- `quantity` - Current stock quantity (non-negative)
- `last_updated` - Last stock update timestamp

**Constraints:**
- Unique constraint on (product_id, location_id)
- Quantity must be >= 0

#### transactions
Historical record of all stock movements.

```sql
CREATE TABLE public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
  location_id uuid REFERENCES public.locations(id) ON DELETE CASCADE NOT NULL,
  type text NOT NULL CHECK (type IN ('in', 'out', 'adjustment')),
  quantity integer NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz DEFAULT now()
);
```

**Columns:**
- `id` - Unique transaction identifier
- `product_id` - Reference to product
- `location_id` - Reference to location
- `type` - Transaction type: 'in', 'out', or 'adjustment'
- `quantity` - Quantity moved (positive or negative)
- `user_id` - User who performed the transaction
- `notes` - Additional notes/comments
- `created_at` - Transaction timestamp

### Order Management

#### orders
Purchase orders header.

```sql
CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text UNIQUE NOT NULL,
  supplier text,
  status text DEFAULT 'pending',
  order_date date DEFAULT CURRENT_DATE,
  expected_delivery date,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

**Columns:**
- `id` - Unique order identifier
- `order_number` - Human-readable order number (unique)
- `supplier` - Supplier name
- `status` - Order status (pending, received, cancelled, etc.)
- `order_date` - Date order was placed
- `expected_delivery` - Expected delivery date
- `notes` - Additional notes
- `created_at` - Record creation timestamp
- `updated_at` - Last update timestamp

#### order_lines
Line items for each order.

```sql
CREATE TABLE public.order_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE NOT NULL,
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price numeric(10,2),
  notes text,
  created_at timestamptz DEFAULT now()
);
```

**Columns:**
- `id` - Unique line item identifier
- `order_id` - Reference to parent order
- `product_id` - Reference to product
- `quantity` - Ordered quantity (must be positive)
- `unit_price` - Price per unit
- `notes` - Line item notes
- `created_at` - Record creation timestamp

### Delivery Notes

#### delivery_notes
Delivery note headers (goods received).

```sql
CREATE TABLE public.delivery_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_number text UNIQUE NOT NULL,
  supplier text,
  delivery_date date DEFAULT CURRENT_DATE,
  status text DEFAULT 'pending',
  notes text,
  user_id uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

**Columns:**
- `id` - Unique delivery note identifier
- `delivery_number` - Delivery note number (unique)
- `supplier` - Supplier name
- `delivery_date` - Date goods were delivered
- `status` - Processing status
- `notes` - Additional notes
- `user_id` - User who created the delivery note
- `created_at` - Record creation timestamp
- `updated_at` - Last update timestamp

#### delivery_note_items
Line items for each delivery note.

```sql
CREATE TABLE public.delivery_note_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_note_id uuid REFERENCES public.delivery_notes(id) ON DELETE CASCADE NOT NULL,
  product_id uuid REFERENCES public.products(id),
  barcode text,
  description text,
  quantity integer NOT NULL CHECK (quantity > 0),
  location_id uuid REFERENCES public.locations(id),
  quantity_modified boolean DEFAULT false,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

**Columns:**
- `id` - Unique line item identifier
- `delivery_note_id` - Reference to parent delivery note
- `product_id` - Reference to product (nullable for unmatched items)
- `barcode` - Product barcode
- `description` - Product description
- `quantity` - Delivered quantity
- `location_id` - Destination location
- `quantity_modified` - Flag indicating if quantity was manually adjusted
- `notes` - Line item notes
- `created_at` - Record creation timestamp
- `updated_at` - Last update timestamp

### User Management

#### profiles
User profile information.

```sql
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  full_name text,
  branch text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

**Columns:**
- `id` - User identifier (matches auth.users.id)
- `email` - User email
- `full_name` - User's full name
- `branch` - Branch/location assignment
- `created_at` - Profile creation timestamp
- `updated_at` - Last update timestamp

#### user_roles
User roles and permissions.

```sql
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  role text NOT NULL DEFAULT 'user',
  is_super_admin boolean DEFAULT false,
  is_limited boolean DEFAULT false,
  branch text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

**Columns:**
- `id` - Unique role record identifier
- `user_id` - Reference to user (unique)
- `role` - User role (user, admin, etc.)
- `is_super_admin` - Super admin flag (highest privilege)
- `is_limited` - Read-only user flag
- `branch` - Assigned branch
- `created_at` - Record creation timestamp
- `updated_at` - Last update timestamp

**Role Hierarchy:**
1. Super Admin - Full access to everything
2. Admin - Can manage users and data
3. User - Standard access
4. Limited User - Read-only access

#### branches
Organization branches/locations.

```sql
CREATE TABLE IF NOT EXISTS public.branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  description text,
  created_at timestamptz DEFAULT now()
);
```

**Columns:**
- `id` - Unique branch identifier
- `name` - Branch name (unique)
- `description` - Branch description
- `created_at` - Record creation timestamp

### Integration Tables

#### sellus_sync_failures
Records of failed Sellus integration syncs.

```sql
CREATE TABLE IF NOT EXISTS public.sellus_sync_failures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  error_message text NOT NULL,
  retry_count integer DEFAULT 0,
  last_retry_at timestamptz,
  created_at timestamptz DEFAULT now(),
  resolved_at timestamptz
);
```

**Columns:**
- `id` - Unique failure record identifier
- `entity_type` - Type of entity that failed (product, order, etc.)
- `entity_id` - ID of the entity
- `error_message` - Error details
- `retry_count` - Number of retry attempts
- `last_retry_at` - Timestamp of last retry
- `created_at` - Failure occurrence timestamp
- `resolved_at` - Resolution timestamp (null if unresolved)

#### sellus_sync_discrepancies
Tracks discrepancies in Sellus sync.

```sql
CREATE TABLE IF NOT EXISTS public.sellus_sync_discrepancies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES public.products(id),
  sellus_item_id text,
  local_quantity integer,
  sellus_quantity integer,
  discrepancy_amount integer,
  checked_at timestamptz DEFAULT now(),
  resolved_at timestamptz
);
```

#### fdt_sync_log
FDT integration sync logs.

```sql
CREATE TABLE IF NOT EXISTS fdt_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_type text NOT NULL,
  status text NOT NULL,
  records_processed integer DEFAULT 0,
  error_message text,
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz
);
```

#### fdt_sync_metadata
Metadata for FDT sync operations.

```sql
CREATE TABLE IF NOT EXISTS fdt_sync_metadata (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  last_sync_timestamp timestamptz,
  sync_cursor text,
  updated_at timestamptz DEFAULT now()
);
```

#### fdt_sync_status
Current status of FDT sync.

```sql
CREATE TABLE IF NOT EXISTS fdt_sync_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_type text UNIQUE NOT NULL,
  is_running boolean DEFAULT false,
  last_run_at timestamptz,
  next_run_at timestamptz,
  error_count integer DEFAULT 0
);
```

## Database Functions

### is_user_limited(user_id uuid)
Returns true if the user has read-only access.

```sql
CREATE OR REPLACE FUNCTION public.is_user_limited(user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT COALESCE(
    (SELECT is_limited FROM public.user_roles WHERE user_roles.user_id = $1),
    false
  );
$$;
```

**Usage:** Used in RLS policies to enforce read-only restrictions.

## Row Level Security (RLS) Policies

### Products Table

**SELECT Policy:**
```sql
CREATE POLICY "Authenticated users can read products"
ON public.products FOR SELECT
TO authenticated
USING (true);
```

**INSERT/UPDATE Policy:**
```sql
CREATE POLICY "Authenticated users can update products"
ON public.products FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (NOT public.is_user_limited(auth.uid()));
```

### Delivery Notes

**INSERT Policy:**
```sql
CREATE POLICY "Authenticated users can create delivery notes"
ON public.delivery_notes FOR INSERT
TO authenticated
WITH CHECK (NOT public.is_user_limited(auth.uid()));
```

**UPDATE Policy:**
```sql
CREATE POLICY "Authenticated users can update their delivery notes"
ON public.delivery_notes FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (NOT public.is_user_limited(auth.uid()));
```

### Similar Policies Apply To:
- `delivery_note_items`
- `orders`
- `inventory`
- `transactions`

## Migrations

All database migrations are stored in `/supabase/migrations/` and are applied in chronological order:

1. `20251015104427_...sql` - Initial schema (products, locations, inventory, transactions)
2. `20251022212915_...sql` - Order management tables
3. `20251023210554_...sql` - Delivery notes
4. `20251026221706_...sql` - Integration tables
5. `20251028204024_...sql` - User roles enhancements
6. `20251104131516_...sql` - Add is_limited column
7. `20251104132000_...sql` - Add is_limited helper and policies

Total: 29 migrations

## Indexes

Key indexes for performance:

```sql
-- Products
CREATE INDEX idx_products_barcode ON products(barcode);
CREATE INDEX idx_products_category ON products(category);

-- Inventory
CREATE INDEX idx_inventory_product ON inventory(product_id);
CREATE INDEX idx_inventory_location ON inventory(location_id);

-- Transactions
CREATE INDEX idx_transactions_product ON transactions(product_id);
CREATE INDEX idx_transactions_created ON transactions(created_at DESC);

-- Orders
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_date ON orders(order_date DESC);

-- Delivery Notes
CREATE INDEX idx_delivery_notes_status ON delivery_notes(status);
CREATE INDEX idx_delivery_notes_date ON delivery_notes(delivery_date DESC);
```

## Backup and Restore

See `docs/BACKUP_AND_RESTORE.md` for detailed backup and restore procedures.

### Quick Backup
```bash
pg_dump "postgresql://postgres:[PASSWORD]@db.sublzjeyxfaxiekacfme.supabase.co:5432/postgres" \
  > backup_$(date +%Y%m%d).sql
```

### Quick Restore
```bash
psql "postgresql://postgres:[PASSWORD]@db.[NEW_PROJECT].supabase.co:5432/postgres" \
  < backup_YYYYMMDD.sql
```

## Performance Considerations

### Query Optimization
- Use indexes on frequently queried columns
- Limit result sets with pagination
- Use appropriate WHERE clauses

### RLS Performance
- RLS policies are evaluated on every query
- Keep policies simple and indexed
- Consider disabling RLS for service role queries

### Connection Pooling
- Supabase uses PgBouncer for connection pooling
- Default pool size: 15 connections
- Use connection pooling in your application

## Security Best Practices

1. **Always use RLS** - Enable RLS on all public tables
2. **Principle of least privilege** - Grant minimal necessary permissions
3. **Validate input** - Use CHECK constraints and triggers
4. **Audit trails** - Use created_at/updated_at timestamps
5. **Secure functions** - Use SECURITY DEFINER carefully
6. **Protect sensitive data** - Never store passwords in plain text

## Monitoring and Maintenance

### Regular Tasks
- Monitor query performance (Supabase Dashboard → Database → Query Performance)
- Check disk usage (Supabase Dashboard → Database → Database Size)
- Review slow queries
- Vacuum and analyze tables (automatic in Supabase)
- Update statistics
- Monitor RLS policy performance

### Alerts to Set Up
- Database size approaching limit
- High query response times
- Failed authentication attempts
- Unusual data patterns

## Additional Resources

- [Supabase Database Documentation](https://supabase.com/docs/guides/database)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Row Level Security Guide](https://supabase.com/docs/guides/auth/row-level-security)
- Project-specific docs in `/docs` directory

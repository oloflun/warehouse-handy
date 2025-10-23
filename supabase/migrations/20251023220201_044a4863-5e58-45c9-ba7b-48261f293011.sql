-- Make barcode nullable to allow products with only article numbers
ALTER TABLE products 
ALTER COLUMN barcode DROP NOT NULL;
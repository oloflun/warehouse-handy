-- Add unique constraint to ensure same article doesn't appear multiple times 
-- with different order numbers on same delivery note (unless intentional with different quantities)
-- The combination of (delivery_note_id, article_number, order_number) should be unique
-- to prevent accidental duplication

CREATE UNIQUE INDEX idx_delivery_note_item_unique 
ON public.delivery_note_items(delivery_note_id, article_number, order_number) 
WHERE order_number IS NOT NULL;

-- Add comment for clarity
COMMENT ON TABLE public.delivery_note_items IS 
'Each row represents one article from the delivery note. If the same article appears 
on multiple rows with different order numbers, it will have separate records with 
the same article_number but different order_number values. If an article appears 
once but with multiple order numbers, those should be stored as comma-separated 
values in the order_number field.';

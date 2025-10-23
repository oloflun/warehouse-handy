-- Drop and recreate view without SECURITY DEFINER
DROP VIEW IF EXISTS order_summary;

CREATE VIEW order_summary 
WITH (security_invoker=true)
AS
SELECT 
  o.id,
  o.fdt_order_id,
  o.order_number,
  o.customer_name,
  o.customer_notes,
  o.status,
  o.order_date,
  l.name as location_name,
  COUNT(ol.id) as total_lines,
  COUNT(CASE WHEN ol.is_picked THEN 1 END) as picked_lines,
  CASE 
    WHEN COUNT(ol.id) = COUNT(CASE WHEN ol.is_picked THEN 1 END) THEN 'Komplett'
    WHEN COUNT(CASE WHEN ol.is_picked THEN 1 END) > 0 THEN 'Delvis'
    ELSE 'Ej påbörjad'
  END as pick_status
FROM public.orders o
LEFT JOIN public.order_lines ol ON o.id = ol.order_id
LEFT JOIN public.locations l ON o.location_id = l.id
GROUP BY o.id, l.name;
-- Restore database triggers for automatic Sellus sync

-- Trigger on transactions table to update inventory
DROP TRIGGER IF EXISTS on_transaction_update_inventory ON public.transactions;
CREATE TRIGGER on_transaction_update_inventory
  AFTER INSERT ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_inventory_on_transaction();

-- Trigger on inventory table to notify and sync to Sellus
DROP TRIGGER IF EXISTS inventory_change_trigger ON public.inventory;
CREATE TRIGGER inventory_change_trigger
  AFTER INSERT OR UPDATE ON public.inventory
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_inventory_change();

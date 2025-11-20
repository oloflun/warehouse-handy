import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, CheckCircle2, Package, Edit } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { DeliveryNoteItemCard } from "@/components/DeliveryNoteItemCard";

interface DeliveryNote {
  id: string;
  delivery_note_number: string;
  scanned_at: string;
  status: string;
  cargo_marking: string | null;
  notes: string | null;
}

interface DeliveryNoteItem {
  id: string;
  article_number: string;
  order_number: string | null;
  description: string | null;
  quantity_expected: number;
  quantity_checked: number;
  is_checked: boolean;
  product_id: string | null;
  quantity_modified?: boolean;
}

export default function DeliveryNoteDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [deliveryNote, setDeliveryNote] = useState<DeliveryNote | null>(null);
  const [items, setItems] = useState<DeliveryNoteItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      fetchDeliveryNoteData();
    }
  }, [id]);

  const fetchDeliveryNoteData = async () => {
    try {
      const { data: noteData, error: noteError } = await supabase
        .from('delivery_notes')
        .select('*')
        .eq('id', id)
        .single();

      if (noteError) throw noteError;
      setDeliveryNote(noteData);

      const { data: itemsData, error: itemsError } = await supabase
        .from('delivery_note_items')
        .select('*')
        .eq('delivery_note_id', id)
        .order('created_at', { ascending: true });

      if (itemsError) throw itemsError;
      setItems(itemsData || []);
    } catch (error) {
      console.error('Error fetching delivery note:', error);
      toast({
        title: "Fel",
        description: "Kunde inte hämta följesedel",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleQuantityChange = async (itemId: string, newQuantity: number) => {
    try {
      const item = items.find(i => i.id === itemId);
      if (!item) return;

      const isModified = newQuantity !== item.quantity_expected;

      const { error } = await supabase
        .from('delivery_note_items')
        .update({
          quantity_checked: newQuantity,
          quantity_modified: isModified
        })
        .eq('id', itemId);

      if (error) throw error;

      setItems(items.map(i => 
        i.id === itemId 
          ? { ...i, quantity_checked: newQuantity, quantity_modified: isModified }
          : i
      ));

      toast({
        title: "Antal uppdaterat",
        description: isModified 
          ? `Kvantitet ändrad till ${newQuantity} (varning: avviker från följesedel)`
          : `Kvantitet återställd till ${newQuantity}`,
        variant: isModified ? "default" : "default",
      });
    } catch (error) {
      console.error('Error updating quantity:', error);
      toast({
        title: "Fel",
        description: "Kunde inte uppdatera antal",
        variant: "destructive",
      });
    }
  };

  const handleCheckItem = async (itemId: string, checked: boolean) => {
    try {
      const item = items.find(i => i.id === itemId);
      if (!item) return;

      const { error } = await supabase
        .from('delivery_note_items')
        .update({
          is_checked: checked,
          checked_at: checked ? new Date().toISOString() : null,
          checked_by: checked ? (await supabase.auth.getUser()).data.user?.id : null,
          quantity_checked: checked ? item.quantity_expected : 0
        })
        .eq('id', itemId);

      if (error) throw error;

      // Update local state
      setItems(items.map(i => 
        i.id === itemId 
          ? { ...i, is_checked: checked, quantity_checked: checked ? item.quantity_expected : 0 }
          : i
      ));

      // Sync to Sellus when checking an item using new workflow
      if (checked) {
        toast({
          title: "Bearbetar enligt WMS-workflow...",
          description: "Uppdaterar order och inköpsorder",
        });

        // Use quantity_checked to reflect any manual edits
        const quantityToSync = item.quantity_checked || item.quantity_expected;

        const { data: syncResult, error: syncError } = await supabase.functions.invoke(
          'process-delivery-item',
          {
            body: {
              articleNumber: item.article_number,
              quantityReceived: quantityToSync,
              orderReference: item.order_number || null,
              cargoMarking: deliveryNote?.cargo_marking || null,
              deliveryNoteId: id,
              deliveryNoteItemId: item.id,
            }
          }
        );

        if (syncError || !syncResult?.success) {
          console.error("Workflow processing error:", syncError || syncResult);
          
          const errorMsg = syncResult?.userMessage || syncResult?.error || syncError?.message || 'Okänt fel';
          toast({
            title: "Varning: Bearbetning misslyckades",
            description: errorMsg,
            variant: "destructive",
          });
        } else {
          // Show appropriate message based on workflow result
          if (syncResult.skippedPurchaseOrderSync) {
            toast({
              title: "⚠️ Delvis synkat",
              description: syncResult.userMessage || 'Artikel registrerad men inköpsorder ej uppdaterad',
            });
          } else if (syncResult.warning) {
            toast({
              title: "⚠️ Synkat med varning",
              description: syncResult.userMessage || syncResult.warning,
            });
          } else {
            toast({
              title: "✅ Workflow komplett",
              description: syncResult.userMessage || `Order och inköpsorder uppdaterade för ${item.article_number}`,
            });
          }
        }
      }

      // Check if all items are checked and update delivery note status
      const updatedItems = items.map(i => 
        i.id === itemId ? { ...i, is_checked: checked } : i
      );
      
      const allChecked = updatedItems.every(i => i.is_checked);
      const someChecked = updatedItems.some(i => i.is_checked);

      let newStatus = deliveryNote?.status;
      if (allChecked) {
        newStatus = 'completed';
      } else if (someChecked) {
        newStatus = 'in_progress';
      } else {
        newStatus = 'pending';
      }

      if (newStatus !== deliveryNote?.status) {
        const { error: statusError } = await supabase
          .from('delivery_notes')
          .update({ 
            status: newStatus,
            completed_at: newStatus === 'completed' ? new Date().toISOString() : null
          })
          .eq('id', id);

        if (statusError) throw statusError;
        
        if (deliveryNote) {
          setDeliveryNote({ ...deliveryNote, status: newStatus });
        }

        if (newStatus === 'completed') {
          toast({
            title: "Följesedel klar!",
            description: "Alla artiklar har checkats av och synkats till Sellus",
          });
        }
      }
    } catch (error) {
      console.error('Error updating item:', error);
      toast({
        title: "Fel",
        description: "Kunde inte uppdatera artikel",
        variant: "destructive",
      });
    }
  };

  const handleViewOrder = (orderNumber: string) => {
    // Find the order and navigate to it
    navigate(`/integrations/sales?search=${orderNumber}`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!deliveryNote) {
    return (
      <div className="min-h-screen bg-background p-4">
        <div className="max-w-4xl mx-auto">
          <Button variant="ghost" onClick={() => navigate('/delivery-notes')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Tillbaka
          </Button>
          <p className="text-center mt-8">Följesedel hittades inte</p>
        </div>
      </div>
    );
  }

  const checkedCount = items.filter(item => item.is_checked).length;
  const totalCount = items.length;
  const progress = totalCount > 0 ? (checkedCount / totalCount) * 100 : 0;

  return (
    <div className="min-h-screen bg-background p-4 pb-20">
      <div className="max-w-4xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/delivery-notes')}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold font-mono">
                #{deliveryNote.delivery_note_number}
              </h1>
              <p className="text-sm text-muted-foreground">
                {format(new Date(deliveryNote.scanned_at), 'yyyy-MM-dd HH:mm')}
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => navigate(`/delivery-notes/scan/${id}`)}
          >
            <Edit className="h-4 w-4" />
          </Button>
        </div>

        {/* Status Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Status</CardTitle>
              <Badge variant={deliveryNote.status === 'completed' ? 'default' : 'secondary'}>
                {deliveryNote.status === 'completed' && <CheckCircle2 className="h-3 w-3 mr-1" />}
                {deliveryNote.status === 'completed' ? 'Klar' : 
                 deliveryNote.status === 'in_progress' ? 'Pågående' : 'Väntande'}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span>Progress</span>
                <span className="font-medium">{checkedCount}/{totalCount} artiklar</span>
              </div>
              <div className="w-full bg-secondary rounded-full h-2">
                <div 
                  className="bg-primary h-2 rounded-full transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
            {deliveryNote.cargo_marking && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Godsmärke:</span>
                <span className="font-medium">{deliveryNote.cargo_marking}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Items List */}
        <div className="space-y-2">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Package className="h-5 w-5" />
            Artiklar ({totalCount})
          </h2>
          {items.length === 0 ? (
            <Card className="p-8 text-center">
              <p className="text-muted-foreground">Inga artiklar</p>
            </Card>
          ) : (
            items.map((item) => (
              <DeliveryNoteItemCard
                key={item.id}
                item={item}
                cargoMarking={deliveryNote.cargo_marking}
                onCheck={handleCheckItem}
                onQuantityChange={handleQuantityChange}
                onViewOrder={handleViewOrder}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

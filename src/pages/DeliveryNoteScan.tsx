import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Camera, CheckCircle2, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Html5Qrcode } from "html5-qrcode";
import { DeliveryNoteItemCard } from "@/components/DeliveryNoteItemCard";

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

export default function DeliveryNoteScan() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [scanning, setScanning] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [deliveryNoteId, setDeliveryNoteId] = useState<string | null>(id || null);
  const [deliveryNoteNumber, setDeliveryNoteNumber] = useState("");
  const [cargoMarking, setCargoMarking] = useState("");
  const [items, setItems] = useState<DeliveryNoteItem[]>([]);
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (deliveryNoteId) {
      fetchDeliveryNote();
    }
  }, [deliveryNoteId]);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const fetchDeliveryNote = async () => {
    try {
      const { data: noteData, error: noteError } = await supabase
        .from('delivery_notes')
        .select('*')
        .eq('id', deliveryNoteId)
        .single();

      if (noteError) throw noteError;
      
      setDeliveryNoteNumber(noteData.delivery_note_number);
      setCargoMarking(noteData.cargo_marking || "");

      const { data: itemsData, error: itemsError } = await supabase
        .from('delivery_note_items')
        .select('*')
        .eq('delivery_note_id', deliveryNoteId)
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
    }
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setCameraActive(true);
      }
    } catch (error) {
      console.error('Error starting camera:', error);
      toast({
        title: "Kamerafel",
        description: "Kunde inte starta kameran",
        variant: "destructive",
      });
    }
  };

  const stopCamera = () => {
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  };

  const captureAndAnalyze = async () => {
    if (!videoRef.current) return;

    setAnalyzing(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext('2d');
      
      if (!ctx) throw new Error('Could not get canvas context');
      
      ctx.drawImage(videoRef.current, 0, 0);
      const imageData = canvas.toDataURL('image/jpeg', 0.8);

      console.log('Analyzing delivery note...');
      
      const { data, error } = await supabase.functions.invoke('analyze-delivery-note', {
        body: { imageData }
      });

      if (error) throw error;

      console.log('Analysis result:', data);

      // Create delivery note and items
      await createDeliveryNote(data);
      
      stopCamera();
      
      toast({
        title: "Följesedel skapad!",
        description: `${data.items.length} artiklar hittades`,
      });
    } catch (error) {
      console.error('Error analyzing delivery note:', error);
      toast({
        title: "Fel",
        description: "Kunde inte analysera följesedeln",
        variant: "destructive",
      });
    } finally {
      setAnalyzing(false);
    }
  };

  const createDeliveryNote = async (analysisData: any) => {
    try {
      const { data: user } = await supabase.auth.getUser();
      
      const { data: noteData, error: noteError } = await supabase
        .from('delivery_notes')
        .insert({
          delivery_note_number: analysisData.deliveryNoteNumber,
          cargo_marking: analysisData.cargoMarking,
          scanned_by: user.user?.id,
          status: 'pending'
        })
        .select()
        .single();

      if (noteError) throw noteError;

      const itemsToInsert = analysisData.items.map((item: any) => ({
        delivery_note_id: noteData.id,
        article_number: item.articleNumber,
        order_number: item.orderNumber,
        description: item.description,
        quantity_expected: item.quantity,
        quantity_checked: 0,
        is_checked: false
      }));

      const { error: itemsError } = await supabase
        .from('delivery_note_items')
        .insert(itemsToInsert);

      if (itemsError) throw itemsError;

      setDeliveryNoteId(noteData.id);
      setDeliveryNoteNumber(noteData.delivery_note_number);
      setCargoMarking(noteData.cargo_marking || "");
      
      await fetchDeliveryNote();
    } catch (error) {
      console.error('Error creating delivery note:', error);
      throw error;
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
          ? { ...i, quantity_checked: newQuantity, quantity_expected: newQuantity, quantity_modified: isModified }
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
      const { data: user } = await supabase.auth.getUser();
      const item = items.find(i => i.id === itemId);
      if (!item) return;
      
      const { error } = await supabase
        .from('delivery_note_items')
        .update({
          is_checked: checked,
          checked_at: checked ? new Date().toISOString() : null,
          checked_by: checked ? user.user?.id : null,
          quantity_checked: checked ? item.quantity_expected : 0
        })
        .eq('id', itemId);

      if (error) throw error;

      setItems(items.map(i => 
        i.id === itemId 
          ? { ...i, is_checked: checked, quantity_checked: checked ? item.quantity_expected : 0 }
          : i
      ));

      // Sync to Sellus when checking an item
      if (checked) {
        toast({
          title: "Synkroniserar till Sellus...",
          description: "Uppdaterar inköpsorder",
        });

        const { data: syncResult, error: syncError } = await supabase.functions.invoke(
          'sync-purchase-order-to-sellus',
          {
            body: {
              itemNumber: item.article_number,
              quantityReceived: item.quantity_expected,
              cargoMarking: cargoMarking || null,
            }
          }
        );

        if (syncError || !syncResult?.success) {
          console.error("Sellus purchase order sync error:", syncError || syncResult?.error);
          toast({
            title: "Varning: Sellus-synkning misslyckades",
            description: syncError?.message || syncResult?.error || 'Okänt fel',
            variant: "destructive",
          });
        } else {
          toast({
            title: "✅ Synkat till Sellus",
            description: `Inköpsorder uppdaterad för ${item.article_number}`,
          });
        }
      }

      // Update delivery note status
      const updatedItems = items.map(i => 
        i.id === itemId ? { ...i, is_checked: checked } : i
      );
      
      const allChecked = updatedItems.every(i => i.is_checked);
      const someChecked = updatedItems.some(i => i.is_checked);

      let newStatus = 'pending';
      if (allChecked) {
        newStatus = 'completed';
      } else if (someChecked) {
        newStatus = 'in_progress';
      }

      await supabase
        .from('delivery_notes')
        .update({ 
          status: newStatus,
          completed_at: newStatus === 'completed' ? new Date().toISOString() : null
        })
        .eq('id', deliveryNoteId);

      if (newStatus === 'completed') {
        toast({
          title: "Följesedel klar!",
          description: "Alla artiklar har checkats av och synkats till Sellus",
        });
        setTimeout(() => navigate('/delivery-notes'), 1500);
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

  const checkedCount = items.filter(item => item.is_checked).length;
  const totalCount = items.length;

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="max-w-4xl mx-auto p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/delivery-notes')}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            {deliveryNoteNumber ? (
              <div>
                <h1 className="text-2xl font-bold font-mono">#{deliveryNoteNumber}</h1>
                <p className="text-sm text-muted-foreground">
                  {checkedCount}/{totalCount} checkade
                </p>
              </div>
            ) : (
              <h1 className="text-2xl font-bold">Ny följesedel</h1>
            )}
          </div>
        </div>

        {/* Camera View */}
        {!deliveryNoteId && (
          <Card>
            <CardHeader>
              <CardTitle>Scanna följesedel</CardTitle>
            </CardHeader>
            <CardContent>
              {cameraActive ? (
                <div className="space-y-4">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    className="w-full rounded-lg"
                  />
                  <div className="flex gap-2">
                    <Button
                      onClick={captureAndAnalyze}
                      disabled={analyzing}
                      className="flex-1"
                    >
                      {analyzing ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Analyserar...
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="mr-2 h-4 w-4" />
                          Fånga bild
                        </>
                      )}
                    </Button>
                    <Button variant="outline" onClick={stopCamera}>
                      Avbryt
                    </Button>
                  </div>
                </div>
              ) : (
                <Button onClick={startCamera} className="w-full">
                  <Camera className="mr-2 h-4 w-4" />
                  Starta kamera
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {/* Items List */}
        {deliveryNoteId && items.length > 0 && (
          <div className="space-y-2">
            {items.map((item) => (
              <DeliveryNoteItemCard
                key={item.id}
                item={item}
                cargoMarking={cargoMarking}
                onCheck={handleCheckItem}
                onQuantityChange={handleQuantityChange}
              />
            ))}
          </div>
        )}
      </div>

      {/* Fixed Scan Button */}
      {deliveryNoteId && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[90%] max-w-md">
          <Button
            size="lg"
            className="w-full shadow-lg"
            onClick={startCamera}
            disabled={cameraActive}
          >
            <Camera className="mr-2 h-5 w-5" />
            Scanna artikel
          </Button>
        </div>
      )}
    </div>
  );
}

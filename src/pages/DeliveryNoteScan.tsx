import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Camera, CheckCircle2, Loader2, ScanLine, Plus, QrCode } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Html5Qrcode } from "html5-qrcode";
import { DeliveryNoteItemCard } from "@/components/DeliveryNoteItemCard";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

interface DeliveryNoteItem {
  id: string;
  article_number: string | null; // Changed to allow null
  order_number: string | null;
  description: string | null;
  quantity_expected: number;
  quantity_checked: number;
  is_checked: boolean;
  product_id: string | null;
  quantity_modified?: boolean;
  order_id?: string | null;
  fdt_order_id?: string | null;
}

type DeliveryStatus = 'mottagen' | 'ej_mottagen' | 'delvis_mottagen';

const getDeliveryStatus = (item: DeliveryNoteItem): DeliveryStatus => {
  if (!item.is_checked) return 'ej_mottagen';
  if (item.quantity_checked < item.quantity_expected) return 'delvis_mottagen';
  return 'mottagen';
};

const getStatusLabel = (status: DeliveryStatus): string => {
  switch (status) {
    case 'mottagen': return 'Mottagen';
    case 'ej_mottagen': return 'Ej mottagen';
    case 'delvis_mottagen': return 'Delvis mottagen';
  }
};

export default function DeliveryNoteScan() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [scanning, setScanning] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [deliveryNoteId, setDeliveryNoteId] = useState<string | null>(id || null);
  const [deliveryNoteNumber, setDeliveryNoteNumber] = useState("");
  const [cargoMarking, setCargoMarking] = useState("");
  const [items, setItems] = useState<DeliveryNoteItem[]>([]);
  const [scanMode, setScanMode] = useState<'delivery-note' | 'article' | null>(null);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [manualArticleNumber, setManualArticleNumber] = useState("");
  const [showScanOptions, setShowScanOptions] = useState(false);
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

  const startCamera = async (mode: 'delivery-note' | 'article' = 'delivery-note') => {
    try {
      console.log('Starting camera for mode:', mode);
      setScanMode(mode);
      setCameraLoading(true);
      setCameraActive(true);

      // Lock screen orientation if supported (prevents camera exit on tilt)
      try {
        if (screen.orientation && 'lock' in screen.orientation) {
          // Try to lock to current orientation
          await (screen.orientation as any).lock('portrait').catch(() => {
            // Fallback to natural if portrait fails
            (screen.orientation as any).lock('natural').catch(() => {
              console.log('Screen orientation lock not supported or denied');
            });
          });
        }
      } catch (orientationError) {
        console.log('Orientation lock not supported:', orientationError);
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        }
      });

      console.log('Camera stream acquired');

      if (videoRef.current) {
        videoRef.current.srcObject = stream;

        // Vänta på att video metadata är laddad innan play
        videoRef.current.onloadedmetadata = async () => {
          try {
            await videoRef.current?.play();
            console.log('Video playing');
            setCameraLoading(false);
          } catch (playError) {
            console.error('Error playing video:', playError);
            toast({
              title: "Videofel",
              description: "Kunde inte starta videouppspelning",
              variant: "destructive",
            });
            stopCamera();
          }
        };
      }
    } catch (error: any) {
      console.error('Error starting camera:', error);
      setCameraActive(false);
      setCameraLoading(false);

      let errorMessage = "Kunde inte starta kameran";
      if (error.name === 'NotAllowedError') {
        errorMessage = "Kameratillstånd nekades. Tillåt kameraåtkomst i webbläsaren.";
      } else if (error.name === 'NotFoundError') {
        errorMessage = "Ingen kamera hittades på enheten";
      } else if (error.name === 'NotReadableError') {
        errorMessage = "Kameran används redan av en annan app";
      }

      toast({
        title: "Kamerafel",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  const stopCamera = () => {
    console.log('Stopping camera');

    // Unlock screen orientation if it was locked
    try {
      if (screen.orientation && 'unlock' in screen.orientation) {
        (screen.orientation as any).unlock();
      }
    } catch (orientationError) {
      console.log('Orientation unlock not supported:', orientationError);
    }

    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => {
        track.stop();
        console.log('Track stopped:', track.kind);
      });
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
    setCameraLoading(false);
    setScanMode(null);
  };

  const captureAndAnalyze = async () => {
    if (!videoRef.current) {
      toast({
        title: "Fel",
        description: "Video-elementet är inte tillgängligt",
        variant: "destructive",
      });
      return;
    }

    if (videoRef.current.readyState !== videoRef.current.HAVE_ENOUGH_DATA) {
      toast({
        title: "Vänta",
        description: "Kameran är inte redo ännu. Vänta några sekunder och försök igen.",
        variant: "default",
      });
      return;
    }

    setAnalyzing(true);

    // Show what we're analyzing
    const modeText = scanMode === 'delivery-note' ? 'följesedeln' : 'etiketten';
    toast({
      title: `Analyserar ${modeText}...`,
      description: "Detta kan ta några sekunder",
    });

    try {
      const canvas = document.createElement('canvas');
      // Optimize resolution for faster processing (reduced from full resolution)
      const targetWidth = Math.min(videoRef.current.videoWidth, 1280);
      const targetHeight = Math.min(videoRef.current.videoHeight, 720);
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');

      if (!ctx) throw new Error('Could not get canvas context');

      // Use medium quality for faster processing
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'medium'; // Changed from 'high' for speed
      ctx.drawImage(videoRef.current, 0, 0, targetWidth, targetHeight);
      const imageData = canvas.toDataURL('image/jpeg', 0.80); // Reduced from 0.85 for speed

      // Freeze the camera view by pausing the video
      videoRef.current.pause();

      if (scanMode === 'delivery-note') {
        console.log('Analyzing delivery note...');

        const { data, error } = await supabase.functions.invoke('analyze-delivery-note', {
          body: { imageData }
        });

        if (error) throw error;

        console.log('Analysis result:', data);

        // Create delivery note and items
        await createDeliveryNote(data);

        // Stop camera BEFORE showing success toast to prevent freeze
        stopCamera();

        toast({
          title: "✅ Följesedel skapad!",
          description: `${data.items.length} ${data.items.length === 1 ? 'artikel hittades' : 'artiklar hittades'}`,
        });
      } else if (scanMode === 'article') {
        console.log('Analyzing article label...');

        const { data, error } = await supabase.functions.invoke('analyze-label', {
          body: { image: imageData }
        });

        if (error) throw error;

        console.log('Label analysis result:', data);

        // Show confidence to user
        if (data.confidence === 'low') {
          toast({
            title: "⚠️ Låg läsbarhet",
            description: "Kunde läsa etiketten men osäker på noggrannheten. Kontrollera resultatet.",
          });
        }

        // Find and check off matching article
        await checkOffArticle(data);

        stopCamera();
      }
    } catch (error) {
      console.error('Error analyzing:', error);
      const errorMessage = error instanceof Error ? error.message : 'Okänt fel';
      toast({
        title: "❌ Kunde inte läsa " + (scanMode === 'delivery-note' ? 'följesedeln' : 'etiketten'),
        description: `${errorMessage}. Tips: Se till att bilden är skarp och välbelyst. Försök igen.`,
        variant: "destructive",
      });

      // Resume video on error
      if (videoRef.current) {
        videoRef.current.play().catch(console.error);
      }
    } finally {
      setAnalyzing(false);

      // Only resume video if camera is still active (wasn't stopped)
      // We check the state variable, but also check if we just stopped it
      // Since state updates are async, we can't rely solely on cameraActive here if we just called stopCamera
      // But since we called stopCamera() which sets videoRef.current.srcObject = null, we can check that
      if (videoRef.current?.srcObject && cameraActive) {
        videoRef.current.play().catch(console.error);
      }
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
        article_number: item.articleNumber || "OKÄNT", // Fallback for missing article number
        order_number: item.orderNumber,
        description: item.description,
        quantity_expected: item.quantity || 0,
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

      // We don't need to await this, let the useEffect handle it or just update local state
      // But to be safe and ensure consistent state:
      await fetchDeliveryNote();
    } catch (error) {
      console.error('Error creating delivery note:', error);
      throw error;
    }
  };

  const checkOffArticle = async (labelData: any) => {
    if (!deliveryNoteId) {
      toast({
        title: "Fel",
        description: "Ingen följesedel vald",
        variant: "destructive",
      });
      return;
    }

    // Try to find matching article by article number
    const articleNumbers = labelData.article_numbers || [];

    if (articleNumbers.length === 0) {
      toast({
        title: "❌ Ingen artikel hittad",
        description: "Kunde inte hitta något artikelnummer på etiketten. Ta en tydligare bild eller ange manuellt.",
        variant: "destructive",
      });
      return;
    }

    // Try each article number to find a match
    let matchedItem = null;
    let matchedArticleNumber = '';

    for (const articleNumber of articleNumbers) {
      matchedItem = items.find(item =>
        !item.is_checked &&
        item.article_number && // Check for null
        item.article_number.toLowerCase().includes(articleNumber.toLowerCase())
      );
      if (matchedItem) {
        matchedArticleNumber = articleNumber;
        break;
      }
    }

    if (!matchedItem) {
      const articleList = articleNumbers.join(', ');
      toast({
        title: "❌ Artikel ej på följesedel",
        description: `Hittade artikelnummer: ${articleList}, men ingen av dessa finns på denna följesedel.`,
        variant: "destructive",
      });
      return;
    }

    // Check off the matched item
    await handleCheckItem(matchedItem.id, true);

    toast({
      title: "✅ Artikel avcheckad!",
      description: `${matchedItem.article_number} (${matchedItem.description || 'Ingen beskrivning'})`,
    });
  };

  const handleManualEntry = async () => {
    if (!manualArticleNumber.trim()) {
      toast({
        title: "Fel",
        description: "Ange ett artikelnummer",
        variant: "destructive",
      });
      return;
    }

    if (!deliveryNoteId) {
      toast({
        title: "Fel",
        description: "Ingen följesedel vald",
        variant: "destructive",
      });
      return;
    }

    const matchedItem = items.find(item =>
      !item.is_checked &&
      item.article_number && // Check for null
      item.article_number.toLowerCase() === manualArticleNumber.toLowerCase()
    );

    if (!matchedItem) {
      toast({
        title: "Artikel ej på följesedel",
        description: `Kunde inte hitta artikel ${manualArticleNumber} på denna följesedel`,
        variant: "destructive",
      });
      return;
    }

    await handleCheckItem(matchedItem.id, true);

    toast({
      title: "Artikel avcheckad!",
      description: `${matchedItem.article_number} har checkats av`,
    });

    setManualArticleNumber("");
    setShowManualEntry(false);
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
      const { data: user } = await supabase.auth.getUser();
      const item = items.find(i => i.id === itemId);
      if (!item) return;

      // Check if article starts with "645" or "0645" - should be marked as existing stock
      // Add safety check for article_number
      const articleNum = item.article_number || "";
      const isExistingStock = articleNum.startsWith('645') || articleNum.startsWith('0645');
      let quantityToCheck = checked ? item.quantity_expected : 0;

      if (isExistingStock && checked) {
        toast({
          title: "Befintligt lager",
          description: `Artikel ${articleNum} markeras som befintligt lager och synkas till Sellus`,
        });
        // For existing stock items, we still sync to Sellus to update purchase orders
        // as per WMS workflow template requirements
      }

      const { error } = await supabase
        .from('delivery_note_items')
        .update({
          is_checked: checked,
          checked_at: checked ? new Date().toISOString() : null,
          checked_by: checked ? user.user?.id : null,
          quantity_checked: quantityToCheck
        })
        .eq('id', itemId);

      if (error) throw error;

      setItems(items.map(i =>
        i.id === itemId
          ? { ...i, is_checked: checked, quantity_checked: quantityToCheck }
          : i
      ));

      // Process through full workflow when checking an item
      if (checked) {
        const status = getDeliveryStatus({ ...item, is_checked: true, quantity_checked: quantityToCheck });
        toast({
          title: "Bearbetar enligt WMS-workflow...",
          description: `Status: ${getStatusLabel(status)}`,
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
              cargoMarking: cargoMarking || null,
              deliveryNoteId: deliveryNoteId,
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
            const finalStatus = getDeliveryStatus({ ...item, is_checked: true, quantity_checked: quantityToSync });
            toast({
              title: `✅ ${getStatusLabel(finalStatus)}`,
              description: syncResult.userMessage || `Order och inköpsorder uppdaterade för ${item.article_number}`,
            });
          }
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
    <ErrorBoundary>
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
          {cameraActive && (
            <Card>
              <CardHeader>
                <CardTitle>
                  {scanMode === 'delivery-note' ? 'Scanna följesedel' : 'Scanna artikel'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full rounded-lg bg-black min-h-[300px]"
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
              </CardContent>
            </Card>
          )}

          {/* Initial Scan Prompt */}
          {!deliveryNoteId && !cameraActive && (
            <Card>
              <CardHeader>
                <CardTitle>Scanna följesedel</CardTitle>
              </CardHeader>
              <CardContent>
                <Button
                  onClick={() => startCamera('delivery-note')}
                  className="w-full"
                  disabled={cameraLoading}
                >
                  {cameraLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Startar kamera...
                    </>
                  ) : (
                    <>
                      <Camera className="mr-2 h-4 w-4" />
                      Starta kamera
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Items List */}
          {deliveryNoteId && items.length > 0 && (
            <div className="space-y-2">
              {items.map((item) => {
                const status = getDeliveryStatus(item);
                return (
                  <div key={item.id} className="relative">
                    <DeliveryNoteItemCard
                      item={item}
                      cargoMarking={cargoMarking}
                      onCheck={handleCheckItem}
                      onQuantityChange={handleQuantityChange}
                    />
                    {/* Status badge overlay */}
                    <div className="absolute top-2 right-2">
                      {status === 'mottagen' && (
                        <Badge className="bg-green-500">Mottagen</Badge>
                      )}
                      {status === 'delvis_mottagen' && (
                        <Badge className="bg-yellow-500">Delvis mottagen</Badge>
                      )}
                      {status === 'ej_mottagen' && (
                        <Badge variant="outline">Ej mottagen</Badge>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Fixed Scan Button */}
        {deliveryNoteId && (
          <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[90%] max-w-md">
            <Button
              size="lg"
              className="w-full shadow-lg"
              onClick={() => setShowScanOptions(true)}
              disabled={cameraActive}
            >
              <ScanLine className="mr-2 h-5 w-5" />
              Scanna artikel
            </Button>
          </div>
        )}

        {/* Scan Options Dialog */}
        <Dialog open={showScanOptions} onOpenChange={setShowScanOptions}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Scanna artikel</DialogTitle>
              <DialogDescription>
                Välj metod för att lägga till artikel på följesedeln
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <Button
                onClick={() => {
                  setShowScanOptions(false);
                  startCamera('article');
                }}
                className="w-full justify-start"
                variant="outline"
              >
                <Camera className="mr-2 h-4 w-4" />
                Scanna etikett
              </Button>
              <Button
                onClick={() => {
                  setShowScanOptions(false);
                  setShowManualEntry(true);
                }}
                className="w-full justify-start"
                variant="outline"
              >
                <Plus className="mr-2 h-4 w-4" />
                Ange manuellt
              </Button>
              <Button
                onClick={() => {
                  setShowScanOptions(false);
                  // Implement QR code scanning for articles if needed
                  toast({ description: "QR-kodsfunktion kommer snart" });
                }}
                className="w-full justify-start"
                variant="outline"
              >
                <QrCode className="mr-2 h-4 w-4" />
                Scanna QR-kod
              </Button>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setShowScanOptions(false)}>
                Avbryt
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Manual Entry Dialog */}
        <Dialog open={showManualEntry} onOpenChange={setShowManualEntry}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Ange artikelnummer</DialogTitle>
              <DialogDescription>
                Skriv in artikelnumret manuellt för att checka av det
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <Input
                placeholder="Artikelnummer"
                value={manualArticleNumber}
                onChange={(e) => setManualArticleNumber(e.target.value)}
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowManualEntry(false)}>
                Avbryt
              </Button>
              <Button onClick={handleManualEntry}>
                Checka av
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </ErrorBoundary>
  );
}

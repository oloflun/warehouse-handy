import { useState, useEffect, useRef } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { Scan, Package, Plus, Minus, CloudUpload, Camera, RotateCcw, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";

const Scanner = () => {
  const navigate = useNavigate();
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const [scannedCode, setScannedCode] = useState("");
  const [manualCode, setManualCode] = useState("");
  const [product, setProduct] = useState<any>(null);
  const [locations, setLocations] = useState<any[]>([]);
  const [selectedLocation, setSelectedLocation] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [transactionType, setTransactionType] = useState<"in" | "out">("in");
  const [notes, setNotes] = useState("");
  const [cameraStarted, setCameraStarted] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [activeOrders, setActiveOrders] = useState<any[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [pickingMode, setPickingMode] = useState(false);
  
  // AI scanning state
  const [scanMode, setScanMode] = useState<"barcode" | "ai">("barcode");
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiResults, setAiResults] = useState<any>(null);
  const [matchedProducts, setMatchedProducts] = useState<any[]>([]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate("/auth");
      } else {
        setUser(session.user);
      }
    });

    fetchLocations();
  }, [navigate]);

  useEffect(() => {
    // Initialize scanner once on mount
    html5QrCodeRef.current = new Html5Qrcode("reader");
    
    return () => {
      // Stop camera on unmount
      if (html5QrCodeRef.current && cameraStarted) {
        html5QrCodeRef.current.stop().catch(console.error);
      }
    };
  }, []);

  const fetchLocations = async () => {
    const { data, error } = await supabase.from("locations").select("*");
    if (error) {
      toast.error("Kunde inte hämta platser");
      return;
    }
    setLocations(data || []);
    if (data && data.length > 0) {
      setSelectedLocation(data[0].id);
    }
  };

  const startScanning = async () => {
    if (!html5QrCodeRef.current) return;
    
    try {
      const cameras = await Html5Qrcode.getCameras();
      
      if (cameras.length === 0) {
        toast.error("Ingen kamera hittades");
        return;
      }
      
      // Find back camera (environment facing)
      const backCamera = cameras.find(camera => 
        camera.label.toLowerCase().includes('back') || 
        camera.label.toLowerCase().includes('rear') ||
        camera.label.toLowerCase().includes('environment')
      ) || cameras[cameras.length - 1]; // Fallback to last camera (often back camera)
      
      await html5QrCodeRef.current.start(
        backCamera.id,
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0,
        },
        (decodedText) => {
          handleScan(decodedText);
          // Keep camera active for continuous scanning
        },
        () => {
          // Ignore scan errors (happens continuously when no QR code is found)
        }
      );
      
      setCameraStarted(true);
      toast.success("Kamera startad - redo att scanna");
    } catch (err) {
      console.error("Kunde inte starta kamera:", err);
      toast.error("Kunde inte starta kameran");
    }
  };

  const stopScanning = async () => {
    if (!html5QrCodeRef.current || !cameraStarted) return;
    
    try {
      await html5QrCodeRef.current.stop();
      setCameraStarted(false);
      toast.info("Kamera stoppad");
    } catch (err) {
      console.error("Kunde inte stoppa kamera:", err);
    }
  };

  const resetScanner = () => {
    setProduct(null);
    setActiveOrders([]);
    setSelectedOrder(null);
    setPickingMode(false);
    setScannedCode("");
    setManualCode("");
    setCapturedImage(null);
    setAiResults(null);
    setMatchedProducts([]);
    // Camera stays active for next scan
  };

  const captureImage = async () => {
    if (!html5QrCodeRef.current || !cameraStarted) {
      toast.error("Kamera måste vara startad först");
      return;
    }
    
    try {
      // Get video element from the reader
      const videoElement = document.getElementById("reader")?.querySelector("video");
      if (!videoElement) {
        toast.error("Kunde inte hitta video-element");
        return;
      }
      
      // Create canvas and capture frame
      const canvas = document.createElement("canvas");
      canvas.width = videoElement.videoWidth;
      canvas.height = videoElement.videoHeight;
      const ctx = canvas.getContext("2d");
      
      if (!ctx) {
        toast.error("Kunde inte skapa canvas");
        return;
      }
      
      ctx.drawImage(videoElement, 0, 0);
      const imageBase64 = canvas.toDataURL("image/jpeg", 0.9);
      setCapturedImage(imageBase64);
      
      // Analyze with AI
      await analyzeLabel(imageBase64);
    } catch (err) {
      console.error("Kunde inte ta foto:", err);
      toast.error("Kunde inte ta foto");
    }
  };

  const analyzeLabel = async (imageBase64: string) => {
    setIsAnalyzing(true);
    toast.loading("Analyserar etikett med AI...", { id: "ai-analysis" });
    
    try {
      const { data, error } = await supabase.functions.invoke("analyze-label", {
        body: { image: imageBase64 }
      });
      
      if (error) throw error;
      
      setAiResults(data);
      
      if (data.article_numbers.length === 0 && data.product_names.length === 0) {
        toast.error("Kunde inte hitta några artikelnummer eller produktnamn", {
          id: "ai-analysis"
        });
        return;
      }
      
      toast.success(
        `Hittade ${data.article_numbers.length} artikelnummer och ${data.product_names.length} produktnamn`,
        { id: "ai-analysis" }
      );
      
      // Auto-match against products
      await matchProductsFromAI(data);
      
    } catch (err) {
      console.error("AI-analys misslyckades:", err);
      toast.error("Kunde inte analysera etikett", { id: "ai-analysis" });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const matchProductsFromAI = async (aiData: any) => {
    const { article_numbers, product_names } = aiData;
    
    if (article_numbers.length === 0 && product_names.length === 0) {
      toast.warning("Inga artikelnummer eller produktnamn att söka efter");
      return;
    }
    
    // Build search query for article numbers
    let matchedProds: any[] = [];
    
    if (article_numbers.length > 0) {
      const articleQueries = article_numbers.map((num: string) => 
        `barcode.ilike.%${num}%,fdt_sellus_article_id.ilike.%${num}%,name.ilike.%${num}%`
      ).join(",");
      
      const { data: articleMatches } = await supabase
        .from("products")
        .select("*")
        .or(articleQueries);
      
      if (articleMatches && articleMatches.length > 0) {
        matchedProds = articleMatches;
      }
    }
    
    // If no matches from article numbers, try product names
    if (matchedProds.length === 0 && product_names.length > 0) {
      const nameQueries = product_names.map((name: string) => 
        `name.ilike.%${name}%`
      ).join(",");
      
      const { data: nameMatches } = await supabase
        .from("products")
        .select("*")
        .or(nameQueries);
      
      if (nameMatches && nameMatches.length > 0) {
        matchedProds = nameMatches;
      }
    }
    
    if (matchedProds.length === 0) {
      toast.warning("Kunde inte hitta några matchande produkter i systemet");
      setMatchedProducts([]);
      return;
    }
    
    setMatchedProducts(matchedProds);
    
    // If only one product matched, auto-select it
    if (matchedProds.length === 1) {
      const product = matchedProds[0];
      setProduct(product);
      toast.success(`Produkt hittad: ${product.name}`);
      
      // Find active orders with this product
      // Bygg upp alla möjliga artikel-identifierare för denna produkt
      const productIdentifiers = [
        product.barcode,
        product.fdt_sellus_article_id,
        String(product.id)
      ].filter(Boolean); // Ta bort null/undefined

      // Sök ordrar på BÅDE product_id OCH fdt_article_id
      const [directMatch, fdtMatch] = await Promise.all([
        // 1. Direkt matchning via product_id (normal flöde)
        supabase
          .from('order_lines')
          .select(`
            id,
            order_id,
            product_id,
            quantity_ordered,
            quantity_picked,
            is_picked,
            fdt_article_id,
            orders!inner (
              id,
              fdt_order_id,
              order_number,
              customer_name,
              customer_notes,
              status,
              order_date
            )
          `)
          .eq('product_id', product.id)
          .in('orders.status', ['pending', 'picking'])
          .eq('is_picked', false),
        
        // 2. Fallback via fdt_article_id (för när product_id är NULL)
        supabase
          .from('order_lines')
          .select(`
            id,
            order_id,
            product_id,
            quantity_ordered,
            quantity_picked,
            is_picked,
            fdt_article_id,
            orders!inner (
              id,
              fdt_order_id,
              order_number,
              customer_name,
              customer_notes,
              status,
              order_date
            )
          `)
          .is('product_id', null) // Endast rader där matchning misslyckades
          .in('fdt_article_id', productIdentifiers) // Matcha mot alla identifierare
          .in('orders.status', ['pending', 'picking'])
          .eq('is_picked', false)
      ]);

      // Kombinera resultat och ta bort dubbletter
      const allOrderLines = [
        ...(directMatch.data || []),
        ...(fdtMatch.data || [])
      ];

      // Filtrera bort dubbletter baserat på order_line id
      const uniqueOrderLines = Array.from(
        new Map(allOrderLines.map(ol => [ol.id, ol])).values()
      );

      // Om vi hittade ordrar via fdt_article_id, fixa product_id-kopplingen
      const fdtMatchedLines = (fdtMatch.data || []).filter(ol => !ol.product_id);
      if (fdtMatchedLines.length > 0) {
        console.log(`🔧 Fixar ${fdtMatchedLines.length} orderrader med NULL product_id`);
        
        await Promise.all(
          fdtMatchedLines.map(ol =>
            supabase
              .from('order_lines')
              .update({ product_id: product.id })
              .eq('id', ol.id)
          )
        );
        
        toast.info(`Länkade ${fdtMatchedLines.length} orderrader till produkten`);
      }

      const ordersWithProduct = uniqueOrderLines;
      
      if (ordersWithProduct && ordersWithProduct.length > 0) {
        setActiveOrders(ordersWithProduct);
        setPickingMode(true);
        toast.info(`${ordersWithProduct.length} aktiva order hittade med denna artikel!`, {
          duration: 4000,
        });
      } else {
        setActiveOrders([]);
        setPickingMode(false);
        toast.info("Inga aktiva ordrar för denna artikel");
      }
    } else {
      toast.info(`${matchedProds.length} matchande produkter hittade - välj en`, {
        duration: 4000
      });
    }
  };

  const selectProductFromMatch = async (selectedProduct: any) => {
    setProduct(selectedProduct);
    setMatchedProducts([]);
    toast.success(`Vald produkt: ${selectedProduct.name}`);
    
    // Find active orders
    // Bygg upp alla möjliga artikel-identifierare för denna produkt
    const productIdentifiers = [
      selectedProduct.barcode,
      selectedProduct.fdt_sellus_article_id,
      String(selectedProduct.id)
    ].filter(Boolean);

    // Sök ordrar på BÅDE product_id OCH fdt_article_id
    const [directMatch, fdtMatch] = await Promise.all([
      // 1. Direkt matchning via product_id
      supabase
        .from('order_lines')
        .select(`
          id,
          order_id,
          product_id,
          quantity_ordered,
          quantity_picked,
          is_picked,
          fdt_article_id,
          orders!inner (
            id,
            fdt_order_id,
            order_number,
            customer_name,
            customer_notes,
            status,
            order_date
          )
        `)
        .eq('product_id', selectedProduct.id)
        .in('orders.status', ['pending', 'picking'])
        .eq('is_picked', false),
      
      // 2. Fallback via fdt_article_id
      supabase
        .from('order_lines')
        .select(`
          id,
          order_id,
          product_id,
          quantity_ordered,
          quantity_picked,
          is_picked,
          fdt_article_id,
          orders!inner (
            id,
            fdt_order_id,
            order_number,
            customer_name,
            customer_notes,
            status,
            order_date
          )
        `)
        .is('product_id', null)
        .in('fdt_article_id', productIdentifiers)
        .in('orders.status', ['pending', 'picking'])
        .eq('is_picked', false)
    ]);

    // Kombinera resultat och ta bort dubbletter
    const allOrderLines = [
      ...(directMatch.data || []),
      ...(fdtMatch.data || [])
    ];

    const uniqueOrderLines = Array.from(
      new Map(allOrderLines.map(ol => [ol.id, ol])).values()
    );

    // Auto-fixa NULL product_id
    const fdtMatchedLines = (fdtMatch.data || []).filter(ol => !ol.product_id);
    if (fdtMatchedLines.length > 0) {
      console.log(`🔧 Fixar ${fdtMatchedLines.length} orderrader med NULL product_id`);
      
      await Promise.all(
        fdtMatchedLines.map(ol =>
          supabase
            .from('order_lines')
            .update({ product_id: selectedProduct.id })
            .eq('id', ol.id)
        )
      );
      
      toast.info(`Länkade ${fdtMatchedLines.length} orderrader till produkten`);
    }

    const ordersWithProduct = uniqueOrderLines;
    
    if (ordersWithProduct && ordersWithProduct.length > 0) {
      setActiveOrders(ordersWithProduct);
      setPickingMode(true);
      toast.info(`${ordersWithProduct.length} aktiva order hittade!`);
    }
  };

  const handleScan = async (code: string) => {
    setScannedCode(code);
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("barcode", code)
      .maybeSingle();

    if (error) {
      toast.error("Fel vid sökning av produkt");
      return;
    }

    if (!data) {
      toast.error("Produkt hittades inte");
      setProduct(null);
      setActiveOrders([]);
      return;
    }

    setProduct(data);
    toast.success(`Produkt hittad: ${data.name}`);

    // Find active orders with this product
    const { data: ordersWithProduct } = await supabase
      .from('order_lines')
      .select(`
        id,
        order_id,
        quantity_ordered,
        quantity_picked,
        is_picked,
        orders!inner (
          id,
          fdt_order_id,
          order_number,
          customer_name,
          customer_notes,
          status,
          order_date
        )
      `)
      .eq('product_id', data.id)
      .in('orders.status', ['pending', 'picking'])
      .eq('is_picked', false);

    if (ordersWithProduct && ordersWithProduct.length > 0) {
      setActiveOrders(ordersWithProduct);
      setPickingMode(true);
      toast.info(`${ordersWithProduct.length} aktiva order hittade med denna artikel!`, {
        duration: 4000,
      });
    } else {
      setActiveOrders([]);
      setPickingMode(false);
      toast.info("Inga aktiva ordrar för denna artikel");
    }
  };

  const handleManualSearch = () => {
    if (manualCode) {
      handleScan(manualCode);
    }
  };

  const handlePickItem = async (orderLineId: string, orderId: string, quantityToPick: number) => {
    if (!user || !product) return;
    
    const { error: lineError } = await supabase
      .from('order_lines')
      .update({
        quantity_picked: quantityToPick,
        is_picked: true,
        picked_by: user.id,
        picked_at: new Date().toISOString()
      })
      .eq('id', orderLineId);
      
    if (lineError) {
      toast.error("Kunde inte bocka av artikel");
      console.error("Error updating order line:", lineError);
      return;
    }
    
    await supabase.from('transactions').insert({
      product_id: product.id,
      location_id: selectedLocation || locations[0]?.id,
      type: 'in',
      quantity: quantityToPick,
      user_id: user.id,
      notes: `Plockning för order ${selectedOrder.order_number}`
    });

    // Sync to Sellus if product has FDT connection
    if (product.fdt_sellus_article_id) {
      toast.loading("Uppdaterar lagersaldo i Sellus...", { id: "sellus-sync" });
      
      const { data: syncResult, error: syncError } = await supabase.functions.invoke(
        'update-sellus-stock',
        {
          body: {
            productId: product.id,
            quantity: quantityToPick,
            locationId: selectedLocation || locations[0]?.id,
          }
        }
      );
      
      if (syncError || !syncResult?.success) {
        console.error("Sellus sync error:", syncError || syncResult?.error);
        toast.error("⚠️ Artikel plockad men misslyckades synka till Sellus", {
          id: "sellus-sync",
          duration: 5000,
        });
      } else if (!syncResult?.skipped) {
        toast.success("✅ Artikel plockad och synkad till Sellus", {
          id: "sellus-sync",
        });
      } else {
        toast.dismiss("sellus-sync");
      }
    }
    
    const { data: remainingLines } = await supabase
      .from('order_lines')
      .select('id')
      .eq('order_id', orderId)
      .eq('is_picked', false);
      
    if (!remainingLines || remainingLines.length === 0) {
      await supabase
        .from('orders')
        .update({ 
          status: 'ready',
          updated_at: new Date().toISOString()
        })
        .eq('id', orderId);
        
      toast.success("✅ Order komplett! Markerad som redo.", {
        duration: 5000,
      });
    } else {
      toast.warning(`⚠️ Order ej komplett. ${remainingLines.length} artikel(er) kvar att plocka.`, {
        duration: 5000,
      });
    }
    
    const { data: orderStatus } = await supabase
      .from('orders')
      .select('status')
      .eq('id', orderId)
      .single();
      
    if (orderStatus?.status === 'pending') {
      await supabase
        .from('orders')
        .update({ status: 'picking' })
        .eq('id', orderId);
    }
    
    resetScanner();
  };

  const handleTransaction = async () => {
    if (!product || !selectedLocation || !user) {
      toast.error("Välj produkt och plats");
      return;
    }

    const { error } = await supabase.from("transactions").insert({
      product_id: product.id,
      location_id: selectedLocation,
      type: transactionType,
      quantity,
      user_id: user.id,
      notes: notes || null,
    });

    if (error) {
      toast.error("Fel vid registrering av transaktion");
      return;
    }

    toast.success(
      `${transactionType === "in" ? "Inleverans" : "Utleverans"} registrerad!`
    );

    // Sync to Sellus if product has FDT connection
    if (product.fdt_sellus_article_id) {
      toast.loading("Uppdaterar lagersaldo i Sellus...", { id: "sellus-sync" });
      
      const { data: syncResult, error: syncError } = await supabase.functions.invoke(
        'update-sellus-stock',
        {
          body: {
            productId: product.id,
            quantity: transactionType === 'in' ? quantity : -quantity,
            locationId: selectedLocation,
          }
        }
      );
      
      if (syncError || !syncResult?.success) {
        console.error("Sellus sync error:", syncError || syncResult?.error);
        toast.error("⚠️ Lagersaldo uppdaterat i WMS men misslyckades synka till Sellus", {
          id: "sellus-sync",
          duration: 5000,
        });
      } else if (!syncResult?.skipped) {
        toast.success("✅ Lagersaldo uppdaterat i både WMS och Sellus", {
          id: "sellus-sync",
        });
      } else {
        toast.dismiss("sellus-sync");
      }
    }

    resetScanner();
    setQuantity(1);
    setNotes("");
  };

  return (
    <div className="min-h-screen bg-background p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Scan className="w-6 h-6 text-primary" />
          Scanner
        </h1>
        <Button variant="outline" onClick={() => navigate("/")}>
          Tillbaka
        </Button>
      </div>

      {!product ? (
        <Card>
          <CardHeader>
            <CardTitle>Skanning</CardTitle>
            <CardDescription>
              Välj skanningsläge: streckkod eller AI-etikett
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Scan mode toggle */}
            <div className="flex gap-2">
              <Button
                variant={scanMode === "barcode" ? "default" : "outline"}
                onClick={() => setScanMode("barcode")}
                className="flex-1"
              >
                <Scan className="w-4 h-4 mr-2" />
                Streckkod
              </Button>
              <Button
                variant={scanMode === "ai" ? "default" : "outline"}
                onClick={() => setScanMode("ai")}
                className="flex-1"
              >
                <Sparkles className="w-4 h-4 mr-2" />
                AI-Etikett
              </Button>
            </div>

            {scanMode === "barcode" && (
              <>
                <div className="flex gap-2">
                  <Input
                    placeholder="Ange streckkod manuellt"
                    value={manualCode}
                    onChange={(e) => setManualCode(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleManualSearch()}
                  />
                  <Button onClick={handleManualSearch}>Sök</Button>
                </div>
              </>
            )}

            <div id="reader" className="w-full"></div>
            
            {!cameraStarted ? (
              <Button
                onClick={startScanning}
                className="w-full"
                variant="default"
                size="lg"
              >
                <Camera className="w-5 h-5 mr-2" />
                Starta kamera
              </Button>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-green-600 dark:text-green-500 font-medium justify-center p-2 bg-green-50 dark:bg-green-950/30 rounded-md">
                  <Camera className="w-5 h-5 animate-pulse" />
                  {scanMode === "barcode" ? "Scanna streckkod" : "Redo att ta foto av etikett"}
                </div>
                
                {scanMode === "ai" && (
                  <Button
                    onClick={captureImage}
                    disabled={isAnalyzing}
                    className="w-full"
                    size="lg"
                  >
                    {isAnalyzing ? (
                      <>
                        <Sparkles className="w-5 h-5 mr-2 animate-spin" />
                        Analyserar...
                      </>
                    ) : (
                      <>
                        <Camera className="w-5 h-5 mr-2" />
                        Ta foto av etikett
                      </>
                    )}
                  </Button>
                )}
                
                <Button
                  onClick={stopScanning}
                  variant="outline"
                  size="sm"
                  className="w-full"
                >
                  Stoppa kamera
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="flex justify-between items-center p-3 border rounded-lg bg-card">
          <div className="flex items-center gap-2 text-sm">
            <Camera className="w-4 h-4 text-green-600" />
            <span className="text-muted-foreground">Kamera aktiv</span>
          </div>
          <Button onClick={resetScanner} size="sm" variant="outline">
            <RotateCcw className="w-4 h-4 mr-2" />
            Scanna nästa
          </Button>
        </div>
      )}

      {/* AI Results Display */}
      {aiResults && !product && (
        <Card className="border-primary">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              AI-Resultat
            </CardTitle>
            <CardDescription>
              Konfidensgrad: <Badge variant={
                aiResults.confidence === "high" ? "default" : 
                aiResults.confidence === "medium" ? "secondary" : 
                "outline"
              }>{aiResults.confidence}</Badge>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {aiResults.article_numbers.length > 0 && (
              <div>
                <Label className="text-sm font-medium">Artikelnummer hittade:</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {aiResults.article_numbers.map((num: string, idx: number) => (
                    <Badge key={idx} variant="default">
                      {num}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            
            {aiResults.product_names.length > 0 && (
              <div>
                <Label className="text-sm font-medium">Produktnamn hittade:</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {aiResults.product_names.map((name: string, idx: number) => (
                    <Badge key={idx} variant="secondary">
                      {name}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Multiple product matches */}
      {matchedProducts.length > 1 && (
        <Card className="border-blue-500">
          <CardHeader>
            <CardTitle>Välj produkt</CardTitle>
            <CardDescription>
              {matchedProducts.length} matchande produkter hittades
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {matchedProducts.map((prod) => (
              <Button
                key={prod.id}
                variant="outline"
                className="w-full justify-start h-auto py-3"
                onClick={() => selectProductFromMatch(prod)}
              >
                <div className="flex flex-col items-start gap-1">
                  <div className="flex items-center gap-2">
                    <Package className="w-4 h-4" />
                    <span className="font-semibold">{prod.name}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {prod.barcode} {prod.fdt_sellus_article_id ? `• ${prod.fdt_sellus_article_id}` : ''}
                  </span>
                </div>
              </Button>
            ))}
          </CardContent>
        </Card>
      )}

      {product && pickingMode && (
        <div className="flex justify-between items-center p-3 border rounded-lg bg-card">
          <div className="flex items-center gap-2">
            <Package className="w-5 h-5 text-primary" />
            <span className="font-medium">{product.name}</span>
          </div>
        </div>
      )}

      {product && !pickingMode && (
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <CardTitle className="flex items-center gap-2">
                  <Package className="w-5 h-5" />
                  {product.name}
                </CardTitle>
                <CardDescription>{product.description}</CardDescription>
              </div>
              <Button
                onClick={resetScanner}
                variant="ghost"
                size="sm"
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Scanna nästa
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Streckkod:</span>
                <p className="font-medium">{product.barcode}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Kategori:</span>
                <p className="font-medium">{product.category || "—"}</p>
              </div>
              {product.fdt_sellus_article_id && (
                <>
                  <div>
                    <span className="text-muted-foreground">FDT Article ID:</span>
                    <p className="font-medium">{product.fdt_sellus_article_id}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Sellus-synk:</span>
                    <p className="font-medium text-green-600 flex items-center gap-1">
                      <CloudUpload className="h-4 w-4" />
                      Aktiverad
                    </p>
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {pickingMode && activeOrders.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Välj order att plocka för</CardTitle>
            <CardDescription>
              {activeOrders.length} aktiv(a) order hittades med denna artikel
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <ScrollArea className="h-[400px] pr-4">
              <div className="space-y-3">
                {activeOrders.map((orderLine: any) => {
                  const order = orderLine.orders;
                  return (
                    <Card 
                      key={orderLine.id}
                      className={`cursor-pointer hover:bg-accent transition-colors ${
                        selectedOrder?.id === order.id ? 'border-primary border-2' : ''
                      }`}
                      onClick={() => setSelectedOrder(order)}
                    >
                      <CardContent className="p-4 space-y-2">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-bold text-lg">Order {order.order_number}</p>
                            {order.customer_name && (
                              <p className="text-sm text-muted-foreground">
                                Kund: {order.customer_name}
                              </p>
                            )}
                          </div>
                          <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                            {order.status === 'pending' ? 'Väntande' : 'Plockas'}
                          </span>
                        </div>
                        
                        {order.customer_notes && (
                          <div className="bg-yellow-50 p-2 rounded border border-yellow-200">
                            <p className="text-sm font-medium text-yellow-900">
                              📝 Godsmärke: {order.customer_notes}
                            </p>
                          </div>
                        )}
                        
                        <div className="text-sm">
                          <p>Antal att plocka: <span className="font-bold">{orderLine.quantity_ordered}</span></p>
                          <p className="text-xs text-muted-foreground">
                            Order datum: {new Date(order.order_date).toLocaleDateString('sv-SE')}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </ScrollArea>
            
            {selectedOrder && (
              <div className="sticky bottom-0 bg-background pt-3 border-t">
                <Button 
                  onClick={() => {
                    const selectedLine = activeOrders.find((ol: any) => ol.orders.id === selectedOrder.id);
                    handlePickItem(selectedLine.id, selectedOrder.id, selectedLine.quantity_ordered);
                  }}
                  className="w-full"
                  size="lg"
                >
                  ✓ Bocka av artikel för order {selectedOrder.order_number}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {!pickingMode && product && (
        <Card>
          <CardHeader>
            <CardTitle>Registrera Transaktion</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">

            <div className="space-y-2">
              <Label>Typ av transaktion</Label>
              <div className="flex gap-2">
                <Button
                  onClick={() => setTransactionType("in")}
                  variant={transactionType === "in" ? "default" : "outline"}
                  className="flex-1"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Inleverans
                </Button>
                <Button
                  onClick={() => setTransactionType("out")}
                  variant={transactionType === "out" ? "default" : "outline"}
                  className="flex-1"
                >
                  <Minus className="w-4 h-4 mr-2" />
                  Utleverans
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="location">Plats</Label>
              <Select value={selectedLocation} onValueChange={setSelectedLocation}>
                <SelectTrigger id="location">
                  <SelectValue placeholder="Välj plats" />
                </SelectTrigger>
                <SelectContent>
                  {locations.map((loc) => (
                    <SelectItem key={loc.id} value={loc.id}>
                      {loc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="quantity">Antal</Label>
              <Input
                id="quantity"
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Anteckningar (valfritt)</Label>
              <Input
                id="notes"
                placeholder="T.ex. leverantör, ordernummer..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            <Button onClick={handleTransaction} className="w-full">
              Registrera {transactionType === "in" ? "inleverans" : "utleverans"}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default Scanner;

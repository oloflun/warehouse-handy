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
import { Scan, Package, Plus, Minus, CloudUpload, Camera, RotateCcw, Loader2, Home, ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import { useIsMobile } from "@/hooks/use-mobile";

const Scanner = () => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
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
  const [manualPickQuantity, setManualPickQuantity] = useState<number | null>(null);
  
  // Scanning state
  const [scanMode, setScanMode] = useState<"barcode" | "ai">("ai");
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiResults, setAiResults] = useState<any>(null);
  const [matchedProducts, setMatchedProducts] = useState<any[]>([]);
  
  // AI Provider and Model Selection
  const [aiProvider, setAiProvider] = useState<"gemini" | "openai">("gemini");
  const [aiModel, setAiModel] = useState<string>("gemini-2.0-flash-exp");
  const [lastScanStats, setLastScanStats] = useState<{
    provider: string;
    model: string;
    processingTime: number;
    success: boolean;
    error?: string;
  } | null>(null);

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

  // Update model when provider changes
  useEffect(() => {
    if (aiProvider === "gemini") {
      setAiModel("gemini-2.0-flash-exp");
    } else if (aiProvider === "openai") {
      setAiModel("gpt-4o-mini");
    }
  }, [aiProvider]);

  useEffect(() => {
    return () => {
      // Stop camera on unmount - check if scanner is actually running first
      if (html5QrCodeRef.current) {
        try {
          const state = html5QrCodeRef.current.getState();
          // Only stop if scanner is in SCANNING or PAUSED state
          if (state === 2 || state === 3) { // 2 = SCANNING, 3 = PAUSED
            html5QrCodeRef.current.stop().catch(console.error);
          }
        } catch (e) {
          // Ignore errors during cleanup
          console.log("Scanner cleanup skipped:", e);
        }
      }
    };
  }, []);

  // Auto-start camera when component mounts and user is authenticated
  useEffect(() => {
    if (user && !cameraStarted) {
      startScanning();
    }
  }, [user]);

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

  const sortOrdersByDeliveryNote = async (orderLines: any[], product: any) => {
    // Collect all unique article identifiers from the product and order lines
    const allArticleIdentifiers = new Set<string>();
    
    [product.barcode, product.fdt_sellus_article_id].forEach(id => {
      if (id) allArticleIdentifiers.add(id);
    });
    
    orderLines.forEach(ol => {
      if (ol.fdt_article_id) allArticleIdentifiers.add(ol.fdt_article_id);
    });

    // If no valid identifiers, return orders sorted by date only
    if (allArticleIdentifiers.size === 0) {
      return orderLines.sort((a, b) => 
        new Date(a.orders.order_date).getTime() - new Date(b.orders.order_date).getTime()
      );
    }

    // Fetch all delivery note items in a single query
    const { data: deliveryNoteItems } = await supabase
      .from('delivery_note_items')
      .select('article_number, delivery_note_id, order_number')
      .in('article_number', Array.from(allArticleIdentifiers));

    // Create a map for quick lookup
    const deliveryNoteMap = new Map<string, any>();
    deliveryNoteItems?.forEach(item => {
      deliveryNoteMap.set(item.article_number, item);
    });

    // Enrich order lines with delivery note information
    const ordersWithDeliveryNote = orderLines.map(ol => {
      const identifiers = [
        product.barcode,
        product.fdt_sellus_article_id,
        ol.fdt_article_id
      ].filter(Boolean);

      // Check if any identifier matches a delivery note
      const deliveryNoteItem = identifiers
        .map(id => deliveryNoteMap.get(id))
        .find(item => item);
      
      return {
        ...ol,
        has_delivery_note: !!deliveryNoteItem,
        delivery_note_order: deliveryNoteItem?.order_number
      };
    });

    // Sort: delivery note orders first, then by order date
    return ordersWithDeliveryNote.sort((a, b) => {
      if (a.has_delivery_note && !b.has_delivery_note) return -1;
      if (!a.has_delivery_note && b.has_delivery_note) return 1;
      return new Date(a.orders.order_date).getTime() - new Date(b.orders.order_date).getTime();
    });
  };

  const startScanning = async () => {
    // Initialize scanner if not already initialized
    if (!html5QrCodeRef.current) {
      const readerElement = document.getElementById("reader");
      if (!readerElement) {
        toast.error("Scanner element inte tillgängligt än");
        return;
      }
      html5QrCodeRef.current = new Html5Qrcode("reader");
    }
    
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
          fps: 30, // Högre FPS ger skarpare bilder när etiketten rör sig
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0,
        },
        (decodedText) => {
          if (scanMode === "barcode") {
            handleScan(decodedText);
          }
        },
        () => {
          // Ignore scan errors (happens continuously when no QR code is found)
        }
      );
      
      setCameraStarted(true);
      
      if (scanMode === "ai") {
        toast.success("Kamera startad - tryck på knappen för att scanna");
      } else {
        toast.success("Kamera startad - redo att scanna");
      }
    } catch (err) {
      console.error("Kunde inte starta kamera:", err);
      toast.error("Kunde inte starta kameran");
    }
  };

  const stopScanning = async () => {
    if (!html5QrCodeRef.current) return;
    
    try {
      // Check if scanner is actually running before trying to stop it
      const state = html5QrCodeRef.current.getState();
      // State 2 = SCANNING, State 3 = PAUSED
      if (state === 2 || state === 3) {
        await html5QrCodeRef.current.stop();
        setCameraStarted(false);
        toast.info("Kamera stoppad");
      } else {
        // Scanner already stopped, just update state
        setCameraStarted(false);
        toast.info("Kamera redan stoppad");
      }
    } catch (err) {
      console.error("Kunde inte stoppa kamera:", err);
      // Reset state anyway
      setCameraStarted(false);
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
    setIsAnalyzing(false);
    setManualPickQuantity(null);
    // Camera stays active for next scan
  };

  const captureImage = async () => {
    if (!html5QrCodeRef.current || !cameraStarted) {
      toast.error("Kamera måste vara startad först");
      return;
    }
    
    try {
      // Get video element from the reader
      const videoElement = document.getElementById("reader")?.querySelector("video") as HTMLVideoElement;
      if (!videoElement) {
        toast.error("Kunde inte hitta video-element");
        return;
      }
      
      // Create canvas and capture frame - optimized for speed
      const canvas = document.createElement("canvas");
      
      // Use optimal resolution for fast OCR (not too high, not too low)
      const targetWidth = Math.min(videoElement.videoWidth, 1280); // Reduced from 1920 for speed
      const targetHeight = Math.min(videoElement.videoHeight, 720); // Reduced from 1080 for speed
      
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext("2d");
      
      if (!ctx) {
        toast.error("Kunde inte skapa canvas");
        return;
      }
      
      // Draw with good quality but optimize for speed
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'medium'; // Changed from 'high' to 'medium' for speed
      ctx.drawImage(videoElement, 0, 0, targetWidth, targetHeight);
      
      // Use 0.80 quality for better speed (reduced from 0.85)
      const imageBase64 = canvas.toDataURL("image/jpeg", 0.80);
      setCapturedImage(imageBase64);
      
      // Freeze the camera view by pausing the video
      videoElement.pause();
      
      // Visual feedback
      toast.success("Bild tagen! Analyserar...", { duration: 500 });
      
      // Analyze label
      await analyzeLabel(imageBase64);
    } catch (err) {
      console.error("Kunde inte ta foto:", err);
      toast.error("Kunde inte ta foto. Försök igen.");
      
      // Resume video on error
      const videoElement = document.getElementById("reader")?.querySelector("video") as HTMLVideoElement;
      if (videoElement) {
        videoElement.play().catch(console.error);
      }
    }
  };

  const analyzeLabel = async (imageBase64: string, retryCount = 0) => {
    // Skip if already analyzing
    if (isAnalyzing) {
      return;
    }
    
    setIsAnalyzing(true);
    const maxRetries = 1;
    const attempt = retryCount + 1;
    const toastId = "label-analysis";
    const analysisStartTime = Date.now();
    
    // Show provider and model in loading message
    const providerDisplay = aiProvider === "gemini" ? "Gemini" : "OpenAI";
    const modelDisplay = aiModel;
    
    toast.loading(
      attempt > 1 
        ? `Analyserar etikett... (försök ${attempt}/${maxRetries + 1}) - ${providerDisplay}` 
        : `Analyserar etikett med ${providerDisplay} (${modelDisplay})...`, 
      { id: toastId }
    );
    
    try {
      // Reduced timeout to 15 seconds for OpenAI (GPT-4 can be slower)
      const timeoutMs = aiProvider === "openai" ? 15000 : 8000;
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout efter ${timeoutMs/1000}s - försök igen eller byt modell`)), timeoutMs)
      );
      
      // Choose function based on provider
      const functionName = aiProvider === "openai" ? "analyze-label-openai" : "analyze-label";
      const requestBody = aiProvider === "openai" 
        ? { image: imageBase64, model: aiModel }
        : { image: imageBase64 };
      
      console.log(`🔍 Analyzing with ${providerDisplay} (${modelDisplay})...`);
      
      const analysisPromise = supabase.functions.invoke(functionName, {
        body: requestBody
      });
      
      const { data, error } = await Promise.race([analysisPromise, timeoutPromise]) as any;
      
      if (error) throw error;
      
      const processingTime = Date.now() - analysisStartTime;
      setAiResults(data);
      
      // Track scan stats
      setLastScanStats({
        provider: data.provider || aiProvider,
        model: data.model || aiModel,
        processingTime: data.processingTime || processingTime,
        success: true,
      });
      
      // Show confidence and warnings to user
      if (data.confidence === 'low') {
        toast.warning("⚠️ Låg läsbarhet - kontrollera resultatet noga", {
          id: toastId,
          duration: 3000
        });
      } else if (data.confidence === 'medium') {
        toast.info("ℹ️ Medelhög läsbarhet - verifiera artikelnummer", {
          id: toastId,
          duration: 2000
        });
      }
      
      if (data.warnings && data.warnings.length > 0) {
        console.log("Varningar:", data.warnings);
      }
      
      if (data.article_numbers.length === 0 && data.product_names.length === 0) {
        // Retry if we have attempts left
        if (retryCount < maxRetries) {
          console.log(`Inga resultat, försöker igen (${attempt}/${maxRetries + 1})...`);
          toast.dismiss(toastId);
          setIsAnalyzing(false);
          
          // Reduced wait time before retry
          await new Promise(resolve => setTimeout(resolve, 300));
          return await analyzeLabel(imageBase64, retryCount + 1);
        }
        
        // Track failed scan
        setLastScanStats({
          provider: data.provider || aiProvider,
          model: data.model || aiModel,
          processingTime: data.processingTime || processingTime,
          success: false,
          error: "Inga resultat hittades"
        });
        
        toast.error("Kunde inte hitta några artikelnummer eller produktnamn. Försök ta en tydligare bild.", {
          id: toastId,
          duration: 4000
        });
        return;
      }
      
      toast.dismiss(toastId);
      console.log(`✅ Hittade ${data.article_numbers.length} artikelnummer och ${data.product_names.length} produktnamn`);
      console.log(`📊 Tillförlitlighet: ${data.confidence}`);
      console.log(`⏱️ Tid: ${processingTime}ms med ${providerDisplay}`);
      
      // Auto-match against products
      await matchProductsFromAnalysis(data);
      
    } catch (err) {
      console.error("Analys misslyckades:", err);
      
      const processingTime = Date.now() - analysisStartTime;
      const errorMsg = err instanceof Error ? err.message : "Kunde inte analysera etikett";
      
      // Track failed scan with error
      setLastScanStats({
        provider: aiProvider,
        model: aiModel,
        processingTime,
        success: false,
        error: errorMsg
      });
      
      // Retry on timeout or network errors
      if (retryCount < maxRetries && err instanceof Error && 
          (err.message.includes('Timeout') || err.message.includes('network'))) {
        console.log(`Timeout/network fel, försöker igen (${attempt}/${maxRetries + 1})...`);
        toast.dismiss(toastId);
        setIsAnalyzing(false);
        
        await new Promise(resolve => setTimeout(resolve, 500));
        return await analyzeLabel(imageBase64, retryCount + 1);
      }
      
      // Show helpful error with troubleshooting tips
      let troubleshootingTip = "";
      if (errorMsg.includes("rate limit") || errorMsg.includes("429")) {
        troubleshootingTip = " 💡 Tips: Prova att byta till annan modell eller vänta några minuter.";
      } else if (errorMsg.includes("Timeout")) {
        troubleshootingTip = " 💡 Tips: Prova en snabbare modell eller bättre belysning.";
      } else if (errorMsg.includes("not configured")) {
        troubleshootingTip = " 💡 Tips: Kontrollera API-nycklar i Admin Tools → Diagnostik.";
      }
      
      toast.error(errorMsg + troubleshootingTip + " Eller ange artikelnummer manuellt.", { 
        id: toastId,
        duration: 7000
      });
    } finally {
      setIsAnalyzing(false);
      
      // Resume video stream after analysis completes
      const videoElement = document.getElementById("reader")?.querySelector("video") as HTMLVideoElement;
      if (videoElement) {
        videoElement.play().catch(console.error);
      }
    }
  };

  const matchProductsFromAnalysis = async (analysisData: any) => {
    const { article_numbers, product_names } = analysisData;
    
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
        const sortedOrders = await sortOrdersByDeliveryNote(ordersWithProduct, product);
        setActiveOrders(sortedOrders);
        setPickingMode(true);
      } else {
        setActiveOrders([]);
        setPickingMode(false);
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
      const sortedOrders = await sortOrdersByDeliveryNote(ordersWithProduct, selectedProduct);
      setActiveOrders(sortedOrders);
      setPickingMode(true);
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
      const sortedOrders = await sortOrdersByDeliveryNote(ordersWithProduct, data);
      setActiveOrders(sortedOrders);
      setPickingMode(true);
    } else {
      setActiveOrders([]);
      setPickingMode(false);
    }
  };

  const handleManualSearch = async () => {
    if (!manualCode.trim()) {
      toast.error("Ange ett artikelnummer");
      return;
    }
    
    const searchCode = manualCode.trim();
    toast.loading("Söker produkt...", { id: "manual-search" });
    
    // Search by barcode, FDT article ID, or name
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .or(`barcode.eq.${searchCode},fdt_sellus_article_id.eq.${searchCode},name.ilike.%${searchCode}%`)
      .limit(10);

    if (error) {
      toast.error("Fel vid sökning av produkt", { id: "manual-search" });
      return;
    }

    if (!data || data.length === 0) {
      toast.error("Produkt hittades inte", { id: "manual-search" });
      setProduct(null);
      setActiveOrders([]);
      return;
    }

    toast.dismiss("manual-search");

    if (data.length === 1) {
      const product = data[0];
      setProduct(product);
      toast.success(`Produkt hittad: ${product.name}`);

      // Find active orders with this product
      const productIdentifiers = [
        product.barcode,
        product.fdt_sellus_article_id,
        String(product.id)
      ].filter(Boolean);

      const [directMatch, fdtMatch] = await Promise.all([
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

      const allOrderLines = [
        ...(directMatch.data || []),
        ...(fdtMatch.data || [])
      ];

      const uniqueOrderLines = Array.from(
        new Map(allOrderLines.map(ol => [ol.id, ol])).values()
      );

      const fdtMatchedLines = (fdtMatch.data || []).filter(ol => !ol.product_id);
      if (fdtMatchedLines.length > 0) {
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

      if (uniqueOrderLines && uniqueOrderLines.length > 0) {
        const sortedOrders = await sortOrdersByDeliveryNote(uniqueOrderLines, product);
        setActiveOrders(sortedOrders);
        setPickingMode(true);
      } else {
        setActiveOrders([]);
        setPickingMode(false);
      }
    } else {
      // Multiple matches - show selection
      setMatchedProducts(data);
      toast.info(`${data.length} matchande produkter hittade - välj en`, {
        duration: 4000
      });
    }
  };

  const handlePickItem = async (orderLineId: string, orderId: string, quantityToPick: number) => {
    if (!user || !product) return;
    
    // Get the order line and order details
    const selectedLine = activeOrders.find((ol: any) => ol.id === orderLineId);
    if (!selectedLine) {
      toast.error("Kunde inte hitta orderrad");
      return;
    }

    const order = selectedLine.orders;
    if (!order) {
      toast.error("Kunde inte hitta orderinformation");
      return;
    }

    // Extract article number from product
    const articleNumber = product.fdt_sellus_article_id || product.barcode;
    if (!articleNumber) {
      toast.error("Artikel saknar artikelnummer - kan inte synka till Sellus");
      return;
    }

    // Extract order reference from customer_notes or order_number
    const orderReference = selectedLine.delivery_note_order || order.customer_notes?.match(/Godsmärkning: ([^\s]+)/)?.[1] || order.order_number;

    console.log(`📦 Receiving ${quantityToPick} of article ${articleNumber} for order ${order.order_number}`);
    
    // Use the WMS workflow template for receiving
    toast.loading("Bearbetar mottagning enligt WMS-workflow...", { id: "receive-workflow" });

    const { data: syncResult, error: syncError } = await supabase.functions.invoke(
      'process-delivery-item',
      {
        body: {
          articleNumber: articleNumber,
          quantityReceived: quantityToPick,
          orderReference: orderReference || null,
          cargoMarking: null, // No delivery note, so no cargo marking
          deliveryNoteId: null,
          deliveryNoteItemId: null,
        }
      }
    );

    if (syncError || !syncResult?.success) {
      console.error("Workflow processing error:", syncError || syncResult);
      
      const errorMsg = syncResult?.userMessage || syncResult?.error || syncError?.message || 'Okänt fel';
      toast.error(`❌ Mottagning misslyckades: ${errorMsg}`, {
        id: "receive-workflow",
        duration: 10000,
      });
      return;
    }

    // Show appropriate message based on workflow result
    if (syncResult.skippedPurchaseOrderSync) {
      toast.warning(syncResult.userMessage || 'Artikel registrerad men inköpsorder ej uppdaterad', {
        id: "receive-workflow",
        duration: 5000,
      });
    } else if (syncResult.warning) {
      toast.warning(syncResult.userMessage || syncResult.warning, {
        id: "receive-workflow",
        duration: 5000,
      });
    } else {
      toast.success(`✅ ${quantityToPick} st mottagna och synkade till Sellus`, {
        id: "receive-workflow",
        duration: 3000,
      });
    }

    // Update local order line status
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
      console.error("Error updating order line:", lineError);
      toast.warning("Artikel mottagen i Sellus men lokalt status kunde inte uppdateras");
    }
    
    // Create transaction record
    await supabase.from('transactions').insert({
      product_id: product.id,
      location_id: selectedLocation || locations[0]?.id,
      type: 'in', // Always 'in' for receiving
      quantity: quantityToPick,
      user_id: user.id,
      notes: `Mottagning för order ${order.order_number}`
    });
    
    // Check if order is complete
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
        
      toast.success("✅ Order komplett! Alla artiklar mottagna.", {
        duration: 5000,
      });
    } else {
      toast.info(`ℹ️ Order delvis mottagen. ${remainingLines.length} artikel(er) kvar.`, {
        duration: 5000,
      });
    }
    
    // Update order status if needed
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

  // Desktop check - scanner only works on mobile
  if (!isMobile) {
    return (
      <div className="min-h-screen bg-background p-4 flex items-center justify-center">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Scan className="w-6 h-6 text-primary" />
              Scanner endast för mobil
            </CardTitle>
            <CardDescription>
              Scanner-funktionen kräver en mobilenhet med kamera för att fungera korrekt.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              För att använda scannern, vänligen öppna webbplatsen på din mobila enhet eller surfplatta.
            </p>
            <Button 
              onClick={() => navigate("/")} 
              className="w-full"
              size="lg"
            >
              <Home className="w-4 h-4 mr-2" />
              Tillbaka till startsidan
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 space-y-4">
      {/* Header med tillbaka-knapp */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Scan className="w-6 h-6 text-primary" />
          Scanner
        </h1>
        <Button variant="outline" onClick={() => navigate("/")}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Tillbaka
        </Button>
      </div>

      {!product ? (
        <Card>
        <CardContent className="space-y-4">
          {!cameraStarted && (
            <div className="text-center py-8">
              <Camera className="w-12 h-12 mx-auto mb-3 text-primary animate-pulse" />
              <p className="text-muted-foreground">Startar kamera...</p>
            </div>
          )}
          
          <div id="reader" className="w-full"></div>

          {/* AI Provider and Model Selection */}
          {cameraStarted && (
            <Card className="bg-muted/50">
              <CardContent className="pt-4 space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="ai-provider" className="text-sm font-semibold">
                    Analysmodell
                  </Label>
                  <Select 
                    value={aiProvider} 
                    onValueChange={(value: "gemini" | "openai") => setAiProvider(value)}
                    disabled={isAnalyzing}
                  >
                    <SelectTrigger id="ai-provider">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gemini">
                        <div className="flex items-center gap-2">
                          <span className="text-purple-500">●</span>
                          <span>Gemini (Google)</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="openai">
                        <div className="flex items-center gap-2">
                          <span className="text-orange-500">●</span>
                          <span>OpenAI (GPT-4)</span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="ai-model" className="text-sm">
                    Modell
                  </Label>
                  <Select 
                    value={aiModel} 
                    onValueChange={setAiModel}
                    disabled={isAnalyzing}
                  >
                    <SelectTrigger id="ai-model">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {aiProvider === "gemini" ? (
                        <>
                          <SelectItem value="gemini-2.0-flash-exp">
                            gemini-2.0-flash-exp (Snabb)
                          </SelectItem>
                          <SelectItem value="gemini-1.5-flash">
                            gemini-1.5-flash (Stabil)
                          </SelectItem>
                          <SelectItem value="gemini-1.5-pro">
                            gemini-1.5-pro (Bäst kvalitet)
                          </SelectItem>
                        </>
                      ) : (
                        <>
                          <SelectItem value="gpt-4o-mini">
                            gpt-4o-mini (Snabb & billig)
                          </SelectItem>
                          <SelectItem value="gpt-4o">
                            gpt-4o (Balanserad)
                          </SelectItem>
                          <SelectItem value="gpt-4-vision-preview">
                            gpt-4-vision-preview (Bäst kvalitet)
                          </SelectItem>
                        </>
                      )}
                    </SelectContent>
                  </Select>
                </div>

                {lastScanStats && (
                  <div className="text-xs text-muted-foreground pt-2 border-t">
                    <div className="flex justify-between">
                      <span>Senaste scan:</span>
                      <span className={lastScanStats.success ? "text-green-600" : "text-red-600"}>
                        {lastScanStats.success ? "✓ Lyckades" : "✗ Misslyckades"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Provider:</span>
                      <span className="font-mono">{lastScanStats.provider}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Modell:</span>
                      <span className="font-mono text-xs">{lastScanStats.model}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Tid:</span>
                      <span>{lastScanStats.processingTime}ms</span>
                    </div>
                    {lastScanStats.error && (
                      <div className="mt-1 p-2 bg-destructive/10 rounded text-destructive">
                        {lastScanStats.error}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Manual search always visible */}
          <div className="space-y-3">
            {/* Camera capture button - only when camera started */}
            {cameraStarted && (
              <>
                <Button
                  onClick={captureImage}
                  disabled={isAnalyzing}
                  size="lg"
                  className="w-full h-14 bg-primary hover:bg-primary/90 disabled:opacity-50"
                >
                  {isAnalyzing ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      Analyserar...
                    </>
                  ) : (
                    <>
                      <Camera className="w-5 h-5 mr-2" />
                      Scanna
                    </>
                  )}
                </Button>
              </>
            )}

            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <Label htmlFor="manualCode" className="text-sm">Eller ange artikelnummer</Label>
                <Input
                  id="manualCode"
                  placeholder="Artikelnummer"
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleManualSearch()}
                  disabled={isAnalyzing}
                />
              </div>
              <Button
                onClick={handleManualSearch}
                disabled={isAnalyzing || !manualCode.trim()}
                size="default"
              >
                Sök
              </Button>
            </div>

            {/* Stop camera button when running */}
            {cameraStarted && (
              <Button
                onClick={stopScanning}
                variant="outline"
                size="sm"
                className="w-full"
              >
                Stoppa kamera
              </Button>
            )}
          </div>
            
            {/* Barcode mode (hidden by default) */}
            {scanMode === "barcode" && cameraStarted && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-green-600 dark:text-green-500 font-medium justify-center p-2 bg-green-50 dark:bg-green-950/30 rounded-md">
                  <Camera className="w-5 h-5 animate-pulse" />
                  Scanna streckkod
                </div>
                <Button onClick={stopScanning} variant="outline" size="sm" className="w-full">
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
            <CardTitle>Välj order att motta för</CardTitle>
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
                      onClick={() => {
                        setSelectedOrder(order);
                        setManualPickQuantity(null);
                      }}
                    >
                      <CardContent className="p-4 space-y-2">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            {/* Display delivery note godsmärke (order_number) at the top if available */}
                            {orderLine.delivery_note_order && (
                              <div className="flex items-center gap-2 mb-2">
                                <p className="font-bold text-xl text-primary">Godsmärke: {orderLine.delivery_note_order}</p>
                                <Badge variant="default" className="bg-green-600">
                                  Följesedel
                                </Badge>
                              </div>
                            )}
                            
                            <div className="flex items-center gap-2">
                              <p className="font-bold text-lg">Order {order.order_number}</p>
                              {orderLine.has_delivery_note && !orderLine.delivery_note_order && (
                                <Badge variant="default" className="bg-green-600">
                                  Följesedel
                                </Badge>
                              )}
                            </div>
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
                        
                        {/* Only show customer_notes if NO delivery note godsmärke exists */}
                        {order.customer_notes && !orderLine.delivery_note_order && (
                          <div className="bg-yellow-50 p-2 rounded border border-yellow-200">
                            <p className="text-sm font-medium text-yellow-900">
                              📝 Notering: {order.customer_notes}
                            </p>
                          </div>
                        )}
                        
                        <div className="text-sm">
                          <p className="font-semibold">Artikelnr: {product.barcode || product.fdt_sellus_article_id}</p>
                          <p className="text-muted-foreground">{product.name}</p>
                          <p className="mt-1">Antal att motta: <span className="font-bold">{orderLine.quantity_ordered}</span></p>
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
            
            {selectedOrder && (() => {
              const selectedLine = activeOrders.find((ol: any) => ol.orders.id === selectedOrder.id);
              const defaultQuantity = selectedLine?.quantity_ordered || 1;
              const quantityToPick = manualPickQuantity !== null ? manualPickQuantity : defaultQuantity;
              
              return (
                <div className="sticky bottom-0 bg-background pt-3 border-t space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="pickQuantity" className="text-sm">
                      Antal att motta (förväntat: {defaultQuantity})
                    </Label>
                    <Input
                      id="pickQuantity"
                      type="number"
                      min="1"
                      placeholder={String(defaultQuantity)}
                      value={manualPickQuantity !== null ? manualPickQuantity : ''}
                      onChange={(e) => {
                        const value = parseInt(e.target.value);
                        setManualPickQuantity(e.target.value && !isNaN(value) && value >= 1 ? value : null);
                      }}
                    />
                  </div>
                  <Button 
                    onClick={() => {
                      handlePickItem(selectedLine.id, selectedOrder.id, quantityToPick);
                    }}
                    className="w-full"
                    size="lg"
                  >
                    ✓ Motta {quantityToPick} st för order {selectedOrder.order_number}
                  </Button>
                </div>
              );
            })()}
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

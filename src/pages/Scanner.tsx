import { useState, useEffect } from "react";
import { Html5QrcodeScanner } from "html5-qrcode";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Scan, Package, Plus, Minus } from "lucide-react";
import { useNavigate } from "react-router-dom";

const Scanner = () => {
  const navigate = useNavigate();
  const [scannedCode, setScannedCode] = useState("");
  const [manualCode, setManualCode] = useState("");
  const [product, setProduct] = useState<any>(null);
  const [locations, setLocations] = useState<any[]>([]);
  const [selectedLocation, setSelectedLocation] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [transactionType, setTransactionType] = useState<"in" | "out">("in");
  const [notes, setNotes] = useState("");
  const [scanning, setScanning] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [activeOrders, setActiveOrders] = useState<any[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [pickingMode, setPickingMode] = useState(false);

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
    if (scanning) {
      const scanner = new Html5QrcodeScanner(
        "reader",
        { fps: 10, qrbox: { width: 250, height: 250 } },
        false
      );

      scanner.render(
        (decodedText) => {
          handleScan(decodedText);
          scanner.clear();
          setScanning(false);
        },
        (error) => {
          console.log(error);
        }
      );

      return () => {
        scanner.clear().catch(console.error);
      };
    }
  }, [scanning]);

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
    
    setProduct(null);
    setActiveOrders([]);
    setSelectedOrder(null);
    setPickingMode(false);
    setScannedCode("");
    setManualCode("");
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
    setProduct(null);
    setScannedCode("");
    setManualCode("");
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

      <Card>
        <CardHeader>
          <CardTitle>Skanna streckkod</CardTitle>
          <CardDescription>
            Använd kameran eller ange streckkoden manuellt
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Ange streckkod manuellt"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleManualSearch()}
            />
            <Button onClick={handleManualSearch}>Sök</Button>
          </div>

          {!scanning ? (
            <Button
              onClick={() => setScanning(true)}
              className="w-full"
              variant="secondary"
            >
              <Scan className="w-4 h-4 mr-2" />
              Starta kamera
            </Button>
          ) : (
            <>
              <div id="reader" className="w-full"></div>
              <Button
                onClick={() => setScanning(false)}
                className="w-full"
                variant="outline"
              >
                Stoppa kamera
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {product && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="w-5 h-5" />
              {product.name}
            </CardTitle>
            <CardDescription>{product.description}</CardDescription>
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
                    <span className="text-muted-foreground">Synk-status:</span>
                    <p className="font-medium text-green-600">
                      {product.fdt_sync_status === 'synced' ? '✓ Synkad' : 'Väntande'}
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
            
            {selectedOrder && (
              <Button 
                onClick={() => {
                  const selectedLine = activeOrders.find((ol: any) => ol.orders.id === selectedOrder.id);
                  handlePickItem(selectedLine.id, selectedOrder.id, selectedLine.quantity_ordered);
                }}
                className="w-full mt-4"
                size="lg"
              >
                ✓ Bocka av artikel för order {selectedOrder.order_number}
              </Button>
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

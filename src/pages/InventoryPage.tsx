import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase, isSupabaseConfigured } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, RefreshCw, Package, AlertTriangle, Search } from "lucide-react";

interface InventoryItem {
  id: string;
  product_id: string;
  quantity: number;
  location_id: string;
  last_updated: string;
  product: {
    name: string;
    barcode: string | null;
    fdt_sellus_article_id: string | null;
    min_stock: number;
  };
  location: {
    name: string;
  };
  pending_orders?: number;
}

const InventoryPage = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    fetchInventory();
  }, []);

  const fetchInventory = async () => {
    if (!isSupabaseConfigured) {
      console.error('Supabase is not configured. SUPABASE_URL or key missing.');
      toast({
        title: "Fel",
        description: "Supabase är inte konfigurerad. Sätt VITE_SUPABASE_URL/SUPABASE_URL och VITE_SUPABASE_PUBLISHABLE_KEY/SUPABASE_ANON_KEY.",
        variant: "destructive",
      });
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('inventory')
        .select(`
          *,
          product:products(name, barcode, fdt_sellus_article_id, min_stock),
          location:locations(name)
        `)
        .order('last_updated', { ascending: false });

      if (error) throw error;

      // Fetch pending orders count for each product
      const inventoryWithOrders = await Promise.all(
        (data || []).map(async (item) => {
          const { count } = await supabase
            .from('order_lines')
            .select('*', { count: 'exact', head: true })
            .eq('product_id', item.product_id)
            .eq('is_picked', false);

          return {
            ...item,
            pending_orders: count || 0,
          };
        })
      );

      setInventory(inventoryWithOrders);
    } catch (err) {
      // Prefer using the error message when available, otherwise try to stringify
      let message = 'Kunde inte hämta lagersaldo';
      try {
        if (err && (err as any).message) message = (err as any).message;
        else if (typeof err === 'string') message = err;
        else message = JSON.stringify(err);
      } catch (e) {
        // ignore stringify errors
      }

      console.error('Error fetching inventory:', err);
      toast({
        title: "Fel",
        description: message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('sync-inventory-to-sellus');

      if (error) throw error;

      toast({
        title: "Synkronisering slutförd",
        description: `Synkroniserade ${data?.synced || 0} poster`,
      });

      await fetchInventory();
    } catch (error: any) {
      toast({
        title: "Synkroniseringsfel",
        description: error.message || "Okänt fel uppstod",
        variant: "destructive",
      });
    } finally {
      setSyncing(false);
    }
  };

  const filteredInventory = inventory.filter((item) => {
    const query = searchQuery.toLowerCase();
    const articleNumber = item.product.barcode || item.product.fdt_sellus_article_id || '';
    return (
      item.product.name.toLowerCase().includes(query) ||
      articleNumber.toLowerCase().includes(query) ||
      item.location.name.toLowerCase().includes(query)
    );
  });

  if (loading) {
    return <div className="container mx-auto p-6">Laddar...</div>;
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Package className="h-8 w-8" />
              Lagersaldo
            </h1>
            <p className="text-muted-foreground">Artiklar i lager och deras status</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleSync} disabled={syncing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Synkroniserar...' : 'Synka till Sellus'}
          </Button>
          <Button onClick={fetchInventory} variant="outline" size="icon">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Lagersaldo ({filteredInventory.length} artiklar)</span>
            <div className="relative w-64">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Sök artikelnummer eller namn..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8"
              />
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Artikelnummer</TableHead>
                <TableHead>Benämning</TableHead>
                <TableHead>Plats</TableHead>
                <TableHead className="text-right">Antal</TableHead>
                <TableHead className="text-right">Min. lager</TableHead>
                <TableHead>Väntande ordrar</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredInventory.map((item) => {
                const isLowStock = item.quantity <= item.product.min_stock;
                const articleNumber = item.product.barcode || item.product.fdt_sellus_article_id || 'N/A';
                
                return (
                  <TableRow key={item.id}>
                    <TableCell className="font-mono">{articleNumber}</TableCell>
                    <TableCell className="font-medium">{item.product.name}</TableCell>
                    <TableCell>{item.location.name}</TableCell>
                    <TableCell className="text-right font-semibold">
                      {item.quantity}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {item.product.min_stock}
                    </TableCell>
                    <TableCell>
                      {item.pending_orders ? (
                        <Badge variant="secondary">{item.pending_orders} order</Badge>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {isLowStock ? (
                        <Badge variant="destructive" className="flex items-center gap-1 w-fit">
                          <AlertTriangle className="h-3 w-3" />
                          Lågt lager
                        </Badge>
                      ) : (
                        <Badge variant="default" className="bg-success text-success-foreground">
                          OK
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default InventoryPage;

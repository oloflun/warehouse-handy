import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Package,
  Scan,
  TrendingUp,
  TrendingDown,
  LogOut,
  AlertTriangle,
  CheckCircle,
  AlertCircle,
} from "lucide-react";

interface InventoryItem {
  id: string;
  quantity: number;
  product: {
    id: string;
    name: string;
    barcode: string;
    category: string;
    min_stock: number;
    unit: string;
  };
  location: {
    name: string;
  };
}

const Index = () => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [user, setUser] = useState<any>(null);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [stats, setStats] = useState({
    totalProducts: 0,
    lowStock: 0,
    recentTransactions: 0,
  });

  const { data: syncFailures } = useQuery({
    queryKey: ['sellus-sync-failures'],
    queryFn: async () => {
      const { data } = await supabase
        .from('sellus_sync_failures')
        .select('*')
        .is('resolved_at', null)
        .order('created_at', { ascending: false });
      return data || [];
    },
    refetchInterval: 30000,
    enabled: !!user,
  });

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate("/auth");
      } else {
        setUser(session.user);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) {
        navigate("/auth");
      } else {
        setUser(session.user);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  useEffect(() => {
    if (user) {
      fetchInventory();
      fetchStats();
    }
  }, [user]);

  const fetchInventory = async () => {
    const { data, error } = await supabase
      .from("inventory")
      .select(`
        *,
        product:products(*),
        location:locations(name)
      `)
      .order("quantity", { ascending: true })
      .limit(10);

    if (error) {
      toast.error("Kunde inte hämta lagersaldo");
      return;
    }

    setInventory(data || []);
  };

  const fetchStats = async () => {
    const [productsResult, transactionsResult] = await Promise.all([
      supabase.from("products").select("*", { count: "exact", head: true }),
      supabase
        .from("transactions")
        .select("*", { count: "exact", head: true })
        .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
    ]);

    const lowStockResult = await supabase
      .from("inventory")
      .select(`
        *,
        product:products(min_stock)
      `)
      .lt("quantity", 10);

    setStats({
      totalProducts: productsResult.count || 0,
      lowStock: lowStockResult.data?.length || 0,
      recentTransactions: transactionsResult.count || 0,
    });
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  const getStockStatus = (item: InventoryItem) => {
    if (item.quantity === 0) {
      return { label: "Slut", variant: "destructive" as const, icon: AlertTriangle };
    }
    if (item.quantity <= item.product.min_stock) {
      return { label: "Lågt", variant: "warning" as const, icon: AlertTriangle };
    }
    return { label: "OK", variant: "success" as const, icon: CheckCircle };
  };

  return (
    <div className="min-h-screen bg-background p-4 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Package className="w-8 h-8 text-primary" />
            WMS Dashboard
          </h1>
          <p className="text-muted-foreground mt-1">
            Välkommen, {user?.email}
          </p>
        </div>
        <Button variant="outline" onClick={handleLogout}>
          <LogOut className="w-4 h-4 mr-2" />
          Logga ut
        </Button>
      </div>

      {syncFailures && syncFailures.length > 0 && (
        <Alert variant="destructive">
          <AlertCircle className="h-5 w-5" />
          <AlertTitle className="text-lg font-bold">
            ⚠️ {syncFailures.length} artikel{syncFailures.length > 1 ? 'ar' : ''} misslyckades synka till Sellus!
          </AlertTitle>
          <AlertDescription className="mt-2">
            <p className="mb-3">
              Följande produkter har plockats men lagersaldot har inte uppdaterats i Sellus.
              Du måste uppdatera dessa MANUELLT:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              {syncFailures.map((failure: any) => (
                <li key={failure.id}>
                  <strong>{failure.product_name}</strong> - 
                  Ändring: {failure.quantity_changed} st - 
                  Order: {failure.order_number || 'N/A'} - 
                  {new Date(failure.created_at).toLocaleString('sv-SE')}
                </li>
              ))}
            </ul>
            <Button 
              variant="outline" 
              size="sm" 
              className="mt-3"
              onClick={() => navigate('/integrations')}
            >
              Visa detaljer och markera som löst
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Totalt produkter</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalProducts}</div>
            <p className="text-xs text-muted-foreground">Unika produkter i systemet</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Lågt lager</CardTitle>
            <AlertTriangle className="h-4 w-4 text-warning" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.lowStock}</div>
            <p className="text-xs text-muted-foreground">Produkter med lågt lagersaldo</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Transaktioner (7d)</CardTitle>
            <TrendingUp className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.recentTransactions}</div>
            <p className="text-xs text-muted-foreground">Senaste veckans aktivitet</p>
          </CardContent>
        </Card>
      </div>

      <div className={`grid grid-cols-1 gap-4 ${isMobile ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
        {isMobile && (
          <Button
            onClick={() => navigate("/scanner")}
            size="lg"
            className="h-16 text-lg"
          >
            <Scan className="w-6 h-6 mr-2" />
            Starta Scanner
          </Button>
        )}
        
        <Button
          onClick={() => navigate("/integrations")}
          size="lg"
          variant="outline"
          className="h-16 text-lg"
        >
          <Package className="w-6 h-6 mr-2" />
          FDT Integration
        </Button>

        <Button
          onClick={() => navigate("/fdt-explorer")}
          size="lg"
          variant="outline"
          className="h-16 text-lg"
        >
          API Explorer
        </Button>
      </div>

    </div>
  );
};

export default Index;

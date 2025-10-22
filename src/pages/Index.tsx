import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Package,
  Scan,
  TrendingUp,
  TrendingDown,
  LogOut,
  AlertTriangle,
  CheckCircle,
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
  const [user, setUser] = useState<any>(null);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [stats, setStats] = useState({
    totalProducts: 0,
    lowStock: 0,
    recentTransactions: 0,
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Button
          onClick={() => navigate("/scanner")}
          size="lg"
          className="h-16 text-lg"
        >
          <Scan className="w-6 h-6 mr-2" />
          Starta Scanner
        </Button>
        
        <Button
          onClick={() => navigate("/integrations")}
          size="lg"
          variant="outline"
          className="h-16 text-lg"
        >
          <Package className="w-6 h-6 mr-2" />
          FDT Integration
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Aktuellt lagersaldo</CardTitle>
          <CardDescription>De 10 produkterna med lägst lagersaldo</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {inventory.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                Inga produkter i lager än. Börja med att scanna in varor!
              </p>
            ) : (
              inventory.map((item) => {
                const status = getStockStatus(item);
                const StatusIcon = status.icon;
                return (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium">{item.product.name}</h3>
                        <Badge variant={status.variant}>
                          <StatusIcon className="w-3 h-3 mr-1" />
                          {status.label}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {item.product.category} • {item.location.name}
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold">
                        {item.quantity}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {item.product.unit}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Index;

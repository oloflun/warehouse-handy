import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, RefreshCw, ShoppingCart, ChevronRight, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface OrderSummary {
  id: string;
  order_number: string;
  customer_name: string | null;
  order_date: string | null;
  status: string | null;
  pick_status: string | null;
  total_lines: number;
  picked_lines: number;
  location_name: string | null;
}

const SalesPage = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [orderToDelete, setOrderToDelete] = useState<OrderSummary | null>(null);

  useEffect(() => {
    checkSuperAdmin();
    fetchOrders();
  }, []);

  const checkSuperAdmin = async () => {
    try {
      const { data } = await supabase.rpc('is_super_admin', {
        _user_id: (await supabase.auth.getUser()).data.user?.id
      });
      setIsSuperAdmin(data || false);
    } catch (error) {
      console.error('Error checking super admin status:', error);
    }
  };

  const fetchOrders = async () => {
    try {
      const { data, error } = await supabase
        .from('order_summary')
        .select('*')
        .order('order_date', { ascending: false });

      if (error) throw error;

      setOrders(data || []);
    } catch (error) {
      console.error('Error fetching orders:', error);
      toast({
        title: "Fel",
        description: "Kunde inte hämta ordrar",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('sync-sales-from-retail');

      if (error) throw error;

      toast({
        title: "Synkronisering slutförd",
        description: `Synkroniserade ${data?.synced || 0} ordrar`,
      });

      await fetchOrders();
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

  const handleDeleteClick = (e: React.MouseEvent, order: OrderSummary) => {
    e.stopPropagation();
    setOrderToDelete(order);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!orderToDelete) return;

    try {
      // Delete order lines first
      const { error: linesError } = await supabase
        .from('order_lines')
        .delete()
        .eq('order_id', orderToDelete.id);

      if (linesError) throw linesError;

      // Delete the order
      const { error: orderError } = await supabase
        .from('orders')
        .delete()
        .eq('id', orderToDelete.id);

      if (orderError) throw orderError;

      // Update local state immediately for better UX
      setOrders(prevOrders => prevOrders.filter(order => order.id !== orderToDelete.id));

      toast({
        title: "Raderad",
        description: `Order #${orderToDelete.order_number} har raderats`,
      });

      // Refresh the list from server to ensure consistency
      await fetchOrders();
    } catch (error) {
      console.error('Error deleting order:', error);
      toast({
        title: "Fel",
        description: "Kunde inte radera order",
        variant: "destructive",
      });
    } finally {
      setDeleteDialogOpen(false);
      setOrderToDelete(null);
    }
  };

  const getStatusBadge = (status: string | null) => {
    if (!status) return <Badge variant="secondary">Okänd</Badge>;

    const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" }> = {
      'pending': { label: 'Väntande', variant: 'secondary' },
      'completed': { label: 'Slutförd', variant: 'default' },
      'cancelled': { label: 'Avbruten', variant: 'destructive' },
    };

    const statusInfo = statusMap[status] || { label: status, variant: 'secondary' };
    return <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>;
  };

  const getPickStatusBadge = (pickStatus: string | null) => {
    if (!pickStatus) return null;

    const statusMap: Record<string, { label: string; className: string }> = {
      'Ej påbörjad': { label: 'Ej påbörjad', className: 'bg-muted text-muted-foreground' },
      'Påbörjad': { label: 'Påbörjad', className: 'bg-warning text-warning-foreground' },
      'Komplett': { label: 'Komplett', className: 'bg-success text-success-foreground' },
    };

    const statusInfo = statusMap[pickStatus] || { label: pickStatus, className: 'bg-muted' };
    return <Badge className={statusInfo.className}>{statusInfo.label}</Badge>;
  };

  const filteredOrders = orders.filter((order) => {
    if (statusFilter === 'all') return true;
    return order.status === statusFilter;
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
              <ShoppingCart className="h-8 w-8" />
              Försäljning
            </h1>
            <p className="text-muted-foreground">Aktiva ordrar och försäljningsstatus</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleSync} disabled={syncing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Synkroniserar...' : 'Synka från Retail'}
          </Button>
          <Button onClick={fetchOrders} variant="outline" size="icon">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex gap-2">
        <Button
          variant={statusFilter === 'all' ? 'default' : 'outline'}
          onClick={() => setStatusFilter('all')}
          size="sm"
        >
          Alla ({orders.length})
        </Button>
        <Button
          variant={statusFilter === 'pending' ? 'default' : 'outline'}
          onClick={() => setStatusFilter('pending')}
          size="sm"
        >
          Väntande ({orders.filter(o => o.status === 'pending').length})
        </Button>
        <Button
          variant={statusFilter === 'completed' ? 'default' : 'outline'}
          onClick={() => setStatusFilter('completed')}
          size="sm"
        >
          Slutförda ({orders.filter(o => o.status === 'completed').length})
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filteredOrders.map((order) => (
          <Card
            key={order.id}
            className="cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => navigate(`/sales/${order.id}`)}
          >
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="text-lg">#{order.order_number}</span>
                <div className="flex items-center gap-2">
                  {isSuperAdmin && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={(e) => handleDeleteClick(e, order)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-sm text-muted-foreground">Kund</p>
                <p className="font-medium">{order.customer_name || 'Okänd kund'}</p>
              </div>

              <div>
                <p className="text-sm text-muted-foreground">Datum</p>
                <p className="font-medium">
                  {order.order_date
                    ? new Date(order.order_date).toLocaleDateString('sv-SE')
                    : '-'}
                </p>
              </div>

              <div>
                <p className="text-sm text-muted-foreground">Plats</p>
                <p className="font-medium">{order.location_name || '-'}</p>
              </div>

              <div className="flex items-center justify-between pt-2 border-t">
                <div>
                  <p className="text-sm text-muted-foreground">Rader</p>
                  <p className="font-bold text-lg">
                    {order.picked_lines} / {order.total_lines}
                  </p>
                </div>
                <div className="flex flex-col gap-2 items-end">
                  {getStatusBadge(order.status)}
                  {getPickStatusBadge(order.pick_status)}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredOrders.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Inga ordrar hittades
          </CardContent>
        </Card>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Radera order?</AlertDialogTitle>
            <AlertDialogDescription>
              Är du säker på att du vill radera order #{orderToDelete?.order_number}?
              Detta kommer permanent radera ordern och alla dess rader.
              <br /><br />
              <strong className="text-destructive">Denna åtgärd kan inte ångras.</strong>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Radera
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default SalesPage;

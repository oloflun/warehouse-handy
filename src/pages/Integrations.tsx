import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw, CheckCircle2, XCircle, Clock, Package, List, ShoppingCart, ChevronRight, AlertCircle, Check, QrCode, ClipboardList } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
interface SyncStatus {
  id: string;
  sync_type: string;
  last_successful_sync: string | null;
  last_error: string | null;
  total_synced: number;
  total_errors: number;
  is_enabled: boolean;
}
interface SyncLog {
  id: string;
  sync_type: string;
  direction: string;
  status: string;
  error_message: string | null;
  created_at: string;
  duration_ms: number;
}
const Integrations = () => {
  const navigate = useNavigate();
  const {
    toast
  } = useToast();
  const [syncStatuses, setSyncStatuses] = useState<SyncStatus[]>([]);
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<Record<string, boolean>>({});
  const [user, setUser] = useState<any>(null);
  const isMobile = useIsMobile();
  const {
    data: syncFailures,
    refetch: refetchFailures
  } = useQuery({
    queryKey: ['sellus-sync-failures'],
    queryFn: async () => {
      const {
        data
      } = await supabase.from('sellus_sync_failures').select('*').is('resolved_at', null).order('created_at', {
        ascending: false
      });
      return data || [];
    },
    refetchInterval: 30000,
    enabled: !!user
  });
  const {
    data: syncDiscrepancies
  } = useQuery({
    queryKey: ['sellus-sync-discrepancies'],
    queryFn: async () => {
      const {
        data
      } = await supabase.from('sellus_sync_discrepancies').select('*').eq('resolved', false).order('severity', {
        ascending: false
      }).order('created_at', {
        ascending: false
      });
      return data || [];
    },
    refetchInterval: 30000,
    enabled: !!user
  });
  useEffect(() => {
    supabase.auth.getSession().then(({
      data: {
        session
      }
    }) => {
      setUser(session?.user || null);
    });
    fetchData();
  }, []);
  const fetchData = async () => {
    try {
      const [statusRes, logsRes] = await Promise.all([supabase.from('fdt_sync_status').select('*').order('sync_type'), supabase.from('fdt_sync_log').select('*').order('created_at', {
        ascending: false
      }).limit(50)]);
      if (statusRes.data) setSyncStatuses(statusRes.data);
      if (logsRes.data) setSyncLogs(logsRes.data);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };
  const triggerSync = async (syncType: string) => {
    setSyncing(prev => ({
      ...prev,
      [syncType]: true
    }));
    try {
      const functionMap: Record<string, string> = {
        'product_import': 'sync-products-from-sellus',
        'inventory_export': 'sync-inventory-to-sellus',
        'sale_import': 'sync-sales-from-retail'
      };
      const {
        data,
        error
      } = await supabase.functions.invoke(functionMap[syncType]);
      if (error) throw error;
      const successMsg = data?.synced !== undefined ? `Synkroniserade ${data.synced} poster${data.errors > 0 ? ` (${data.errors} fel)` : ''}` : 'Synkronisering slutförd';
      toast({
        title: "Synkronisering slutförd",
        description: successMsg,
        variant: data?.errors > 0 ? "destructive" : "default"
      });

      // Wait a bit before refreshing to ensure database is updated
      setTimeout(fetchData, 1000);
    } catch (error: any) {
      let errorMsg = error.message || 'Okänt fel uppstod';

      // If error.context is a Response object, try to extract details
      if (error.context && typeof error.context === 'object') {
        try {
          if (error.context instanceof Response) {
            const responseText = await error.context.text();
            try {
              const responseJson = JSON.parse(responseText);
              errorMsg = responseJson.error || responseJson.message || `${error.context.status} ${error.context.statusText}`;
            } catch {
              errorMsg = `${error.context.status} ${error.context.statusText}: ${responseText}`;
            }
          } else if (error.context.error) {
            errorMsg = error.context.error;
          }
        } catch (e) {
          console.error('Failed to parse error context:', e);
        }
      }
      toast({
        title: "Synkroniseringsfel",
        description: errorMsg,
        variant: "destructive"
      });
      console.error('Sync error details:', error);
    } finally {
      setSyncing(prev => ({
        ...prev,
        [syncType]: false
      }));
    }
  };
  const retryFailedSync = async (failure: any) => {
    if (!failure.product_id) {
      toast({
        title: "Fel",
        description: "Ingen produkt-ID hittades för att försöka igen",
        variant: "destructive"
      });
      return;
    }
    setSyncing(prev => ({
      ...prev,
      [`retry-${failure.id}`]: true
    }));
    try {
      const {
        data,
        error
      } = await supabase.functions.invoke('update-sellus-stock', {
        body: {
          productId: failure.product_id,
          quantity: failure.quantity_changed
        }
      });
      if (error) throw error;
      toast({
        title: "Försök igen lyckades",
        description: `Lagersaldo för ${failure.product_name} har uppdaterats i Sellus`
      });

      // Refresh data
      setTimeout(() => {
        fetchData();
        refetchFailures();
      }, 1000);
    } catch (error: any) {
      toast({
        title: "Försök igen misslyckades",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setSyncing(prev => ({
        ...prev,
        [`retry-${failure.id}`]: false
      }));
    }
  };
  const resolveAllItemIds = async () => {
    setSyncing(prev => ({
      ...prev,
      'resolve-ids': true
    }));
    try {
      const {
        data,
        error
      } = await supabase.functions.invoke('resolve-sellus-item-ids', {
        body: {}
      });
      if (error) throw error;
      toast({
        title: "Verifiering slutförd",
        description: `${data.resolved} artiklar verifierade, ${data.failed} misslyckades`
      });
      setTimeout(fetchData, 1000);
    } catch (error: any) {
      toast({
        title: "Fel vid verifiering",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setSyncing(prev => ({
        ...prev,
        'resolve-ids': false
      }));
    }
  };
  const getSyncTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      'product_import': 'Artiklar',
      'inventory_export': 'Lagersaldo till Sellus',
      'sale_import': 'Försäljning'
    };
    return labels[type] || type;
  };
  const getStatusColor = (status: SyncStatus) => {
    if (!status.last_successful_sync) return 'secondary';
    const hoursSinceSync = (Date.now() - new Date(status.last_successful_sync).getTime()) / (1000 * 60 * 60);
    if (status.total_errors > 0) return 'destructive';
    if (hoursSinceSync > 24) return 'secondary';
    return 'default';
  };
  if (loading) {
    return <div className="container mx-auto p-6">Laddar...</div>;
  }
  return <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          
        </div>
        <div className="flex gap-2">
          {isMobile ? <>
              <Button onClick={() => navigate('/scanner')} variant="default" className="flex items-center gap-2">
                <QrCode className="h-4 w-4" />
                Scanner
              </Button>
              <Button onClick={() => navigate('/delivery-notes')} variant="secondary" className="flex items-center gap-2">
                <ClipboardList className="h-4 w-4" />
                Följesedlar
              </Button>
            </> : <>
              <Button onClick={() => navigate('/delivery-notes')} variant="default">
                <ClipboardList className="h-4 w-4 mr-2" />
                Följesedlar
              </Button>
              <Button onClick={resolveAllItemIds} disabled={syncing['resolve-ids']} variant="secondary">
                {syncing['resolve-ids'] ? 'Verifierar...' : 'Verifiera artikelkopplingar'}
              </Button>
              <Button onClick={() => navigate('/fdt-explorer')} variant="outline">
                API Explorer
              </Button>
            </>}
          <Button onClick={fetchData} variant="outline" size="icon">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader className="cursor-pointer" onClick={() => navigate('/inventory')}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Package className="h-6 w-6 text-primary" />
                </div>
                <CardTitle className="text-xl">Lagersaldo</CardTitle>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="cursor-pointer mb-3" onClick={() => navigate('/inventory')}>
              <p className="text-muted-foreground text-sm mb-2">
                Visa artiklar i lager med kvantiteter och status
              </p>
              <p className="text-2xl font-bold text-primary">
                {syncStatuses.find(s => s.sync_type === 'inventory_export')?.total_synced || 0}
              </p>
              <p className="text-sm text-muted-foreground">artiklar i lager</p>
            </div>
            <Button onClick={e => {
            e.stopPropagation();
            triggerSync('inventory_export');
          }} disabled={syncing['inventory_export']} className="w-full" variant="default">
              {syncing['inventory_export'] ? 'Synkar...' : 'Synka till Sellus'}
            </Button>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => navigate('/articles')}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-secondary/10">
                  <List className="h-6 w-6 text-secondary" />
                </div>
                <CardTitle className="text-xl">Artiklar</CardTitle>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm mb-2">
              Hantera alla registrerade artiklar i systemet
            </p>
            <p className="text-2xl font-bold text-secondary">
              {syncStatuses.find(s => s.sync_type === 'product_import')?.total_synced || 0}
            </p>
            <p className="text-sm text-muted-foreground">registrerade artiklar</p>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => navigate('/sales')}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-accent/10">
                  <ShoppingCart className="h-6 w-6 text-accent" />
                </div>
                <CardTitle className="text-xl">Försäljning</CardTitle>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm mb-2">
              Visa aktiva ordrar och försäljningsstatus
            </p>
            <p className="text-2xl font-bold text-accent">
              {syncStatuses.find(s => s.sync_type === 'sale_import')?.total_synced || 0}
            </p>
            <p className="text-sm text-muted-foreground">synkade ordrar</p>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => navigate('/delivery-notes')}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-500/10">
                  <ClipboardList className="h-6 w-6 text-blue-500" />
                </div>
                <CardTitle className="text-xl">Följesedlar</CardTitle>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm mb-2">
              Hantera inleveranser och följesedlar
            </p>
            <p className="text-2xl font-bold text-blue-500">
              {/* Will be replaced with actual count */}
              <span className="opacity-50">-</span>
            </p>
            <p className="text-sm text-muted-foreground">följesedlar</p>
          </CardContent>
        </Card>
      </div>

      {syncFailures && syncFailures.length > 0 && <Alert variant="destructive">
          <AlertCircle className="h-5 w-5" />
          <AlertTitle className="text-lg font-bold">
            Misslyckade Sellus-synkningar
          </AlertTitle>
          <AlertDescription className="mt-2">
            <p className="mb-3">
              Följande produkter har plockats men kunde inte synkas till Sellus. Uppdatera manuellt i Sellus och markera som löst:
            </p>
            <div className="space-y-2">
              {syncFailures.map((failure: any) => <div key={failure.id} className="flex items-center justify-between p-3 bg-background rounded border">
                  <div className="flex-1">
                    <p className="font-medium">{failure.product_name}</p>
                    <p className="text-sm text-muted-foreground">
                      Ändring: {failure.quantity_changed} st • 
                      Order: {failure.order_number || 'N/A'} • 
                      Sellus-ID: {failure.fdt_sellus_article_id || 'Saknas'} • 
                      {new Date(failure.created_at).toLocaleString('sv-SE')}
                    </p>
                    <p className="text-sm text-destructive mt-1">
                      Fel: {failure.error_message}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="default" onClick={() => retryFailedSync(failure)} disabled={syncing[`retry-${failure.id}`]}>
                      {syncing[`retry-${failure.id}`] ? 'Försöker...' : 'Försök igen'}
                    </Button>
                    <Button size="sm" variant="outline" onClick={async () => {
                const {
                  error
                } = await supabase.from('sellus_sync_failures').update({
                  resolved_at: new Date().toISOString(),
                  resolved_by: user?.id
                }).eq('id', failure.id);
                if (error) {
                  toast({
                    title: "Fel",
                    description: "Kunde inte markera som löst",
                    variant: "destructive"
                  });
                } else {
                  toast({
                    title: "Markerad som löst",
                    description: "Synkfelet har markerats som åtgärdat"
                  });
                  refetchFailures();
                }
              }}>
                      <Check className="w-4 h-4 mr-2" />
                      Markera som löst
                    </Button>
                  </div>
                </div>)}
            </div>
          </AlertDescription>
        </Alert>}

      {!isMobile && <Card>
          <CardHeader>
            <CardTitle>Synkroniseringslogg</CardTitle>
            <CardDescription>Senaste 50 synkroniseringarna</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tidpunkt</TableHead>
                  <TableHead>Typ</TableHead>
                  <TableHead>Riktning</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Varaktighet</TableHead>
                  <TableHead>Felmeddelande</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {syncLogs.map(log => <TableRow key={log.id}>
                    <TableCell className="font-mono text-sm">
                      {new Date(log.created_at).toLocaleString('sv-SE')}
                    </TableCell>
                    <TableCell>{getSyncTypeLabel(log.sync_type)}</TableCell>
                    <TableCell>
                      {log.direction === 'sellus_to_wms' ? '→ WMS' : '→ FDT'}
                    </TableCell>
                    <TableCell>
                      {log.status === 'success' ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <XCircle className="h-4 w-4 text-red-600" />}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {log.duration_ms}ms
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {log.error_message || '-'}
                    </TableCell>
                  </TableRow>)}
              </TableBody>
            </Table>
          </CardContent>
        </Card>}
    </div>;
};
export default Integrations;
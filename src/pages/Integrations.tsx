import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { RefreshCw, ArrowLeft, CheckCircle2, XCircle, Clock } from "lucide-react";

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
  const { toast } = useToast();
  const [syncStatuses, setSyncStatuses] = useState<SyncStatus[]>([]);
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [statusRes, logsRes] = await Promise.all([
        supabase.from('fdt_sync_status').select('*').order('sync_type'),
        supabase.from('fdt_sync_log').select('*').order('created_at', { ascending: false }).limit(50)
      ]);

      if (statusRes.data) setSyncStatuses(statusRes.data);
      if (logsRes.data) setSyncLogs(logsRes.data);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const triggerSync = async (syncType: string) => {
    setSyncing(syncType);
    try {
      const functionMap: Record<string, string> = {
        'product_import': 'sync-products-from-sellus',
        'inventory_export': 'sync-inventory-to-sellus',
        'sale_import': 'sync-sales-from-retail',
      };

      const { data, error } = await supabase.functions.invoke(functionMap[syncType]);

      if (error) throw error;

      const successMsg = data?.synced !== undefined 
        ? `Synkroniserade ${data.synced} poster${data.errors > 0 ? ` (${data.errors} fel)` : ''}`
        : 'Synkronisering slutförd';

      toast({
        title: "Synkronisering slutförd",
        description: successMsg,
        variant: data?.errors > 0 ? "destructive" : "default",
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
        variant: "destructive",
      });
      
      console.error('Sync error details:', error);
    } finally {
      setSyncing(null);
    }
  };

  const getSyncTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      'product_import': 'Produkter från Sellus',
      'inventory_export': 'Lagersaldo till Sellus',
      'sale_import': 'Försäljning från Retail',
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

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">FDT Integration</h1>
            <p className="text-muted-foreground">Hantera synkronisering med FDT Sellus & Excellence Retail</p>
          </div>
        </div>
        <Button onClick={fetchData} variant="outline" size="icon">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {syncStatuses.map((status) => (
          <Card key={status.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">{getSyncTypeLabel(status.sync_type)}</CardTitle>
                <Badge variant={getStatusColor(status)}>
                  {status.is_enabled ? 'Aktiv' : 'Inaktiv'}
                </Badge>
              </div>
              <CardDescription>
                {status.last_successful_sync 
                  ? `Senaste synk: ${new Date(status.last_successful_sync).toLocaleString('sv-SE')}`
                  : 'Ingen synkronisering än'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Synkade</p>
                  <p className="text-2xl font-bold">{status.total_synced}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Fel</p>
                  <p className="text-2xl font-bold text-destructive">{status.total_errors}</p>
                </div>
              </div>
              {status.last_error && (
                <p className="text-sm text-destructive">{status.last_error}</p>
              )}
              <Button 
                onClick={() => triggerSync(status.sync_type)} 
                disabled={syncing === status.sync_type}
                className="w-full"
              >
                {syncing === status.sync_type ? 'Synkroniserar...' : 'Kör synk nu'}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
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
              {syncLogs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="font-mono text-sm">
                    {new Date(log.created_at).toLocaleString('sv-SE')}
                  </TableCell>
                  <TableCell>{getSyncTypeLabel(log.sync_type)}</TableCell>
                  <TableCell>
                    {log.direction === 'sellus_to_wms' ? '→ WMS' : '→ FDT'}
                  </TableCell>
                  <TableCell>
                    {log.status === 'success' ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-600" />
                    )}
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
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default Integrations;

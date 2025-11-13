import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RefreshCw, CheckCircle2, XCircle, Clock, ArrowLeft } from "lucide-react";
import { ProfileButton } from "@/components/ProfileButton";

interface SyncLog {
  id: string;
  sync_type: string;
  direction: string;
  status: string;
  error_message: string | null;
  created_at: string;
  duration_ms: number;
}

const SyncLog = () => {
  const navigate = useNavigate();
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const { data } = await supabase
        .from('fdt_sync_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      
      if (data) setSyncLogs(data);
    } catch (error) {
      console.error('Error fetching sync logs:', error);
    } finally {
      setLoading(false);
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

  if (loading) {
    return <div className="w-full max-w-full px-4 py-6">Laddar...</div>;
  }

  return (
    <div className="w-full max-w-full px-4 py-6 md:container md:mx-auto md:px-6 space-y-6">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/admin-tools')}
            className="shrink-0"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="font-extrabold text-2xl sm:text-3xl md:text-4xl truncate">
            Synkroniseringslogg
          </h1>
        </div>
        <div className="flex gap-2">
          <Button onClick={fetchData} variant="outline" size="icon">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <ProfileButton />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Synkroniseringshistorik</CardTitle>
          <CardDescription>Senaste 100 synkroniseringarna</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
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
                {syncLogs.map(log => (
                  <TableRow key={log.id}>
                    <TableCell className="font-mono text-sm">
                      {new Date(log.created_at).toLocaleString('sv-SE')}
                    </TableCell>
                    <TableCell>{getSyncTypeLabel(log.sync_type)}</TableCell>
                    <TableCell>
                      {log.direction === 'sellus_to_wms' ? '→ WMS' : '→ FDT'}
                    </TableCell>
                    <TableCell>
                      {log.status === 'success' 
                        ? <CheckCircle2 className="h-4 w-4 text-green-600" /> 
                        : <XCircle className="h-4 w-4 text-red-600" />
                      }
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {log.duration_ms}ms
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                      {log.error_message || '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SyncLog;

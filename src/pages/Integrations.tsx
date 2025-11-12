import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { Package, List, ShoppingCart, ChevronRight, AlertCircle, Check, QrCode, ClipboardList, Settings } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { ProfileButton } from "@/components/ProfileButton";

const Integrations = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [syncing, setSyncing] = useState<Record<string, boolean>>({});
  const [user, setUser] = useState<any>(null);
  const isMobile = useIsMobile();

  // Check if user is super admin
  const { data: isSuperAdmin } = useQuery({
    queryKey: ["is-super-admin"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;
      
      const { data } = await supabase.rpc('is_super_admin', { 
        _user_id: user.id 
      });
      return data;
    },
    enabled: !!user,
  });

  const { data: syncFailures, refetch: refetchFailures } = useQuery({
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
  }, []);

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

      // Refresh sync failures
      setTimeout(() => {
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

  return <div className="w-full max-w-full px-4 py-6 md:container md:mx-auto md:px-6 space-y-6">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="font-extrabold text-2xl sm:text-3xl md:text-4xl truncate">LOGIC WMS</h1>
          
        </div>
        <div className="flex flex-wrap gap-2 items-center justify-end">
          <ProfileButton />
        </div>
      </div>

      {/* Desktop & Mobile: Navigationskort */}
      {!isMobile ? (
        <div className="max-w-2xl mx-auto">
          <div className="space-y-4">
            <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => navigate('/inventory')}>
              <CardHeader className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Package className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <CardTitle className="text-lg">Lagersaldo</CardTitle>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </CardHeader>
            </Card>

            <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => navigate('/articles')}>
              <CardHeader className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-secondary/10">
                    <List className="h-5 w-5 text-secondary" />
                  </div>
                  <div className="flex-1">
                    <CardTitle className="text-lg">Artiklar</CardTitle>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </CardHeader>
            </Card>

            <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => navigate('/sales')}>
              <CardHeader className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-accent/10">
                    <ShoppingCart className="h-5 w-5 text-accent" />
                  </div>
                  <div className="flex-1">
                    <CardTitle className="text-lg">Försäljning</CardTitle>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </CardHeader>
            </Card>

            <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => navigate('/delivery-notes')}>
              <CardHeader className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-500/10">
                    <ClipboardList className="h-5 w-5 text-blue-500" />
                  </div>
                  <div className="flex-1">
                    <CardTitle className="text-lg">Följesedlar</CardTitle>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </CardHeader>
            </Card>

            {isSuperAdmin && (
              <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => navigate('/admin-tools')}>
                <CardHeader className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-orange-500/10">
                      <Settings className="h-5 w-5 text-orange-500" />
                    </div>
                    <div className="flex-1">
                      <CardTitle className="text-lg">Admin-Verktyg</CardTitle>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </CardHeader>
              </Card>
            )}
          </div>
        </div>
      ) : (
        /* Mobil: Original 4-korts grid */
        <div className="grid gap-6 grid-cols-1">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => navigate('/scanner')}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-500/10">
                    <QrCode className="h-6 w-6 text-blue-500" />
                  </div>
                  <CardTitle className="text-xl">Scanna</CardTitle>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </div>
            </CardHeader>
          </Card>
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader onClick={() => navigate('/inventory')} className="cursor-pointer rounded-none">
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
          </Card>

          {isSuperAdmin && (
            <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => navigate('/admin-tools')}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-orange-500/10">
                      <Settings className="h-6 w-6 text-orange-500" />
                    </div>
                    <CardTitle className="text-xl">Admin-Verktyg</CardTitle>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </div>
              </CardHeader>
            </Card>
          )}
        </div>
      )}

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

    </div>;
};
export default Integrations;

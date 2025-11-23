import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, RefreshCw, List, Search, CheckCircle2, XCircle, Trash2 } from "lucide-react";
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

interface Article {
  id: string;
  name: string;
  barcode: string | null;
  fdt_sellus_article_id: string | null;
  fdt_sellus_item_numeric_id: string | null;
  category: string | null;
  fdt_sync_status: string;
  fdt_last_synced: string | null;
  has_inventory?: boolean;
}

const ArticlesPage = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [resolvingIds, setResolvingIds] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [articleToDelete, setArticleToDelete] = useState<Article | null>(null);

  useEffect(() => {
    checkSuperAdmin();
    fetchArticles();
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

  const fetchArticles = async () => {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .neq('fdt_sync_status', 'inactive')
        .order('name');

      if (error) throw error;

      // Check which articles have inventory
      const articlesWithInventory = await Promise.all(
        (data || []).map(async (article) => {
          const { count } = await supabase
            .from('inventory')
            .select('*', { count: 'exact', head: true })
            .eq('product_id', article.id);

          return {
            ...article,
            has_inventory: (count || 0) > 0,
          };
        })
      );

      setArticles(articlesWithInventory);
    } catch (error) {
      console.error('Error fetching articles:', error);
      toast({
        title: "Fel",
        description: "Kunde inte hämta artiklar",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('sync-products-from-sellus');

      if (error) throw error;

      const deleted = data?.deleted || 0;
      const inactivated = data?.inactivated || 0;

      toast({
        title: "Synkronisering slutförd",
        description: `Synkade ${data?.synced || 0} artiklar från varugrupp 1200- Elon${deleted + inactivated > 0 ? `, ${deleted} raderade, ${inactivated} inaktiverade` : ''}`,
      });

      await fetchArticles();
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

  const handleResolveAllIds = async () => {
    setResolvingIds(true);
    try {
      const { data, error } = await supabase.functions.invoke('batch-resolve-all-ids');

      if (error) throw error;

      const stats = data?.stats || {};

      toast({
        title: "ID-upplösning slutförd",
        description: `Löste ${stats.resolved || 0} av ${stats.total || 0} artiklar${stats.failed > 0 ? `, ${stats.failed} misslyckades` : ''}`,
      });

      await fetchArticles();
    } catch (error: any) {
      toast({
        title: "Fel vid ID-upplösning",
        description: error.message || "Okänt fel uppstod",
        variant: "destructive",
      });
    } finally {
      setResolvingIds(false);
    }
  };

  const handleDeleteClick = (article: Article) => {
    setArticleToDelete(article);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!articleToDelete) return;

    try {
      // Delete inventory records first
      const { error: inventoryError } = await supabase
        .from('inventory')
        .delete()
        .eq('product_id', articleToDelete.id);

      if (inventoryError) throw inventoryError;

      // Delete the product
      const { error: productError } = await supabase
        .from('products')
        .delete()
        .eq('id', articleToDelete.id);

      if (productError) throw productError;

      // Update local state immediately for better UX
      setArticles(prevArticles => prevArticles.filter(article => article.id !== articleToDelete.id));

      const articleNumber = articleToDelete.barcode || articleToDelete.fdt_sellus_article_id || articleToDelete.name;
      toast({
        title: "Raderad",
        description: `Artikel ${articleNumber} har raderats`,
      });

      // Refresh the list from server to ensure consistency
      await fetchArticles();
    } catch (error) {
      console.error('Error deleting article:', error);
      toast({
        title: "Fel",
        description: "Kunde inte radera artikel",
        variant: "destructive",
      });
    } finally {
      setDeleteDialogOpen(false);
      setArticleToDelete(null);
    }
  };

  const filteredArticles = articles.filter((article) => {
    const query = searchQuery.toLowerCase();
    const articleNumber = article.barcode || article.fdt_sellus_article_id || '';
    return (
      article.name.toLowerCase().includes(query) ||
      articleNumber.toLowerCase().includes(query) ||
      (article.category && article.category.toLowerCase().includes(query))
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
              <List className="h-8 w-8" />
              Artiklar
            </h1>
            <p className="text-muted-foreground">Artiklar från varugrupp 1200- Elon</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleResolveAllIds} disabled={resolvingIds} variant="secondary">
            <RefreshCw className={`h-4 w-4 mr-2 ${resolvingIds ? 'animate-spin' : ''}`} />
            {resolvingIds ? 'Löser IDs...' : 'Lös alla Numeric IDs'}
          </Button>
          <Button onClick={handleSync} disabled={syncing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Synkroniserar...' : 'Synka från Sellus'}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Artikelregister ({filteredArticles.length} artiklar)</span>
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
                <TableHead>Numeric ID</TableHead>
                <TableHead>Benämning</TableHead>
                <TableHead>Kategori</TableHead>
                <TableHead>I lager</TableHead>
                <TableHead>Synkstatus</TableHead>
                <TableHead>Senast synkad</TableHead>
                {isSuperAdmin && <TableHead className="w-[50px]"></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredArticles.map((article) => {
                const articleNumber = article.barcode || article.fdt_sellus_article_id || 'N/A';

                return (
                  <TableRow key={article.id}>
                    <TableCell className="font-mono">{articleNumber}</TableCell>
                    <TableCell className="font-mono text-sm">
                      {article.fdt_sellus_item_numeric_id ? (
                        <span className="text-success">{article.fdt_sellus_item_numeric_id}</span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">{article.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {article.category || '-'}
                    </TableCell>
                    <TableCell>
                      {article.has_inventory ? (
                        <CheckCircle2 className="h-4 w-4 text-success" />
                      ) : (
                        <XCircle className="h-4 w-4 text-muted-foreground" />
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={article.fdt_sync_status === 'synced' ? 'default' : 'secondary'}
                        className={article.fdt_sync_status === 'synced' ? 'bg-success text-success-foreground' : ''}
                      >
                        {article.fdt_sync_status === 'synced' ? 'Synkad' : 'Väntande'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {article.fdt_last_synced
                        ? new Date(article.fdt_last_synced).toLocaleString('sv-SE')
                        : '-'}
                    </TableCell>
                    {isSuperAdmin && (
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => handleDeleteClick(article)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Radera artikel?</AlertDialogTitle>
            <AlertDialogDescription>
              Är du säker på att du vill radera artikel{' '}
              <strong>{articleToDelete?.barcode || articleToDelete?.fdt_sellus_article_id || articleToDelete?.name}</strong>?
              Detta kommer permanent radera artikeln och alla dess lagerplatser.
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

export default ArticlesPage;

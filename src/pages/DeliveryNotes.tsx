import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Plus, Package, CheckCircle2, Clock, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
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

interface DeliveryNote {
  id: string;
  delivery_note_number: string;
  scanned_at: string;
  status: string;
  cargo_marking: string | null;
  total_items?: number;
  checked_items?: number;
}

export default function DeliveryNotes() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [deliveryNotes, setDeliveryNotes] = useState<DeliveryNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [noteToDelete, setNoteToDelete] = useState<DeliveryNote | null>(null);

  useEffect(() => {
    checkSuperAdmin();
    fetchDeliveryNotes();
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

  const fetchDeliveryNotes = async () => {
    try {
      const { data: notes, error } = await supabase
        .from('delivery_notes')
        .select(`
          id,
          delivery_note_number,
          scanned_at,
          status,
          cargo_marking
        `)
        .order('scanned_at', { ascending: false });

      if (error) throw error;

      // Fetch item counts for each delivery note
      const notesWithCounts = await Promise.all(
        (notes || []).map(async (note) => {
          const { data: items } = await supabase
            .from('delivery_note_items')
            .select('id, is_checked')
            .eq('delivery_note_id', note.id);

          const total_items = items?.length || 0;
          const checked_items = items?.filter(item => item.is_checked).length || 0;

          return {
            ...note,
            total_items,
            checked_items
          };
        })
      );

      setDeliveryNotes(notesWithCounts);
    } catch (error) {
      console.error('Error fetching delivery notes:', error);
      toast({
        title: "Fel",
        description: "Kunde inte hämta följesedlar",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClick = (e: React.MouseEvent, note: DeliveryNote) => {
    e.stopPropagation();
    setNoteToDelete(note);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!noteToDelete) return;

    try {
      // Delete delivery note items first (cascade should handle this, but being explicit)
      const { error: itemsError } = await supabase
        .from('delivery_note_items')
        .delete()
        .eq('delivery_note_id', noteToDelete.id);

      if (itemsError) throw itemsError;

      // Delete the delivery note
      const { error: noteError } = await supabase
        .from('delivery_notes')
        .delete()
        .eq('id', noteToDelete.id);

      if (noteError) throw noteError;

      toast({
        title: "Raderad",
        description: `Följesedel #${noteToDelete.delivery_note_number} har raderats`,
      });

      // Refresh the list
      fetchDeliveryNotes();
    } catch (error) {
      console.error('Error deleting delivery note:', error);
      toast({
        title: "Fel",
        description: "Kunde inte radera följesedel",
        variant: "destructive",
      });
    } finally {
      setDeleteDialogOpen(false);
      setNoteToDelete(null);
    }
  };

  const getStatusBadge = (note: DeliveryNote) => {
    if (note.status === 'completed') {
      return <Badge className="bg-green-500"><CheckCircle2 className="h-3 w-3 mr-1" />Klar</Badge>;
    }
    if (note.status === 'in_progress') {
      return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Pågående</Badge>;
    }
    return <Badge variant="outline"><Package className="h-3 w-3 mr-1" />Väntande</Badge>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 pb-20">
      <div className="max-w-4xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/')}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-2xl font-bold">Följesedlar</h1>
          </div>
          <Button onClick={() => navigate('/delivery-notes/scan')}>
            <Plus className="h-4 w-4 mr-2" />
            Ny följesedel
          </Button>
        </div>

        {/* Delivery Notes List */}
        {deliveryNotes.length === 0 ? (
          <Card className="p-8 text-center">
            <Package className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">Inga följesedlar än</p>
            <Button
              className="mt-4"
              onClick={() => navigate('/delivery-notes/scan')}
            >
              Skapa första följesedeln
            </Button>
          </Card>
        ) : (
          <div className="space-y-3">
            {deliveryNotes.map((note) => (
              <Card
                key={note.id}
                className="cursor-pointer hover:bg-accent transition-colors"
                onClick={() => navigate(`/delivery-notes/${note.id}`)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg font-mono">
                        #{note.delivery_note_number}
                      </CardTitle>
                      <p className="text-sm text-muted-foreground mt-1">
                        {format(new Date(note.scanned_at), 'yyyy-MM-dd HH:mm')}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {getStatusBadge(note)}
                      {isSuperAdmin && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={(e) => handleDeleteClick(e, note)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Artiklar:</span>
                    <span className="font-medium">
                      {note.checked_items}/{note.total_items} checkade
                    </span>
                  </div>
                  {note.cargo_marking && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Godsmärke:</span>
                      <span className="font-medium">{note.cargo_marking}</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Radera följesedel?</AlertDialogTitle>
            <AlertDialogDescription>
              Är du säker på att du vill radera följesedel #{noteToDelete?.delivery_note_number}?
              Detta kommer permanent radera följesedeln och alla dess artiklar.
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
}

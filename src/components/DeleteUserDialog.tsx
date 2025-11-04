import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

interface User {
  id: string;
  email: string;
  display_name: string;
  role: string;
  is_super_admin: boolean;
  branch_name: string | null;
  created_at: string;
}

interface DeleteUserDialogProps {
  user: User | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const DeleteUserDialog = ({ user, open, onOpenChange }: DeleteUserDialogProps) => {
  const queryClient = useQueryClient();

  const deleteUserMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("delete-user", {
        body: { userId: user?.id },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Användare borttagen!");
      queryClient.invalidateQueries({ queryKey: ["users-with-roles"] });
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast.error("Misslyckades att ta bort användare: " + error.message);
    },
  });

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Är du säker?</AlertDialogTitle>
          <AlertDialogDescription>
            Vill du verkligen ta bort användaren <strong>{user?.display_name}</strong>? 
            Denna åtgärd kan inte ångras.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Avbryt
          </Button>
          <Button
            variant="destructive"
            onClick={() => deleteUserMutation.mutate()}
            disabled={deleteUserMutation.isPending}
          >
            {deleteUserMutation.isPending ? "Tar bort..." : "Ta bort"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

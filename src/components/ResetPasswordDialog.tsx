import { useMutation } from "@tanstack/react-query";
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

interface ResetPasswordDialogProps {
  user: User | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ResetPasswordDialog = ({ user, open, onOpenChange }: ResetPasswordDialogProps) => {
  const resetPasswordMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("reset-user-password", {
        body: { email: user?.email },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Återställningslänk skickad till " + user?.email);
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast.error("Misslyckades att skicka återställningslänk: " + error.message);
    },
  });

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Återställ lösenord</AlertDialogTitle>
          <AlertDialogDescription>
            Vill du skicka en återställningslänk för lösenord till <strong>{user?.email}</strong>?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Avbryt
          </Button>
          <Button
            onClick={() => resetPasswordMutation.mutate()}
            disabled={resetPasswordMutation.isPending}
          >
            {resetPasswordMutation.isPending ? "Skickar..." : "Skicka återställningslänk"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

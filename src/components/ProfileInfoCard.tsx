import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Shield, User, LogOut, KeyRound } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ProfileInfoCardProps {
  firstName: string;
  lastName: string;
  email: string;
  branchName?: string | null;
  role: string;
  isSuperAdmin?: boolean;
}

export const ProfileInfoCard = ({
  firstName,
  lastName,
  email,
  branchName,
  role,
  isSuperAdmin,
}: ProfileInfoCardProps) => {
  const navigate = useNavigate();
  const displayName = `${firstName} ${lastName}`;
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword) {
      toast.error("Vänligen fyll i båda fälten");
      return;
    }

    if (newPassword.length < 6) {
      toast.error("Nytt lösenord måste vara minst 6 tecken");
      return;
    }

    setIsChangingPassword(true);
    try {
      // First verify current password by signing in
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password: currentPassword,
      });

      if (signInError) {
        toast.error("Felaktigt nuvarande lösenord");
        setIsChangingPassword(false);
        return;
      }

      // Update password
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) {
        toast.error("Misslyckades att ändra lösenord: " + updateError.message);
      } else {
        toast.success("Lösenordet har ändrats");
        setShowChangePassword(false);
        setCurrentPassword("");
        setNewPassword("");
      }
    } catch (error: any) {
      toast.error("Ett fel uppstod: " + error.message);
    } finally {
      setIsChangingPassword(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle>Min Profil</CardTitle>
            <CardDescription>Din kontoinformation</CardDescription>
          </div>
          <Button 
            variant="destructive" 
            size="sm"
            onClick={handleLogout}
            className="flex items-center gap-2"
          >
            <LogOut className="h-4 w-4" />
            Logga ut
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <h3 className="text-xl font-semibold">
              {displayName}
              {branchName && <span className="text-muted-foreground"> - {branchName}</span>}
            </h3>
            {role === "admin" && (
              <Badge variant="default" className="gap-1">
                <Shield className="h-3 w-3" />
                {isSuperAdmin ? "Super-Admin" : "Admin"}
              </Badge>
            )}
            {role === "user" && (
              <Badge variant="secondary" className="gap-1">
                <User className="h-3 w-4" />
                Användare
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">{email}</p>
        </div>

        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowChangePassword(!showChangePassword)}
            className="flex items-center gap-2"
          >
            <KeyRound className="h-4 w-4" />
            Ändra lösenord
          </Button>
        </div>

        {showChangePassword && (
          <div className="space-y-4 pt-4 border-t">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="currentPassword">Nuvarande lösenord</Label>
                <Input
                  id="currentPassword"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Ange nuvarande lösenord"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="newPassword">Nytt lösenord</Label>
                <Input
                  id="newPassword"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Ange nytt lösenord"
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => {
                  setShowChangePassword(false);
                  setCurrentPassword("");
                  setNewPassword("");
                }}
              >
                Avbryt
              </Button>
              <Button
                onClick={handleChangePassword}
                disabled={isChangingPassword}
              >
                {isChangingPassword ? "Ändrar..." : "Ändra lösenord"}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

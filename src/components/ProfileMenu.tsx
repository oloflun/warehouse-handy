import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { LogOut, Key, UserPlus } from "lucide-react";

interface CurrentUser {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: "user" | "admin";
}

export const ProfileMenu = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [inviteUserOpen, setInviteUserOpen] = useState(false);
  
  // Change password state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  
  // Invite user state
  const [inviteFirstName, setInviteFirstName] = useState("");
  const [inviteLastName, setInviteLastName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");

  // Fetch current user data
  const { data: currentUser, isLoading, error } = useQuery<CurrentUser>({
    queryKey: ["current-user-profile"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      
      console.log('Fetching profile for user:', user.id);
      
      // Fetch profile - use maybeSingle to avoid errors when no profile exists
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("first_name, last_name")
        .eq("id", user.id)
        .maybeSingle();
      
      if (profileError) {
        console.error('Profile fetch error:', profileError);
      }
      
      console.log('Profile data:', profile);
      
      // Fetch role - use maybeSingle to avoid errors when no role exists
      const { data: roleData, error: roleError } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();
      
      if (roleError) {
        console.error('Role fetch error:', roleError);
      }
      
      console.log('Role data:', roleData);
      
      return {
        id: user.id,
        email: user.email || "",
        first_name: profile?.first_name || "",
        last_name: profile?.last_name || "",
        role: roleData?.role || "user"
      };
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry: 3
  });

  // Log errors
  useEffect(() => {
    if (error) {
      console.error('Profile query error:', error);
    }
  }, [error]);

  // Invalidate query on auth state changes
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      queryClient.invalidateQueries({ queryKey: ["current-user-profile"] });
    });

    return () => subscription.unsubscribe();
  }, [queryClient]);

  // Change password mutation
  const changePasswordMutation = useMutation({
    mutationFn: async () => {
      if (newPassword !== confirmPassword) {
        throw new Error("Lösenorden matchar inte");
      }
      
      if (newPassword.length < 6) {
        throw new Error("Lösenordet måste vara minst 6 tecken");
      }

      // Verify current password
      if (!currentUser?.email) throw new Error("Email saknas");
      
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: currentUser.email,
        password: currentPassword
      });

      if (verifyError) {
        throw new Error("Felaktigt nuvarande lösenord");
      }

      // Update password
      const { error } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Lösenordet har ändrats");
      setChangePasswordOpen(false);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    }
  });

  // Invite user mutation
  const inviteUserMutation = useMutation({
    mutationFn: async () => {
      if (!inviteEmail || !inviteFirstName || !inviteLastName) {
        throw new Error("Alla fält måste fyllas i");
      }

      const { data, error } = await supabase.functions.invoke("invite-user", {
        body: {
          email: inviteEmail,
          firstName: inviteFirstName,
          lastName: inviteLastName,
          role: "user" // Hardcoded to "user" - admins cannot invite other admins
        }
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Användaren har bjudits in");
      setInviteUserOpen(false);
      setInviteFirstName("");
      setInviteLastName("");
      setInviteEmail("");
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    }
  });

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  const handleChangePassword = () => {
    changePasswordMutation.mutate();
  };

  const handleInviteUser = () => {
    inviteUserMutation.mutate();
  };

  if (isLoading) {
    return (
      <div className="h-10 w-10 rounded-full bg-muted animate-pulse" />
    );
  }

  if (!currentUser) {
    return null;
  }

  // Calculate initials with email fallback
  const getInitials = () => {
    // Try first_name + last_name
    if (currentUser.first_name && currentUser.last_name) {
      return `${currentUser.first_name[0]}${currentUser.last_name[0]}`.toUpperCase();
    }
    
    // Fallback to email
    if (currentUser.email) {
      const localPart = currentUser.email.split('@')[0];
      const tokens = localPart.split(/[._\-+\s]+/);
      
      if (tokens.length >= 2) {
        return `${tokens[0][0]}${tokens[1][0]}`.toUpperCase();
      }
      
      return localPart.substring(0, 2).toUpperCase();
    }
    
    // Final fallback
    return "U";
  };

  const initials = getInitials();

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button 
            variant="ghost" 
            className="relative z-40 h-10 w-10 rounded-full pointer-events-auto"
            aria-label="Användarmeny"
            title={`${currentUser.first_name || currentUser.email} - Öppna meny`}
          >
            <Avatar className="h-10 w-10">
              <AvatarFallback className="bg-primary text-primary-foreground font-semibold">
                {initials}
              </AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-64" align="end" forceMount>
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col space-y-1">
              <p className="text-sm font-medium leading-none flex items-center gap-2">
                {currentUser.first_name} {currentUser.last_name}
                {currentUser.role === "admin" && (
                  <Badge variant="secondary" className="text-xs">Admin</Badge>
                )}
              </p>
              <p className="text-xs leading-none text-muted-foreground">
                {currentUser.email}
              </p>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setChangePasswordOpen(true)}>
            <Key className="mr-2 h-4 w-4" />
            Ändra lösenord
          </DropdownMenuItem>
          {currentUser.role === "admin" && (
            <DropdownMenuItem onClick={() => setInviteUserOpen(true)}>
              <UserPlus className="mr-2 h-4 w-4" />
              Bjud in användare
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleLogout}>
            <LogOut className="mr-2 h-4 w-4" />
            Logga ut
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Change Password Dialog */}
      <Dialog open={changePasswordOpen} onOpenChange={setChangePasswordOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ändra lösenord</DialogTitle>
            <DialogDescription>
              Ange ditt nuvarande lösenord och välj ett nytt lösenord.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="current-password">Nuvarande lösenord</Label>
              <Input
                id="current-password"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Ange nuvarande lösenord"
              />
            </div>
            <div>
              <Label htmlFor="new-password">Nytt lösenord</Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Minst 6 tecken"
              />
            </div>
            <div>
              <Label htmlFor="confirm-password">Bekräfta nytt lösenord</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Ange lösenordet igen"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setChangePasswordOpen(false)}>
                Avbryt
              </Button>
              <Button 
                onClick={handleChangePassword}
                disabled={changePasswordMutation.isPending}
              >
                {changePasswordMutation.isPending ? "Sparar..." : "Spara"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Invite User Dialog */}
      <Dialog open={inviteUserOpen} onOpenChange={setInviteUserOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bjud in användare</DialogTitle>
            <DialogDescription>
              Bjud in en ny användare till systemet. Användaren får ett e-postmeddelande med instruktioner.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="invite-first-name">Förnamn</Label>
              <Input
                id="invite-first-name"
                value={inviteFirstName}
                onChange={(e) => setInviteFirstName(e.target.value)}
                placeholder="Ange förnamn"
              />
            </div>
            <div>
              <Label htmlFor="invite-last-name">Efternamn</Label>
              <Input
                id="invite-last-name"
                value={inviteLastName}
                onChange={(e) => setInviteLastName(e.target.value)}
                placeholder="Ange efternamn"
              />
            </div>
            <div>
              <Label htmlFor="invite-email">E-post</Label>
              <Input
                id="invite-email"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="anvandare@example.com"
              />
            </div>
            <div className="bg-muted p-3 rounded-md text-sm text-muted-foreground">
              Användaren kommer att bjudas in som <strong>vanlig användare</strong> (ej admin).
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setInviteUserOpen(false)}>
                Avbryt
              </Button>
              <Button 
                onClick={handleInviteUser}
                disabled={inviteUserMutation.isPending}
              >
                {inviteUserMutation.isPending ? "Bjuder in..." : "Bjud in"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

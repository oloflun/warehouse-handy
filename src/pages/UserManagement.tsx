import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { ProfileInfoCard } from "@/components/ProfileInfoCard";
import { UserManagementTable } from "@/components/UserManagementTable";
import { AddUserDialog } from "@/components/AddUserDialog";
import { EditUserDialog } from "@/components/EditUserDialog";
import { DeleteUserDialog } from "@/components/DeleteUserDialog";
import { ResetPasswordDialog } from "@/components/ResetPasswordDialog";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

interface User {
  id: string;
  email: string;
  display_name: string;
  role: string;
  is_super_admin: boolean;
  branch_name: string | null;
  created_at: string;
}

const USERS_PER_PAGE = 10;

const UserManagement = () => {
  const navigate = useNavigate();
  const [currentPage, setCurrentPage] = useState(1);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [deleteUser, setDeleteUser] = useState<User | null>(null);
  const [resetPasswordUser, setResetPasswordUser] = useState<User | null>(null);

  // Fetch current user with profile
  const { data: currentUserProfile } = useQuery({
    queryKey: ["current-user-profile"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      
      const { data: profile } = await supabase
        .from("profiles")
        .select(`
          *,
          branches(name)
        `)
        .eq("id", user.id)
        .single();
      
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role, is_super_admin")
        .eq("user_id", user.id)
        .single();
      
      return { 
        ...profile, 
        email: user.email,
        role: roleData?.role || "user",
        is_super_admin: roleData?.is_super_admin || false,
      };
    },
  });

  // Fetch all users (only if admin)
  const { data: users, isLoading } = useQuery({
    queryKey: ["users-with-roles"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("list-users");
      if (error) throw error;
      return data.users || [];
    },
    enabled: currentUserProfile?.role === "admin",
  });

  // Check admin permission
  if (!currentUserProfile || currentUserProfile.role !== "admin") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Åtkomst nekad</CardTitle>
            <CardDescription>
              Du har inte behörighet att visa denna sida.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate("/")} variant="outline">
              Tillbaka till startsidan
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Pagination logic
  const totalPages = Math.ceil((users?.length || 0) / USERS_PER_PAGE);
  const paginatedUsers = users?.slice(
    (currentPage - 1) * USERS_PER_PAGE,
    currentPage * USERS_PER_PAGE
  );

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/")}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold">Profil & Användarinställningar</h1>
              <p className="text-muted-foreground">Hantera din profil och användare</p>
            </div>
          </div>
        </div>

        {/* User Profile Card */}
        <ProfileInfoCard
          firstName={currentUserProfile.first_name}
          lastName={currentUserProfile.last_name}
          email={currentUserProfile.email || ""}
          branchName={currentUserProfile.branches?.name}
          role={currentUserProfile.role}
          isSuperAdmin={currentUserProfile.is_super_admin}
        />

        {/* User Management Section (Admin only) */}
        {currentUserProfile.role === "admin" && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Användarhantering</CardTitle>
                  <CardDescription>
                    Hantera alla användare i systemet
                  </CardDescription>
                </div>
                <AddUserDialog />
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center p-8">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              ) : (
                <>
                  <UserManagementTable
                    users={paginatedUsers || []}
                    currentUserId={currentUserProfile.id}
                    isSuperAdmin={currentUserProfile.is_super_admin}
                    onEdit={setEditUser}
                    onDelete={setDeleteUser}
                    onResetPassword={setResetPasswordUser}
                  />

                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div className="mt-4">
                      <Pagination>
                        <PaginationContent>
                          <PaginationItem>
                            <PaginationPrevious 
                              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                              className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                            />
                          </PaginationItem>
                          {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                            <PaginationItem key={page}>
                              <PaginationLink
                                onClick={() => setCurrentPage(page)}
                                isActive={currentPage === page}
                                className="cursor-pointer"
                              >
                                {page}
                              </PaginationLink>
                            </PaginationItem>
                          ))}
                          <PaginationItem>
                            <PaginationNext 
                              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                              className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                            />
                          </PaginationItem>
                        </PaginationContent>
                      </Pagination>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Dialogs */}
      <EditUserDialog 
        user={editUser} 
        open={!!editUser} 
        onOpenChange={(open) => !open && setEditUser(null)} 
      />
      <DeleteUserDialog 
        user={deleteUser} 
        open={!!deleteUser} 
        onOpenChange={(open) => !open && setDeleteUser(null)} 
      />
      <ResetPasswordDialog 
        user={resetPasswordUser} 
        open={!!resetPasswordUser} 
        onOpenChange={(open) => !open && setResetPasswordUser(null)} 
      />
    </div>
  );
};

export default UserManagement;

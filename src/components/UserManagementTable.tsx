import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Shield, User, MoreHorizontal, Trash2, Edit, KeyRound, Lock, LockOpen, Clock } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface User {
  id: string;
  email: string;
  display_name: string;
  role: string;
  is_super_admin: boolean;
  is_limited?: boolean;
  branch_name: string | null;
  created_at: string;
  email_confirmed_at: string | null;
  is_pending?: boolean;
}

interface UserManagementTableProps {
  users: User[];
  currentUserId: string;
  isSuperAdmin: boolean;
  onEdit: (user: User) => void;
  onDelete: (user: User) => void;
  onResetPassword: (user: User) => void;
  onToggleLimited: (user: User) => void;
}

export const UserManagementTable = ({
  users,
  currentUserId,
  isSuperAdmin,
  onEdit,
  onDelete,
  onResetPassword,
  onToggleLimited,
}: UserManagementTableProps) => {
  const canModifyUser = (user: User) => {
    // Can't modify yourself
    if (user.id === currentUserId) return false;
    // Super admin can modify anyone
    if (isSuperAdmin) return true;
    // Regular admins can't modify super admins
    if (user.is_super_admin) return false;
    return true;
  };

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Namn</TableHead>
            <TableHead>E-post</TableHead>
            <TableHead>Roll</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Butik</TableHead>
            <TableHead>Skapad</TableHead>
            <TableHead className="w-[50px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => (
            <TableRow key={user.id}>
              <TableCell className="font-medium">
                <div className="flex items-center gap-2">
                  <span>
                    {user.display_name}
                    {user.branch_name && (
                      <span className="text-muted-foreground font-normal"> - {user.branch_name}</span>
                    )}
                  </span>
                  {user.role === "admin" && (
                    <Badge variant="default" className="gap-1">
                      <Shield className="h-3 w-3" />
                      Admin
                    </Badge>
                  )}
                  {user.is_pending && (
                    <Badge variant="outline" className="gap-1 bg-yellow-50 text-yellow-700 border-yellow-300">
                      <Clock className="h-3 w-3" />
                      Väntande
                    </Badge>
                  )}
                  {user.is_limited && (
                    <Badge variant="outline" className="gap-1 bg-gray-50 text-gray-700 border-gray-300">
                      <Lock className="h-3 w-3" />
                      Begränsad
                    </Badge>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {user.email}
              </TableCell>
              <TableCell>
                {user.role === "admin" ? (
                  <span className="text-sm">Admin</span>
                ) : (
                  <span className="text-sm">Användare</span>
                )}
              </TableCell>
              <TableCell>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      {user.is_pending ? (
                        <Badge variant="outline" className="gap-1 text-yellow-600 border-yellow-600 cursor-help">
                          Väntande
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="gap-1 text-green-600 border-green-600 cursor-help">
                          Aktiv
                        </Badge>
                      )}
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>
                        {user.is_pending 
                          ? "Användaren har blivit inbjuden men har inte aktiverat sitt konto ännu"
                          : "Användaren har aktiverat sitt konto och kan logga in"}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </TableCell>
              <TableCell className="text-sm">
                {user.branch_name || "-"}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {new Date(user.created_at).toLocaleDateString("sv-SE")}
              </TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onResetPassword(user)}>
                      <KeyRound className="mr-2 h-4 w-4" />
                      Återställ lösenord
                    </DropdownMenuItem>
                    {canModifyUser(user) && (
                      <>
                        <DropdownMenuItem onClick={() => onEdit(user)}>
                          <Edit className="mr-2 h-4 w-4" />
                          Ändra roll
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onToggleLimited(user)}>
                          {user.is_limited ? (
                            <>
                              <LockOpen className="mr-2 h-4 w-4" />
                              Ge full åtkomst
                            </>
                          ) : (
                            <>
                              <Lock className="mr-2 h-4 w-4" />
                              Begränsa användare
                            </>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={() => onDelete(user)}
                          className="text-destructive"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Ta bort
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

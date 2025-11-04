import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Shield, User } from "lucide-react";

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
  const displayName = `${firstName} ${lastName}${role === 'admin' ? ' - Admin' : ''}`;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Min Profil</CardTitle>
        <CardDescription>Din kontoinformation</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <h3 className="text-xl font-semibold">{displayName}</h3>
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
          {branchName && (
            <p className="text-sm font-medium">{branchName}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

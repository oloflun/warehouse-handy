import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate, useLocation } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";

export const ProfileButton = () => {
  const navigate = useNavigate();
  const location = useLocation();

  // Hide button on user-management and auth pages
  if (location.pathname === "/user-management" || location.pathname === "/auth") {
    return null;
  }

  const { data: user, isLoading } = useQuery({
    queryKey: ["profile-button-user"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      
      const { data: profile } = await supabase
        .from("profiles")
        .select("first_name, last_name")
        .eq("id", user.id)
        .single();
      
      return { ...user, profile };
    },
  });

  if (isLoading) {
    return <Skeleton className="h-10 w-10 rounded-full" />;
  }

  if (!user) return null;

  // Get initials from profile
  const initials = user.profile
    ? `${user.profile.first_name?.[0] || ''}${user.profile.last_name?.[0] || ''}`.toUpperCase()
    : user.email?.[0]?.toUpperCase() || '?';

  return (
    <button
      type="button"
      onClick={() => navigate("/user-management")}
      className="h-10 w-10 rounded-full bg-primary text-primary-foreground font-semibold shadow-md ring-2 ring-background hover:opacity-90 focus:outline-none focus-visible:ring-4 focus-visible:ring-ring transition-opacity flex items-center justify-center"
      aria-label="Öppna användarhantering"
      title="Öppna användarhantering"
    >
      {initials}
    </button>
  );
};

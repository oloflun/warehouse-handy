import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";

export const ProfileButtonTopRight = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  const { data: currentUser, isLoading } = useQuery({
    queryKey: ["fab-user"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data: profile } = await supabase
        .from("profiles")
        .select("first_name, last_name")
        .eq("id", user.id)
        .maybeSingle();
      return {
        email: user.email || "",
        first_name: profile?.first_name || "",
        last_name: profile?.last_name || "",
      };
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      queryClient.invalidateQueries({ queryKey: ["fab-user"] });
    });
    return () => subscription.unsubscribe();
  }, [queryClient]);

  if (location.pathname === "/auth" || !currentUser) return null;

  const getInitials = () => {
    const fn = currentUser.first_name?.trim() || "";
    const ln = currentUser.last_name?.trim() || "";
    if (fn && ln) return `${fn[0]}${ln[0]}`.toUpperCase();
    const local = (currentUser.email || "").split("@")[0] || "";
    if (!local) return "U";
    const tokens = local.split(/[._\-+\s]+/).filter(Boolean);
    if (tokens.length >= 2) return `${tokens[0][0]}${tokens[1][0]}`.toUpperCase();
    return local.substring(0, 2).toUpperCase();
  };

  const initials = getInitials();

  if (isLoading) {
    return (
      <div 
        className="fixed top-2 right-2 md:top-4 md:right-4 z-[9999]"
        style={{ position: 'fixed', zIndex: 9999, pointerEvents: 'auto' }}
      >
        <Skeleton className="h-11 w-11 rounded-full" />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => navigate("/user-management")}
      className="fixed top-2 right-2 md:top-4 md:right-4 z-[9999] h-11 w-11 rounded-full bg-primary text-primary-foreground font-semibold shadow-lg ring-2 ring-background hover:opacity-90 focus:outline-none focus-visible:ring-4 focus-visible:ring-ring pointer-events-auto transition-opacity"
      style={{ position: 'fixed', zIndex: 9999, pointerEvents: 'auto' }}
      aria-label="Öppna användarhantering"
      title="Öppna användarhantering"
    >
      {initials}
    </button>
  );
};

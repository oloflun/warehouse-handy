import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Package } from "lucide-react";

const Auth = () => {
  const navigate = useNavigate();
  const [isLogin, setIsLogin] = useState(true);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Check for password recovery hash in URL
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const type = hashParams.get('type');
    const isRecoveryMode = type === 'recovery';
    
    if (isRecoveryMode) {
      setIsResettingPassword(true);
      setIsForgotPassword(false);
      setIsLogin(false);
      // Clean up URL hash
      window.history.replaceState(null, '', window.location.pathname);
    }

    // Set up auth state listener first
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && !isRecoveryMode) {
        navigate("/");
      }
    });

    // Then check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session && !isRecoveryMode) {
        navigate("/");
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (newPassword !== confirmPassword) {
      toast.error("Lösenorden matchar inte");
      return;
    }

    if (newPassword.length < 6) {
      toast.error("Lösenordet måste vara minst 6 tecken");
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({ 
        password: newPassword 
      });
      
      if (error) {
        console.error("Password reset error:", error);
        
        // Check if it's a token expiration or invalid token error
        if (error.message.includes("Invalid") || error.message.includes("expired")) {
          toast.error("Återställningslänken har gått ut. Begär en ny länk.");
          setIsResettingPassword(false);
          setIsForgotPassword(true);
          return;
        }
        
        throw error;
      }
      
      toast.success("Lösenord uppdaterat! Du är nu inloggad.");
      navigate("/");
    } catch (error: any) {
      toast.error(error.message || "Ett fel uppstod vid återställning");
    } finally {
      setLoading(false);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isForgotPassword) {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth`,
        });
        if (error) throw error;
        toast.success("Återställningslänk skickad till din e-post!");
        setIsForgotPassword(false);
      } else if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        toast.success("Inloggad!");
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/`,
          },
        });
        if (error) throw error;
        toast.success("Konto skapat! Du är nu inloggad.");
      }
    } catch (error: any) {
      toast.error(error.message || "Ett fel uppstod");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 flex flex-col items-center">
          <div className="w-16 h-16 bg-primary rounded-xl flex items-center justify-center mb-2">
            <Package className="w-10 h-10 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl font-bold">WMS</CardTitle>
          <CardDescription>
            {isResettingPassword
              ? "Ställ in ditt nya lösenord"
              : isForgotPassword 
                ? "Återställ ditt lösenord" 
                : isLogin 
                  ? "Logga in på ditt konto" 
                  : "Skapa ett nytt konto"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isResettingPassword ? (
            <form onSubmit={handlePasswordReset} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="newPassword">Nytt lösenord</Label>
                <Input
                  id="newPassword"
                  type="password"
                  placeholder="••••••••"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Bekräfta lösenord</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Sparar..." : "Spara nytt lösenord"}
              </Button>
            </form>
          ) : (
            <>
              <form onSubmit={handleAuth} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">E-post</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="din@email.se"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                {!isForgotPassword && (
                  <div className="space-y-2">
                    <Label htmlFor="password">Lösenord</Label>
                    <Input
                      id="password"
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                  </div>
                )}
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading 
                    ? "Laddar..." 
                    : isForgotPassword 
                      ? "Skicka återställningslänk" 
                      : isLogin 
                        ? "Logga in" 
                        : "Skapa konto"}
                </Button>
              </form>
              <div className="mt-4 text-center text-sm space-y-2">
                {!isForgotPassword && (
                  <button
                    type="button"
                    onClick={() => setIsLogin(!isLogin)}
                    className="text-primary hover:underline block w-full"
                  >
                    {isLogin ? "Inget konto? Skapa ett här" : "Har redan ett konto? Logga in"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setIsForgotPassword(!isForgotPassword);
                    setIsLogin(true);
                  }}
                  className="text-primary hover:underline block w-full"
                >
                  {isForgotPassword ? "Tillbaka till inloggning" : "Glömt lösenord?"}
                </button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;

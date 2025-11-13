import { useNavigate } from "react-router-dom";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ChevronRight, Activity, Sparkles, Code } from "lucide-react";
import { ProfileButton } from "@/components/ProfileButton";

const AdminTools = () => {
  const navigate = useNavigate();

  return (
    <div className="w-full max-w-full px-4 py-6 md:container md:mx-auto md:px-6 space-y-6">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/')}
            className="shrink-0"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="font-extrabold text-2xl sm:text-3xl md:text-4xl truncate">
            Admin-Verktyg
          </h1>
        </div>
        <ProfileButton />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Synkroniseringslogg Card */}
        <Card 
          className="hover:shadow-lg transition-shadow cursor-pointer"
          onClick={() => navigate('/sync-log')}
        >
          <CardHeader className="p-6">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-lg bg-blue-500/10">
                <Activity className="h-6 w-6 text-blue-500" />
              </div>
              <div className="flex-1">
                <CardTitle className="text-lg">Synkroniseringslogg</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Visa synkroniseringshistorik och status
                </p>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </div>
          </CardHeader>
        </Card>

        {/* API Explorer Card */}
        <Card 
          className="hover:shadow-lg transition-shadow cursor-pointer"
          onClick={() => navigate('/fdt-explorer')}
        >
          <CardHeader className="p-6">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-lg bg-green-500/10">
                <Code className="h-6 w-6 text-green-500" />
              </div>
              <div className="flex-1">
                <CardTitle className="text-lg">API Explorer</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Testa och utforska FDT Sellus API
                </p>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </div>
          </CardHeader>
        </Card>

        {/* Gemini Diagnostik Card */}
        <Card 
          className="hover:shadow-lg transition-shadow cursor-pointer"
          onClick={() => navigate('/gemini-diagnostics')}
        >
          <CardHeader className="p-6">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-lg bg-purple-500/10">
                <Sparkles className="h-6 w-6 text-purple-500" />
              </div>
              <div className="flex-1">
                <CardTitle className="text-lg">Gemini Diagnostik</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Testa Gemini API-konfiguration
                </p>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </div>
          </CardHeader>
        </Card>
      </div>
    </div>
  );
};

export default AdminTools;

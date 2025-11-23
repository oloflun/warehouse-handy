import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, RefreshCw, CheckCircle, XCircle, AlertTriangle, Info, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface DiagnosticResult {
  diagnostics: {
    timestamp: string;
    environment: {
      GEMINI_API_KEY: {
        configured: boolean;
        length?: number;
        prefix?: string;
        startsWithAIza?: boolean;
        error?: string;
      };
    };
    tests: {
      apiKeyValidation?: {
        success: boolean;
        status?: number;
        error?: string;
        message?: string;
        note?: string;
      };
      visionAPI?: {
        success: boolean;
        status?: number;
        statusText?: string;
        response?: string;
        finishReason?: string;
        error?: string;
        message?: string;
        note?: string;
        rawResponse?: any;
      };
      jsonFormatTest?: {
        success: boolean;
        note?: string;
        parsed?: any;
        rawResponse?: string;
        error?: string;
      };
    };
  };
  recommendations: string[];
  elapsed: string;
  status: string;
}

const GeminiDiagnostics = () => {
  const navigate = useNavigate();
  const [diagnosticResult, setDiagnosticResult] = useState<DiagnosticResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [autoChecked, setAutoChecked] = useState(false);

  // Check auth and auto-check on mount
  useEffect(() => {
    const checkAuthAndRun = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Du måste vara inloggad för att köra diagnostik");
        navigate("/auth");
        return;
      }

      if (!autoChecked) {
        runDiagnostics();
        setAutoChecked(true);
      }
    };

    checkAuthAndRun();
  }, [autoChecked, navigate]);

  const runDiagnostics = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('diagnose-gemini');

      if (error) {
        toast.error(`Diagnostics failed: ${error.message}`);
        return;
      }

      setDiagnosticResult(data);

      // Show summary toast
      const apiConfigured = data.diagnostics.environment.GEMINI_API_KEY.configured;
      const apiWorks = data.diagnostics.tests.visionAPI?.success;

      if (apiConfigured && apiWorks) {
        toast.success('✅ Gemini API is working correctly!');
      } else if (!apiConfigured) {
        toast.error('❌ GEMINI_API_KEY is not configured');
      } else {
        toast.warning('⚠️ API key is configured but API calls are failing');
      }

    } catch (err) {
      console.error('Diagnostics error:', err);
      toast.error('Failed to run diagnostics');
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusIcon = (success: boolean | undefined) => {
    if (success === undefined) return <Loader2 className="h-5 w-5 animate-spin" />;
    return success
      ? <CheckCircle className="h-5 w-5 text-green-500" />
      : <XCircle className="h-5 w-5 text-red-500" />;
  };

  const getStatusBadge = (success: boolean | undefined) => {
    if (success === undefined) return <Badge variant="outline">Unknown</Badge>;
    return success
      ? <Badge variant="default" className="bg-green-500">Working</Badge>
      : <Badge variant="destructive">Failed</Badge>;
  };

  return (
    <div className="container max-w-5xl py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/')}
            className="mb-2"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Tillbaka
          </Button>
          <h1 className="text-3xl font-bold">Gemini API Diagnostik</h1>
          <p className="text-muted-foreground">
            Verifiera att Gemini API är korrekt konfigurerad för bildanalys
          </p>
        </div>
        <Button
          onClick={runDiagnostics}
          disabled={isLoading}
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Testar...
            </>
          ) : (
            <>
              <RefreshCw className="h-4 w-4 mr-2" />
              Kör test igen
            </>
          )}
        </Button>
      </div>

      {/* Loading State */}
      {isLoading && !diagnosticResult && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
              <p className="text-lg font-medium">Kör diagnostik...</p>
              <p className="text-sm text-muted-foreground">
                Testar Gemini API-anslutning
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {diagnosticResult && (
        <>
          {/* Overall Status Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {getStatusIcon(diagnosticResult.diagnostics.tests.visionAPI?.success)}
                Status Översikt
              </CardTitle>
              <CardDescription>
                Kördes {new Date(diagnosticResult.diagnostics.timestamp).toLocaleString('sv-SE')}
                {' '}({diagnosticResult.elapsed})
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* API Key Configuration */}
              <div className="flex items-start justify-between p-4 border rounded-lg">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">GEMINI_API_KEY</h3>
                    {getStatusBadge(diagnosticResult.diagnostics.environment.GEMINI_API_KEY.configured)}
                  </div>
                  {diagnosticResult.diagnostics.environment.GEMINI_API_KEY.configured ? (
                    <div className="text-sm text-muted-foreground space-y-1">
                      <p>Längd: {diagnosticResult.diagnostics.environment.GEMINI_API_KEY.length} tecken</p>
                      <p>Prefix: {diagnosticResult.diagnostics.environment.GEMINI_API_KEY.prefix}</p>
                      <p>
                        Format: {diagnosticResult.diagnostics.environment.GEMINI_API_KEY.startsWithAIza
                          ? '✅ Korrekt (börjar med AIza)'
                          : '⚠️ Ovanligt format'}
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-red-500 font-medium">
                      {diagnosticResult.diagnostics.environment.GEMINI_API_KEY.error}
                    </p>
                  )}
                </div>
              </div>

              {/* API Test Results */}
              {diagnosticResult.diagnostics.tests.apiKeyValidation && (
                <div className="flex items-start justify-between p-4 border rounded-lg">
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">API-nyckel Validering</h3>
                      {getStatusBadge(diagnosticResult.diagnostics.tests.apiKeyValidation.success)}
                    </div>
                    {diagnosticResult.diagnostics.tests.apiKeyValidation.success ? (
                      <p className="text-sm text-green-600 font-medium">
                        {diagnosticResult.diagnostics.tests.apiKeyValidation.note}
                      </p>
                    ) : (
                      <div className="space-y-1 text-sm">
                        <p className="text-red-600 font-medium">
                          {diagnosticResult.diagnostics.tests.apiKeyValidation.message ||
                            diagnosticResult.diagnostics.tests.apiKeyValidation.error}
                        </p>
                        {diagnosticResult.diagnostics.tests.apiKeyValidation.status && (
                          <p className="text-muted-foreground">
                            HTTP Status: {diagnosticResult.diagnostics.tests.apiKeyValidation.status}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {diagnosticResult.diagnostics.tests.visionAPI && (
                <div className="flex items-start justify-between p-4 border rounded-lg">
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">Gemini Vision API Test</h3>
                      {getStatusBadge(diagnosticResult.diagnostics.tests.visionAPI.success)}
                    </div>

                    {diagnosticResult.diagnostics.tests.visionAPI.success ? (
                      <div className="space-y-1 text-sm">
                        <p className="text-green-600 font-medium">
                          {diagnosticResult.diagnostics.tests.visionAPI.note}
                        </p>
                        {diagnosticResult.diagnostics.tests.visionAPI.response && (
                          <div className="mt-2 p-2 bg-muted rounded">
                            <p className="font-medium text-xs mb-1">API-svar:</p>
                            <p className="text-xs">{diagnosticResult.diagnostics.tests.visionAPI.response}</p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-1 text-sm">
                        <p className="text-red-600 font-medium">
                          {diagnosticResult.diagnostics.tests.visionAPI.message ||
                            diagnosticResult.diagnostics.tests.visionAPI.error}
                        </p>
                        {diagnosticResult.diagnostics.tests.visionAPI.status && (
                          <p className="text-muted-foreground">
                            HTTP Status: {diagnosticResult.diagnostics.tests.visionAPI.status}
                            {' '}
                            {diagnosticResult.diagnostics.tests.visionAPI.statusText}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {diagnosticResult.diagnostics.tests.jsonFormatTest && (
                <div className="flex items-start justify-between p-4 border rounded-lg">
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">JSON Format Test</h3>
                      {getStatusBadge(diagnosticResult.diagnostics.tests.jsonFormatTest.success)}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {diagnosticResult.diagnostics.tests.jsonFormatTest.note}
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recommendations */}
          {diagnosticResult.recommendations && diagnosticResult.recommendations.length > 0 && (
            <Alert variant={
              diagnosticResult.recommendations[0].startsWith('✅') ? 'default' :
                diagnosticResult.recommendations[0].startsWith('❌') ? 'destructive' :
                  'default'
            }>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Rekommendationer</AlertTitle>
              <AlertDescription>
                <ul className="list-disc list-inside space-y-1 mt-2">
                  {diagnosticResult.recommendations.map((rec, idx) => (
                    <li key={idx} className="text-sm">{rec}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {/* Setup Instructions (if API key not configured) */}
          {!diagnosticResult.diagnostics.environment.GEMINI_API_KEY.configured && (
            <Card>
              <CardHeader>
                <CardTitle>Konfigurera Gemini API</CardTitle>
                <CardDescription>
                  Följ dessa steg för att aktivera bildanalys-funktionerna
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <h4 className="font-semibold flex items-center gap-2">
                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-sm">1</span>
                    Skaffa API-nyckel
                  </h4>
                  <p className="text-sm text-muted-foreground ml-8">
                    Gå till{' '}
                    <a
                      href="https://aistudio.google.com/app/apikey"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary underline"
                    >
                      Google AI Studio
                    </a>
                    {' '}och skapa en gratis API-nyckel
                  </p>
                </div>

                <div className="space-y-2">
                  <h4 className="font-semibold flex items-center gap-2">
                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-sm">2</span>
                    Lägg till i Supabase
                  </h4>
                  <p className="text-sm text-muted-foreground ml-8">
                    Öppna Supabase Dashboard → Settings → Edge Functions → Environment Variables
                  </p>
                  <div className="ml-8 p-3 bg-muted rounded-md text-sm font-mono">
                    <div>Variable name: <strong>GEMINI_API_KEY</strong></div>
                    <div>Value: <em>[din API-nyckel här]</em></div>
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="font-semibold flex items-center gap-2">
                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-sm">3</span>
                    Vänta och testa
                  </h4>
                  <p className="text-sm text-muted-foreground ml-8">
                    Vänta 2-5 minuter efter att du lagt till nyckeln, sedan klicka på "Kör test igen" här.
                  </p>
                </div>

                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertTitle>Gratis API</AlertTitle>
                  <AlertDescription>
                    Google Gemini API är gratis upp till 15 förfrågningar per minut och 1 500 förfrågningar per dag.
                    Detta är mer än tillräckligt för normalt lageranvändning.
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
};

export default GeminiDiagnostics;

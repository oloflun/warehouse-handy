import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, RefreshCw, CheckCircle, XCircle, AlertTriangle, Info, Loader2, Brain } from "lucide-react";
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
      OPENAI_API_KEY: {
        configured: boolean;
        length?: number;
        prefix?: string;
        startsWithSk?: boolean;
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
        availableVisionModels?: string[];
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
        model?: string;
        usage?: any;
        warning?: string;
        errorDetails?: any;
      };
      jsonFormatTest?: {
        success: boolean;
        note?: string;
        parsed?: any;
        rawResponse?: string;
        error?: string;
        message?: string;
        warning?: string;
      };
    };
  };
  recommendations: string[];
  elapsed: string;
  status: string;
}

const OpenAIDiagnostics = () => {
  const navigate = useNavigate();
  const [diagnosticResult, setDiagnosticResult] = useState<DiagnosticResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [autoChecked, setAutoChecked] = useState(false);

  // Auto-check on mount
  useEffect(() => {
    if (!autoChecked) {
      runDiagnostics();
      setAutoChecked(true);
    }
  }, [autoChecked]);

  const runDiagnostics = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('diagnose-openai');
      
      if (error) {
        toast.error(`Diagnostics failed: ${error.message}`);
        return;
      }

      setDiagnosticResult(data);
      
      // Show summary toast
      const apiConfigured = data.diagnostics.environment.OPENAI_API_KEY.configured;
      const apiWorks = data.diagnostics.tests.visionAPI?.success;
      
      if (apiConfigured && apiWorks) {
        toast.success('✅ OpenAI API is working correctly!');
      } else if (!apiConfigured) {
        toast.error('❌ OPENAI_API_KEY is not configured');
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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'healthy':
        return <Badge className="bg-green-500"><CheckCircle className="w-3 h-3 mr-1" />Healthy</Badge>;
      case 'degraded':
        return <Badge className="bg-yellow-500"><AlertTriangle className="w-3 h-3 mr-1" />Degraded</Badge>;
      case 'error':
        return <Badge className="bg-red-500"><XCircle className="w-3 h-3 mr-1" />Error</Badge>;
      case 'not_configured':
        return <Badge className="bg-gray-500"><Info className="w-3 h-3 mr-1" />Not Configured</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  const getTestStatusIcon = (success?: boolean) => {
    if (success === undefined) return <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />;
    return success 
      ? <CheckCircle className="w-4 h-4 text-green-500" />
      : <XCircle className="w-4 h-4 text-red-500" />;
  };

  return (
    <div className="container mx-auto p-4 max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/admin-tools')}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Brain className="w-6 h-6 text-orange-500" />
              OpenAI Diagnostik
            </h1>
            <p className="text-sm text-muted-foreground">
              Testa OpenAI API-konfiguration och vision-kapacitet
            </p>
          </div>
        </div>
        <Button
          onClick={runDiagnostics}
          disabled={isLoading}
          variant="outline"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Testar...
            </>
          ) : (
            <>
              <RefreshCw className="w-4 h-4 mr-2" />
              Kör test igen
            </>
          )}
        </Button>
      </div>

      {isLoading && !diagnosticResult && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-center p-8">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <span className="ml-3 text-muted-foreground">Kör diagnostik...</span>
            </div>
          </CardContent>
        </Card>
      )}

      {diagnosticResult && (
        <>
          {/* Overall Status */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Status</CardTitle>
                {getStatusBadge(diagnosticResult.status)}
              </div>
              <CardDescription>
                Test genomfört: {new Date(diagnosticResult.diagnostics.timestamp).toLocaleString('sv-SE')}
                {' • '}
                Tid: {diagnosticResult.elapsed}
              </CardDescription>
            </CardHeader>
          </Card>

          {/* Environment Variables */}
          <Card>
            <CardHeader>
              <CardTitle>Miljövariabler</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <div className="flex items-center gap-2">
                  {getTestStatusIcon(diagnosticResult.diagnostics.environment.OPENAI_API_KEY.configured)}
                  <span className="font-mono text-sm">OPENAI_API_KEY</span>
                </div>
                <div className="text-sm text-muted-foreground">
                  {diagnosticResult.diagnostics.environment.OPENAI_API_KEY.configured ? (
                    <>
                      <Badge variant="outline" className="mr-2">
                        {diagnosticResult.diagnostics.environment.OPENAI_API_KEY.prefix}...
                      </Badge>
                      <span>({diagnosticResult.diagnostics.environment.OPENAI_API_KEY.length} tecken)</span>
                      {diagnosticResult.diagnostics.environment.OPENAI_API_KEY.startsWithSk && (
                        <CheckCircle className="w-3 h-3 inline ml-1 text-green-500" />
                      )}
                    </>
                  ) : (
                    <Badge variant="destructive">Ej konfigurerad</Badge>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* API Tests */}
          <Card>
            <CardHeader>
              <CardTitle>API-tester</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* API Key Validation */}
              {diagnosticResult.diagnostics.tests.apiKeyValidation && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    {getTestStatusIcon(diagnosticResult.diagnostics.tests.apiKeyValidation.success)}
                    <h3 className="font-semibold">API-nyckel validering</h3>
                  </div>
                  <p className="text-sm text-muted-foreground ml-6">
                    {diagnosticResult.diagnostics.tests.apiKeyValidation.message}
                  </p>
                  {diagnosticResult.diagnostics.tests.apiKeyValidation.availableVisionModels && (
                    <div className="ml-6 mt-2">
                      <p className="text-xs text-muted-foreground mb-1">Tillgängliga vision-modeller:</p>
                      <div className="flex flex-wrap gap-1">
                        {diagnosticResult.diagnostics.tests.apiKeyValidation.availableVisionModels.map((model) => (
                          <Badge key={model} variant="secondary" className="text-xs">
                            {model}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {diagnosticResult.diagnostics.tests.apiKeyValidation.error && (
                    <Alert variant="destructive" className="ml-6 mt-2">
                      <AlertDescription className="text-xs">
                        {diagnosticResult.diagnostics.tests.apiKeyValidation.error}
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              )}

              {/* Vision API Test */}
              {diagnosticResult.diagnostics.tests.visionAPI && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    {getTestStatusIcon(diagnosticResult.diagnostics.tests.visionAPI.success)}
                    <h3 className="font-semibold">Vision API test</h3>
                  </div>
                  <p className="text-sm text-muted-foreground ml-6">
                    {diagnosticResult.diagnostics.tests.visionAPI.message}
                  </p>
                  {diagnosticResult.diagnostics.tests.visionAPI.model && (
                    <p className="text-xs text-muted-foreground ml-6">
                      Modell: {diagnosticResult.diagnostics.tests.visionAPI.model}
                    </p>
                  )}
                  {diagnosticResult.diagnostics.tests.visionAPI.usage && (
                    <p className="text-xs text-muted-foreground ml-6">
                      Användning: {diagnosticResult.diagnostics.tests.visionAPI.usage.total_tokens} tokens
                    </p>
                  )}
                  {diagnosticResult.diagnostics.tests.visionAPI.warning && (
                    <Alert className="ml-6 mt-2">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription className="text-xs">
                        {diagnosticResult.diagnostics.tests.visionAPI.warning}
                      </AlertDescription>
                    </Alert>
                  )}
                  {diagnosticResult.diagnostics.tests.visionAPI.error && (
                    <Alert variant="destructive" className="ml-6 mt-2">
                      <AlertDescription className="text-xs">
                        {diagnosticResult.diagnostics.tests.visionAPI.error}
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              )}

              {/* JSON Format Test */}
              {diagnosticResult.diagnostics.tests.jsonFormatTest && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    {getTestStatusIcon(diagnosticResult.diagnostics.tests.jsonFormatTest.success)}
                    <h3 className="font-semibold">JSON-format test</h3>
                  </div>
                  <p className="text-sm text-muted-foreground ml-6">
                    {diagnosticResult.diagnostics.tests.jsonFormatTest.message}
                  </p>
                  {diagnosticResult.diagnostics.tests.jsonFormatTest.parsed && (
                    <pre className="ml-6 mt-2 p-2 bg-muted rounded text-xs overflow-auto">
                      {JSON.stringify(diagnosticResult.diagnostics.tests.jsonFormatTest.parsed, null, 2)}
                    </pre>
                  )}
                  {diagnosticResult.diagnostics.tests.jsonFormatTest.warning && (
                    <Alert className="ml-6 mt-2">
                      <AlertDescription className="text-xs">
                        {diagnosticResult.diagnostics.tests.jsonFormatTest.warning}
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recommendations */}
          {diagnosticResult.recommendations.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Info className="w-5 h-5" />
                  Rekommendationer
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {diagnosticResult.recommendations.map((rec, idx) => (
                    <li key={idx} className="text-sm flex items-start gap-2">
                      <span className="text-muted-foreground mt-0.5">•</span>
                      <span>{rec}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Setup Guide */}
          {diagnosticResult.status === 'not_configured' && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertTitle>Setup-guide för OpenAI API</AlertTitle>
              <AlertDescription className="space-y-2 mt-2">
                <ol className="list-decimal list-inside space-y-1 text-sm">
                  <li>Gå till <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-primary underline">OpenAI API Keys</a></li>
                  <li>Skapa en ny API-nyckel (börjar med "sk-")</li>
                  <li>Öppna Supabase Dashboard → Edge Functions → Environment Variables</li>
                  <li>Lägg till variabel: <code className="bg-muted px-1 rounded">OPENAI_API_KEY</code></li>
                  <li>Klistra in din API-nyckel som värde</li>
                  <li>Starta om edge functions</li>
                  <li>Kör diagnostik igen</li>
                </ol>
              </AlertDescription>
            </Alert>
          )}
        </>
      )}
    </div>
  );
};

export default OpenAIDiagnostics;

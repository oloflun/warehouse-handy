import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Play, Clock, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ApiResponse {
  success: boolean;
  status?: number;
  statusText?: string;
  data?: any;
  authStrategy?: string;
  duration_ms?: number;
  url?: string;
  method?: string;
  error?: string;
  lastError?: any;
}

interface HistoryItem {
  endpoint: string;
  method: string;
  timestamp: Date;
  status: number;
  success: boolean;
  duration_ms: number;
}

const PREDEFINED_ENDPOINTS = [
  { value: "items", label: "Produkter med lagersaldo (/items)" },
  { value: "items/full", label: "Fullständig produktdata inkl. lager (/items/full)" },
  { value: "items/{id}", label: "Specifik produkt (/items/{id})" },
  { value: "items/{id}/orders", label: "Ordrar för artikel (/items/{id}/orders)" },
  { value: "orders", label: "Ordrar (/orders)" },
  { value: "customers", label: "Kunder (/customers)" },
  { value: "branches", label: "Butiker/Lager (/branches)" },
  { value: "suppliers", label: "Leverantörer (/suppliers)" },
  { value: "custom", label: "Anpassad endpoint..." },
];

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];

const FDTExplorer = () => {
  const navigate = useNavigate();
  const [selectedEndpoint, setSelectedEndpoint] = useState("items");
  const [customEndpoint, setCustomEndpoint] = useState("");
  const [method, setMethod] = useState("GET");
  const [requestBody, setRequestBody] = useState("");
  const [response, setResponse] = useState<ApiResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [articleId, setArticleId] = useState("");
  const [branchId, setBranchId] = useState("5");

  const getEndpoint = () => {
    let endpoint = selectedEndpoint === "custom" ? customEndpoint : selectedEndpoint;
    
    // Replace {id} with articleId if provided
    if (articleId && endpoint.includes("{id}")) {
      endpoint = endpoint.replace("{id}", articleId);
    }
    
    // Add branchId as query parameter if provided
    if (branchId) {
      const separator = endpoint.includes("?") ? "&" : "?";
      endpoint = `${endpoint}${separator}branchId=${branchId}`;
    }
    
    return endpoint;
  };

  const handleTest = async () => {
    const endpoint = getEndpoint();
    if (!endpoint) {
      toast.error("Ange en endpoint");
      return;
    }

    setIsLoading(true);
    setResponse(null);

    try {
      let body = null;
      if (requestBody && (method === "POST" || method === "PUT" || method === "PATCH")) {
        try {
          body = JSON.parse(requestBody);
        } catch (e) {
          toast.error("Ogiltig JSON i request body");
          setIsLoading(false);
          return;
        }
      }

      const { data, error } = await supabase.functions.invoke("fdt-api-explorer", {
        body: { endpoint, method, body },
      });

      if (error) throw error;

      setResponse(data);

      // Add to history
      setHistory((prev) => [
        {
          endpoint,
          method,
          timestamp: new Date(),
          status: data.status || 500,
          success: data.success,
          duration_ms: data.duration_ms || 0,
        },
        ...prev.slice(0, 19),
      ]);

      if (data.success) {
        toast.success("API-anrop lyckades!");
      } else {
        toast.error("API-anrop misslyckades");
      }
    } catch (error: any) {
      console.error("Explorer error:", error);
      toast.error(error.message || "Ett fel inträffade");
      setResponse({
        success: false,
        error: error.message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusColor = (status?: number) => {
    if (!status) return "bg-muted";
    if (status >= 200 && status < 300) return "bg-green-500";
    if (status >= 400 && status < 500) return "bg-yellow-500";
    return "bg-red-500";
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-7xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate("/integrations")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold">FDT API Explorer</h1>
              <p className="text-muted-foreground">Testa och utforska FDT Sellus API endpoints</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Request Builder */}
          <Card className="lg:col-span-2 p-6 space-y-4">
            <h2 className="text-xl font-semibold">Request Builder</h2>

            {/* Endpoint Selector */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Endpoint</label>
              <Select value={selectedEndpoint} onValueChange={setSelectedEndpoint}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PREDEFINED_ENDPOINTS.map((ep) => (
                    <SelectItem key={ep.value} value={ep.value}>
                      {ep.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedEndpoint === "custom" && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Anpassad endpoint</label>
                <Input
                  placeholder="t.ex. items/{id}/orders eller orders?since=2024-01-01"
                  value={customEndpoint}
                  onChange={(e) => setCustomEndpoint(e.target.value)}
                />
              </div>
            )}

            {/* Dynamic Parameters */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Artikel-ID (valfritt)</label>
                <Input
                  placeholder="t.ex. 297093"
                  value={articleId}
                  onChange={(e) => setArticleId(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Ersätter {"{id}"} i endpoint</p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Branch-ID</label>
                <Input
                  placeholder="5"
                  value={branchId}
                  onChange={(e) => setBranchId(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Läggs till som ?branchId=</p>
              </div>
            </div>

            {/* Method Selector */}
            <div className="space-y-2">
              <label className="text-sm font-medium">HTTP Method</label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HTTP_METHODS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Request Body */}
            {(method === "POST" || method === "PUT" || method === "PATCH") && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Request Body (JSON)</label>
                <Textarea
                  placeholder='{"key": "value"}'
                  value={requestBody}
                  onChange={(e) => setRequestBody(e.target.value)}
                  rows={6}
                  className="font-mono text-sm"
                />
              </div>
            )}

            {/* Test Button */}
            <Button onClick={handleTest} disabled={isLoading} className="w-full" size="lg">
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Testar...
                </>
              ) : (
                <>
                  <Play className="mr-2 h-4 w-4" />
                  Testa API-anrop
                </>
              )}
            </Button>
          </Card>

          {/* History Panel */}
          <Card className="p-6 space-y-4">
            <h2 className="text-xl font-semibold">Historik</h2>
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {history.length === 0 ? (
                <p className="text-sm text-muted-foreground">Inga anrop ännu</p>
              ) : (
                history.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-lg border bg-card cursor-pointer hover:bg-accent transition-colors"
                    onClick={() => {
                      setSelectedEndpoint(
                        PREDEFINED_ENDPOINTS.find((ep) => ep.value === item.endpoint)
                          ? item.endpoint
                          : "custom"
                      );
                      if (!PREDEFINED_ENDPOINTS.find((ep) => ep.value === item.endpoint)) {
                        setCustomEndpoint(item.endpoint);
                      }
                      setMethod(item.method);
                    }}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <Badge variant={item.success ? "default" : "destructive"}>
                        {item.method}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {item.duration_ms}ms
                      </span>
                    </div>
                    <p className="text-sm font-mono truncate">{item.endpoint}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.timestamp.toLocaleTimeString()}
                    </p>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>

        {/* Response Viewer */}
        {response && (
          <Card className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Response</h2>
              <div className="flex gap-2">
                {response.status && (
                  <Badge className={getStatusColor(response.status)}>
                    {response.status} {response.statusText}
                  </Badge>
                )}
                {response.duration_ms && (
                  <Badge variant="outline">
                    <Clock className="mr-1 h-3 w-3" />
                    {response.duration_ms}ms
                  </Badge>
                )}
                {response.authStrategy && (
                  <Badge variant="outline">Auth: {response.authStrategy}</Badge>
                )}
              </div>
            </div>

            {response.success ? (
              <>
                <div className="flex items-center gap-2 text-green-600">
                  <CheckCircle className="h-5 w-5" />
                  <span className="font-medium">Lyckat API-anrop</span>
                </div>
                <div className="bg-muted p-4 rounded-lg overflow-auto max-h-[500px]">
                  <pre className="text-sm font-mono">
                    {JSON.stringify(response.data, null, 2)}
                  </pre>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 text-red-600">
                  <XCircle className="h-5 w-5" />
                  <span className="font-medium">API-anropet misslyckades</span>
                </div>
                <div className="bg-muted p-4 rounded-lg">
                  <p className="text-sm text-red-600">{response.error}</p>
                  {response.lastError && (
                    <pre className="text-xs font-mono mt-2 text-muted-foreground">
                      {JSON.stringify(response.lastError, null, 2)}
                    </pre>
                  )}
                </div>
              </>
            )}

            {response.url && (
              <div className="text-xs text-muted-foreground">
                <span className="font-medium">URL:</span> {response.url}
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  );
};

export default FDTExplorer;

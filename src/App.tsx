import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Scanner from "./pages/Scanner";
import Integrations from "./pages/Integrations";
import InventoryPage from "./pages/InventoryPage";
import ArticlesPage from "./pages/ArticlesPage";
import SalesPage from "./pages/SalesPage";
import OrderDetailPage from "./pages/OrderDetailPage";
import FDTExplorer from "./pages/FDTExplorer";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/scanner" element={<Scanner />} />
          <Route path="/integrations" element={<Integrations />} />
          <Route path="/integrations/inventory" element={<InventoryPage />} />
          <Route path="/integrations/articles" element={<ArticlesPage />} />
          <Route path="/integrations/sales" element={<SalesPage />} />
          <Route path="/integrations/sales/:orderId" element={<OrderDetailPage />} />
          <Route path="/fdt-explorer" element={<FDTExplorer />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

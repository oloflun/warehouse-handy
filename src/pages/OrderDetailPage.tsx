import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, CheckCircle2, Clock, AlertCircle } from "lucide-react";

interface Order {
  id: string;
  order_number: string | null;
  fdt_order_id: string;
  customer_name: string | null;
  customer_notes: string | null;
  order_date: string | null;
  status: string | null;
  location: {
    name: string;
  } | null;
}

interface OrderLine {
  id: string;
  fdt_article_id: string | null;
  quantity_ordered: number;
  quantity_picked: number;
  is_picked: boolean;
  product: {
    name: string;
    barcode: string | null;
    fdt_sellus_article_id: string | null;
  } | null;
}

const OrderDetailPage = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [order, setOrder] = useState<Order | null>(null);
  const [orderLines, setOrderLines] = useState<OrderLine[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (orderId) {
      fetchOrderDetails();
    }
  }, [orderId]);

  const fetchOrderDetails = async () => {
    try {
      const [orderRes, linesRes] = await Promise.all([
        supabase
          .from('orders')
          .select('*, location:locations(name)')
          .eq('id', orderId)
          .single(),
        supabase
          .from('order_lines')
          .select('*, product:products(name, barcode, fdt_sellus_article_id)')
          .eq('order_id', orderId)
          .order('created_at'),
      ]);

      if (orderRes.error) throw orderRes.error;
      if (linesRes.error) throw linesRes.error;

      setOrder(orderRes.data);
      setOrderLines(linesRes.data || []);
    } catch (error) {
      console.error('Error fetching order details:', error);
      toast({
        title: "Fel",
        description: "Kunde inte hämta orderdetaljer",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="container mx-auto p-6">Laddar...</div>;
  }

  if (!order) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="py-12 text-center">
            <AlertCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-lg text-muted-foreground">Order hittades inte</p>
            <Button onClick={() => navigate('/sales')} className="mt-4">
              Tillbaka till försäljning
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const pickedLines = orderLines.filter(line => line.is_picked).length;
  const totalLines = orderLines.length;
  const allPicked = pickedLines === totalLines && totalLines > 0;

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/sales')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">Order #{order.order_number || order.fdt_order_id}</h1>
            <p className="text-muted-foreground">Orderdetaljer och artiklar</p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Orderinformation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-sm text-muted-foreground">Kund</p>
              <p className="font-medium">{order.customer_name || 'Okänd kund'}</p>
            </div>
            
            <div>
              <p className="text-sm text-muted-foreground">Datum</p>
              <p className="font-medium">
                {order.order_date 
                  ? new Date(order.order_date).toLocaleString('sv-SE')
                  : '-'}
              </p>
            </div>

            <div>
              <p className="text-sm text-muted-foreground">Plats</p>
              <p className="font-medium">{order.location?.name || '-'}</p>
            </div>

            <div>
              <p className="text-sm text-muted-foreground">Status</p>
              <Badge variant={order.status === 'completed' ? 'default' : 'secondary'}>
                {order.status === 'pending' ? 'Väntande' : 
                 order.status === 'completed' ? 'Slutförd' : 
                 order.status || 'Okänd'}
              </Badge>
            </div>

            {order.customer_notes && (
              <div>
                <p className="text-sm text-muted-foreground">Kundnoteringar</p>
                <p className="font-medium">{order.customer_notes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Plockstatus</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-3xl font-bold">{pickedLines} / {totalLines}</span>
              {allPicked ? (
                <Badge className="bg-success text-success-foreground">
                  <CheckCircle2 className="h-4 w-4 mr-1" />
                  Komplett
                </Badge>
              ) : pickedLines > 0 ? (
                <Badge className="bg-warning text-warning-foreground">
                  <Clock className="h-4 w-4 mr-1" />
                  Påbörjad
                </Badge>
              ) : (
                <Badge variant="secondary">
                  Ej påbörjad
                </Badge>
              )}
            </div>
            <div className="w-full bg-muted rounded-full h-4 overflow-hidden">
              <div 
                className="bg-primary h-full transition-all duration-300"
                style={{ width: `${totalLines > 0 ? (pickedLines / totalLines) * 100 : 0}%` }}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Orderrader ({totalLines})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Artikelnummer</TableHead>
                <TableHead>Produktnamn</TableHead>
                <TableHead className="text-right">Beställd kvantitet</TableHead>
                <TableHead className="text-right">Plockad kvantitet</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orderLines.map((line) => {
                const articleNumber = line.product?.barcode || 
                                     line.product?.fdt_sellus_article_id || 
                                     line.fdt_article_id || 
                                     'N/A';
                const productName = line.product?.name || 'Produkt ej synkad';
                const isProductMissing = !line.product;

                return (
                  <TableRow key={line.id}>
                    <TableCell className="font-mono">{articleNumber}</TableCell>
                    <TableCell className={isProductMissing ? 'text-muted-foreground italic' : 'font-medium'}>
                      {productName}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {line.quantity_ordered}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {line.quantity_picked}
                    </TableCell>
                    <TableCell>
                      {line.is_picked ? (
                        <Badge className="bg-success text-success-foreground">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Plockad
                        </Badge>
                      ) : (
                        <Badge className="bg-warning text-warning-foreground">
                          <Clock className="h-3 w-3 mr-1" />
                          Väntande
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default OrderDetailPage;

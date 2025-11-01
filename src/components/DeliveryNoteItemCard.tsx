import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Package, FileText, Tag } from "lucide-react";

interface DeliveryNoteItem {
  id: string;
  article_number: string;
  order_number: string | null;
  description: string | null;
  quantity_expected: number;
  quantity_checked: number;
  is_checked: boolean;
  product_id: string | null;
}

interface DeliveryNoteItemCardProps {
  item: DeliveryNoteItem;
  cargoMarking?: string | null;
  onCheck: (id: string, checked: boolean) => void;
  onViewOrder?: (orderNumber: string) => void;
}

export const DeliveryNoteItemCard = ({ 
  item, 
  cargoMarking,
  onCheck,
  onViewOrder 
}: DeliveryNoteItemCardProps) => {
  return (
    <Card 
      className={`p-4 transition-colors ${
        item.is_checked 
          ? 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800' 
          : 'bg-card'
      }`}
    >
      <div className="flex items-start gap-3">
        <Checkbox
          checked={item.is_checked}
          onCheckedChange={(checked) => onCheck(item.id, checked as boolean)}
          className="mt-1 h-6 w-6"
        />
        
        <div className="flex-1 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-muted-foreground" />
                <span className="font-mono text-lg font-bold">
                  {item.article_number}
                </span>
              </div>
              
              {item.order_number && (
                <div className="flex items-center gap-2">
                  <FileText className="h-3 w-3 text-muted-foreground" />
                  <button
                    onClick={() => onViewOrder?.(item.order_number!)}
                    className="text-sm text-primary hover:underline"
                  >
                    Order: {item.order_number}
                  </button>
                </div>
              )}
              
              {cargoMarking && (
                <div className="flex items-center gap-2">
                  <Tag className="h-3 w-3 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    Godsmärke: {cargoMarking}
                  </span>
                </div>
              )}
            </div>
            
            <Badge variant={item.is_checked ? "default" : "secondary"}>
              {item.quantity_checked}/{item.quantity_expected} st
            </Badge>
          </div>
          
          {item.description && (
            <p className="text-sm text-muted-foreground line-clamp-2">
              {item.description}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
};

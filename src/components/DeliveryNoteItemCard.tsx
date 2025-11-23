import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Package, FileText, Tag, AlertTriangle, Edit2, Check, X } from "lucide-react";
import { useState } from "react";

interface DeliveryNoteItem {
  id: string;
  article_number: string | null;
  order_number: string | null;
  description: string | null;
  quantity_expected: number;
  quantity_checked: number;
  is_checked: boolean;
  product_id: string | null;
  quantity_modified?: boolean;
}

interface DeliveryNoteItemCardProps {
  item: DeliveryNoteItem;
  cargoMarking?: string | null;
  onCheck: (id: string, checked: boolean) => void;
  onQuantityChange?: (id: string, newQuantity: number) => void;
  onViewOrder?: (orderNumber: string) => void;
}

export const DeliveryNoteItemCard = ({
  item,
  cargoMarking,
  onCheck,
  onQuantityChange,
  onViewOrder
}: DeliveryNoteItemCardProps) => {
  const [isEditingQuantity, setIsEditingQuantity] = useState(false);
  const [editedQuantity, setEditedQuantity] = useState(item.quantity_expected);

  const handleSaveQuantity = () => {
    if (editedQuantity !== item.quantity_expected && onQuantityChange) {
      onQuantityChange(item.id, editedQuantity);
    }
    setIsEditingQuantity(false);
  };

  const handleCancelEdit = () => {
    setEditedQuantity(item.quantity_expected);
    setIsEditingQuantity(false);
  };

  const quantityDiffers = item.quantity_checked !== item.quantity_expected && item.is_checked;

  return (
    <Card
      className={`p-4 transition-colors ${item.is_checked
          ? quantityDiffers
            ? 'bg-yellow-50 dark:bg-yellow-950/20 border-yellow-400 dark:border-yellow-700 border-2'
            : 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800'
          : item.quantity_modified
            ? 'bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-800'
            : 'bg-card'
        }`}
    >
      <div className="flex items-start gap-3">
        <Checkbox
          checked={item.is_checked}
          onCheckedChange={(checked) => onCheck(item.id, checked as boolean)}
          className="mt-1 h-6 w-6"
          disabled={item.is_checked}
        />

        <div className="flex-1 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-1 flex-1">
              {/* Order Numbers - Bold at top */}
              {item.order_number && (
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <div className="flex flex-wrap gap-1">
                    {item.order_number
                      .split(/[,\s]+/)  // Split by comma or whitespace
                      .filter(num => num.trim().length > 0)  // Remove empty values
                      .map((orderNum, idx) => (
                        <button
                          key={idx}
                          onClick={() => onViewOrder?.(orderNum.trim())}
                          className="font-mono text-lg font-bold text-primary hover:underline"
                        >
                          {orderNum.trim()}
                        </button>
                      ))}
                  </div>
                </div>
              )}

              {/* Article Number and Description */}
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-muted-foreground" />
                  <span className="font-mono font-bold text-sm">
                    {item.article_number || "OKÄNT ARTIKELNR"}
                  </span>
                </div>
                {item.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2 ml-0">
                    {item.description}
                  </p>
                )}
              </div>

              {/* Alerts */}
              <div className="flex flex-wrap gap-2 mt-2">
                {quantityDiffers && (
                  <Badge variant="outline" className="bg-yellow-100 text-yellow-800 border-yellow-400 dark:bg-yellow-900 dark:text-yellow-100">
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    Alla produkter ännu inte i lager
                  </Badge>
                )}
                {item.quantity_modified && !item.is_checked && (
                  <Badge variant="outline" className="bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900 dark:text-yellow-100">
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    Ändrad kvantitet
                  </Badge>
                )}
              </div>
            </div>

            <div className="flex flex-col items-end gap-2">
              {!isEditingQuantity ? (
                <>
                  <Badge variant={item.is_checked ? "default" : "secondary"}>
                    {item.quantity_checked}/{item.quantity_expected} st
                  </Badge>
                  {!item.is_checked && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsEditingQuantity(true)}
                      className="h-6 px-2 text-xs"
                    >
                      <Edit2 className="h-3 w-3 mr-1" />
                      Ändra antal
                    </Button>
                  )}
                </>
              ) : (
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min="1"
                    value={editedQuantity}
                    onChange={(e) => setEditedQuantity(parseInt(e.target.value) || 1)}
                    className="w-20 h-8 text-sm"
                    autoFocus
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleSaveQuantity}
                    className="h-8 w-8 p-0"
                  >
                    <Check className="h-4 w-4 text-green-600" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCancelEdit}
                    className="h-8 w-8 p-0"
                  >
                    <X className="h-4 w-4 text-red-600" />
                  </Button>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </Card>
  );
};

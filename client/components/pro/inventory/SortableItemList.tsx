import { useState } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Edit3, Trash2, Leaf } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

import type { ProInventoryItem } from "@/lib/pro/types";
import { labelById } from "./inventoryLabels";
import { formatMoney } from "./inventoryUtils";

type Props = {
  items: ProInventoryItem[];
  canEdit: boolean;
  onReorder: (itemIds: string[]) => void;
  onEditItem: (item: ProInventoryItem) => void;
  onDeleteItem: (itemId: string) => void;
  onThumbItem: (itemId: string) => void;
};

function itemPriceLabel(item: ProInventoryItem) {
  const currency = item.currency || "MAD";
  const activeVariants = (item.variants ?? []).filter((v) => !!v.is_active);
  if (activeVariants.length) {
    const min = Math.min(...activeVariants.map((v) => v.price));
    return `À partir de ${formatMoney(min, currency)}`;
  }
  if (typeof item.base_price === "number") return formatMoney(item.base_price, currency);
  return "—";
}

function itemStatusBadge(item: ProInventoryItem) {
  if (item.is_active) return { label: "Actif", className: "bg-emerald-50 text-emerald-700 border-emerald-200" };
  if (item.visible_when_unavailable)
    return { label: "Indisponible", className: "bg-amber-50 text-amber-800 border-amber-200" };
  return { label: "Masqué", className: "bg-slate-50 text-slate-700 border-slate-200" };
}

function SortableItem({
  item,
  canEdit,
  onEdit,
  onDelete,
  onThumb,
}: {
  item: ProInventoryItem;
  canEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onThumb: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const status = itemStatusBadge(item);
  const labels = (item.labels ?? []).slice(0, 3);
  const mainPhoto = (item.photos ?? [])[0] ?? null;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`
        rounded-lg border p-3 transition flex items-center gap-3
        ${item.is_active ? "bg-white border-slate-200" : "bg-slate-50 border-slate-200"}
        ${isDragging ? "opacity-50 shadow-lg z-50" : "hover:bg-slate-50"}
      `}
    >
      {/* Drag handle */}
      {canEdit && (
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600"
        >
          <GripVertical className="w-5 h-5" />
        </button>
      )}

      {/* Photo */}
      {mainPhoto ? (
        <div className="h-12 w-12 rounded-md overflow-hidden border border-slate-200 bg-white shrink-0">
          <img src={mainPhoto} alt={item.title} className="h-12 w-12 object-cover" />
        </div>
      ) : (
        <div className="h-12 w-12 rounded-md bg-slate-100 shrink-0" />
      )}

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-slate-900 truncate">{item.title}</div>
        <div className="text-xs text-slate-600 flex items-center gap-2">
          <span className="tabular-nums">{itemPriceLabel(item)}</span>
          <Badge className={`${status.className} text-[10px] px-1.5 py-0`}>{status.label}</Badge>
        </div>
        {labels.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {labels.map((id) => {
              const l = labelById(id);
              if (!l) return null;
              return (
                <span key={id} className="text-[10px] text-slate-500">
                  {l.emoji}
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        <Button type="button" variant="ghost" size="icon" onClick={onThumb} title="Pouce vert" className="h-8 w-8">
          <Leaf className="w-4 h-4 text-emerald-600" />
        </Button>
        <span className="text-xs tabular-nums text-slate-500 w-6 text-right">{item.popularity ?? 0}</span>

        <Button type="button" variant="ghost" size="icon" disabled={!canEdit} onClick={onEdit} className="h-8 w-8">
          <Edit3 className="w-4 h-4" />
        </Button>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button type="button" variant="ghost" size="icon" disabled={!canEdit} className="h-8 w-8">
              <Trash2 className="w-4 h-4" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Supprimer cette offre ?</AlertDialogTitle>
              <AlertDialogDescription>Suppression définitive (variantes incluses).</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuler</AlertDialogCancel>
              <AlertDialogAction onClick={onDelete}>Supprimer</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}

export function SortableItemList({
  items,
  canEdit,
  onReorder,
  onEditItem,
  onDeleteItem,
  onThumbItem,
}: Props) {
  const [localItems, setLocalItems] = useState(items);

  // Update local items when props change
  if (items !== localItems && JSON.stringify(items.map(i => i.id)) !== JSON.stringify(localItems.map(i => i.id))) {
    setLocalItems(items);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = localItems.findIndex((item) => item.id === active.id);
      const newIndex = localItems.findIndex((item) => item.id === over.id);

      const newItems = arrayMove(localItems, oldIndex, newIndex);
      setLocalItems(newItems);
      onReorder(newItems.map((item) => item.id));
    }
  };

  if (!canEdit) {
    // Non-sortable view for read-only users
    return (
      <div className="space-y-2">
        {items.map((item) => (
          <SortableItem
            key={item.id}
            item={item}
            canEdit={false}
            onEdit={() => onEditItem(item)}
            onDelete={() => onDeleteItem(item.id)}
            onThumb={() => onThumbItem(item.id)}
          />
        ))}
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={localItems.map((item) => item.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="space-y-2">
          {localItems.map((item) => (
            <SortableItem
              key={item.id}
              item={item}
              canEdit={canEdit}
              onEdit={() => onEditItem(item)}
              onDelete={() => onDeleteItem(item.id)}
              onThumb={() => onThumbItem(item.id)}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

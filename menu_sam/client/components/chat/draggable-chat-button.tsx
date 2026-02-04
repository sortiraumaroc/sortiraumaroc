import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MessageCircle } from "lucide-react";

type Props = {
  open: boolean;
  onClick: () => void;
};

const BTN = 48; // button size
const PAD = 20; // padding from edges

function getViewport() {
  // iOS Safari: visualViewport is more stable with dynamic bars
  const vv = window.visualViewport;
  const w = vv?.width ?? window.innerWidth;
  const h = vv?.height ?? window.innerHeight;
  const offsetLeft = vv?.offsetLeft ?? 0;
  const offsetTop = vv?.offsetTop ?? 0;
  return { w, h, offsetLeft, offsetTop };
}

export function DraggableChatButton({ open, onClick }: Props) {
  const [position, setPosition] = React.useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = React.useState(false);
  const [dragOffset, setDragOffset] = React.useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const movedRef = React.useRef(false);

  // Load position from localStorage on mount, default to bottom-right with padding
  React.useEffect(() => {
    const getDefaultPosition = () => {
      const { w, h, offsetLeft, offsetTop } = getViewport();
      return {
        x: offsetLeft + w - BTN - PAD,
        y: offsetTop + h - BTN - PAD,
      };
    };

    const savedPosition = localStorage.getItem("sam-chat-button-position");
    if (savedPosition) {
      try {
        setPosition(JSON.parse(savedPosition));
      } catch {
        setPosition(getDefaultPosition());
      }
    } else {
      setPosition(getDefaultPosition());
    }
  }, []);

  // Keep inside viewport on resize/orientation changes (iOS bars)
  React.useEffect(() => {
    const clamp = () => {
      setPosition((p) => {
        const { w, h, offsetLeft, offsetTop } = getViewport();
        const maxX = offsetLeft + w - BTN;
        const maxY = offsetTop + h - BTN;
        return {
          x: Math.max(offsetLeft, Math.min(p.x, maxX)),
          y: Math.max(offsetTop, Math.min(p.y, maxY)),
        };
      });
    };

    window.addEventListener("resize", clamp);
    window.visualViewport?.addEventListener("resize", clamp);
    window.visualViewport?.addEventListener("scroll", clamp);
    return () => {
      window.removeEventListener("resize", clamp);
      window.visualViewport?.removeEventListener("resize", clamp);
      window.visualViewport?.removeEventListener("scroll", clamp);
    };
  }, []);

  const startDrag = (clientX: number, clientY: number) => {
    if (open) return;
    if (!buttonRef.current) return;

    const rect = buttonRef.current.getBoundingClientRect();
    setDragOffset({ x: clientX - rect.left, y: clientY - rect.top });
    movedRef.current = false;
    setIsDragging(true);

    // capture pointer so drag continues even if finger leaves button
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (buttonRef.current as any).setPointerCapture?.(0);
    } catch { }
  };

  const moveDrag = (clientX: number, clientY: number) => {
    if (!isDragging) return;

    const { w, h, offsetLeft, offsetTop } = getViewport();
    const newX = offsetLeft + (clientX - offsetLeft) - dragOffset.x;
    const newY = offsetTop + (clientY - offsetTop) - dragOffset.y;

    const maxX = offsetLeft + w - BTN;
    const maxY = offsetTop + h - BTN;

    const constrainedX = Math.max(offsetLeft, Math.min(newX, maxX));
    const constrainedY = Math.max(offsetTop, Math.min(newY, maxY));

    // mark as moved if finger moved enough (avoid click after drag)
    if (!movedRef.current) {
      const dx = Math.abs(constrainedX - position.x);
      const dy = Math.abs(constrainedY - position.y);
      if (dx + dy > 4) movedRef.current = true;
    }

    setPosition({ x: constrainedX, y: constrainedY });
  };

  const endDrag = () => {
    if (!isDragging) return;
    setIsDragging(false);
    localStorage.setItem("sam-chat-button-position", JSON.stringify(position));
  };

  React.useEffect(() => {
    if (!isDragging) return;

    // iOS: prevent scroll while dragging
    const prevent = (e: TouchEvent) => e.preventDefault();

    document.addEventListener("touchmove", prevent, { passive: false });
    return () => {
      document.removeEventListener("touchmove", prevent);
    };
  }, [isDragging]);

  if (open) return null;

  return (
    <Button
      ref={buttonRef}
      type="button"
      onClick={(e) => {
        // If it was a drag, ignore click
        if (movedRef.current) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        onClick();
      }}
      // ✅ Pointer Events: best cross-device approach
      onPointerDown={(e) => {
        // only primary pointer
        if (e.button !== 0) return;
        e.preventDefault();
        startDrag(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (!isDragging) return;
        e.preventDefault();
        moveDrag(e.clientX, e.clientY);
      }}
      onPointerUp={(e) => {
        e.preventDefault();
        endDrag();
      }}
      onPointerCancel={() => endDrag()}
      className={cn(
        "fixed z-[200] h-12 w-12 rounded-full px-0",
        "bg-white text-sam-red",
        "border border-border shadow-lg shadow-black/15",
        "hover:bg-sam-gray-50 active:scale-[0.99]",
        isDragging ? "cursor-grabbing" : "cursor-grab",
      )}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        bottom: "auto",
        right: "auto",
        // ✅ iOS: stop scroll hijacking during drag
        touchAction: "none",
        WebkitUserSelect: "none",
        userSelect: "none",
      }}
      aria-label="Ouvrir SAM"
      title="SAM - Glissez pour déplacer"
    >
      <MessageCircle className="h-5 w-5" />
    </Button>
  );
}

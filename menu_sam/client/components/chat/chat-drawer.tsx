import * as React from "react";

import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { toast } from "sonner";
import { Bot, Send, ShoppingCart, Trash2, User, X } from "lucide-react";

import { useChatHistory, type ChatMessage, type ChatProductItem } from "@/components/chat/use-chat-history";
import {
  generateLpbAssistantReply,
  getLpbFirstTimeIntro,
  type AssistantContext,
} from "@/components/chat/lpb-assistant";
import { useOpenAiChat } from "@/hooks/use-openai-chat";
import { ChatProductCard } from "@/components/chat/chat-product-card";
import { ChatProductDetail } from "@/components/chat/chat-product-detail";

type CartSnapshot = {
  lines: { title: string; quantity: number; unitPriceDh: number }[];
  totalDh: number;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  context: AssistantContext;
  className?: string;
  onAddToCart?: (productId: string) => void | Promise<void>;
  getCartSnapshot?: () => CartSnapshot;
  placeName?: string;
  placeId?: number;
  useOpenAi?: boolean;
};

// Note: SAM_OPENING_MESSAGE is set dynamically in useEffect based on placeName
const ENDING_LINE = "👉 Souhaites-tu d’autres combinaisons, modifier ton panier ou finaliser ta commande ?";

type SamActionLine = { addProductId: string };

function parseSamActionLine(line: string): SamActionLine | null {
  const trimmed = line.trim();

  // Legacy format support (older messages may still contain the skip link)
  const legacy = trimmed.match(
    /^➡️\s*\[Ajouter au panier\]\(sam:add:([^)]+)\)\s*\/\s*\[Ne pas ajouter\]\(sam:skip:([^)]+)\)\s*$/,
  );
  if (legacy?.[1]) return { addProductId: legacy[1] };

  // Current format
  const single = trimmed.match(/^➡️\s*\[Ajouter au panier\]\(sam:add:([^)]+)\)\s*$/);
  if (single?.[1]) return { addProductId: single[1] };

  return null;
}

function SamAssistantContent({
  content,
  onAdd,
  disabled,
}: {
  content: string;
  onAdd: (productId: string) => void;
  disabled: boolean;
}) {
  const lines = React.useMemo(() => content.split("\n"), [content]);

  const blocks: React.ReactNode[] = [];
  let buffer: string[] = [];

  const flushText = (key: string) => {
    if (buffer.length === 0) return;
    const text = buffer.join("\n");
    blocks.push(
      <div key={key} className="whitespace-pre-wrap">
        {text}
      </div>,
    );
    buffer = [];
  };

  lines.forEach((line, idx) => {
    const action = parseSamActionLine(line);
    if (!action) {
      buffer.push(line);
      return;
    }

    flushText(`t_${idx}`);

    blocks.push(
      <div key={`a_${idx}`} className="mt-2 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          onClick={() => onAdd(action.addProductId)}
          disabled={disabled}
          aria-label="Ajouter au panier"
          title="Ajouter au panier"
          className={cn(
            "h-9 shrink-0 rounded-full px-3",
            "bg-sam-red text-primary-foreground hover:bg-sam-red/90",
            "shadow-sm shadow-black/5 active:scale-[0.99]",
          )}
        >
          <ShoppingCart className="h-4 w-4" />
        </Button>
      </div>,
    );
  });

  flushText("t_end");

  return <div className="space-y-2">{blocks}</div>;
}

function MessageBubble({
  msg,
  onAdd,
  onImageClick,
  isBusy,
}: {
  msg: ChatMessage;
  onAdd: (productId: string) => void;
  onImageClick?: (product: ChatProductItem) => void;
  isBusy: boolean;
}) {
  const isUser = msg.role === "user";
  const hasProducts = msg.products && msg.products.length > 0;

  return (
    <div className={cn("flex gap-2", isUser ? "justify-end" : "justify-start")}>
      {!isUser ? (
        <span className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-sam-red/10 text-sam-red ring-1 ring-sam-red/15">
          <Bot className="h-4 w-4" />
        </span>
      ) : null}

      <div
        className={cn(
          "rounded-2xl text-[13px] leading-relaxed",
          isUser
            ? "max-w-[85%] bg-sam-red text-primary-foreground px-3 py-2"
            : "w-full max-w-sm space-y-3",
        )}
      >
        {isUser ? (
          <div className="whitespace-pre-wrap">{msg.content}</div>
        ) : (
          <>
            {msg.content && (
              <div className="max-w-[85%] rounded-2xl bg-sam-gray-50 text-foreground ring-1 ring-border px-3 py-2">
                <SamAssistantContent content={msg.content} onAdd={onAdd} disabled={isBusy} />
              </div>
            )}

            {hasProducts && (
              <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
                {msg.products.map((product) => (
                  <ChatProductCard
                    key={product.id}
                    product={product}
                    onAdd={onAdd}
                    onImageClick={onImageClick}
                    disabled={isBusy}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {isUser ? (
        <span className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-sam-gray-50 text-foreground ring-1 ring-border">
          <User className="h-4 w-4" />
        </span>
      ) : null}
    </div>
  );
}

function formatCartSnapshot(snapshot: CartSnapshot) {
  const lines = snapshot.lines
    .filter((l) => Number.isFinite(l.quantity) && l.quantity > 0)
    .map((l) => `${l.title} ×${l.quantity} — ${l.unitPriceDh * l.quantity} Dhs`);

  const body = lines.length > 0 ? lines.join("\n") : "(vide)";

  return `🧾 Panier actuel :\n\n${body}\n\nTotal provisoire : ${snapshot.totalDh} Dhs`;
}

export function ChatDrawer({
  open,
  onOpenChange,
  context,
  className,
  onAddToCart,
  getCartSnapshot,
  placeName,
  placeId,
  useOpenAi = false,
}: Props) {
  const { messages, append, clear } = useChatHistory();
  const [draft, setDraft] = React.useState("");
  const [isAnswering, setIsAnswering] = React.useState(false);
  const [selectedProduct, setSelectedProduct] = React.useState<ChatProductItem | null>(null);
  const [detailOpen, setDetailOpen] = React.useState(false);

  // Build menu data for OpenAI
  const menuData = React.useMemo(() => {
    const categories: Record<string, any[]> = {};
    for (const category of context.categories) {
      categories[category.id] = context.products.filter((p) => p.categoryId === category.id);
    }
    return {
      categories: context.categories,
      products: context.products,
      byCategory: categories,
    };
  }, [context]);

  const openAiChat = useOpenAiChat({
    placeName: placeName || "Restaurant",
    placeId: placeId || 1,
    menu: menuData,
  });

  const listRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!open) return;
    if (messages.length !== 0) return;
    const openingMessage = getLpbFirstTimeIntro(placeName || "Restaurant");
    append("assistant", openingMessage);
  }, [append, messages.length, open, placeName]);

  // Auto-scroll when opening / new messages
  React.useEffect(() => {
    if (!open) return;
    window.setTimeout(() => {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
    }, 50);
  }, [open, messages.length]);

  const handleSamAdd = React.useCallback(
    async (productId: string) => {
      try {
        console.log("🛒 Adding product to cart:", productId);
        await onAddToCart?.(productId);

        // Wait for cart state to update, with retries
        console.log("⏳ Waiting for cart to update...");
        let snapshot = null;
        let attempts = 0;

        // Try up to 5 times with increasing waits to get a non-empty cart
        while (attempts < 5) {
          await new Promise((r) => window.setTimeout(r, attempts === 0 ? 250 : 150));
          snapshot = getCartSnapshot?.();
          console.log(`📦 Cart snapshot attempt ${attempts + 1}:`, snapshot);

          // If we got a snapshot with items, we're good
          if (snapshot && snapshot.lines && snapshot.lines.length > 0) {
            console.log("✅ Cart updated successfully");
            break;
          }
          attempts++;
        }

        const recap = snapshot ? formatCartSnapshot(snapshot) : null;

        append(
          "assistant",
          [
            "✔️ Plat ajouté au panier.",
            ENDING_LINE,
          ]
            .filter(Boolean)
            .join("\n\n"),
        );
      } catch (error) {
        console.error("❌ Error adding to cart:", error);
        toast.message("Impossible de mettre à jour le panier pour le moment.");
      }
    },
    [append, getCartSnapshot, onAddToCart],
  );

  const handleSend = React.useCallback(async () => {
    const text = draft.trim();
    if (text.length === 0) return;

    const userMessagesCount = messages.reduce((sum, m) => sum + (m.role === "user" ? 1 : 0), 0);
    const assistantMessagesCount = messages.reduce((sum, m) => sum + (m.role === "assistant" ? 1 : 0), 0);

    append("user", text);
    setDraft("");

    setIsAnswering(true);

    if (useOpenAi) {
      try {
        const response = await openAiChat.getResponse([
          ...messages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
          { role: "user", content: text },
        ]);

        if (response) {
          console.log("📨 Received response from OpenAI:", { type: response.type, hasItems: !!response.items, itemsCount: response.items?.length || 0 });
          console.log("📋 Response text preview:", response.text?.substring(0, 100));

          if (response.type === "products" && response.items && response.items.length > 0) {
            console.log("✅ Rendering as product cards", response.items);
            const products = response.items.map((item) => ({
              id: item.id,
              title: item.title,
              price: item.price,
              image: item.image,
              description: item.description,
            }));
            append("assistant", response.text, products);
          } else {
            // Check if the text might contain embedded JSON that wasn't parsed on server
            let textToDisplay = response.text;
            let productsFromText: typeof response.items | undefined = undefined;

            // Try to find JSON object embedded in the text
            if (response.text) {
              const firstBrace = response.text.indexOf("{");
              if (firstBrace !== -1) {
                // Try to extract and parse JSON
                let braceCount = 0;
                let endBrace = -1;

                for (let i = firstBrace; i < response.text.length; i++) {
                  const char = response.text[i];
                  if (char === "{") braceCount++;
                  else if (char === "}") {
                    braceCount--;
                    if (braceCount === 0) {
                      endBrace = i;
                      break;
                    }
                  }
                }

                if (endBrace !== -1) {
                  let jsonStr = response.text.substring(firstBrace, endBrace + 1);
                  console.log("🔍 Found embedded JSON in text, attempting to parse...");
                  console.log("📦 JSON length:", jsonStr.length, "Preview:", jsonStr.substring(0, 150));

                  try {
                    // First try direct parsing
                    let parsed = JSON.parse(jsonStr);
                    if (parsed.type === "products" && Array.isArray(parsed.items) && parsed.items.length > 0) {
                      console.log("✅ Successfully extracted and parsed JSON from text, found", parsed.items.length, "products");
                      textToDisplay = parsed.text || response.text.substring(0, firstBrace).trim();
                      productsFromText = parsed.items;
                    } else if (parsed.text) {
                      console.log("📝 Parsed JSON contains text field but no products, using text");
                      textToDisplay = parsed.text;
                    }
                  } catch (e1) {
                    console.log("❌ Direct parse failed:", (e1 as Error).message);
                    // Try to fix unescaped newlines and control characters
                    try {
                      console.log("🔧 Attempting to fix unescaped newlines...");
                      // Replace literal newlines inside string values with escaped \n
                      // This is a safe approach: find quoted strings and escape newlines within them
                      let fixedJsonStr = jsonStr.replace(/"([^"\\]|\\.)*"/g, (match) => {
                        // For each quoted string, escape any newlines
                        return match.replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t");
                      });

                      const parsed = JSON.parse(fixedJsonStr);
                      if (parsed.type === "products" && Array.isArray(parsed.items) && parsed.items.length > 0) {
                        console.log("✅ Successfully parsed fixed JSON, found", parsed.items.length, "products");
                        textToDisplay = parsed.text || response.text.substring(0, firstBrace).trim();
                        productsFromText = parsed.items;
                      } else if (parsed.text) {
                        console.log("📝 Parsed fixed JSON contains text field but no products");
                        textToDisplay = parsed.text;
                      }
                    } catch (e2) {
                      console.log("❌ Failed to parse even after fixing:", (e2 as Error).message);
                    }
                  }
                }
              }
            }

            if (productsFromText && productsFromText.length > 0) {
              const products = productsFromText.map((item: any) => ({
                id: item.id,
                title: item.title,
                price: item.price,
                image: item.image,
                description: item.description,
              }));
              append("assistant", textToDisplay, products);
            } else {
              console.log("📝 Rendering as text (type:", response.type, "items:", response.items?.length || 0, ")");
              append("assistant", textToDisplay);
            }
          }
        } else {
          console.error("❌ No response from OpenAI");
          toast.message("Impossible de générer une réponse pour le moment.");
        }
      } catch (error) {
        console.error("Chat error:", error);
        toast.message("Impossible de générer une réponse pour le moment.");
      } finally {
        setIsAnswering(false);
      }
    } else {
      window.setTimeout(() => {
        try {
          const reply = generateLpbAssistantReply(text, context, {
            isFirstUserMessage: userMessagesCount === 0 && assistantMessagesCount === 0,
            placeName: placeName || "Restaurant",
          });

          // Extract product IDs from the LPB response
          const productIdRegex = /\[Ajouter au panier\]\(sam:add:([^)]+)\)/g;
          const productIds = new Set<string>();
          let match;
          while ((match = productIdRegex.exec(reply)) !== null) {
            productIds.add(match[1]);
          }

          // Find the actual product objects from context
          const products = Array.from(productIds)
            .map(id => context.products.find(p => p.id === id))
            .filter((p): p is typeof context.products[0] => p !== undefined)
            .map(p => ({
              id: p.id,
              title: p.title,
              price: `${p.priceDh}`,
              image: p.img || "",
              description: p.description || "",
            }));

          append("assistant", reply, products.length > 0 ? products : undefined);
        } catch {
          toast.message("Impossible de générer une réponse pour le moment.");
        } finally {
          setIsAnswering(false);
        }
      }, 250);
    }
  }, [append, context, draft, messages, openAiChat, useOpenAi, placeName]);

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleTextareaFocus = React.useCallback(
    (e: React.FocusEvent<HTMLTextAreaElement>) => {
      // iOS Safari fix: prevent viewport zoom on input focus
      // Scroll to element with offset to avoid zoom
      if (/iPhone|iPad/.test(navigator.userAgent)) {
        window.setTimeout(() => {
          e.currentTarget.scrollIntoView({ block: 'end', behavior: 'smooth' });
        }, 100);
      }
    },
    [],
  );

  return (
    <Drawer open={open} onOpenChange={onOpenChange} shouldScaleBackground={false}>
      {/* iOS FIX: use dvh + flex layout */}
      <DrawerContent
        className={cn(
          "h-[100dvh] max-h-[100dvh]",
          "flex flex-col",
          "p-0",
          className,
        )}
      >
        {/* Header with close button INSIDE (avoid fixed on iOS) */}
        <DrawerHeader className="mx-auto w-full max-w-md pb-2 sm:max-w-lg md:max-w-2xl lg:max-w-3xl">
          <div className="flex items-center justify-between gap-2">
            <DrawerTitle className="text-left text-base font-semibold">SAM</DrawerTitle>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="rounded-full bg-muted text-xs text-muted-foreground hover:bg-muted/80"
                onClick={() => {
                  clear();
                  toast.success("Conversation effacée", { duration: 1400 });
                }}
              >
                <Trash2 className="h-4 w-4" />
                Effacer
              </Button>

              <DrawerClose asChild>
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  className="h-9 w-9 rounded-full bg-sam-red hover:bg-sam-red/90 text-white"
                  aria-label="Fermer SAM"
                  title="Fermer"
                >
                  <X className="h-4 w-4" />
                </Button>
              </DrawerClose>
            </div>
          </div>

          <p className="mt-1 text-left text-[11px] leading-[1.2] text-muted-foreground">
            (Votre conseiller iA basé uniquement sur notre menu)
          </p>
        </DrawerHeader>

        {/* Messages list (reserve space for footer) */}
        <div
          ref={listRef}
          className="flex-1 overflow-auto px-4 pb-28"
          style={{ WebkitOverflowScrolling: "touch" as any }}
        >
          <div className="space-y-3">
            {messages.map((m) => (
              <MessageBubble
                key={m.id}
                msg={m}
                onAdd={handleSamAdd}
                onImageClick={(product) => {
                  setSelectedProduct(product);
                  setDetailOpen(true);
                }}
                isBusy={isAnswering}
              />
            ))}

            {isAnswering ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-sam-red" />
                Réponse en cours…
              </div>
            ) : null}
          </div>
        </div>

        {/* iOS FIX: sticky footer */}
        <div
          className={cn(
            "sticky bottom-0 z-10",
            "border-t border-border bg-background/95 backdrop-blur",
            "px-4 pt-3",
            "pb-[calc(env(safe-area-inset-bottom)+12px)]",
          )}
        >
          <div className="mx-auto w-full max-w-md sm:max-w-lg md:max-w-2xl lg:max-w-3xl">
            <div className="flex items-end gap-2 min-w-0">
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={handleTextareaFocus}
                placeholder="Écris ton message…"
                className="min-w-0 min-h-[44px] flex-1 resize-none rounded-2xl"
                style={{ fontSize: '16px' }}
              />
              <Button
                type="button"
                className="h-11 w-11 shrink-0 rounded-2xl bg-sam-red px-0 text-primary-foreground hover:bg-sam-red/90" // ✅
                onClick={handleSend}
                disabled={draft.trim().length === 0 || isAnswering}
                aria-label="Envoyer"
                title="Envoyer"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>

          </div>
        </div>

        {/* Product Detail Modal */}
        <ChatProductDetail
          product={selectedProduct}
          open={detailOpen}
          onOpenChange={setDetailOpen}
          onAdd={handleSamAdd}
          disabled={isAnswering}
        />
      </DrawerContent>
    </Drawer>
  );
}

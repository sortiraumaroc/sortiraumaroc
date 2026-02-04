import { Router, Request, Response } from "express";
import prisma from "../lib/prisma";
import { v4 as uuidv4 } from "uuid";

export const mysqlApiRouter = Router();

// ============ ORDERS API (Using commandes table) ============

// Get all orders for a place
mysqlApiRouter.get("/orders/:placeId", async (req: Request, res: Response) => {
  try {
    const { placeId } = req.params;
    const orders = await prisma.commande.findMany({
      where: { placeId: parseInt(placeId) },
      include: {
        commandeProducts: { include: { menuItem: true } },
        participants: true,
        payments: true,
      },
      orderBy: { dateCreation: "desc" },
      take: 50,
    });
    res.json(orders);
  } catch (error) {
    console.error("Error fetching orders:", error);
    res.status(500).json({ error: "Failed to fetch orders" });
  }
});

// Get single order
mysqlApiRouter.get("/orders/:placeId/:orderId", async (req: Request, res: Response) => {
  try {
    const { placeId, orderId } = req.params;
    const order = await prisma.commande.findUnique({
      where: { id: parseInt(orderId) },
      include: {
        commandeProducts: { include: { menuItem: true } },
        participants: true,
        payments: true,
      },
    });

    if (!order || order.placeId !== parseInt(placeId)) {
      return res.status(404).json({ error: "Order not found" });
    }

    res.json(order);
  } catch (error) {
    console.error("Error fetching order:", error);
    res.status(500).json({ error: "Failed to fetch order" });
  }
});

// Get orders for a specific place with date filtering
mysqlApiRouter.post("/orders/place/:placeId", async (req: Request, res: Response) => {
  try {
    const placeId = Number(req.params.placeId);
    const { startDate, endDate } = req.body;

    if (!Number.isFinite(placeId)) {
      return res.status(400).json({ error: "Invalid placeId" });
    }

    const where: any = { placeId };

    if (startDate) {
      where.dateCreation = { gte: new Date(startDate) };
    }

    if (endDate) {
      where.dateCreation = {
        ...(where.dateCreation ?? {}),
        lte: new Date(endDate),
      };
    }

    const orders = await prisma.commande.findMany({
      where,
      include: {
        commandeProducts: { include: { menuItem: true } },
        participants: true,
        payments: true,
      },
      orderBy: { dateCreation: "desc" },
      take: 500,
    });

    res.json(orders);
  } catch (error) {
    console.error("Error fetching place orders:", error);
    res.status(500).json({ error: "Failed to fetch orders" });
  }
});

// Create a new order
mysqlApiRouter.post("/orders", async (req: Request, res: Response) => {
  try {
    const {
      placeId,
      nbrTable,
      tableNumber,
      serviceType,
      joinCode,
      userId,
      orderByUser,
      pourboire,
    } = req.body;

    // Validate required fields
    const parsedPlaceId = placeId ? parseInt(placeId) : NaN;
    const parsedTableNumber = tableNumber ? parseInt(tableNumber) : null;
    const parsedNbrTable = nbrTable ? parseInt(nbrTable) : parsedTableNumber || 1;

    if (Number.isNaN(parsedPlaceId)) {
      return res.status(400).json({ error: "Invalid or missing placeId" });
    }

    if (!Number.isFinite(parsedNbrTable) || parsedNbrTable <= 0) {
      return res.status(400).json({ error: "Invalid nbrTable value" });
    }

    const order = await prisma.commande.create({
      data: {
        placeId: parsedPlaceId,
        nbrTable: parsedNbrTable,
        tableNumber: parsedTableNumber,
        serviceType: serviceType || "sur_place",
        joinCode: joinCode || uuidv4().slice(0, 8).toUpperCase(),
        status: "open",
        kitchenStatus: "new",
        type: "scan",
        userId: userId || 7591,
        orderByUser: orderByUser || "",
        total: 0,
        comment: "",
        discountAmount: 0,
        pourboire: parseInt(String(pourboire || 0)),
      },
      include: {
        commandeProducts: { include: { menuItem: true } },
        participants: true,
        payments: true,
      },
    });

    res.status(201).json(order);
  } catch (error) {
    console.error("Error creating order:", error);
    res.status(500).json({ error: "Failed to create order" });
  }
});

// Create a complete order with products (from cart)
mysqlApiRouter.post("/orders/complete", async (req: Request, res: Response) => {
  try {
    const {
      placeId,
      nbrTable,
      serviceType,
      joinCode,
      userId,
      orderByUser,
      products, // Array of { menuId, quantite, prix, comment }
      total,
      comment,
      discountAmount,
      paymentMethod,
      pourboire,
    } = req.body;

    // Validate input
    if (!placeId || !Array.isArray(products) || products.length === 0) {
      return res.status(400).json({ error: "Invalid order data" });
    }

    // Determine initial payment status based on payment method
    const paymentStatus = paymentMethod === "card" ? "pending" : "pending";

    // Create order with products in a transaction
    const order = await prisma.commande.create({
      data: {
        placeId: parseInt(placeId),
        nbrTable: nbrTable || 1,
        serviceType: serviceType || "sur_place",
        joinCode: joinCode || uuidv4().slice(0, 8).toUpperCase(),
        status: "open",
        kitchenStatus: "new",
        type: "scan",
        userId: userId ?? 7591, // Default to 7591
        orderByUser: orderByUser || "",
        total: parseFloat(String(total || 0)),
        comment: comment || "",
        discountAmount: parseFloat(String(discountAmount || 0)),
        paymentMethod: paymentMethod || "card",
        paymentStatus,
        pourboire: parseInt(String(pourboire || 0)),
        commandeProducts: {
          create: products.map((product: any) => ({
            menuId: parseInt(product.menuId),
            quantite: parseInt(product.quantite) || 1,
            prix: parseFloat(String(product.prix || 0)),
            comment: product.comment || "",
            addedBySessionId: product.addedBySessionId || "",
            addedByName: product.addedByName || "",
            ownerId: product.ownerId || "",
            nameUser: product.nameUser || "",
          })),
        },
      },
      include: {
        commandeProducts: { include: { menuItem: true } },
        participants: true,
        payments: true,
      },
    });

    res.status(201).json(order);
  } catch (error) {
    console.error("Error creating complete order:", error);
    res.status(500).json({ error: "Failed to create order" });
  }
});

// Update order status
mysqlApiRouter.patch("/orders/:orderId", async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const {
      status,
      kitchenStatus,
      paymentStatus,
      discountAmount,
      total,
      promoCode,
      paymentMethod,
      pourboire,
    } = req.body;

    const parsedOrderId = parseInt(orderId, 10);
    if (!Number.isFinite(parsedOrderId)) {
      return res.status(400).json({ error: "Invalid orderId" });
    }

    // Validate paymentStatus if provided
    const validPaymentStatuses = ["pending", "paid", "failed"];
    if (paymentStatus !== undefined && !validPaymentStatuses.includes(paymentStatus.toLowerCase())) {
      return res.status(400).json({
        error: `Invalid paymentStatus. Must be one of: ${validPaymentStatuses.join(", ")}`
      });
    }

    const data: any = {};
    if (status !== undefined) data.status = status;
    if (kitchenStatus !== undefined) data.kitchenStatus = kitchenStatus;
    if (paymentStatus !== undefined) data.paymentStatus = paymentStatus.toLowerCase();
    if (discountAmount !== undefined) data.discountAmount = discountAmount;
    if (total !== undefined) data.total = total;
    if (promoCode !== undefined) data.promoCode = promoCode;
    if (paymentMethod !== undefined) data.paymentMethod = paymentMethod;
    if (pourboire !== undefined) data.pourboire = parseInt(String(pourboire));
    data.updatedAt = new Date();

    const order = await prisma.commande.update({
      where: { id: parsedOrderId },
      data,
      include: {
        commandeProducts: { include: { menuItem: true } },
        participants: true,
        payments: true,
      },
    });

    res.json(order);
  } catch (error) {
    console.error("Error updating order:", error);
    res.status(500).json({ error: "Failed to update order" });
  }
});

// ============ ORDER ITEMS API (Using commandes_products) ============

// Get all items for an order
mysqlApiRouter.get("/orders/:orderId/items", async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const items = await prisma.commandeProduct.findMany({
      where: { commandeId: parseInt(orderId) },
      include: { menuItem: true },
      orderBy: { createdAt: "desc" },
    });
    res.json(items);
  } catch (error) {
    console.error("Error fetching order items:", error);
    res.status(500).json({ error: "Failed to fetch order items" });
  }
});

// Add item to order
mysqlApiRouter.post("/order-items", async (req: Request, res: Response) => {
  try {
    const {
      commandeId,
      menuId,
      quantite,
      prix,
      comment,
      addedBySessionId,
      addedByName,
      ownerId,
      nameUser,
      categoryId,
    } = req.body;

    const item = await prisma.commandeProduct.create({
      data: {
        commandeId: parseInt(commandeId),
        menuId: parseInt(menuId),
        quantite: quantite || 1,
        prix: prix || 0,
        comment: comment || "",
        addedBySessionId: addedBySessionId || "",
        addedByName: addedByName || "",
        ownerId: ownerId || "",
        nameUser: nameUser || "",
        categoryId: categoryId || "",
      },
      include: { menuItem: true },
    });

    res.status(201).json(item);
  } catch (error) {
    console.error("Error adding order item:", error);
    res.status(500).json({ error: "Failed to add item to order" });
  }
});

// Update an order item
mysqlApiRouter.patch("/order-items/:itemId", async (req: Request, res: Response) => {
  try {
    const { itemId } = req.params;
    const { quantite, comment, prix, categoryId } = req.body;

    const data: any = {};
    if (quantite !== undefined) data.quantite = quantite;
    if (comment !== undefined) data.comment = comment;
    if (prix !== undefined) data.prix = prix;
    if (categoryId !== undefined) data.categoryId = categoryId;
    data.updatedAt = new Date();

    const item = await prisma.commandeProduct.update({
      where: { id: parseInt(itemId) },
      data,
      include: { menuItem: true },
    });

    res.json(item);
  } catch (error) {
    console.error("Error updating order item:", error);
    res.status(500).json({ error: "Failed to update order item" });
  }
});

// Delete an order item
mysqlApiRouter.delete("/order-items/:itemId", async (req: Request, res: Response) => {
  try {
    const { itemId } = req.params;
    await prisma.commandeProduct.delete({
      where: { id: parseInt(itemId) },
    });
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting order item:", error);
    res.status(500).json({ error: "Failed to delete order item" });
  }
});

// Clear user's items from an order
mysqlApiRouter.post("/orders/:orderId/items/clear", async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const { sessionId } = req.body;

    await prisma.commandeProduct.deleteMany({
      where: {
        commandeId: parseInt(orderId),
        addedBySessionId: sessionId,
      },
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Error clearing items:", error);
    res.status(500).json({ error: "Failed to clear items" });
  }
});

// ============ MENU API ============

// Get all menu categories and items for a place
mysqlApiRouter.get("/menu/:placeId", async (req: Request, res: Response) => {
  try {
    const { placeId } = req.params;
    const categories = await prisma.menuCategory.findMany({
      where: { placeId: parseInt(placeId) },
      orderBy: { priority: "asc" },
    });
    const items = await prisma.menuItem.findMany({
      where: {
        menuCategory: {
          placeId: parseInt(placeId),
        },
      },
      orderBy: { priority: "asc" },
    });
    res.json({ categories, items });
  } catch (error) {
    console.error("Error fetching menu:", error);
    res.status(500).json({ error: "Failed to fetch menu" });
  }
});
// Get all menu categories and items for a place
mysqlApiRouter.get("/menudispo/:placeId", async (req: Request, res: Response) => {
  try {
    const { placeId } = req.params;
    const categories = await prisma.menuCategory.findMany({
      where: { placeId: parseInt(placeId) },
      orderBy: { priority: "asc" },
    });
    const items = await prisma.menuItem.findMany({
      where: {
        disponibleProduct: "oui",
        menuCategory: {
          placeId: parseInt(placeId),
        },
      },
      orderBy: { priority: "asc" },
    });
    res.json({ categories, items });
  } catch (error) {
    console.error("Error fetching menu:", error);
    res.status(500).json({ error: "Failed to fetch menu" });
  }
});

// Get menu items by category
mysqlApiRouter.get("/menu-items/:categoryId", async (req: Request, res: Response) => {
  try {
    const { categoryId } = req.params;
    const items = await prisma.menuItem.findMany({
      where: { menuCategoryId: parseInt(categoryId) },
      orderBy: { priority: "asc" },
    });
    res.json(items);
  } catch (error) {
    console.error("Error fetching menu items:", error);
    res.status(500).json({ error: "Failed to fetch menu items" });
  }
});

// Create menu category
mysqlApiRouter.post("/menu-categories", async (req: Request, res: Response) => {
  try {
    const { placeId, title } = req.body;

    const category = await prisma.menuCategory.create({
      data: {
        placeId: parseInt(placeId),
        title: title || "Untitled",
        priority: 999,
      },
    });

    res.status(201).json(category);
  } catch (error) {
    console.error("Error creating menu category:", error);
    res.status(500).json({ error: "Failed to create menu category" });
  }
});

// Update menu category
mysqlApiRouter.patch("/menu-categories/:categoryId", async (req: Request, res: Response) => {
  try {
    const { categoryId } = req.params;
    const { title, priority } = req.body;
    const parsedCategoryId = parseInt(categoryId, 10);

    if (!Number.isFinite(parsedCategoryId)) {
      return res.status(400).json({ error: "Invalid categoryId" });
    }

    const data: any = {};
    if (title !== undefined) data.title = title;
    if (priority !== undefined) data.priority = priority;

    const category = await prisma.menuCategory.update({
      where: { menuCategoryId: parsedCategoryId },
      data,
    });

    res.json(category);
  } catch (error) {
    console.error("Error updating menu category:", error);
    res.status(500).json({ error: "Failed to update menu category" });
  }
});

// Delete menu category
mysqlApiRouter.delete("/menu-categories/:categoryId", async (req: Request, res: Response) => {
  try {
    const { categoryId } = req.params;
    const parsedCategoryId = parseInt(categoryId, 10);

    if (!Number.isFinite(parsedCategoryId)) {
      return res.status(400).json({ error: "Invalid categoryId" });
    }

    // Delete all items in this category first
    await prisma.menuItem.deleteMany({
      where: { menuCategoryId: parsedCategoryId },
    });

    // Delete the category
    await prisma.menuCategory.delete({
      where: { menuCategoryId: parsedCategoryId },
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting menu category:", error);
    res.status(500).json({ error: "Failed to delete menu category" });
  }
});

// Create menu item
mysqlApiRouter.post("/menu-items", async (req: Request, res: Response) => {
  try {
    const { menuCategoryId, title, description, price } = req.body;

    const item = await prisma.menuItem.create({
      data: {
        menuCategoryId: parseInt(menuCategoryId),
        title: title || "Untitled",
        description: description || "",
        price: price || 0,

        priority: 999,
      },
    });

    res.status(201).json(item);
  } catch (error) {
    console.error("Error creating menu item:", error);
    res.status(500).json({ error: "Failed to create menu item" });
  }
});

// Update menu item
mysqlApiRouter.patch("/menu-items/:itemId", async (req: Request, res: Response) => {
  try {
    const { itemId } = req.params;
    const { title, description, price, menuCategoryId, image_src, label, disponibleProduct } = req.body;
    const parsedItemId = parseInt(itemId, 10);

    if (!Number.isFinite(parsedItemId)) {
      return res.status(400).json({ error: "Invalid itemId" });
    }

    const data: any = {};
    if (title !== undefined) data.title = title;
    if (description !== undefined) data.description = description;
    if (price !== undefined) data.price = price;
    if (image_src !== undefined) data.img = image_src;
    if (label !== undefined) data.label = label;
    if (menuCategoryId !== undefined) data.menuCategoryId = parseInt(menuCategoryId);
    if (disponibleProduct !== undefined) data.disponibleProduct = disponibleProduct;

    const item = await prisma.menuItem.update({
      where: { menuItemId: parsedItemId },
      data,
    });

    res.json(item);
  } catch (error) {
    console.error("Error updating menu item:", error);
    res.status(500).json({ error: "Failed to update menu item" });
  }
});

// Delete menu item
mysqlApiRouter.delete("/menu-items/:itemId", async (req: Request, res: Response) => {
  try {
    const { itemId } = req.params;
    const parsedItemId = parseInt(itemId, 10);

    if (!Number.isFinite(parsedItemId)) {
      return res.status(400).json({ error: "Invalid itemId" });
    }

    await prisma.menuItem.delete({
      where: { menuItemId: parsedItemId },
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting menu item:", error);
    res.status(500).json({ error: "Failed to delete menu item" });
  }
});

// ============ PROMOS API ============

// Get active promo codes for a place
mysqlApiRouter.get("/promos/:placeId", async (req: Request, res: Response) => {
  try {
    const { placeId } = req.params;
    const now = new Date();
    const promos = await prisma.promoCode.findMany({
      where: {
        placeId: parseInt(placeId),
        status: 1,
        startsAt: { lte: now },
        expiresAt: { gte: now },
      },
    });
    res.json(promos);
  } catch (error) {
    console.error("Error fetching promos:", error);
    res.status(500).json({ error: "Failed to fetch promos" });
  }
});

// Validate and apply promo code
mysqlApiRouter.post("/promos/validate", async (req: Request, res: Response) => {
  try {
    const { placeId, code, orderAmount } = req.body;
    const now = new Date();
    const promo = await prisma.promoCode.findFirst({
      where: {
        placeId: parseInt(placeId),
        code: code.toUpperCase(),
        status: 1,
        startsAt: { lte: now },
        expiresAt: { gte: now },
      },
    });

    if (!promo) {
      return res.status(404).json({ error: "Invalid or expired promo code" });
    }

    if (orderAmount < promo.minOrderAmount.toNumber()) {
      return res.status(400).json({
        error: `Minimum order amount: ${promo.minOrderAmount}`,
      });
    }

    let discount = 0;
    if (promo.discountType === "percent") {
      discount = (orderAmount * promo.discountValue.toNumber()) / 100;
    } else {
      discount = promo.discountValue.toNumber();
    }

    res.json({
      code: promo.code,
      discountType: promo.discountType,
      discountValue: promo.discountValue,
      discount,
      description: promo.description,
    });
  } catch (error) {
    console.error("Error validating promo:", error);
    res.status(500).json({ error: "Failed to validate promo" });
  }
});

// Create promo code
mysqlApiRouter.post("/promos", async (req: Request, res: Response) => {
  try {
    const { placeId, code, discountType, discountValue, description, startsAt, expiresAt, minOrderAmount } = req.body;

    const promo = await prisma.promoCode.create({
      data: {
        placeId: parseInt(placeId),
        code: code.toUpperCase(),
        discountType: discountType || "percent",
        discountValue: parseFloat(String(discountValue || 0)),
        description: description || "",
        startsAt: startsAt ? new Date(startsAt) : new Date(),
        expiresAt: expiresAt ? new Date(expiresAt) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        minOrderAmount: parseFloat(String(minOrderAmount || 0)),
        status: 1,
      },
    });

    res.status(201).json(promo);
  } catch (error) {
    console.error("Error creating promo:", error);
    res.status(500).json({ error: "Failed to create promo" });
  }
});

// Update promo code
mysqlApiRouter.patch("/promos/:promoId", async (req: Request, res: Response) => {
  try {
    const { promoId } = req.params;
    const { discountType, discountValue, description, startsAt, expiresAt, minOrderAmount, status } = req.body;

    const data: any = {};
    if (discountType !== undefined) data.discountType = discountType;
    if (discountValue !== undefined) data.discountValue = parseFloat(String(discountValue));
    if (description !== undefined) data.description = description;
    if (startsAt !== undefined) data.startsAt = new Date(startsAt);
    if (expiresAt !== undefined) data.expiresAt = new Date(expiresAt);
    if (minOrderAmount !== undefined) data.minOrderAmount = parseFloat(String(minOrderAmount));
    if (status !== undefined) data.status = parseInt(String(status));
    data.updatedAt = new Date();

    const promo = await prisma.promoCode.update({
      where: { id: parseInt(promoId) },
      data,
    });

    res.json(promo);
  } catch (error) {
    console.error("Error updating promo:", error);
    res.status(500).json({ error: "Failed to update promo" });
  }
});

// Delete promo code
mysqlApiRouter.delete("/promos/:promoId", async (req: Request, res: Response) => {
  try {
    const { promoId } = req.params;

    await prisma.promoCode.delete({
      where: { id: parseInt(promoId) },
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting promo:", error);
    res.status(500).json({ error: "Failed to delete promo" });
  }
});

// ============ PLACES API ============

// Get place by slug (for public menu: /api/mysql/places/by-slug/sur-la-table)
mysqlApiRouter.get("/places/by-slug/:slug", async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;

    const place = await prisma.place.findFirst({
      where: { slug },
      include: {
        client: {
          select: {
            clientId: true,
            name: true,
            email: true,
          },
        },
        place_contacts: true,
      },
    });

    if (!place) {
      return res.status(404).json({ error: "Establishment not found" });
    }

    res.json(place);
  } catch (error) {
    console.error("Error fetching place by slug:", error);
    res.status(500).json({ error: "Failed to fetch establishment" });
  }
});

// Get place details
mysqlApiRouter.get("/places/:placeId", async (req: Request, res: Response) => {
  try {
    const { placeId } = req.params;
    const place = await prisma.place.findUnique({
      where: { placeId: parseInt(placeId) },
      include: { client: true },
    });

    if (!place) {
      return res.status(404).json({ error: "Place not found" });
    }

    res.json(place);
  } catch (error) {
    console.error("Error fetching place:", error);
    res.status(500).json({ error: "Failed to fetch place" });
  }
});

// Update place details
mysqlApiRouter.patch("/places/:placeId", async (req: Request, res: Response) => {
  try {
    const { placeId } = req.params;
    const {
      name,
      slogan,
      city,
      address,
      phoneOrder,
      latitude,
      langitude,
      geoFenceEnabled,
      geoFenceRadiusMeters,
    } = req.body;

    const data: any = {};
    if (name !== undefined) data.name = name;
    if (slogan !== undefined) data.slogan = slogan;
    if (city !== undefined) data.city = city;
    if (address !== undefined) data.address = address;
    if (phoneOrder !== undefined) data.phoneOrder = phoneOrder;
    if (latitude !== undefined) data.latitude = latitude;
    if (langitude !== undefined) data.langitude = langitude;
    if (geoFenceEnabled !== undefined) data.geoFenceEnabled = geoFenceEnabled;
    if (geoFenceRadiusMeters !== undefined) data.geoFenceRadiusMeters = geoFenceRadiusMeters;
    data.updatedAt = new Date();

    const place = await prisma.place.update({
      where: { placeId: parseInt(placeId) },
      data,
      include: { client: true },
    });

    res.json(place);
  } catch (error) {
    console.error("Error updating place:", error);
    res.status(500).json({ error: "Failed to update place" });
  }
});
mysqlApiRouter.patch("/places/logo/:placeId", async (req: Request, res: Response) => {
  try {
    const { placeId } = req.params;
    const {
      logo
    } = req.body;

    const data: any = {};
    if (logo !== undefined) data.logo = logo;
    data.updatedAt = new Date();

    const place = await prisma.place.update({
      where: { placeId: parseInt(placeId) },
      data,
      include: { client: true },
    });

    res.json(place);
  } catch (error) {
    console.error("Error updating place:", error);
    res.status(500).json({ error: "Failed to update place" });
  }
});
// Get all places for a client
mysqlApiRouter.get("/places/client/:clientId", async (req: Request, res: Response) => {
  try {
    const { clientId } = req.params;
    const places = await prisma.place.findMany({
      where: { clientId: parseInt(clientId) },
    });
    res.json(places);
  } catch (error) {
    console.error("Error fetching places:", error);
    res.status(500).json({ error: "Failed to fetch places" });
  }
});

// Get all orders for a client (across all their places)
mysqlApiRouter.post(
  "/orders/client/:clientId",
  async (req: Request, res: Response) => {
    try {
      const clientId = Number(req.params.clientId);
      const { startDate, endDate } = req.body;

      if (!Number.isFinite(clientId)) {
        return res.status(400).json({ error: "Invalid clientId" });
      }

      // Get places for this client
      const places = await prisma.place.findMany({
        where: { clientId },
        select: { placeId: true },
      });

      const placeIds = places.map(p => p.placeId);

      if (placeIds.length === 0) {
        return res.json([]);
      }

      const where: any = {
        placeId: { in: placeIds },
      };

      if (startDate) {
        where.dateCreation = { gte: new Date(startDate) };
      }

      if (endDate) {
        where.dateCreation = {
          ...(where.dateCreation ?? {}),
          lte: new Date(endDate),
        };
      }

      const orders = await prisma.commande.findMany({
        where,
        include: {
          commandeProducts: { include: { menuItem: true } },
        },
        orderBy: { dateCreation: "desc" },
        take: 500,
      });

      res.json(orders);
    } catch (error) {
      console.error("Error fetching client orders:", error);
      res.status(500).json({ error: "Failed to fetch orders" });
    }
  }
);

// ============ PARTICIPANTS API ============

// Add participant to order
mysqlApiRouter.post("/participants", async (req: Request, res: Response) => {
  try {
    const { commandeId, sessionId, firstName } = req.body;

    const participant = await prisma.participant.create({
      data: {
        id: uuidv4(),
        commandeId: parseInt(commandeId),
        sessionId,
        firstName: firstName || null,
      },
    });

    res.status(201).json(participant);
  } catch (error) {
    console.error("Error adding participant:", error);
    res.status(500).json({ error: "Failed to add participant" });
  }
});

// ============ PAYMENTS API ============

// Create payment record
mysqlApiRouter.post("/payments", async (req: Request, res: Response) => {
  try {
    const { commandeId, amount, paymentMethod, transactionId } = req.body;
    const payment = await prisma.payment.create({
      data: {
        id: uuidv4(),
        commandeId: parseInt(commandeId),
        amount,
        paymentMethod,
        transactionId,
        status: "pending",
      },
    });
    res.status(201).json(payment);
  } catch (error) {
    console.error("Error creating payment:", error);
    res.status(500).json({ error: "Failed to create payment" });
  }
});

// Update payment status
mysqlApiRouter.patch("/payments/:paymentId", async (req: Request, res: Response) => {
  try {
    const { paymentId } = req.params;
    const { status } = req.body;
    const payment = await prisma.payment.update({
      where: { id: paymentId },
      data: { status },
    });
    res.json(payment);
  } catch (error) {
    console.error("Error updating payment:", error);
    res.status(500).json({ error: "Failed to update payment" });
  }
});

// ============ QR TABLES API ============

// Get all QR tables for a place
mysqlApiRouter.get("/qr-tables/:placeId", async (req: Request, res: Response) => {
  try {
    const { placeId } = req.params;
    const tables = await prisma.qrTable.findMany({
      where: { placeId: parseInt(placeId) },
      orderBy: { tableNumber: "asc" },
    });
    res.json(tables);
  } catch (error) {
    console.error("Error fetching QR tables:", error);
    res.status(500).json({ error: "Failed to fetch QR tables" });
  }
});

// Create a new QR table
mysqlApiRouter.post("/qr-tables", async (req: Request, res: Response) => {
  try {
    const { placeId, tableNumber, qrCode, slug } = req.body;

    // Use provided QR code or default to empty string (will be generated client-side)
    const finalQrCode = qrCode || ""; // Must not be null

    const table = await prisma.qrTable.create({
      data: {
        id: uuidv4(),
        placeId: parseInt(placeId),
        tableNumber: parseInt(tableNumber),
        qrCode: finalQrCode,
      },
    });

    res.status(201).json(table);
  } catch (error) {
    console.error("Error creating QR table:", error);
    res.status(500).json({ error: "Failed to create QR table" });
  }
});

// Update a QR table
mysqlApiRouter.patch("/qr-tables/:tableId", async (req: Request, res: Response) => {
  try {
    const { tableId } = req.params;
    const { tableNumber, qrCode, isActive } = req.body;

    const data: any = {};
    if (tableNumber !== undefined) data.tableNumber = tableNumber;
    if (qrCode !== undefined) {
      // Only update if qrCode is provided and not empty
      if (qrCode && qrCode.trim()) {
        data.qrCode = qrCode;
      }
    }
    if (isActive !== undefined) data.isActive = isActive;

    // If no updates, just return the existing table
    if (Object.keys(data).length === 0) {
      const table = await prisma.qrTable.findUnique({
        where: { id: tableId },
      });
      return res.json(table);
    }

    const table = await prisma.qrTable.update({
      where: { id: tableId },
      data,
    });

    res.json(table);
  } catch (error) {
    console.error("Error updating QR table:", error);
    res.status(500).json({ error: "Failed to update QR table" });
  }
});

// Delete a QR table
mysqlApiRouter.delete("/qr-tables/:tableId", async (req: Request, res: Response) => {
  try {
    const { tableId } = req.params;
    await prisma.qrTable.delete({
      where: { id: tableId },
    });
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting QR table:", error);
    res.status(500).json({ error: "Failed to delete QR table" });
  }
});

// ============ NOTIFICATIONS API ============

// Get all notifications for a place
mysqlApiRouter.get("/notifications/:placeId", async (req: Request, res: Response) => {
  try {
    const { placeId } = req.params;
    const { status } = req.query;

    const where: any = { placeId: parseInt(placeId) };
    if (status) where.status = status;

    const notifications = await prisma.tableNotification.findMany({
      where,
      include: { commande: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    res.json(notifications);
  } catch (error) {
    console.error("Error fetching notifications:", error);
    res.status(500).json({ error: "Failed to fetch notifications" });
  }
});

// Get notification by ID
mysqlApiRouter.get("/notifications/by-id/:notificationId", async (req: Request, res: Response) => {
  try {
    const { notificationId } = req.params;

    const notification = await prisma.tableNotification.findUnique({
      where: { id: notificationId },
      include: { commande: true },
    });

    if (!notification) {
      return res.status(404).json({ error: "Notification not found" });
    }

    res.json(notification);
  } catch (error) {
    console.error("Error fetching notification:", error);
    res.status(500).json({ error: "Failed to fetch notification" });
  }
});

// Create a notification (Serveur/Addition request)
// commandeId is optional - customer can call for serveur/addition without an active order
mysqlApiRouter.post("/notifications", async (req: Request, res: Response) => {
  try {
    const { commandeId, placeId, tableNumber, type, message, priority } = req.body;

    if (!placeId || !type) {
      return res.status(400).json({ error: "Missing required fields: placeId, type" });
    }

    const notification = await prisma.tableNotification.create({
      data: {
        id: uuidv4(),
        commandeId: commandeId ? parseInt(commandeId) : null,
        placeId: parseInt(placeId),
        tableNumber: tableNumber || 0,
        type, // 'serveur','addition','chef','paiement'
        message: message || null,
        priority: priority || "normal", // 'low','normal','high','urgent'
        status: "pending",
      },
      include: { commande: true },
    });

    res.status(201).json(notification);
  } catch (error) {
    console.error("Error creating notification:", error);
    res.status(500).json({ error: "Failed to create notification" });
  }
});

// Update notification status (acknowledge/complete)
mysqlApiRouter.patch("/notifications/:notificationId", async (req: Request, res: Response) => {
  try {
    const { notificationId } = req.params;
    const { status, acknowledgedAt, completedAt } = req.body;

    const data: any = {};
    if (status !== undefined) data.status = status;
    if (status === "acknowledged" && acknowledgedAt === undefined) {
      data.acknowledgedAt = new Date();
    } else if (acknowledgedAt !== undefined) {
      data.acknowledgedAt = acknowledgedAt;
    }

    if (status === "completed" && completedAt === undefined) {
      data.completedAt = new Date();
    } else if (completedAt !== undefined) {
      data.completedAt = completedAt;
    }

    const notification = await prisma.tableNotification.update({
      where: { id: notificationId },
      data,
      include: { commande: true },
    });

    res.json(notification);
  } catch (error) {
    console.error("Error updating notification:", error);
    res.status(500).json({ error: "Failed to update notification" });
  }
});

// Delete notification
mysqlApiRouter.delete("/notifications/:notificationId", async (req: Request, res: Response) => {
  try {
    const { notificationId } = req.params;

    await prisma.tableNotification.delete({
      where: { id: notificationId },
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting notification:", error);
    res.status(500).json({ error: "Failed to delete notification" });
  }
});

// ============ TABLE CARTS API ============

// Get all carts for a table
mysqlApiRouter.get("/table-carts/:placeId/:tableNumber", async (req: Request, res: Response) => {
  try {
    const { placeId, tableNumber } = req.params;
    const carts = await prisma.tableCart.findMany({
      where: {
        placeId: parseInt(placeId),
        tableNumber: parseInt(tableNumber),
      },
      include: { menuItem: true },
      orderBy: { createdAt: "desc" },
    });
    res.json(carts);
  } catch (error) {
    console.error("Error fetching table carts:", error);
    res.status(500).json({ error: "Failed to fetch table carts" });
  }
});

// Add item to cart
mysqlApiRouter.post("/table-carts", async (req: Request, res: Response) => {
  try {
    const { placeId, tableNumber, menuItemId, sessionId, firstName, quantity, price, comment, categoryId } = req.body;

    // Check if this item already exists in cart for this session
    const existing = await prisma.tableCart.findFirst({
      where: {
        placeId: parseInt(placeId),
        tableNumber: parseInt(tableNumber),
        menuItemId: parseInt(menuItemId),
        sessionId,
        comment: comment || null,
      },
    });

    if (existing) {
      // Update quantity
      const updated = await prisma.tableCart.update({
        where: { id: existing.id },
        data: { quantity: existing.quantity + (quantity || 1) },
        include: { menuItem: true },
      });
      return res.status(201).json(updated);
    }

    // Create new cart item
    const cart = await prisma.tableCart.create({
      data: {
        placeId: parseInt(placeId),
        tableNumber: parseInt(tableNumber),
        menuItemId: parseInt(menuItemId),
        sessionId,
        firstName: firstName || null,
        quantity: quantity || 1,
        price: parseFloat(price),
        comment: comment || null,
        categoryId: categoryId || "",
      },
      include: { menuItem: true },
    });

    res.status(201).json(cart);
  } catch (error) {
    console.error("Error adding to cart:", error);
    res.status(500).json({ error: "Failed to add to cart" });
  }
});

// Update cart item quantity
mysqlApiRouter.patch("/table-carts/:cartId", async (req: Request, res: Response) => {
  try {
    const { cartId } = req.params;
    const { quantity, comment, categoryId } = req.body;

    const data: any = {};
    if (quantity !== undefined) data.quantity = Math.max(0, parseInt(quantity));
    if (comment !== undefined) data.comment = comment;
    if (categoryId !== undefined) data.categoryId = categoryId;

    const cart = await prisma.tableCart.update({
      where: { id: parseInt(cartId) },
      data,
      include: { menuItem: true },
    });

    res.json(cart);
  } catch (error) {
    console.error("Error updating cart:", error);
    res.status(500).json({ error: "Failed to update cart" });
  }
});

// Delete cart item
mysqlApiRouter.delete("/table-carts/:cartId", async (req: Request, res: Response) => {
  try {
    const { cartId } = req.params;
    await prisma.tableCart.delete({
      where: { id: parseInt(cartId) },
    });
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting from cart:", error);
    res.status(500).json({ error: "Failed to delete from cart" });
  }
});

// Check if table has active carts (created within 15 minutes)
mysqlApiRouter.get("/table-carts/:placeId/:tableNumber/active", async (req: Request, res: Response) => {
  try {
    const { placeId, tableNumber } = req.params;
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);

    const activeCarts = await prisma.tableCart.findMany({
      where: {
        placeId: parseInt(placeId),
        tableNumber: parseInt(tableNumber),
        createdAt: {
          gte: fifteenMinutesAgo,
        },
        quantity: {
          gt: 0,
        },
      },
      include: { menuItem: true },
      orderBy: { createdAt: "desc" },
    });

    res.json({
      hasActive: activeCarts.length > 0,
      count: activeCarts.length,
      items: activeCarts,
    });
  } catch (error) {
    console.error("Error checking active carts:", error);
    res.status(500).json({ error: "Failed to check active carts" });
  }
});

// Clear all carts for a table/session
mysqlApiRouter.post("/table-carts/:placeId/:tableNumber/clear", async (req: Request, res: Response) => {
  try {
    const { placeId, tableNumber } = req.params;
    const { sessionId } = req.body;

    const deleted = await prisma.tableCart.deleteMany({
      where: {
        placeId: parseInt(placeId),
        tableNumber: parseInt(tableNumber),
        ...(sessionId ? { sessionId } : {}),
      },
    });

    res.json({ deleted: deleted.count });
  } catch (error) {
    console.error("Error clearing carts:", error);
    res.status(500).json({ error: "Failed to clear carts" });
  }
});

// ============ PLACE CONTACTS API ============

// Get all contacts for a place
mysqlApiRouter.get("/places/:placeId/contacts", async (req: Request, res: Response) => {
  try {
    const { placeId } = req.params;
    const parsedPlaceId = parseInt(placeId);

    if (!Number.isFinite(parsedPlaceId)) {
      return res.status(400).json({ error: "Invalid placeId" });
    }

    const contacts = await prisma.place_contact.findMany({
      where: { place_id: parsedPlaceId },
      orderBy: { place_contact_id: "asc" },
    });

    res.json(contacts);
  } catch (error) {
    console.error("Error fetching place contacts:", error);
    res.status(500).json({ error: "Failed to fetch contacts" });
  }
});

// Create a new contact for a place
mysqlApiRouter.post("/places/:placeId/contacts", async (req: Request, res: Response) => {
  try {
    const { placeId } = req.params;
    const { key, value } = req.body;

    const parsedPlaceId = parseInt(placeId);

    if (!Number.isFinite(parsedPlaceId)) {
      return res.status(400).json({ error: "Invalid placeId" });
    }

    if (!key || !value) {
      return res.status(400).json({ error: "Key and value are required" });
    }

    const contact = await prisma.place_contact.create({
      data: {
        place_id: parsedPlaceId,
        key: key.trim(),
        value: value.trim(),
      },
    });

    res.status(201).json(contact);
  } catch (error) {
    console.error("Error creating place contact:", error);
    res.status(500).json({ error: "Failed to create contact" });
  }
});

// Delete a contact
mysqlApiRouter.delete("/places/:placeId/contacts/:contactId", async (req: Request, res: Response) => {
  try {
    const { placeId, contactId } = req.params;

    const parsedPlaceId = parseInt(placeId);
    const parsedContactId = parseInt(contactId);

    if (!Number.isFinite(parsedPlaceId) || !Number.isFinite(parsedContactId)) {
      return res.status(400).json({ error: "Invalid placeId or contactId" });
    }

    // Verify the contact belongs to this place
    const contact = await prisma.place_contact.findUnique({
      where: { place_contact_id: parsedContactId },
    });

    if (!contact || contact.place_id !== parsedPlaceId) {
      return res.status(404).json({ error: "Contact not found" });
    }

    await prisma.place_contact.delete({
      where: { place_contact_id: parsedContactId },
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting place contact:", error);
    res.status(500).json({ error: "Failed to delete contact" });
  }
});

// ============ MENU ITEM VOTING API ============

// Vote for a menu item
mysqlApiRouter.post("/menu-items/:menuItemId/vote", async (req: Request, res: Response) => {
  try {
    const { menuItemId } = req.params;
    const { placeId, categoryId } = req.body;

    // Validate inputs
    const parsedMenuItemId = parseInt(menuItemId);
    const parsedPlaceId = placeId ? parseInt(placeId) : 0;
    const parsedCategoryId = categoryId ? parseInt(categoryId) : 0;

    if (!Number.isFinite(parsedMenuItemId) || parsedMenuItemId <= 0) {
      return res.status(400).json({ error: "Invalid menuItemId" });
    }

    // Get user IP address
    const userIp = (req.headers["x-forwarded-for"] as string)?.split(",")[0].trim() ||
      (req.socket?.remoteAddress as string) ||
      "unknown";

    // Check if user has already voted for this item
    const existingVote = await prisma.voteMenu.findFirst({
      where: {
        userIp,
        idMenu: parsedMenuItemId,
        placeId: parsedPlaceId,
      },
    });

    if (existingVote) {
      return res.status(400).json({
        error: "Vous avez déjà voté pour ce plat",
        alreadyVoted: true,
        votes: (await prisma.menuItem.findUnique({ where: { menuItemId: parsedMenuItemId }, select: { votes: true } }))?.votes || 0,
      });
    }

    // Create vote record
    const timestamp = Math.floor(Date.now() / 1000);
    await prisma.voteMenu.create({
      data: {
        userIp,
        idMenu: parsedMenuItemId,
        placeId: parsedPlaceId,
        catId: parsedCategoryId,
        dateCreation: timestamp,
      },
    });

    // Increment the votes count
    const updatedMenuItem = await prisma.menuItem.update({
      where: { menuItemId: parsedMenuItemId },
      data: {
        votes: {
          increment: 1,
        },
      },
      select: { votes: true },
    });

    res.status(201).json({
      success: true,
      message: "Vote enregistré avec succès",
      votes: updatedMenuItem.votes,
    });
  } catch (error) {
    console.error("Error voting for menu item:", error);
    res.status(500).json({ error: "Failed to record vote" });
  }
});

// Get vote status for a menu item (check if user has voted)
mysqlApiRouter.get("/menu-items/:menuItemId/vote-status", async (req: Request, res: Response) => {
  try {
    const { menuItemId } = req.params;
    const { placeId } = req.query;

    const parsedMenuItemId = parseInt(menuItemId);
    const parsedPlaceId = placeId ? parseInt(placeId as string) : 0;

    if (!Number.isFinite(parsedMenuItemId) || parsedMenuItemId <= 0) {
      return res.status(400).json({ error: "Invalid menuItemId" });
    }

    // Get user IP
    const userIp = (req.headers["x-forwarded-for"] as string)?.split(",")[0].trim() ||
      (req.socket?.remoteAddress as string) ||
      "unknown";

    // Check if user has voted
    const hasVoted = await prisma.voteMenu.findFirst({
      where: {
        userIp,
        idMenu: parsedMenuItemId,
        placeId: parsedPlaceId,
      },
    });

    res.json({
      hasVoted: !!hasVoted,
    });
  } catch (error) {
    console.error("Error checking vote status:", error);
    res.status(500).json({ error: "Failed to check vote status" });
  }
});

// ============ QR CODE REVIEWS API ============

// Get all reviews for a place
mysqlApiRouter.get("/reviews/:placeId", async (req: Request, res: Response) => {
  try {
    const { placeId } = req.params;
    const parsedPlaceId = parseInt(placeId);

    if (!Number.isFinite(parsedPlaceId)) {
      return res.status(400).json({ error: "Invalid placeId" });
    }

    const reviews = await prisma.qrCodeReview.findMany({
      where: { placeId: parsedPlaceId },
      orderBy: { dateCreation: "desc" },
      take: 100,
    });

    res.json(reviews);
  } catch (error) {
    console.error("Error fetching reviews:", error);
    res.status(500).json({ error: "Failed to fetch reviews" });
  }
});

// Get review statistics for a place
mysqlApiRouter.get("/reviews/:placeId/stats", async (req: Request, res: Response) => {
  try {
    const { placeId } = req.params;
    const parsedPlaceId = parseInt(placeId);

    if (!Number.isFinite(parsedPlaceId)) {
      return res.status(400).json({ error: "Invalid placeId" });
    }

    const reviews = await prisma.qrCodeReview.findMany({
      where: { placeId: parsedPlaceId },
    });

    const totalReviews = reviews.length;
    const averageRating = totalReviews > 0 ? reviews.reduce((sum, r) => sum + r.note, 0) / totalReviews : 0;
    const ratingDistribution = {
      5: reviews.filter(r => r.note === 5).length,
      4: reviews.filter(r => r.note === 4).length,
      3: reviews.filter(r => r.note === 3).length,
      2: reviews.filter(r => r.note === 2).length,
      1: reviews.filter(r => r.note === 1).length,
    };

    res.json({
      totalReviews,
      averageRating: Math.round(averageRating * 10) / 10,
      ratingDistribution,
    });
  } catch (error) {
    console.error("Error fetching review stats:", error);
    res.status(500).json({ error: "Failed to fetch review statistics" });
  }
});

// Create a new review
mysqlApiRouter.post("/reviews", async (req: Request, res: Response) => {
  try {
    const { placeId, comment, note } = req.body;

    if (!placeId || note === undefined) {
      return res.status(400).json({ error: "Missing required fields: placeId, note" });
    }

    const parsedPlaceId = parseInt(placeId);
    const parsedNote = parseInt(note);

    if (!Number.isFinite(parsedPlaceId)) {
      return res.status(400).json({ error: "Invalid placeId" });
    }

    if (!Number.isFinite(parsedNote) || parsedNote < 1 || parsedNote > 5) {
      return res.status(400).json({ error: "Note must be between 1 and 5" });
    }

    const review = await prisma.qrCodeReview.create({
      data: {
        placeId: parsedPlaceId,
        comment: comment || "",
        note: parsedNote,
      },
    });

    res.status(201).json(review);
  } catch (error) {
    console.error("Error creating review:", error);
    res.status(500).json({ error: "Failed to create review" });
  }
});

// Delete a review
mysqlApiRouter.delete("/reviews/:reviewId", async (req: Request, res: Response) => {
  try {
    const { reviewId } = req.params;
    const parsedReviewId = parseInt(reviewId);

    if (!Number.isFinite(parsedReviewId)) {
      return res.status(400).json({ error: "Invalid reviewId" });
    }

    await prisma.qrCodeReview.delete({
      where: { id: parsedReviewId },
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting review:", error);
    res.status(500).json({ error: "Failed to delete review" });
  }
});

// ============ HEALTH CHECK ============

mysqlApiRouter.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", database: "mysql", tables: "commandes, table_notifications, table_carts" });
});

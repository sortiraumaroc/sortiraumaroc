import { Router, Request, Response } from "express";
import bcrypt from "bcrypt";
import prisma from "../lib/prisma";

export const migratePasswordsRouter = Router();

// Helper: Check if a string is a bcrypt hash
function isBcryptHash(str: string): boolean {
  return /^\$2[aby]\$\d+\$/.test(str);
}

// Endpoint: Migrate all plaintext passwords to bcrypt
migratePasswordsRouter.post("/migrate-admin-passwords", async (req: Request, res: Response) => {
  try {
    const adminUsers = await prisma.admin.findMany();
    
    let migratedCount = 0;
    const results = [];

    for (const admin of adminUsers) {
      if (!isBcryptHash(admin.password)) {
        // Password is plaintext, hash it
        const hashedPassword = await bcrypt.hash(admin.password, 10);
        await prisma.admin.update({
          where: { adminId: admin.adminId },
          data: { password: hashedPassword },
        });
        migratedCount++;
        results.push({
          adminId: admin.adminId,
          email: admin.email,
          status: "migrated",
        });
      } else {
        results.push({
          adminId: admin.adminId,
          email: admin.email,
          status: "already_hashed",
        });
      }
    }

    res.json({
      success: true,
      message: `Migrated ${migratedCount} admin password(s) to bcrypt`,
      totalAdmins: adminUsers.length,
      migratedCount,
      details: results,
    });
  } catch (error) {
    console.error("Admin password migration error:", error);
    res.status(500).json({
      error: "Failed to migrate admin passwords",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

migratePasswordsRouter.post("/migrate-client-passwords", async (req: Request, res: Response) => {
  try {
    const clientUsers = await prisma.client.findMany();
    
    let migratedCount = 0;
    const results = [];

    for (const client of clientUsers) {
      if (!isBcryptHash(client.password)) {
        // Password is plaintext, hash it
        const hashedPassword = await bcrypt.hash(client.password, 10);
        await prisma.client.update({
          where: { clientId: client.clientId },
          data: { password: hashedPassword },
        });
        migratedCount++;
        results.push({
          clientId: client.clientId,
          email: client.email,
          name: `${client.nom} ${client.prenom}`,
          status: "migrated",
        });
      } else {
        results.push({
          clientId: client.clientId,
          email: client.email,
          name: `${client.nom} ${client.prenom}`,
          status: "already_hashed",
        });
      }
    }

    res.json({
      success: true,
      message: `Migrated ${migratedCount} client password(s) to bcrypt`,
      totalClients: clientUsers.length,
      migratedCount,
      details: results,
    });
  } catch (error) {
    console.error("Client password migration error:", error);
    res.status(500).json({
      error: "Failed to migrate client passwords",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

// Endpoint: Migrate both admin and client passwords
migratePasswordsRouter.post("/migrate-all-passwords", async (req: Request, res: Response) => {
  try {
    const adminUsers = await prisma.admin.findMany();
    const clientUsers = await prisma.client.findMany();

    let adminMigratedCount = 0;
    let clientMigratedCount = 0;

    // Migrate admin passwords
    for (const admin of adminUsers) {
      if (!isBcryptHash(admin.password)) {
        const hashedPassword = await bcrypt.hash(admin.password, 10);
        await prisma.admin.update({
          where: { adminId: admin.adminId },
          data: { password: hashedPassword },
        });
        adminMigratedCount++;
      }
    }

    // Migrate client passwords
    for (const client of clientUsers) {
      if (!isBcryptHash(client.password)) {
        const hashedPassword = await bcrypt.hash(client.password, 10);
        await prisma.client.update({
          where: { clientId: client.clientId },
          data: { password: hashedPassword },
        });
        clientMigratedCount++;
      }
    }

    res.json({
      success: true,
      message: "Password migration complete",
      stats: {
        admins: {
          total: adminUsers.length,
          migrated: adminMigratedCount,
        },
        clients: {
          total: clientUsers.length,
          migrated: clientMigratedCount,
        },
      },
    });
  } catch (error) {
    console.error("Password migration error:", error);
    res.status(500).json({
      error: "Failed to migrate passwords",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

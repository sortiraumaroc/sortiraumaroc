import { useEffect } from "react";
import { Outlet } from "react-router-dom";

import { AdminKeyGate } from "@/components/admin/AdminKeyGate";
import { AdminLayout } from "@/components/admin/layout/AdminLayout";

// Préchargement des pages admin les plus utilisées
const preloadAdminPages = () => {
  // Pages prioritaires (chargées immédiatement)
  const priorityPages = [
    () => import("./admin/AdminUsersPage"),
    () => import("./admin/AdminProsPage"),
    () => import("./admin/AdminEstablishmentsPage"),
    () => import("./admin/AdminReservationsPage"),
    () => import("./admin/AdminPaymentsPage"),
    () => import("./admin/AdminSupportPage"),
    () => import("./admin/AdminImportExportPage"),
  ];

  // Pages secondaires (chargées après un délai)
  const secondaryPages = [
    () => import("./admin/AdminContentPage"),
    () => import("./admin/AdminSettingsPage"),
    () => import("./admin/AdminCollaboratorsPage"),
    () => import("./admin/AdminVisibilityPage"),
    () => import("./admin/AdminMediaFactoryJobsPage"),
    () => import("./admin/AdminPartnersPage"),
    () => import("./admin/AdminLogsPage"),
    () => import("./admin/emails/AdminEmailsTemplatesPage"),
    () => import("./admin/emails/AdminEmailsCampaignsPage"),
  ];

  // Charger les pages prioritaires immédiatement
  priorityPages.forEach((load) => {
    load().catch(() => {
      // Ignorer les erreurs de préchargement
    });
  });

  // Charger les pages secondaires après 1 seconde
  setTimeout(() => {
    secondaryPages.forEach((load) => {
      load().catch(() => {
        // Ignorer les erreurs de préchargement
      });
    });
  }, 1000);
};

export default function Admin() {
  // Précharger les pages admin une seule fois au montage
  useEffect(() => {
    preloadAdminPages();
  }, []);

  return (
    <AdminKeyGate>
      {({ signOut }) => (
        <AdminLayout onSignOut={signOut}>
          <Outlet />
        </AdminLayout>
      )}
    </AdminKeyGate>
  );
}

import "./global.css";
import "./styles/utilities.css";

import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { AppShell } from "@/components/app-shell";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CartProvider } from "@/state/cart-store";

import Index from "@/pages/Index";
import Menu from "@/pages/Menu";
import OrderConfirmation from "@/pages/OrderConfirmation";
import NotFound from "@/pages/NotFound";

import { ProProtectedRoute } from "@/components/pro/protected-route";
import { SuperadminProtectedRoute } from "@/components/superadmin/protected-route";

import ProDashboard from "@/pages/pro/Dashboard";
import ProForcePassword from "@/pages/pro/ForcePassword";
import ProLogin from "@/pages/pro/Login";
import ProForgotPassword from "@/pages/pro/ForgotPassword";
import ProResetPassword from "@/pages/pro/ResetPassword";
import ProMenu from "@/pages/pro/Menu";
import ProNotifications from "@/pages/pro/Notifications";
import ProPayments from "@/pages/pro/Payments";
import ProPromos from "@/pages/pro/Promos";
import ProReviews from "@/pages/pro/Reviews";
import ProSettings from "@/pages/pro/Settings";
import ProTables from "@/pages/pro/Tables";
import ProVisibility from "@/pages/pro/Visibility";

import SuperadminDashboard from "@/pages/superadmin/Dashboard";
import SuperadminForcePassword from "@/pages/superadmin/ForcePassword";
import SuperadminLogin from "@/pages/superadmin/Login";
import SuperadminAccounts from "@/pages/superadmin/Accounts";
import SuperadminPayments from "@/pages/superadmin/Payments";
import SuperadminSupport from "@/pages/superadmin/Support";
import SuperadminFaq from "@/pages/superadmin/Faq";
import SuperadminLogs from "@/pages/superadmin/Logs";
import SuperadminSettings from "@/pages/superadmin/Settings";

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <CartProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <AppShell>
                <Routes>
                  <Route path="/" element={<Index />} />
                  <Route path="/menu" element={<Menu />} />
                  <Route path="/:slug/menu" element={<Menu />} />

                  <Route path="/pro" element={<Navigate to="/pro/dashboard" replace />} />
                  <Route path="/pro/login" element={<ProLogin />} />
                  <Route path="/pro/forgot-password" element={<ProForgotPassword />} />
                  <Route path="/pro/reset-password" element={<ProResetPassword />} />
                  <Route
                    path="/pro/force-password"
                    element={
                      <ProProtectedRoute>
                        <ProForcePassword />
                      </ProProtectedRoute>
                    }
                  />
                  <Route
                    path="/pro/dashboard"
                    element={
                      <ProProtectedRoute>
                        <ProDashboard />
                      </ProProtectedRoute>
                    }
                  />
                  <Route
                    path="/pro/menu"
                    element={
                      <ProProtectedRoute>
                        <ProMenu />
                      </ProProtectedRoute>
                    }
                  />
                  <Route
                    path="/pro/tables"
                    element={
                      <ProProtectedRoute>
                        <ProTables />
                      </ProProtectedRoute>
                    }
                  />
                  <Route
                    path="/:slug/pro/tables"
                    element={
                      <ProProtectedRoute>
                        <ProTables />
                      </ProProtectedRoute>
                    }
                  />
                  <Route
                    path="/pro/payments"
                    element={
                      <ProProtectedRoute>
                        <ProPayments />
                      </ProProtectedRoute>
                    }
                  />
                  <Route
                    path="/pro/promos"
                    element={
                      <ProProtectedRoute>
                        <ProPromos />
                      </ProProtectedRoute>
                    }
                  />
                  <Route
                    path="/pro/notifications"
                    element={
                      <ProProtectedRoute>
                        <ProNotifications />
                      </ProProtectedRoute>
                    }
                  />
                  <Route
                    path="/pro/reviews"
                    element={
                      <ProProtectedRoute>
                        <ProReviews />
                      </ProProtectedRoute>
                    }
                  />
                  <Route
                    path="/pro/settings"
                    element={
                      <ProProtectedRoute>
                        <ProSettings />
                      </ProProtectedRoute>
                    }
                  />
                  <Route
                    path="/pro/visibility"
                    element={
                      <ProProtectedRoute>
                        <ProVisibility />
                      </ProProtectedRoute>
                    }
                  />

                  <Route path="/superadmin" element={<Navigate to="/superadmin/dashboard" replace />} />
                  <Route path="/superadmin/login" element={<SuperadminLogin />} />
                  <Route
                    path="/superadmin/force-password"
                    element={
                      <SuperadminProtectedRoute>
                        <SuperadminForcePassword />
                      </SuperadminProtectedRoute>
                    }
                  />
                  <Route
                    path="/superadmin/dashboard"
                    element={
                      <SuperadminProtectedRoute>
                        <SuperadminDashboard />
                      </SuperadminProtectedRoute>
                    }
                  />
                  <Route
                    path="/superadmin/accounts"
                    element={
                      <SuperadminProtectedRoute>
                        <SuperadminAccounts />
                      </SuperadminProtectedRoute>
                    }
                  />
                  <Route
                    path="/superadmin/payments"
                    element={
                      <SuperadminProtectedRoute>
                        <SuperadminPayments />
                      </SuperadminProtectedRoute>
                    }
                  />
                  <Route
                    path="/superadmin/support"
                    element={
                      <SuperadminProtectedRoute>
                        <SuperadminSupport />
                      </SuperadminProtectedRoute>
                    }
                  />
                  <Route
                    path="/superadmin/faq"
                    element={
                      <SuperadminProtectedRoute>
                        <SuperadminFaq />
                      </SuperadminProtectedRoute>
                    }
                  />
                  <Route
                    path="/superadmin/logs"
                    element={
                      <SuperadminProtectedRoute>
                        <SuperadminLogs />
                      </SuperadminProtectedRoute>
                    }
                  />
                  <Route
                    path="/superadmin/settings"
                    element={
                      <SuperadminProtectedRoute>
                        <SuperadminSettings />
                      </SuperadminProtectedRoute>
                    }
                  />

                  {/* Public menu page with establishment slug - must come BEFORE /:slug */}
                  <Route path="/:slug/menu" element={<Menu />} />

                  {/* Public order confirmation page with establishment slug */}
                  <Route path="/:slug/order-confirmation/:orderId" element={<OrderConfirmation />} />

                  {/* Public home page with establishment slug */}
                  <Route path="/:slug" element={<Index />} />

                  {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </AppShell>
            </BrowserRouter>
          </TooltipProvider>
        </CartProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

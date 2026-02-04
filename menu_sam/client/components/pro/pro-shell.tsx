import * as React from "react"
import { Link, useLocation, useNavigate } from "react-router-dom"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useProNotificationsBadge } from "@/hooks/use-pro-notifications-badge"
import { useProNotificationModal } from "@/hooks/use-pro-notification-modal"
import { NotificationModal } from "@/components/pro/notification-modal"
import { getLogoUrl } from "@/lib/image-urls"
import { useProPlace } from "@/contexts/pro-place-context"

import {
  BarChart3,
  Bell,
  Eye,
  LogOut,
  Receipt,
  Settings,
  Tags,
  UtensilsCrossed,
  QrCode,
  Loader2,
  MessageCircle,
} from "lucide-react"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

type NavItem = {
  href: string
  label: string
  icon: React.ReactNode
}

const NAV_ITEMS: NavItem[] = [
  { href: "/pro/dashboard", label: "Commandes", icon: <BarChart3 className="h-4 w-4" /> },
  { href: "/pro/menu", label: "Carte", icon: <UtensilsCrossed className="h-4 w-4" /> },
  { href: "/pro/tables", label: "Tables & QR", icon: <QrCode className="h-4 w-4" /> },
  { href: "/pro/notifications", label: "Appels à table", icon: <Bell className="h-4 w-4" /> },
  { href: "/pro/payments", label: "Paiements", icon: <Receipt className="h-4 w-4" /> },
  { href: "/pro/promos", label: "Codes promo", icon: <Tags className="h-4 w-4" /> },
  { href: "/pro/reviews", label: "Avis Express", icon: <MessageCircle className="h-4 w-4" /> },
  { href: "/pro/settings", label: "Paramètres", icon: <Settings className="h-4 w-4" /> },
]

export function ProShell({
  title,
  subtitle,
  onSignOut,
  children,
}: {
  title: string
  subtitle?: string
  onSignOut: () => void | Promise<void>
  children: React.ReactNode
}) {
  const location = useLocation()
  const navigate = useNavigate()
  const { places, selectedPlaceId, setSelectedPlaceId, isLoading: placesLoading } = useProPlace()

  const [signingOut, setSigningOut] = React.useState(false)
  const [establishmentName, setEstablishmentName] = React.useState<string | null>(null)
  const [establishmentSlug, setEstablishmentSlug] = React.useState<string | null>(null)
  const [establishmentLogo, setEstablishmentLogo] = React.useState<string | null>(null)
  const [loadingName, setLoadingName] = React.useState(true)

  const badgeData = useProNotificationsBadge(selectedPlaceId)
  const { notification, onDismiss, onAccept, onTerminate, isAccepting, isTerminating } =
    useProNotificationModal(selectedPlaceId)

  const fetchEstablishmentData = React.useCallback(async () => {
    if (!selectedPlaceId) {
      setEstablishmentName("Restaurant")
      setLoadingName(false)
      return
    }

    try {
      const response = await fetch(`/api/mysql/places/${selectedPlaceId}`)
      if (response.ok) {
        const data = await response.json()
        setEstablishmentName(data.name || "Restaurant")
        setEstablishmentSlug(data.slug || null)
        setEstablishmentLogo(data.logo || null)
      } else {
        setEstablishmentName("Restaurant")
      }
    } catch (error) {
      console.error("Error fetching establishment data:", error)
      setEstablishmentName("Restaurant")
    } finally {
      setLoadingName(false)
    }
  }, [selectedPlaceId])

  React.useEffect(() => {
    void fetchEstablishmentData()

    const handler = () => {
      setLoadingName(true)
      void fetchEstablishmentData()
    }

    window.addEventListener("sam:place-updated", handler)
    return () => window.removeEventListener("sam:place-updated", handler)
  }, [fetchEstablishmentData])

  const logoSrc = React.useMemo(() => {
    if (!establishmentLogo) return null
    const base = getLogoUrl(establishmentSlug, establishmentLogo)
    return `${base}${base.includes("?") ? "&" : "?"}t=${Date.now()}`
  }, [establishmentSlug, establishmentLogo])

  const handleSignOut = React.useCallback(async () => {
    if (signingOut) return
    setSigningOut(true)
    try {
      await Promise.resolve(onSignOut())
    } finally {
      setSigningOut(false)
      navigate("/menu", { replace: true })
    }
  }, [navigate, onSignOut, signingOut])

  return (
    <div className="min-h-screen bg-white text-black overflow-x-hidden">
      <div className="grid w-full min-w-0 grid-cols-1 gap-6 px-4 py-5 sm:px-6 sm:py-6 md:grid-cols-[260px_1fr]">
        {/* ✅ ASIDE: white, clean, professional */}
        <aside className="min-w-0 rounded-2xl border border-black/10 bg-white p-4 shadow-sm">
          <div className="grid grid-cols-[40px_1fr_auto] items-center gap-2">
            {establishmentLogo ? (
              <img
                src={logoSrc ?? ""}
                alt="Logo"
                className="h-10 w-10 rounded-xl object-cover"
              />
            ) : (
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-sam-red text-white font-semibold text-sm">
                PRO
              </div>
            )}

            <div className="min-w-0">
              {placesLoading ? (
                <div className="flex items-center gap-2 text-black/70">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span className="text-sm font-semibold">Chargement...</span>
                </div>
              ) : places.length > 1 ? (
                <Select
                  value={selectedPlaceId?.toString() || ""}
                  onValueChange={(val) => setSelectedPlaceId(parseInt(val, 10))}
                >
                  <SelectTrigger className="w-full h-auto border-0 bg-transparent p-0 text-left text-sm font-semibold text-black hover:bg-black/5 focus:ring-0">
                    <SelectValue placeholder="Choisir établissement" />
                  </SelectTrigger>
                  <SelectContent>
                    {places.map((place) => (
                      <SelectItem key={place.placeId} value={place.placeId.toString()}>
                        {place.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="truncate text-sm font-semibold">
                  {loadingName ? (
                    <div className="flex items-center gap-2 text-black/70">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      <span>Chargement...</span>
                    </div>
                  ) : (
                    establishmentName || "Restaurant"
                  )}
                </div>
              )}

              <div className="truncate text-xs text-black/60">Interface restaurant</div>
            </div>

            <div className="flex items-center gap-1">
              <Button
                asChild
                type="button"
                variant="ghost"
                className="h-10 w-10 rounded-xl px-0 text-black/70 hover:bg-black/5 hover:text-black"
                aria-label="Aperçu du menu"
                title="Aperçu du menu"
              >
                <Link
                  to={establishmentSlug ? `/${establishmentSlug}` : "/menu"}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Eye className="h-5 w-5" />
                </Link>
              </Button>

              <Button
                type="button"
                variant="ghost"
                onClick={() => void handleSignOut()}
                disabled={signingOut}
                className="h-10 w-10 rounded-xl px-0 text-black/70 hover:bg-black/5 hover:text-black"
                aria-label="Se déconnecter"
                title="Se déconnecter"
              >
                <LogOut className="h-5 w-5" />
              </Button>
            </div>
          </div>

          {/* Divider */}
          <div className="mt-4 h-px bg-black/10" />

          <nav className="mt-4">
            <div className="min-w-0 max-w-full overflow-x-hidden md:overflow-visible">
              <div
                className={cn(
                  "flex w-full gap-2 overflow-x-auto no-scrollbar pb-1",
                  "snap-x snap-mandatory overscroll-x-contain",
                  "md:block md:overflow-visible md:pb-0",
                )}
              >
                {NAV_ITEMS.map((item) => {
                  const active = location.pathname === item.href
                  return (
                    <Link
                      key={item.href}
                      to={item.href}
                      className={cn(
                        "snap-start shrink-0",
                        "flex items-center gap-2 rounded-xl px-3 py-2 text-sm",
                        "transition-colors whitespace-nowrap",
                        active
                          ? "bg-sam-red text-white shadow-sm"
                          : "text-black/70 hover:bg-black/5 hover:text-black",
                        "md:w-full md:justify-start",
                      )}
                    >
                      {item.icon}
                      <span className="truncate md:truncate">{item.label}</span>
                    </Link>
                  )
                })}
              </div>
            </div>
          </nav>
        </aside>

        {/* ✅ MAIN: also white for a consistent, professional UI */}
        <main className="min-w-0 rounded-2xl border border-black/10 bg-white shadow-sm">
          <header className="border-b border-black/10 px-4 py-4 sm:px-5 bg-white/80 backdrop-blur">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="truncate text-lg font-semibold">{title}</div>
                {subtitle ? <div className="mt-1 text-sm text-black/60">{subtitle}</div> : null}
              </div>

              {badgeData.totalPending > 0 && (
                <div className="flex shrink-0 gap-2">
                  {badgeData.pendingOrders > 0 && (
                    <Button
                      type="button"
                      onClick={() => navigate("/pro/dashboard")}
                      className={cn(
                        "h-10 rounded-xl px-3 py-2 font-medium",
                        "bg-sam-red text-white hover:bg-sam-red/90",
                        "flex items-center gap-2",
                      )}
                      title={`${badgeData.pendingOrders} nouvelle(s) commande(s)`}
                    >
                      <BarChart3 className="h-4 w-4" />
                      <span className="text-xs sm:text-sm">{badgeData.pendingOrders}</span>
                    </Button>
                  )}

                  {badgeData.pendingNotifications > 0 && (
                    <Button
                      type="button"
                      onClick={() => navigate("/pro/notifications")}
                      className={cn(
                        "h-10 rounded-xl px-3 py-2 font-medium",
                        "bg-sam-red text-white hover:bg-sam-red/90",
                        "flex items-center gap-2",
                      )}
                      title={`${badgeData.pendingNotifications} appel(s) à table`}
                    >
                      <Bell className="h-4 w-4" />
                      <span className="text-xs sm:text-sm">{badgeData.pendingNotifications}</span>
                    </Button>
                  )}
                </div>
              )}
            </div>
          </header>

          <div className="p-4 sm:p-5 min-w-0">{children}</div>
        </main>
      </div>

      <NotificationModal
        notification={notification}
        onDismiss={onDismiss}
        onAccept={onAccept}
        onTerminate={onTerminate}
        isAccepting={isAccepting}
        isTerminating={isTerminating}
      />
    </div>
  )
}

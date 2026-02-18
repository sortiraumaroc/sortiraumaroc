# SAM Mobile App - Document de Reference Architecture

> **Derniere mise a jour** : 8 fevrier 2026
> **Projet** : Sortir Au Maroc (SAM) - Super-app pour le Maroc
> **Stack** : React Native + Expo 54 + TypeScript + React Navigation 7.x + TanStack React Query + Zustand

---

## 1. COULEURS ET DESIGN TOKENS

```
Primary (rouge)   : #B30013
PrimaryDark        : #8F0010
PrimaryDeep        : #6B000C
Secondary (noir)   : #1A1A2E
White              : #FFFFFF
```

Header gradient : `LinearGradient(['#B30013', '#8F0010', '#6B000C'])`

Tous les tokens sont dans `src/config/theme.ts` : Colors, Typography, Spacing, BorderRadius, Shadows.

---

## 2. STRUCTURE DES DOSSIERS

```
sam-mobile-app/
├── src/
│   ├── components/
│   │   ├── ui/                    # 25 composants UI reutilisables
│   │   ├── cards/                 # EstablishmentCard, ReservationCard
│   │   ├── social/                # PostCard, CommentSection, FollowButton, ShareSheet, PostImageCarousel
│   │   ├── messaging/             # ChatInput, ConversationItem, MessageBubble
│   │   ├── navigation/            # DrawerContent, HeaderRight
│   │   └── ThemeProvider.tsx
│   ├── screens/
│   │   ├── auth/                  # Login, Signup, VerifyCode, ForgotPassword, Onboarding
│   │   ├── user/                  # 14 ecrans consommateur
│   │   ├── pro/                   # 6 ecrans professionnel
│   │   ├── partner/               # 3 ecrans partenaire
│   │   ├── social/                # 5 ecrans sociaux
│   │   └── messaging/             # 2 ecrans messagerie
│   ├── navigation/                # DrawerNavigator, RootNavigator, UserTabNavigator, ProTabNavigator, etc.
│   ├── hooks/
│   │   ├── queries/               # 10 hooks React Query
│   │   ├── useDebounce.ts
│   │   └── useRefreshOnFocus.ts
│   ├── services/                  # 11 services API (Axios)
│   ├── store/                     # 3 stores Zustand (auth, app, pro)
│   ├── config/                    # api.ts (endpoints), theme.ts (design tokens)
│   ├── constants/                 # index.ts (constantes globales)
│   ├── types/                     # index.ts (tous les types TypeScript)
│   ├── i18n/                      # fr.ts, en.ts, ar.ts
│   └── utils/                     # storage, format, validation
├── App.tsx
├── package.json
└── tsconfig.json
```

Backend (dans `Sortir Au Maroc - Official/`) :
```
server/
├── routes/
│   ├── social.ts                  # 16 endpoints sociaux
│   ├── messaging.ts               # 6 endpoints messagerie
│   └── ... (708+ endpoints existants)
├── migrations/
│   ├── 20260208_social_features.sql
│   └── 20260208_direct_messaging.sql
└── index.ts                       # Enregistrement des routes
```

---

## 3. NAVIGATION

### Architecture
```
RootNavigator (Stack)
├── DrawerNavigator (Drawer - cote droit)
│   ├── UserTabNavigator (5 onglets)
│   │   ├── Accueil (HomeScreen)
│   │   ├── Rechercher (SearchScreen)
│   │   ├── Reservations (ReservationsScreen)
│   │   ├── Favoris (FavoritesScreen)
│   │   └── Profil (ProfileScreen)
│   ├── ProTabNavigator (4 onglets)
│   │   ├── Dashboard (ProDashboardScreen)
│   │   ├── Reservations (ProReservationsScreen)
│   │   ├── Etablissement (ProEstablishmentScreen)
│   │   └── Finance (ProFinanceScreen)
│   └── PartnerTabNavigator (3 onglets)
├── Stack screens (modales/pushed) :
│   ├── SearchResults, EstablishmentDetails, Booking, BookingDetails
│   ├── Feed, PostDetail, CreatePost, UserProfile, FollowList
│   ├── ConversationsList, Chat
│   ├── Notifications, Loyalty, EditProfile, MyQRCode, Referral
│   └── QRScanner, ProReservationDetails
```

### Drawer (hamburger)
- Position : **droite**
- Contenu : `DrawerContent.tsx` — avatar, menu sections (Compte, Parametres, Support, A propos, Deconnexion)
- Header droit : `HeaderRight.tsx` — icone messagerie avec badge + hamburger

---

## 4. COUCHE DONNEES (React Query + Zustand)

### Hooks React Query (`src/hooks/queries/`)

| Fichier | Hooks | Endpoints |
|---------|-------|-----------|
| `useHomeData.ts` | `useHomeData()` | `GET /api/public/home` |
| `useEstablishments.ts` | `useEstablishmentById(id)`, `useSearchEstablishments(filters)`, `useEstablishmentReviews(id)` | `GET /api/public/establishments/:id`, search, reviews |
| `useReservations.ts` | `useMyReservations(status?)`, `useReservationById(id)`, `useCreateReservation()`, `useCancelReservation()` | `GET/POST /api/consumer/reservations` |
| `useProfile.ts` | `useMyProfile()`, `useUpdateProfile()` | `GET /api/consumer/me`, `POST /api/consumer/me/update` |
| `useLoyalty.ts` | `useMyLoyaltyCards()`, `useMyRewards()` | `GET /api/consumer/loyalty/cards`, rewards |
| `useNotifications.ts` | `useMyNotifications()`, `useUnreadNotificationCount()` | `GET /api/consumer/notifications` |
| `useProData.ts` | `useMyEstablishments()`, `useProDashboard(id)`, `useProReservations(id, filters)`, `useProFinance(id)` | `GET /api/pro/*` |
| `useSocial.ts` | `useFeed(type)`, `usePostById(id)`, `usePostComments(id)`, `useUserProfile(id)`, `useUserPosts(id)`, `useFollowers(id)`, `useFollowing(id)`, `useSavedPosts()`, `useCreatePost()`, `useToggleLike(id)`, `useToggleSave(id)`, `useAddComment(id)`, `useToggleFollow(id)`, `useDeletePost(id)` | `GET/POST /api/consumer/social/*` |
| `useMessaging.ts` | `useConversations()`, `useMessages(convId)`, `useSendMessage(convId)`, `useCreateConversation()`, `useMarkAsRead(convId)`, `useUnreadMessageCount()` | `GET/POST /api/consumer/messages/*` |

### Stores Zustand (`src/store/`)

| Store | Contenu |
|-------|---------|
| `authStore.ts` | user, token, isAuthenticated, role, needsOnboarding. Actions: initialize, login, signup, sendPhoneCode, verifyPhoneCode, completeOnboarding, logout, updateProfile |
| `appStore.ts` | language, theme, favorites, onboarding status. Actions: toggleFavorite, setLanguage |
| `proStore.ts` | selectedEstablishmentId, selectedEstablishment, establishments. Actions: initialize, setSelectedEstablishment |

---

## 5. SERVICES API (`src/services/`)

| Service | Methodes principales |
|---------|---------------------|
| `api.ts` | Client Axios central. Methodes: get, post, put, patch, delete, uploadFile. Intercepteurs: token JWT auto, logout sur 401 |
| `auth.service.ts` | login, signup, sendPhoneCode (Twilio), verifyPhoneCode, completeOnboarding, setEmailPassword, getCurrentUser, updateProfile, logout |
| `social.service.ts` | getFeed, getPost, createPost, deletePost, toggleLike, toggleSave, getComments, addComment, deleteComment, getUserProfile, getUserPosts, getFollowers, getFollowing, toggleFollow, getSavedPosts |
| `messaging.service.ts` | getConversations, createOrGetConversation, getMessages, sendMessage, markAsRead, getUnreadCount |
| `pro.service.ts` | getDashboard, getMyEstablishments, getEstablishment, updateEstablishment, getInvoices, requestPayout, getFinanceSummary |
| `reservation.service.ts` | getReservations, getById, create, cancel, getProReservations, updateStatus, getTimeSlots |
| `loyalty.service.ts` | getMyCards, getMyRewards, redeemReward |
| `notification.service.ts` | getNotifications, markAsRead, markAllAsRead, getUnreadCount, registerPushToken |
| `establishment.service.ts` | getById, search, getReviews |
| `totp.service.ts` | getSecret, generateCode, validate, regenerate |
| `partner.service.ts` | getDashboard, getCommissions, getPayouts |

---

## 6. ENDPOINTS API CONFIG (`src/config/api.ts`)

```
BASE_URL: DEV → http://localhost:5000 | PROD → https://sam.ma

Auth:
  AUTH_EMAIL_LOGIN, AUTH_EMAIL_SIGNUP, AUTH_PASSWORD_RESET
  AUTH_TWILIO_SEND_CODE (/api/twilio/send-code)
  AUTH_TWILIO_VERIFY_CODE (/api/twilio/verify-code)
  AUTH_SET_EMAIL_PASSWORD, AUTH_VERIFY_EMAIL

Consumer:
  CONSUMER_ME, CONSUMER_UPDATE, CONSUMER_RESERVATIONS
  CONSUMER_NOTIFICATIONS, CONSUMER_DELETE_ACCOUNT
  CONSUMER_TOTP_SECRET, CONSUMER_TOTP_CODE, CONSUMER_TOTP_REGENERATE, CONSUMER_TOTP_VALIDATE

Loyalty:
  CONSUMER_LOYALTY_CARDS, CONSUMER_LOYALTY_REWARDS

Social:
  SOCIAL_FEED, SOCIAL_DISCOVER, SOCIAL_POSTS, SOCIAL_SAVED

Messaging:
  MESSAGES_CONVERSATIONS, MESSAGES_UNREAD_COUNT

Public:
  PUBLIC_ESTABLISHMENTS, PUBLIC_HOME, PUBLIC_CATEGORIES
  PUBLIC_PROMO_VALIDATE, PUBLIC_RESERVATIONS
  SEARCH_AUTOCOMPLETE, SEARCH_POPULAR

Pro:
  PRO_ESTABLISHMENTS, PRO_RESERVATIONS, PRO_DASHBOARD
  PRO_PACKS, PRO_OFFERS, PRO_VISIBILITY, PRO_QR_SCAN
  PRO_TEAM, PRO_INVOICES, PRO_PAYOUTS
  PRO_LOYALTY_PROGRAMS, PRO_LOYALTY_STATS, PRO_LOYALTY_STAMPS
  PRO_MY_ESTABLISHMENTS, PRO_CHECKIN_BY_USER

Admin:
  ADMIN_DASHBOARD, ADMIN_ESTABLISHMENTS, ADMIN_USERS
  ADMIN_RESERVATIONS, ADMIN_NOTIFICATIONS_PUSH, ADMIN_HOME_SETTINGS

Paiements:
  PAYMENTS_SESSION (LaCaissePay), WALLET_APPLE, WALLET_GOOGLE

Parrainage:
  REFERRAL_PARTNERS, REFERRAL_COMMISSIONS
```

---

## 7. COMPOSANTS UI (`src/components/ui/`)

25 composants reutilisables :

| Composant | Description |
|-----------|-------------|
| `AccordionSection` | Section repliable avec titre et contenu |
| `Avatar` | Avatar utilisateur avec initiales si pas d'image |
| `Badge` | Badge avec variantes (success, warning, error, info, default) |
| `BadgeOverlay` | Badge superpose sur un autre composant |
| `BottomSheet` | Bottom sheet modale |
| `Button` | Bouton avec variantes (primary, outline, ghost) et tailles (sm, md, lg) |
| `Card` | Carte avec ombre et border radius |
| `EmptyState` | Etat vide avec icone, titre et message |
| `ErrorView` | Vue d'erreur avec icone, titre, message et bouton retry |
| `FeedPostCard` | Carte de post social dans le feed |
| `FilterChips` | Chips de filtres horizontaux |
| `HorizontalCarousel` | Carousel horizontal de cartes |
| `Input` | Champ de saisie stylise |
| `LoadingScreen` | Ecran de chargement plein ecran |
| `MenuItemCard` | Carte d'item de menu restaurant |
| `OfflineBanner` | Banniere hors-ligne animee |
| `PhotoGallery` | Galerie photos en grille |
| `RatingBadge` | Badge de note avec etoile |
| `RatingStars` | Etoiles de notation (1-5) |
| `ReviewCard` | Carte d'avis avec avatar, note, commentaire |
| `SearchBar` | Barre de recherche avec icone |
| `SectionHeader` | En-tete de section avec titre et lien "voir tout" |
| `StickyBottomCTA` | CTA fixe en bas d'ecran |
| `TimeSlotPicker` | Selecteur de creneaux horaires |
| `UserCard` | Carte utilisateur avec avatar et infos |

---

## 8. BACKEND — SOCIAL (16 endpoints)

**Fichier** : `server/routes/social.ts`
**Tables** : `social_posts`, `social_post_images`, `social_post_likes`, `social_post_comments`, `social_post_saves`, `social_user_follows`

```
GET    /api/consumer/social/feed                    # Feed personnalise (suivis + populaires)
GET    /api/consumer/social/feed/discover            # Decouvrir (tendances)
POST   /api/consumer/social/posts                    # Creer un post
GET    /api/consumer/social/posts/:id                # Detail d'un post
DELETE /api/consumer/social/posts/:id                # Supprimer son post
POST   /api/consumer/social/posts/:id/like           # Toggle like
POST   /api/consumer/social/posts/:id/save           # Toggle sauvegarde
GET    /api/consumer/social/posts/:id/comments       # Lister commentaires
POST   /api/consumer/social/posts/:id/comments       # Ajouter commentaire
DELETE /api/consumer/social/comments/:id             # Supprimer commentaire
POST   /api/consumer/social/users/:id/follow         # Toggle follow
GET    /api/consumer/social/users/:id/profile        # Profil social
GET    /api/consumer/social/users/:id/posts          # Posts d'un utilisateur
GET    /api/consumer/social/users/:id/followers       # Liste abonnes
GET    /api/consumer/social/users/:id/following       # Liste abonnements
GET    /api/consumer/social/me/saved                 # Mes sauvegardes
```

---

## 9. BACKEND — MESSAGERIE (6 endpoints)

**Fichier** : `server/routes/messaging.ts`
**Tables** : `dm_conversations`, `dm_conversation_participants`, `dm_messages`

```
GET    /api/consumer/messages/conversations                     # Lister conversations
POST   /api/consumer/messages/conversations                     # Creer/obtenir conversation
GET    /api/consumer/messages/conversations/:id/messages         # Messages pagines
POST   /api/consumer/messages/conversations/:id/messages         # Envoyer message
POST   /api/consumer/messages/conversations/:id/read             # Marquer lu
GET    /api/consumer/messages/unread-count                       # Badge non-lus
```

---

## 10. AUTHENTIFICATION

### Flux supporte
1. **Email + Mot de passe** : login → `POST /api/consumer/auth/email/login`
2. **Inscription email** : signup → `POST /api/consumer/auth/email/signup`
3. **SMS Twilio** : sendCode → `POST /api/twilio/send-code` → verifyCode → `POST /api/twilio/verify-code`
4. **Onboarding** : completeOnboarding → updateProfile + setEmailPassword

### Token
- Stocke dans AsyncStorage (`STORAGE_KEYS.AUTH_TOKEN`)
- Injecte automatiquement via intercepteur Axios (`Authorization: Bearer <token>`)
- Backend : `supabase.auth.getUser(token)` pour verifier

### Comptes demo
- **SUPPRIMES** — Plus de comptes demo hardcodes dans authStore.ts
- L'authentification passe toujours par le backend

---

## 11. TYPES PRINCIPAUX (`src/types/index.ts`)

```typescript
User, ConsumerUser, ProUser, PartnerUser, BankInfo
LoginCredentials, SignupData, OnboardingData, PhoneAuthData
Establishment, Category, OpeningHours, Feature
Reservation, CreateReservationData, TimeSlot
Review, ReviewResponse
PromoCode, Notification
LoyaltyCard, LoyaltyProgram, LoyaltyReward, BonusRules
ProDashboardData, FinanceSummary, Invoice, Payout
TotpCode, TotpSecret
SearchResults, SearchFilters, HomeData
SocialPost, SocialComment, SocialUser, CreatePostData
```

---

## 12. ECRANS PAR ROLE

### Consommateur (14 ecrans)
| Ecran | Fichier | Connecte au backend |
|-------|---------|-------------------|
| Accueil | `HomeScreen.tsx` | useHomeData() |
| Recherche | `SearchScreen.tsx` | Suggestions, recherches recentes |
| Resultats recherche | `SearchResultsScreen.tsx` | useSearchEstablishments() infinite |
| Details etablissement | `EstablishmentDetailsScreen.tsx` | useEstablishmentById(), useEstablishmentReviews() |
| Reservation | `BookingScreen.tsx` | useCreateReservation() |
| Details reservation | `BookingDetailsScreen.tsx` | useReservationById() |
| Mes reservations | `ReservationsScreen.tsx` | useMyReservations(), useCancelReservation() |
| Favoris | `FavoritesScreen.tsx` | Local (appStore) — pas encore connecte au backend |
| Profil | `ProfileScreen.tsx` | useMyProfile() |
| Modifier profil | `EditProfileScreen.tsx` | useUpdateProfile() |
| Notifications | `NotificationsScreen.tsx` | notificationService |
| Fidelite | `LoyaltyScreen.tsx` | loyaltyService |
| Mon QR Code | `MyQRCodeScreen.tsx` | totpService |
| Parrainage | `ReferralScreen.tsx` | partnerService |

### Social (5 ecrans)
| Ecran | Fichier | Hook |
|-------|---------|------|
| Feed | `FeedScreen.tsx` | useFeed('following' / 'discover') |
| Detail post | `PostDetailScreen.tsx` | usePostById(), usePostComments() |
| Creer post | `CreatePostScreen.tsx` | useCreatePost() |
| Profil utilisateur | `UserProfileScreen.tsx` | useUserProfile(), useUserPosts() |
| Liste follows | `FollowListScreen.tsx` | useFollowers(), useFollowing() |

### Messagerie (2 ecrans)
| Ecran | Fichier | Hook |
|-------|---------|------|
| Conversations | `ConversationsListScreen.tsx` | useConversations() |
| Chat | `ChatScreen.tsx` | useMessages(), useSendMessage(), polling 5s |

### Professionnel (6 ecrans)
| Ecran | Fichier | Hook |
|-------|---------|------|
| Dashboard | `ProDashboardScreen.tsx` | useProDashboard(), useProStore |
| Reservations | `ProReservationsScreen.tsx` | useProReservations(), useMutation updateStatus |
| Etablissement | `ProEstablishmentScreen.tsx` | useMyEstablishments() |
| Finance | `ProFinanceScreen.tsx` | useProFinance(), useQuery invoices, useMutation payout |
| Details reservation | `ProReservationDetailsScreen.tsx` | reservationService |
| Scanner QR | `QRScannerScreen.tsx` | totpService |

### Partenaire (3 ecrans)
| Ecran | Fichier |
|-------|---------|
| Dashboard | `PartnerDashboardScreen.tsx` |
| Commissions | `PartnerCommissionsScreen.tsx` |
| Paiements | `PartnerPayoutsScreen.tsx` |

---

## 13. I18N

Langues supportees : **Francais** (fr), **Anglais** (en), **Arabe** (ar)
Fichiers : `src/i18n/fr.ts`, `src/i18n/en.ts`, `src/i18n/ar.ts`
Librairie : `react-i18next`

---

## 14. HISTORIQUE DES PHASES COMPLETEES

| Phase | Quoi | Quand |
|-------|------|-------|
| Phase 1A | 10 hooks React Query crees | 8 fev 2026 |
| Phase 1B | 5 ecrans connectes au backend (mock data supprime) | 8 fev 2026 |
| Phase 1C | Auth nettoye, comptes demo supprimes | 8 fev 2026 |
| Phase 2 | Drawer hamburger + 5 onglets + SearchScreen | 8 fev 2026 |
| Phase 3 | Social complet : SQL + 16 API + 5 ecrans + 5 composants | 8 fev 2026 |
| Phase 4 | Messagerie complete : SQL + 6 API + 2 ecrans + 3 composants | 8 fev 2026 |
| Phase 5 | 4 ecrans Pro connectes via React Query + proStore Zustand | 8 fev 2026 |
| Phase 6 | ErrorView + OfflineBanner crees | 8 fev 2026 |

---

## 15. CE QUI RESTE A FAIRE

- [ ] Connecter FavoritesScreen au backend (endpoint favori a creer)
- [ ] Push notifications (expo-notifications, registerPushToken)
- [ ] Tests end-to-end (creation post → like → commentaire → partage)
- [ ] Tests messagerie (envoi entre 2 users)
- [ ] Tests auth complet (inscription SMS → onboarding → home)
- [ ] Tests interface pro (dashboard → reservations → QR scan)
- [ ] Gestion offline plus robuste (queuing mutations)
- [ ] Real-time messaging (WebSocket / Supabase Realtime au lieu de polling)
- [ ] Animations et transitions de navigation
- [ ] Dark mode support
- [ ] Accessibilite (a11y)

---

## 16. COMMANDES UTILES

```bash
# Demarrer l'app
npx expo start

# Verifier TypeScript (0 erreurs attendues)
npx tsc --noEmit

# Synchroniser vers le dossier officiel
rsync -av --delete --exclude='node_modules' --exclude='.expo' --exclude='.git' \
  /Users/salaheddineaitnasser/Downloads/sam-mobile-app/ \
  "/Users/salaheddineaitnasser/Downloads/Sortir Au Maroc - Official/mobile/"

# Demarrer le serveur backend
cd "/Users/salaheddineaitnasser/Downloads/Sortir Au Maroc - Official/server"
npm run dev
```

---

## 17. CONVENTIONS DE CODE

- **Langage** : TypeScript strict, 0 erreurs toleres
- **Composants** : `React.FC<Props>`, export named + default
- **Hooks** : Prefixe `use`, fichiers dans `hooks/queries/`
- **Services** : Classes avec methodes async, export instance + default
- **Stores** : Zustand `create<Store>((set, get) => ({...}))`
- **Styles** : `StyleSheet.create({})` en bas du fichier
- **Erreurs API** : `error.response?.data?.message` pour les messages serveur
- **Commentaires** : En francais
- **Nommage fichiers** : PascalCase pour composants/ecrans, camelCase pour services/hooks

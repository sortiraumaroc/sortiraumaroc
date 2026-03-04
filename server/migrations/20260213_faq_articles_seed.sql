-- =============================================================================
-- FAQ Articles Seed — Mise à jour pour toutes les nouvelles fonctionnalités
-- Date: 2026-02-13
-- Catégories: reservations, paiements, annulations, comptes_utilisateurs,
--             comptes_pro, packs_offres, support_general
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- CATÉGORIE : reservations
-- ---------------------------------------------------------------------------

INSERT INTO faq_articles (title, body, question_fr, question_en, answer_html_fr, answer_html_en, category, display_order, is_published, tags, created_at, updated_at)
VALUES (
  'Comment faire une réservation ?',
  '<p>Pour réserver, recherchez un établissement, choisissez un créneau disponible, indiquez le nombre de personnes et confirmez.</p>',
  'Comment faire une réservation ?',
  'How do I make a reservation?',
  '<p>Pour réserver sur sam.ma :</p><ol><li>Recherchez un établissement (restaurant, hôtel, spa, etc.)</li><li>Consultez les créneaux disponibles sur la fiche</li><li>Sélectionnez la date, l''heure et le nombre de personnes</li><li>Confirmez votre réservation</li></ol><p>Vous recevrez une confirmation par email et notification. Certains établissements peuvent demander un acompte.</p>',
  '<p>To book on sam.ma:</p><ol><li>Search for an establishment (restaurant, hotel, spa, etc.)</li><li>Check available time slots on the listing page</li><li>Select the date, time and number of guests</li><li>Confirm your reservation</li></ol><p>You will receive a confirmation by email and notification. Some establishments may require a deposit.</p>',
  'reservations', 1, true, ARRAY['booking', 'how-to', 'reservation']::text[], NOW(), NOW()
);

INSERT INTO faq_articles (title, body, question_fr, question_en, answer_html_fr, answer_html_en, category, display_order, is_published, tags, created_at, updated_at)
VALUES (
  'Qu''est-ce qu''un no-show et que se passe-t-il si je ne me présente pas ?',
  '<p>Un no-show signifie que vous ne vous êtes pas présenté à votre réservation sans l''annuler au préalable.</p>',
  'Qu''est-ce qu''un no-show et que se passe-t-il si je ne me présente pas ?',
  'What is a no-show and what happens if I don''t show up?',
  '<p>Un <strong>no-show</strong> signifie que vous ne vous êtes pas présenté à votre réservation sans l''avoir annulée.</p><p><strong>Conséquences :</strong></p><ul><li>Votre score de fiabilité diminue de <strong>-15 points</strong></li><li>Après <strong>3 no-shows consécutifs</strong>, votre compte est suspendu 7 jours</li><li>Après <strong>5 no-shows cumulés</strong>, suspension de 30 jours</li></ul><p><strong>Vous pouvez contester :</strong> Si le professionnel déclare un no-show par erreur, vous avez <strong>48 heures</strong> pour contester en fournissant des preuves. Un arbitrage sera effectué par l''équipe sam.ma.</p>',
  '<p>A <strong>no-show</strong> means you did not show up for your reservation without canceling it.</p><p><strong>Consequences:</strong></p><ul><li>Your reliability score decreases by <strong>-15 points</strong></li><li>After <strong>3 consecutive no-shows</strong>, your account is suspended for 7 days</li><li>After <strong>5 cumulative no-shows</strong>, 30-day suspension</li></ul><p><strong>You can dispute:</strong> If the professional declares a no-show by mistake, you have <strong>48 hours</strong> to dispute with evidence. Arbitration will be handled by the sam.ma team.</p>',
  'reservations', 2, true, ARRAY['no-show', 'dispute', 'scoring', 'suspension']::text[], NOW(), NOW()
);

INSERT INTO faq_articles (title, body, question_fr, question_en, answer_html_fr, answer_html_en, category, display_order, is_published, tags, created_at, updated_at)
VALUES (
  'Comment fonctionne le QR code de réservation ?',
  '<p>Chaque réservation confirmée génère un QR code unique pour le check-in sur place.</p>',
  'Comment fonctionne le QR code de réservation ?',
  'How does the reservation QR code work?',
  '<p>Chaque réservation confirmée génère un <strong>QR code unique</strong> :</p><ul><li>Retrouvez-le dans <strong>"Mes Réservations"</strong> → détail de la réservation</li><li>Présentez-le à l''établissement à votre arrivée</li><li>Le professionnel scanne le code pour valider votre présence</li><li>Le check-in est instantané et confirme votre venue</li></ul><p>Le QR code est à usage unique et ne peut pas être partagé.</p>',
  '<p>Each confirmed reservation generates a <strong>unique QR code</strong>:</p><ul><li>Find it in <strong>"My Reservations"</strong> → reservation details</li><li>Show it at the establishment upon arrival</li><li>The professional scans the code to validate your presence</li><li>Check-in is instant and confirms your attendance</li></ul><p>The QR code is single-use and cannot be shared.</p>',
  'reservations', 3, true, ARRAY['qr-code', 'check-in', 'scan']::text[], NOW(), NOW()
);

INSERT INTO faq_articles (title, body, question_fr, question_en, answer_html_fr, answer_html_en, category, display_order, is_published, tags, created_at, updated_at)
VALUES (
  'Qu''est-ce que le score de fiabilité ?',
  '<p>Le score de fiabilité évalue votre comportement en tant que client sur sam.ma.</p>',
  'Qu''est-ce que le score de fiabilité ?',
  'What is the reliability score?',
  '<p>Le <strong>score de fiabilité</strong> (0-100) reflète votre comportement sur sam.ma :</p><ul><li><strong>Base :</strong> 60 points (tout nouveau compte)</li><li><strong>+5 pts</strong> par réservation honorée</li><li><strong>+2 pts</strong> si vous passez d''une réservation gratuite à payante</li><li><strong>+1 pt</strong> par avis déposé</li><li><strong>-5 à -10 pts</strong> par annulation tardive</li><li><strong>-15 pts</strong> par no-show</li></ul><p>Un score élevé vous donne accès à plus de créneaux et à des avantages exclusifs. Le score est affiché sous forme d''étoiles (score ÷ 20).</p>',
  '<p>The <strong>reliability score</strong> (0-100) reflects your behavior on sam.ma:</p><ul><li><strong>Base:</strong> 60 points (every new account)</li><li><strong>+5 pts</strong> per honored reservation</li><li><strong>+2 pts</strong> if you upgrade from free to paid reservation</li><li><strong>+1 pt</strong> per review posted</li><li><strong>-5 to -10 pts</strong> per late cancellation</li><li><strong>-15 pts</strong> per no-show</li></ul><p>A high score gives you access to more time slots and exclusive benefits. The score is displayed as stars (score ÷ 20).</p>',
  'reservations', 4, true, ARRAY['scoring', 'reliability', 'points', 'stars']::text[], NOW(), NOW()
);

INSERT INTO faq_articles (title, body, question_fr, question_en, answer_html_fr, answer_html_en, category, display_order, is_published, tags, created_at, updated_at)
VALUES (
  'Puis-je passer d''une réservation gratuite à payante ?',
  '<p>Oui, vous pouvez upgrader une réservation gratuite vers une réservation payante.</p>',
  'Puis-je passer d''une réservation gratuite à payante ?',
  'Can I upgrade from a free to a paid reservation?',
  '<p>Oui ! Si votre réservation est actuellement <strong>gratuite</strong>, vous pouvez la passer en <strong>réservation payante</strong> (avec acompte) :</p><ul><li>Allez dans <strong>"Mes Réservations"</strong></li><li>Cliquez sur le bouton <strong>"Passer en payant"</strong></li><li>Réglez l''acompte demandé</li></ul><p><strong>Avantage :</strong> Vous gagnez <strong>+2 points</strong> de fiabilité et votre créneau est garanti avec priorité.</p>',
  '<p>Yes! If your reservation is currently <strong>free</strong>, you can upgrade it to a <strong>paid reservation</strong> (with deposit):</p><ul><li>Go to <strong>"My Reservations"</strong></li><li>Click the <strong>"Upgrade to paid"</strong> button</li><li>Pay the required deposit</li></ul><p><strong>Benefit:</strong> You earn <strong>+2 reliability points</strong> and your slot is guaranteed with priority.</p>',
  'reservations', 5, true, ARRAY['upgrade', 'free', 'paid', 'deposit']::text[], NOW(), NOW()
);

INSERT INTO faq_articles (title, body, question_fr, question_en, answer_html_fr, answer_html_en, category, display_order, is_published, tags, created_at, updated_at)
VALUES (
  'Je n''ai pas reçu ma confirmation de réservation, que faire ?',
  '<p>Si vous n''avez pas reçu de confirmation, vérifiez vos spams ou contactez le support.</p>',
  'Je n''ai pas reçu ma confirmation de réservation, que faire ?',
  'I didn''t receive my reservation confirmation, what should I do?',
  '<p>Si vous n''avez pas reçu de confirmation :</p><ol><li>Vérifiez votre dossier <strong>spam / courrier indésirable</strong></li><li>Consultez <strong>"Mes Réservations"</strong> dans votre espace client — la réservation y est peut-être déjà</li><li>Vérifiez que votre adresse email est correcte dans votre profil</li><li>Si le problème persiste, contactez-nous via le <strong>chat support</strong> ou créez un <strong>ticket</strong></li></ol>',
  '<p>If you didn''t receive a confirmation:</p><ol><li>Check your <strong>spam / junk folder</strong></li><li>Check <strong>"My Reservations"</strong> in your account — the booking may already be there</li><li>Verify your email address is correct in your profile</li><li>If the issue persists, contact us via <strong>support chat</strong> or create a <strong>ticket</strong></li></ol>',
  'reservations', 6, true, ARRAY['confirmation', 'email', 'notification']::text[], NOW(), NOW()
);

-- ---------------------------------------------------------------------------
-- CATÉGORIE : annulations
-- ---------------------------------------------------------------------------

INSERT INTO faq_articles (title, body, question_fr, question_en, answer_html_fr, answer_html_en, category, display_order, is_published, tags, created_at, updated_at)
VALUES (
  'Comment annuler une réservation ?',
  '<p>Vous pouvez annuler depuis votre espace "Mes Réservations".</p>',
  'Comment annuler une réservation ?',
  'How do I cancel a reservation?',
  '<p>Pour annuler une réservation :</p><ol><li>Allez dans <strong>"Mes Réservations"</strong></li><li>Sélectionnez la réservation à annuler</li><li>Cliquez sur <strong>"Annuler"</strong></li></ol><p><strong>Important :</strong></p><ul><li>L''annulation est <strong>gratuite</strong> si elle est faite plus de <strong>3 heures avant</strong> le créneau</li><li>Une annulation tardive (moins de 3h) impacte votre <strong>score de fiabilité</strong> (-5 à -10 pts)</li><li>L''annulation d''une réservation avec acompte peut entraîner des frais selon la politique de l''établissement</li></ul>',
  '<p>To cancel a reservation:</p><ol><li>Go to <strong>"My Reservations"</strong></li><li>Select the reservation to cancel</li><li>Click <strong>"Cancel"</strong></li></ol><p><strong>Important:</strong></p><ul><li>Cancellation is <strong>free</strong> if done more than <strong>3 hours before</strong> the time slot</li><li>A late cancellation (less than 3h) impacts your <strong>reliability score</strong> (-5 to -10 pts)</li><li>Canceling a reservation with deposit may incur fees depending on the establishment''s policy</li></ul>',
  'annulations', 1, true, ARRAY['cancel', 'annulation', 'policy']::text[], NOW(), NOW()
);

INSERT INTO faq_articles (title, body, question_fr, question_en, answer_html_fr, answer_html_en, category, display_order, is_published, tags, created_at, updated_at)
VALUES (
  'Qu''est-ce que la fenêtre de protection de 3 heures ?',
  '<p>La fenêtre de 3 heures est le délai minimum avant lequel une annulation gratuite est possible.</p>',
  'Qu''est-ce que la fenêtre de protection de 3 heures ?',
  'What is the 3-hour protection window?',
  '<p>La <strong>fenêtre de protection de 3 heures</strong> (H-3) fonctionne ainsi :</p><ul><li><strong>Plus de 3h avant :</strong> Annulation gratuite, sans impact sur votre score</li><li><strong>Moins de 3h avant :</strong> L''annulation est considérée comme <strong>tardive</strong> et impacte votre score (-5 pts)</li><li><strong>Moins de 1h avant :</strong> Annulation <strong>très tardive</strong> (-10 pts)</li></ul><p>Les réservations gratuites faites moins de 3 heures avant le créneau ne sont plus possibles pour protéger les établissements.</p>',
  '<p>The <strong>3-hour protection window</strong> (H-3) works as follows:</p><ul><li><strong>More than 3h before:</strong> Free cancellation, no impact on your score</li><li><strong>Less than 3h before:</strong> Cancellation is considered <strong>late</strong> and impacts your score (-5 pts)</li><li><strong>Less than 1h before:</strong> <strong>Very late</strong> cancellation (-10 pts)</li></ul><p>Free reservations made less than 3 hours before the time slot are no longer possible to protect establishments.</p>',
  'annulations', 2, true, ARRAY['3-hours', 'protection', 'late-cancel', 'scoring']::text[], NOW(), NOW()
);

-- ---------------------------------------------------------------------------
-- CATÉGORIE : paiements
-- ---------------------------------------------------------------------------

INSERT INTO faq_articles (title, body, question_fr, question_en, answer_html_fr, answer_html_en, category, display_order, is_published, tags, created_at, updated_at)
VALUES (
  'Pourquoi un dépôt (acompte) est demandé sur certaines réservations ?',
  '<p>Certains établissements demandent un acompte pour garantir votre réservation.</p>',
  'Pourquoi un dépôt (acompte) est demandé sur certaines réservations ?',
  'Why is a deposit required for some reservations?',
  '<p>L''acompte est un mécanisme de <strong>garantie</strong> :</p><ul><li>L''établissement fixe le montant (souvent un pourcentage du menu)</li><li>Il est <strong>déduit de l''addition finale</strong> lors de votre visite</li><li>En cas de no-show, l''acompte peut être conservé par l''établissement</li><li>En cas d''annulation dans les délais, l''acompte est remboursé</li></ul><p>Le paiement est sécurisé via <strong>LacaissePay</strong>, notre partenaire de paiement certifié.</p>',
  '<p>The deposit is a <strong>guarantee</strong> mechanism:</p><ul><li>The establishment sets the amount (often a percentage of the menu)</li><li>It is <strong>deducted from the final bill</strong> during your visit</li><li>In case of no-show, the deposit may be kept by the establishment</li><li>If canceled on time, the deposit is refunded</li></ul><p>Payment is secured via <strong>LacaissePay</strong>, our certified payment partner.</p>',
  'paiements', 1, true, ARRAY['deposit', 'acompte', 'payment', 'guarantee']::text[], NOW(), NOW()
);

INSERT INTO faq_articles (title, body, question_fr, question_en, answer_html_fr, answer_html_en, category, display_order, is_published, tags, created_at, updated_at)
VALUES (
  'Comment fonctionne la facturation pour les professionnels ?',
  '<p>La facturation est bimensuelle avec un système d''appel à facture.</p>',
  'Comment fonctionne la facturation pour les professionnels ?',
  'How does billing work for professionals?',
  '<p>Le système de facturation sam.ma fonctionne par <strong>périodes bimensuelles</strong> :</p><ol><li><strong>1er au 15</strong> et <strong>16 au dernier jour</strong> de chaque mois</li><li>À la clôture de chaque période, un récapitulatif des commissions est généré</li><li>Le professionnel soumet un <strong>appel à facture</strong> depuis son espace</li><li>L''équipe sam.ma valide la facture</li><li>Le virement est exécuté dans les délais convenus</li></ol><p>Les factures sont générées automatiquement via <strong>VosFactures</strong> et téléchargeables en PDF.</p>',
  '<p>The sam.ma billing system works in <strong>semi-monthly periods</strong>:</p><ol><li><strong>1st to 15th</strong> and <strong>16th to last day</strong> of each month</li><li>At the close of each period, a commission summary is generated</li><li>The professional submits an <strong>invoice request</strong> from their dashboard</li><li>The sam.ma team validates the invoice</li><li>Payment is executed within the agreed timeframe</li></ol><p>Invoices are automatically generated via <strong>VosFactures</strong> and downloadable as PDF.</p>',
  'paiements', 2, true, ARRAY['billing', 'facturation', 'commission', 'invoice', 'pro']::text[], NOW(), NOW()
);

INSERT INTO faq_articles (title, body, question_fr, question_en, answer_html_fr, answer_html_en, category, display_order, is_published, tags, created_at, updated_at)
VALUES (
  'Quel est le taux de commission sur les réservations et les packs ?',
  '<p>La commission par défaut est de 15% sur les acomptes de réservation et les ventes de packs.</p>',
  'Quel est le taux de commission sur les réservations et les packs ?',
  'What is the commission rate on reservations and packs?',
  '<p>Les taux de commission sam.ma :</p><ul><li><strong>Réservations (acompte) :</strong> 15% par défaut</li><li><strong>Ventes de Packs :</strong> 15% par défaut</li><li><strong>Autres services :</strong> varient selon le type</li></ul><p>Des taux <strong>personnalisés</strong> peuvent être négociés avec l''équipe commerciale sam.ma. Les commissions sont calculées sur le montant HT et détaillées dans chaque facture.</p>',
  '<p>sam.ma commission rates:</p><ul><li><strong>Reservations (deposit):</strong> 15% by default</li><li><strong>Pack sales:</strong> 15% by default</li><li><strong>Other services:</strong> vary by type</li></ul><p><strong>Custom</strong> rates can be negotiated with the sam.ma sales team. Commissions are calculated on the pre-tax amount and detailed in each invoice.</p>',
  'paiements', 3, true, ARRAY['commission', 'rate', 'percentage', 'pro']::text[], NOW(), NOW()
);

-- ---------------------------------------------------------------------------
-- CATÉGORIE : comptes_utilisateurs
-- ---------------------------------------------------------------------------

INSERT INTO faq_articles (title, body, question_fr, question_en, answer_html_fr, answer_html_en, category, display_order, is_published, tags, created_at, updated_at)
VALUES (
  'Comment créer un compte et me connecter ?',
  '<p>Créez un compte avec votre email ou connectez-vous avec Google/Apple.</p>',
  'Comment créer un compte et me connecter ?',
  'How do I create an account and log in?',
  '<p>Pour créer un compte :</p><ol><li>Cliquez sur <strong>"Se connecter"</strong> en haut de la page</li><li>Choisissez entre : <strong>Email + mot de passe</strong>, <strong>Google</strong>, ou <strong>Apple</strong></li><li>Confirmez votre adresse email (un lien de vérification vous sera envoyé)</li></ol><p><strong>Important :</strong> La vérification email est nécessaire pour effectuer des réservations et accéder à toutes les fonctionnalités.</p>',
  '<p>To create an account:</p><ol><li>Click <strong>"Sign in"</strong> at the top of the page</li><li>Choose between: <strong>Email + password</strong>, <strong>Google</strong>, or <strong>Apple</strong></li><li>Confirm your email address (a verification link will be sent)</li></ol><p><strong>Important:</strong> Email verification is required to make reservations and access all features.</p>',
  'comptes_utilisateurs', 1, true, ARRAY['account', 'login', 'signup', 'register']::text[], NOW(), NOW()
);

INSERT INTO faq_articles (title, body, question_fr, question_en, answer_html_fr, answer_html_en, category, display_order, is_published, tags, created_at, updated_at)
VALUES (
  'Comment laisser un avis sur un établissement ?',
  '<p>Vous pouvez laisser un avis après avoir visité un établissement via une réservation confirmée.</p>',
  'Comment laisser un avis sur un établissement ?',
  'How do I leave a review for an establishment?',
  '<p>Pour laisser un avis :</p><ol><li>Vous devez avoir une <strong>réservation honorée</strong> (check-in effectué)</li><li>Après votre visite, vous recevrez une <strong>invitation à donner votre avis</strong></li><li>Vous pouvez aussi aller dans <strong>"Mes Réservations"</strong> → réservations passées → <strong>"Donner un avis"</strong></li><li>Notez l''établissement et rédigez votre commentaire</li></ol><p>Les avis sont <strong>modérés</strong> par l''équipe sam.ma avant publication. Laisser un avis vous rapporte <strong>+1 point</strong> de fiabilité.</p>',
  '<p>To leave a review:</p><ol><li>You must have an <strong>honored reservation</strong> (check-in completed)</li><li>After your visit, you''ll receive a <strong>review invitation</strong></li><li>You can also go to <strong>"My Reservations"</strong> → past reservations → <strong>"Leave a review"</strong></li><li>Rate the establishment and write your comment</li></ol><p>Reviews are <strong>moderated</strong> by the sam.ma team before publication. Leaving a review earns you <strong>+1 reliability point</strong>.</p>',
  'comptes_utilisateurs', 2, true, ARRAY['review', 'avis', 'rating', 'moderation']::text[], NOW(), NOW()
);

INSERT INTO faq_articles (title, body, question_fr, question_en, answer_html_fr, answer_html_en, category, display_order, is_published, tags, created_at, updated_at)
VALUES (
  'Comment utiliser Sam, l''assistant IA ?',
  '<p>Sam est le concierge intelligent de sam.ma qui vous aide à trouver et réserver.</p>',
  'Comment utiliser Sam, l''assistant IA ?',
  'How do I use Sam, the AI assistant?',
  '<p><strong>Sam</strong> est le premier concierge IA de réservation au Maroc :</p><ul><li>Cliquez sur le <strong>bouton flottant</strong> en bas à droite de l''écran</li><li>Sélectionnez <strong>"Sam AI"</strong></li><li>Posez votre question en <strong>français, anglais ou darija</strong></li></ul><p><strong>Sam peut :</strong></p><ul><li>Chercher des restaurants, hôtels, spas, activités...</li><li>Consulter les menus, horaires, adresses et avis</li><li>Vérifier la disponibilité en temps réel</li><li>Vous guider dans la réservation</li><li>Vous surprendre avec des recommandations personnalisées</li></ul><p>Sam utilise uniquement les données de sam.ma et ne recommande que des établissements vérifiés.</p>',
  '<p><strong>Sam</strong> is Morocco''s first AI booking concierge:</p><ul><li>Click the <strong>floating button</strong> at the bottom right of the screen</li><li>Select <strong>"Sam AI"</strong></li><li>Ask your question in <strong>French, English, or Darija</strong></li></ul><p><strong>Sam can:</strong></p><ul><li>Search for restaurants, hotels, spas, activities...</li><li>Check menus, hours, addresses, and reviews</li><li>Verify real-time availability</li><li>Guide you through the booking process</li><li>Surprise you with personalized recommendations</li></ul><p>Sam only uses sam.ma data and only recommends verified establishments.</p>',
  'comptes_utilisateurs', 3, true, ARRAY['sam', 'ai', 'assistant', 'concierge', 'chatbot']::text[], NOW(), NOW()
);

-- ---------------------------------------------------------------------------
-- CATÉGORIE : comptes_pro
-- ---------------------------------------------------------------------------

INSERT INTO faq_articles (title, body, question_fr, question_en, answer_html_fr, answer_html_en, category, display_order, is_published, tags, created_at, updated_at)
VALUES (
  'Je suis un établissement : comment créer un compte PRO ?',
  '<p>Créez votre compte pro pour gérer vos réservations, menus et visibilité.</p>',
  'Je suis un établissement : comment créer un compte PRO ?',
  'I''m an establishment: how do I create a PRO account?',
  '<p>Pour créer un compte PRO :</p><ol><li>Rendez-vous sur <strong>sam.ma/pro</strong></li><li>Cliquez sur <strong>"Créer un compte professionnel"</strong></li><li>Renseignez les informations de votre établissement</li><li>Votre compte sera vérifié par notre équipe sous 24-48h</li></ol><p>Une fois validé, vous aurez accès à votre <strong>tableau de bord</strong> complet : réservations, menu digital, avis, statistiques, messagerie, et plus.</p>',
  '<p>To create a PRO account:</p><ol><li>Go to <strong>sam.ma/pro</strong></li><li>Click <strong>"Create a professional account"</strong></li><li>Fill in your establishment information</li><li>Your account will be verified by our team within 24-48h</li></ol><p>Once validated, you''ll have access to your full <strong>dashboard</strong>: reservations, digital menu, reviews, statistics, messaging, and more.</p>',
  'comptes_pro', 1, true, ARRAY['pro', 'account', 'create', 'establishment']::text[], NOW(), NOW()
);

INSERT INTO faq_articles (title, body, question_fr, question_en, answer_html_fr, answer_html_en, category, display_order, is_published, tags, created_at, updated_at)
VALUES (
  'Comment fonctionne la messagerie avec les clients ?',
  '<p>La messagerie pro permet de communiquer directement avec vos clients ayant une réservation.</p>',
  'Comment fonctionne la messagerie avec les clients ?',
  'How does messaging with clients work?',
  '<p>La <strong>messagerie pro</strong> (onglet "Messages") vous permet de :</p><ul><li>Voir toutes les <strong>conversations liées à vos réservations</strong></li><li>Répondre aux messages des clients en <strong>temps réel</strong></li><li>Envoyer des <strong>pièces jointes</strong> (images, PDF)</li><li>Configurer des <strong>réponses automatiques</strong> (horaires, vacances)</li><li>Marquer les conversations comme lues/non lues</li></ul><p><strong>Réponses automatiques :</strong> Allez dans Paramètres → Réponses auto pour configurer un message automatique en dehors de vos heures de disponibilité ou pendant vos congés.</p>',
  '<p>The <strong>pro messaging</strong> ("Messages" tab) allows you to:</p><ul><li>See all <strong>conversations linked to your reservations</strong></li><li>Reply to client messages in <strong>real-time</strong></li><li>Send <strong>attachments</strong> (images, PDF)</li><li>Set up <strong>auto-replies</strong> (schedule, vacation mode)</li><li>Mark conversations as read/unread</li></ul><p><strong>Auto-replies:</strong> Go to Settings → Auto-replies to configure an automatic message outside your availability hours or during your holidays.</p>',
  'comptes_pro', 2, true, ARRAY['messaging', 'chat', 'auto-reply', 'communication']::text[], NOW(), NOW()
);

INSERT INTO faq_articles (title, body, question_fr, question_en, answer_html_fr, answer_html_en, category, display_order, is_published, tags, created_at, updated_at)
VALUES (
  'Comment gérer les rôles et permissions de mon équipe ?',
  '<p>Attribuez des rôles et personnalisez les permissions de chaque membre de votre équipe.</p>',
  'Comment gérer les rôles et permissions de mon équipe ?',
  'How do I manage my team''s roles and permissions?',
  '<p>Le système de <strong>permissions par rôle</strong> (onglet "Équipe") :</p><p><strong>5 rôles disponibles :</strong></p><ul><li><strong>Propriétaire :</strong> tous les accès (non modifiable)</li><li><strong>Manager :</strong> gestion complète sauf équipe</li><li><strong>Réception :</strong> réservations et scanner QR</li><li><strong>Comptabilité :</strong> facturation et finances</li><li><strong>Marketing :</strong> offres, packs et visibilité</li></ul><p><strong>6 catégories de permissions :</strong> profil, équipe (propriétaire uniquement), réservations, facturation, inventaire, offres.</p><p>Le propriétaire peut <strong>personnaliser</strong> les permissions de chaque rôle depuis la matrice de permissions dans l''onglet Équipe.</p>',
  '<p>The <strong>role-based permissions</strong> system ("Team" tab):</p><p><strong>5 available roles:</strong></p><ul><li><strong>Owner:</strong> full access (not modifiable)</li><li><strong>Manager:</strong> full management except team</li><li><strong>Reception:</strong> reservations and QR scanner</li><li><strong>Accounting:</strong> billing and finances</li><li><strong>Marketing:</strong> offers, packs and visibility</li></ul><p><strong>6 permission categories:</strong> profile, team (owner only), reservations, billing, inventory, offers.</p><p>The owner can <strong>customize</strong> permissions for each role from the permissions matrix in the Team tab.</p>',
  'comptes_pro', 3, true, ARRAY['team', 'roles', 'permissions', 'owner', 'manager']::text[], NOW(), NOW()
);

INSERT INTO faq_articles (title, body, question_fr, question_en, answer_html_fr, answer_html_en, category, display_order, is_published, tags, created_at, updated_at)
VALUES (
  'Comment utiliser le scanner QR pour valider les réservations ?',
  '<p>Scannez le QR code des clients pour confirmer leur présence.</p>',
  'Comment utiliser le scanner QR pour valider les réservations ?',
  'How do I use the QR scanner to validate reservations?',
  '<p>Pour valider une réservation par QR code :</p><ol><li>Allez dans l''onglet <strong>"Scanner QR"</strong> de votre espace pro</li><li>Autorisez l''accès à la <strong>caméra</strong> de votre appareil</li><li>Scannez le <strong>QR code</strong> présenté par le client</li><li>La réservation est automatiquement validée (<strong>check-in</strong>)</li></ol><p>Le scan déclenche automatiquement :</p><ul><li>La confirmation de présence du client</li><li>La mise à jour du statut de la réservation</li><li>Le calcul des points de fiabilité du client (+5 pts)</li></ul>',
  '<p>To validate a reservation via QR code:</p><ol><li>Go to the <strong>"QR Scanner"</strong> tab in your pro dashboard</li><li>Allow <strong>camera</strong> access on your device</li><li>Scan the <strong>QR code</strong> presented by the client</li><li>The reservation is automatically validated (<strong>check-in</strong>)</li></ol><p>Scanning automatically triggers:</p><ul><li>Client presence confirmation</li><li>Reservation status update</li><li>Client reliability points calculation (+5 pts)</li></ul>',
  'comptes_pro', 4, true, ARRAY['qr', 'scanner', 'check-in', 'validation']::text[], NOW(), NOW()
);

INSERT INTO faq_articles (title, body, question_fr, question_en, answer_html_fr, answer_html_en, category, display_order, is_published, tags, created_at, updated_at)
VALUES (
  'Comment gérer mes capacités et créneaux ?',
  '<p>Configurez la capacité de votre établissement et les créneaux disponibles.</p>',
  'Comment gérer mes capacités et créneaux ?',
  'How do I manage my capacity and time slots?',
  '<p>Dans l''onglet <strong>"Réservations"</strong> → <strong>"Capacité"</strong> :</p><ul><li>Définissez le <strong>nombre de places total</strong> par créneau</li><li>Configurez les <strong>horaires d''ouverture</strong> par jour</li><li>Créez des <strong>créneaux spéciaux</strong> (brunch du dimanche, soirées thématiques)</li><li>Activez les <strong>remises sur créneau</strong> pour les heures creuses</li></ul><p>Le système gère automatiquement un <strong>buffer</strong> entre réservations gratuites et payantes pour optimiser votre taux de remplissage.</p>',
  '<p>In the <strong>"Reservations"</strong> tab → <strong>"Capacity"</strong>:</p><ul><li>Set the <strong>total number of seats</strong> per time slot</li><li>Configure <strong>opening hours</strong> by day</li><li>Create <strong>special slots</strong> (Sunday brunch, themed evenings)</li><li>Enable <strong>slot discounts</strong> for off-peak hours</li></ul><p>The system automatically manages a <strong>buffer</strong> between free and paid reservations to optimize your occupancy rate.</p>',
  'comptes_pro', 5, true, ARRAY['capacity', 'slots', 'availability', 'schedule']::text[], NOW(), NOW()
);

-- ---------------------------------------------------------------------------
-- CATÉGORIE : packs_offres
-- ---------------------------------------------------------------------------

INSERT INTO faq_articles (title, body, question_fr, question_en, answer_html_fr, answer_html_en, category, display_order, is_published, tags, created_at, updated_at)
VALUES (
  'À quoi servent les packs et offres ?',
  '<p>Les packs sont des offres spéciales proposées par les établissements.</p>',
  'À quoi servent les packs et offres ?',
  'What are packs and offers for?',
  '<p>Les <strong>Packs</strong> sont des offres spéciales créées par les établissements :</p><ul><li><strong>Réductions</strong> sur des menus, soins, activités</li><li><strong>Multi-usage</strong> : certains packs permettent plusieurs utilisations (ex: 5 entrées spa)</li><li><strong>Durée limitée</strong> : les packs ont des dates de validité</li><li><strong>Stock limité</strong> : nombre de places disponibles affiché</li></ul><p>Chaque pack acheté génère un <strong>QR code</strong> que vous présentez à l''établissement pour utilisation.</p>',
  '<p><strong>Packs</strong> are special offers created by establishments:</p><ul><li><strong>Discounts</strong> on menus, treatments, activities</li><li><strong>Multi-use</strong>: some packs allow multiple uses (e.g., 5 spa entries)</li><li><strong>Limited time</strong>: packs have validity dates</li><li><strong>Limited stock</strong>: number of available spots displayed</li></ul><p>Each purchased pack generates a <strong>QR code</strong> that you present at the establishment for use.</p>',
  'packs_offres', 1, true, ARRAY['packs', 'offers', 'deals', 'promotions']::text[], NOW(), NOW()
);

INSERT INTO faq_articles (title, body, question_fr, question_en, answer_html_fr, answer_html_en, category, display_order, is_published, tags, created_at, updated_at)
VALUES (
  'Comment acheter et utiliser un Pack ?',
  '<p>Achetez un pack en ligne et utilisez-le via QR code sur place.</p>',
  'Comment acheter et utiliser un Pack ?',
  'How do I buy and use a Pack?',
  '<p><strong>Acheter un Pack :</strong></p><ol><li>Parcourez les packs sur la page <strong>/packs</strong> ou sur la fiche d''un établissement</li><li>Sélectionnez le pack souhaité</li><li>Appliquez un <strong>code promo</strong> si vous en avez un</li><li>Procédez au paiement</li></ol><p><strong>Utiliser un Pack :</strong></p><ol><li>Allez dans <strong>"Mes Packs"</strong> dans votre profil</li><li>Présentez le <strong>QR code</strong> à l''établissement</li><li>Le professionnel scanne le code pour valider l''utilisation</li><li>Pour les packs multi-usage, le compteur d''utilisations se met à jour automatiquement</li></ol>',
  '<p><strong>Buying a Pack:</strong></p><ol><li>Browse packs on the <strong>/packs</strong> page or on an establishment''s listing</li><li>Select the desired pack</li><li>Apply a <strong>promo code</strong> if you have one</li><li>Proceed to payment</li></ol><p><strong>Using a Pack:</strong></p><ol><li>Go to <strong>"My Packs"</strong> in your profile</li><li>Show the <strong>QR code</strong> at the establishment</li><li>The professional scans the code to validate usage</li><li>For multi-use packs, the usage counter updates automatically</li></ol>',
  'packs_offres', 2, true, ARRAY['buy', 'purchase', 'use', 'qr-code', 'scan']::text[], NOW(), NOW()
);

INSERT INTO faq_articles (title, body, question_fr, question_en, answer_html_fr, answer_html_en, category, display_order, is_published, tags, created_at, updated_at)
VALUES (
  'Comment obtenir un remboursement sur un Pack ?',
  '<p>Les packs peuvent être remboursés sous certaines conditions.</p>',
  'Comment obtenir un remboursement sur un Pack ?',
  'How do I get a refund on a Pack?',
  '<p>La politique de remboursement des Packs :</p><ul><li><strong>Plus de 14 jours avant expiration :</strong> Remboursement intégral</li><li><strong>Moins de 14 jours + crédit préféré :</strong> 100% en crédit sam.ma</li><li><strong>Moins de 14 jours :</strong> Remboursement à 50%</li><li><strong>Pack expiré ou entièrement consommé :</strong> Pas de remboursement</li></ul><p>Pour demander un remboursement :</p><ol><li>Allez dans <strong>"Mes Packs"</strong></li><li>Sélectionnez le pack concerné</li><li>Cliquez sur <strong>"Demander un remboursement"</strong></li></ol>',
  '<p>Pack refund policy:</p><ul><li><strong>More than 14 days before expiry:</strong> Full refund</li><li><strong>Less than 14 days + credit preferred:</strong> 100% as sam.ma credit</li><li><strong>Less than 14 days:</strong> 50% refund</li><li><strong>Expired or fully consumed pack:</strong> No refund</li></ul><p>To request a refund:</p><ol><li>Go to <strong>"My Packs"</strong></li><li>Select the concerned pack</li><li>Click <strong>"Request a refund"</strong></li></ol>',
  'packs_offres', 3, true, ARRAY['refund', 'remboursement', 'policy', 'credit']::text[], NOW(), NOW()
);

INSERT INTO faq_articles (title, body, question_fr, question_en, answer_html_fr, answer_html_en, category, display_order, is_published, tags, created_at, updated_at)
VALUES (
  'Comment utiliser un code promo ?',
  '<p>Appliquez un code promo lors de l''achat d''un pack ou d''une réservation.</p>',
  'Comment utiliser un code promo ?',
  'How do I use a promo code?',
  '<p>Pour utiliser un code promo :</p><ol><li>Lors de l''achat d''un <strong>Pack</strong>, cliquez sur <strong>"J''ai un code promo"</strong></li><li>Saisissez votre code et cliquez sur <strong>"Appliquer"</strong></li><li>La réduction s''affiche immédiatement sur le prix</li></ol><p><strong>Types de codes promo :</strong></p><ul><li><strong>Codes établissement :</strong> créés par les professionnels pour leurs packs</li><li><strong>Codes plateforme :</strong> créés par sam.ma pour des opérations spéciales</li></ul><p>Certains codes sont limités (premier achat, date de validité, nombre d''utilisations max).</p>',
  '<p>To use a promo code:</p><ol><li>When buying a <strong>Pack</strong>, click <strong>"I have a promo code"</strong></li><li>Enter your code and click <strong>"Apply"</strong></li><li>The discount is immediately shown on the price</li></ol><p><strong>Types of promo codes:</strong></p><ul><li><strong>Establishment codes:</strong> created by professionals for their packs</li><li><strong>Platform codes:</strong> created by sam.ma for special operations</li></ul><p>Some codes are limited (first purchase, validity date, max usage count).</p>',
  'packs_offres', 4, true, ARRAY['promo', 'code', 'discount', 'coupon']::text[], NOW(), NOW()
);

-- ---------------------------------------------------------------------------
-- CATÉGORIE : support_general
-- ---------------------------------------------------------------------------

INSERT INTO faq_articles (title, body, question_fr, question_en, answer_html_fr, answer_html_en, category, display_order, is_published, tags, created_at, updated_at)
VALUES (
  'Comment contacter le support ?',
  '<p>Contactez-nous par chat, ticket ou email.</p>',
  'Comment contacter le support ?',
  'How do I contact support?',
  '<p>Plusieurs moyens de nous contacter :</p><ul><li><strong>Chat en direct :</strong> Disponible de 9h à 19h dans l''onglet Assistance. Cliquez sur le champ de chat et écrivez votre message.</li><li><strong>Tickets support :</strong> Créez un ticket pour les demandes complexes. Vous recevrez une réponse sous 24h (2h pour les urgences).</li><li><strong>Email :</strong> support@sortiraumaroc.com</li></ul><p>Pour les professionnels, le support est accessible directement depuis votre <strong>espace pro → Assistance</strong>.</p>',
  '<p>Several ways to contact us:</p><ul><li><strong>Live chat:</strong> Available 9am-7pm in the Assistance tab. Click the chat field and type your message.</li><li><strong>Support tickets:</strong> Create a ticket for complex requests. You''ll receive a response within 24h (2h for urgent issues).</li><li><strong>Email:</strong> support@sortiraumaroc.com</li></ul><p>For professionals, support is accessible directly from your <strong>pro dashboard → Assistance</strong>.</p>',
  'support_general', 1, true, ARRAY['contact', 'support', 'help', 'chat', 'ticket']::text[], NOW(), NOW()
);

INSERT INTO faq_articles (title, body, question_fr, question_en, answer_html_fr, answer_html_en, category, display_order, is_published, tags, created_at, updated_at)
VALUES (
  'Comment fonctionne le programme de fidélité ?',
  '<p>Gagnez des points à chaque réservation honorée et débloquez des avantages.</p>',
  'Comment fonctionne le programme de fidélité ?',
  'How does the loyalty program work?',
  '<p>Le <strong>programme de fidélité</strong> sam.ma vous récompense pour votre activité :</p><ul><li><strong>Gagnez des points</strong> à chaque réservation honorée, avis déposé, et participation aux événements</li><li><strong>Montez de niveau</strong> : Bronze → Argent → Or → Platine</li><li><strong>Débloquez des avantages</strong> : réductions exclusives, accès prioritaire, offres VIP</li></ul><p>Consultez votre solde de points et votre niveau dans votre <strong>profil</strong> → section <strong>"Fidélité"</strong>.</p>',
  '<p>The sam.ma <strong>loyalty program</strong> rewards your activity:</p><ul><li><strong>Earn points</strong> with each honored reservation, review posted, and event participation</li><li><strong>Level up</strong>: Bronze → Silver → Gold → Platinum</li><li><strong>Unlock benefits</strong>: exclusive discounts, priority access, VIP offers</li></ul><p>Check your points balance and level in your <strong>profile</strong> → <strong>"Loyalty"</strong> section.</p>',
  'support_general', 2, true, ARRAY['loyalty', 'fidelite', 'points', 'rewards', 'levels']::text[], NOW(), NOW()
);

INSERT INTO faq_articles (title, body, question_fr, question_en, answer_html_fr, answer_html_en, category, display_order, is_published, tags, created_at, updated_at)
VALUES (
  'Qu''est-ce que la politique anti no-show de sam.ma ?',
  '<p>sam.ma applique une politique stricte contre les no-shows pour protéger les établissements.</p>',
  'Qu''est-ce que la politique anti no-show de sam.ma ?',
  'What is sam.ma''s anti no-show policy?',
  '<p>Pour protéger nos partenaires établissements, sam.ma applique une <strong>politique anti no-show</strong> progressive :</p><ul><li><strong>1er no-show :</strong> Avertissement + pénalité scoring (-15 pts)</li><li><strong>3 no-shows consécutifs :</strong> Suspension temporaire de 7 jours</li><li><strong>5 no-shows cumulés :</strong> Suspension de 30 jours</li></ul><p><strong>Processus de litige :</strong></p><ol><li>Le professionnel déclare un no-show</li><li>Vous avez <strong>48 heures</strong> pour contester</li><li>Si vous contestez, un arbitrage est réalisé par l''équipe sam.ma</li><li>Si vous ne répondez pas dans les 48h, le no-show est confirmé automatiquement</li></ol><p>Les suspensions sont <strong>levées automatiquement</strong> à leur expiration.</p>',
  '<p>To protect our partner establishments, sam.ma applies a <strong>progressive anti no-show policy</strong>:</p><ul><li><strong>1st no-show:</strong> Warning + scoring penalty (-15 pts)</li><li><strong>3 consecutive no-shows:</strong> 7-day temporary suspension</li><li><strong>5 cumulative no-shows:</strong> 30-day suspension</li></ul><p><strong>Dispute process:</strong></p><ol><li>The professional declares a no-show</li><li>You have <strong>48 hours</strong> to dispute</li><li>If you dispute, arbitration is handled by the sam.ma team</li><li>If you don''t respond within 48h, the no-show is automatically confirmed</li></ol><p>Suspensions are <strong>automatically lifted</strong> upon expiry.</p>',
  'support_general', 3, true, ARRAY['no-show', 'policy', 'suspension', 'dispute', 'anti-fraud']::text[], NOW(), NOW()
);

INSERT INTO faq_articles (title, body, question_fr, question_en, answer_html_fr, answer_html_en, category, display_order, is_published, tags, created_at, updated_at)
VALUES (
  'Comment créer et gérer des Packs en tant que professionnel ?',
  '<p>Les professionnels peuvent créer des packs spéciaux pour attirer des clients.</p>',
  'Comment créer et gérer des Packs en tant que professionnel ?',
  'How do I create and manage Packs as a professional?',
  '<p>Pour créer un Pack depuis votre espace pro :</p><ol><li>Allez dans <strong>"Packs & Promotions"</strong></li><li>Cliquez sur <strong>"Nouveau Pack"</strong></li><li>Renseignez : titre, description, prix, réduction, photos, conditions</li><li>Configurez : stock disponible, dates de validité, jours/horaires valides</li><li>Soumettez le pack pour <strong>modération</strong></li></ol><p>Après validation par l''équipe sam.ma, votre pack sera publié. Vous pouvez ensuite :</p><ul><li><strong>Suspendre/reprendre</strong> les ventes temporairement</li><li><strong>Dupliquer</strong> un pack existant pour en créer un nouveau</li><li><strong>Consulter les statistiques</strong> de ventes</li><li><strong>Scanner les QR codes</strong> des clients pour valider l''utilisation</li></ul>',
  '<p>To create a Pack from your pro dashboard:</p><ol><li>Go to <strong>"Packs & Promotions"</strong></li><li>Click <strong>"New Pack"</strong></li><li>Fill in: title, description, price, discount, photos, conditions</li><li>Configure: available stock, validity dates, valid days/hours</li><li>Submit the pack for <strong>moderation</strong></li></ol><p>After validation by the sam.ma team, your pack will be published. You can then:</p><ul><li><strong>Suspend/resume</strong> sales temporarily</li><li><strong>Duplicate</strong> an existing pack to create a new one</li><li><strong>Check sales statistics</strong></li><li><strong>Scan QR codes</strong> from clients to validate usage</li></ul>',
  'comptes_pro', 6, true, ARRAY['packs', 'create', 'manage', 'pro', 'moderation']::text[], NOW(), NOW()
);

INSERT INTO faq_articles (title, body, question_fr, question_en, answer_html_fr, answer_html_en, category, display_order, is_published, tags, created_at, updated_at)
VALUES (
  'Comment contester une facture de commission ?',
  '<p>Si vous n''êtes pas d''accord avec une facture, vous pouvez la contester.</p>',
  'Comment contester une facture de commission ?',
  'How do I dispute a commission invoice?',
  '<p>Pour contester une facture de commission :</p><ol><li>Allez dans <strong>"Finances"</strong> → <strong>"Périodes"</strong></li><li>Sélectionnez la période concernée</li><li>Cliquez sur <strong>"Contester"</strong></li><li>Décrivez le motif de votre contestation</li></ol><p><strong>Processus :</strong></p><ul><li>L''équipe sam.ma examine votre contestation sous <strong>5 jours</strong></li><li>Si acceptée : un avoir est généré et le montant corrigé</li><li>Si rejetée : vous pouvez <strong>escalader</strong> la contestation pour un second examen</li></ul>',
  '<p>To dispute a commission invoice:</p><ol><li>Go to <strong>"Finances"</strong> → <strong>"Periods"</strong></li><li>Select the concerned period</li><li>Click <strong>"Dispute"</strong></li><li>Describe the reason for your dispute</li></ol><p><strong>Process:</strong></p><ul><li>The sam.ma team reviews your dispute within <strong>5 days</strong></li><li>If accepted: a credit note is generated and the amount corrected</li><li>If rejected: you can <strong>escalate</strong> the dispute for a second review</li></ul>',
  'comptes_pro', 7, true, ARRAY['dispute', 'invoice', 'billing', 'contest', 'commission']::text[], NOW(), NOW()
);

COMMIT;

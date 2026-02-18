import type { TranslationKey } from "../translation-keys";

const it: Partial<Record<TranslationKey, string>> = {
    // Comune
    "common.close": "Chiudi",
    "common.cancel": "Annulla",
    "common.confirm": "Conferma",
    "common.continue": "Continua",
    "common.back": "Indietro",
    "common.prev": "Precedente",
    "common.next": "Successivo",
    "common.pdf": "PDF",
    "common.error.load_failed": "Errore di caricamento",
    "currency.mad.short": "Dhs",
    "common.loading": "Caricamento…",
    "common.refresh": "Aggiorna",
    "common.impossible": "Impossibile",
    "common.error.generic": "Errore",
    "common.error.unexpected": "Errore imprevisto",
    "common.clear": "Cancella",
    "common.edit": "Modifica",
    "common.reset": "Reimposta",
    "common.help": "Aiuto",

    // Ripresa navigazione
    "navigation.resume.title": "Riprendi la navigazione",
    "navigation.resume.description": "Avevi iniziato una ricerca. Vuoi riprenderla?",
    "navigation.resume.continue": "Riprendi",
    "navigation.resume.new_search": "Nuova ricerca",
    "navigation.resume.search": "La tua ricerca",
    "navigation.resume.establishment_page": "Pagina struttura",
    "navigation.resume.just_now": "Proprio ora",
    "navigation.resume.minutes_ago": "{n} min fa",
    "navigation.resume.hours_ago": "{n}h fa",

    "content.toc": "Sommario",
    "content.related_links": "Link utili",

    "blog.index.title": "Blog",
    "blog.index.subtitle":
      "Novità, guide e consigli per le vostre uscite in Marocco.",
    "blog.index.error": "Impossibile caricare gli articoli.",
    "blog.index.empty.title": "Nessun articolo al momento",
    "blog.index.empty.subtitle":
      "Pubblica un articolo dal Super-admin per vederlo apparire qui.",
    "blog.index.back_home": "Torna alla home",

    "common.coming_soon": "Disponibile a breve",
    "common.change": "Cambia",
    "common.user": "Utente",
    "common.today": "Oggi",
    "common.tomorrow": "Domani",
    "common.at": "alle",
    "common.time_placeholder": "hh:mm",
    "common.person.one": "persona",
    "common.person.other": "persone",
    "timepicker.title": "Scegli un orario",

    // Persone
    "persons.title": "Persone",
    "persons.button.confirm": "Conferma",
    "persons.action.add": "Aggiungi {label}",
    "persons.action.remove": "Rimuovi {label}",
    "persons.age_group.age0_2": "0–2 anni",
    "persons.age_group.age3_6": "3–6 anni",
    "persons.age_group.age6_12": "6–12 anni",
    "persons.age_group.age12_17": "12–17 anni",
    "persons.age_group.age18_plus": "+18 anni",

    // Lingua
    "language.french": "Français",
    "language.english": "English",
    "language.switcher.label": "Lingua",
    "language.suggestion.title":
      "Sortir Au Maroc è disponibile in Français / English.",
    "language.suggestion.subtitle":
      "Scegli la tua lingua. Potrai cambiarla in qualsiasi momento.",

    // Intestazione
    "header.add_establishment.full": "Aggiungi la mia struttura",
    "header.add_establishment.short": "Aggiungi",
    "header.profile.menu": "Menu profilo",
    "header.profile.photo_alt": "Foto profilo",
    "header.profile.my_account": "Il mio identificativo",
    "header.profile.my_profile": "Il mio profilo",

    // Offerta lista d'attesa
    "profile.bookings.waitlist_offer": "Offerta disponibile",
    "header.profile.logout": "Disconnetti",
    "header.login": "Accedi",
    "header.brand": "Sortir Au Maroc",
    "header.pro_space": "Area Pro",
    "header.logo_alt": "Sortir Au Maroc",

    "header.pro_conflict.title": "Disconnessione Pro richiesta",
    "header.pro_conflict.description":
      "Sei connesso all'area Pro. Per accedere come utente, disconnettiti prima dall'area Pro.",
    "header.pro_conflict.go_to_pro": "Vai alla mia area Pro",
    "header.pro_conflict.logout_pro": "Disconnessione Pro",

    // Autenticazione
    "auth.title.login": "Accedi a Sortir Au Maroc",
    "auth.title.forgot": "Password dimenticata?",
    "auth.title.signup": "Crea un account gratuitamente",

    "auth.subtitle.login":
      "Accedi alle tue prenotazioni, preferiti e offerte esclusive",
    "auth.subtitle.forgot":
      "Inserisci la tua email o il numero di telefono per ricevere un link di reimpostazione.",
    "auth.subtitle.signup":
      "Crea il tuo account per accedere a prenotazioni, preferiti e offerte esclusive.",

    "auth.field.email_or_phone.label": "Email o Telefono",
    "auth.field.email_or_phone.placeholder":
      "tua@email.com o +212 6XX XXX XXX",
    "auth.field.password.label": "Password",

    "auth.link.forgot_password": "Password dimenticata?",
    "auth.link.create_account": "Crea un account",
    "auth.link.login": "Accedi",

    "auth.password.show": "Mostra password",
    "auth.password.hide": "Nascondi password",

    "auth.button.login": "Accedi",
    "auth.button.login_busy": "Accesso…",
    "auth.button.demo_login": "Accesso demo",

    "auth.or_continue_with": "Oppure continua con",
    "auth.button.continue_with_google": "Continua con Google",
    "auth.button.continue_with_apple": "Continua con Apple",
    "auth.button.continue_with_facebook": "Continua con Facebook",

    "auth.button.send_reset": "Invia il link",
    "auth.button.send_reset_busy": "Invio…",

    "auth.button.signup": "Crea il mio account",
    "auth.button.signup_busy": "Creazione…",

    "auth.note.no_account": "Non hai un account?",
    "auth.note.have_account": "Hai già un account?",

    "auth.error.demo_login_failed":
      "Impossibile accedere all'account demo. Riprova.",
    "auth.error.phone_login_unavailable":
      "Al momento l'accesso tramite telefono non è disponibile. Utilizza un'email.",
    "auth.error.invalid_credentials":
      "Credenziali errate o account inesistente.",
    "auth.error.reset_by_phone_unavailable":
      "Reimpostazione tramite telefono non disponibile. Utilizza la tua email.",
    "auth.error.reset_send_failed":
      "Impossibile inviare il link di reimpostazione. Riprova.",
    "auth.error.signup_requires_email":
      "Al momento la registrazione richiede un'email.",
    "auth.error.signup_failed":
      "Impossibile creare l'account. Verifica l'email e riprova.",
    "auth.error.too_many_attempts":
      "Troppi tentativi. Attendi qualche secondo e riprova.",
    "auth.error.signup_spam_detected":
      "Registrazione bloccata (rilevamento anti-spam).",
    "auth.error.social_unconfigured":
      "Accesso {provider} non configurato al momento.",
    "auth.error.social_login_failed":
      "Impossibile accedere con questo social network. Riprova.",

    "auth.notice.reset_link_sent":
      "Link di reimpostazione inviato. Controlla la tua casella email.",
    "auth.notice.account_created":
      "Account creato. Verifica la tua email per confermare e poi riconnettiti.",

    // Autenticazione telefono
    "auth.phone.title": "Accesso tramite telefono",
    "auth.phone.subtitle": "Inserisci il tuo numero di telefono per ricevere un codice di verifica via SMS.",
    "auth.phone.label": "Numero di telefono",
    "auth.phone.hint": "Riceverai un SMS con un codice a 6 cifre.",
    "auth.phone.send_code": "Invia il codice",
    "auth.phone.verify_title": "Verifica",
    "auth.phone.code_sent_to": "Codice inviato al",
    "auth.phone.resend_code": "Reinvia il codice",
    "auth.phone.resend_in": "Reinvia tra",
    "auth.phone.success_title": "Accesso riuscito",
    "auth.phone.success_message": "Sei connesso!",
    "auth.phone.redirecting": "Reindirizzamento in corso...",
    "auth.phone.use_email_instead": "Usa l'email invece",
    "auth.phone.use_phone_instead": "Accedi tramite telefono",
    "auth.phone.error.invalid_number": "Numero di telefono non valido.",
    "auth.phone.error.send_failed": "Impossibile inviare il codice. Riprova.",
    "auth.phone.error.too_many_requests": "Troppi tentativi. Riprova tra qualche minuto.",
    "auth.phone.error.invalid_code": "Codice errato. Verifica e riprova.",
    "auth.phone.error.code_expired": "Il codice è scaduto. Richiedine uno nuovo.",
    "auth.phone.error.verify_failed": "Verifica fallita. Riprova.",
    "auth.phone.error.not_configured": "L'autenticazione tramite telefono non è disponibile al momento.",

    // Piè di pagina
    "footer.brand": "Sortir Au Maroc",
    "footer.section.partners": "Partner",
    "footer.section.professionals": "Professionisti",
    "footer.section.help": "Aiuto",
    "footer.section.legal": "Legale",
    "footer.section.download_app": "Scarica l'app",

    "footer.link.discover": "Scopri",
    "footer.link.about": "Chi siamo",
    "footer.link.contact": "Contatti",
    "footer.link.blog": "Blog",
    "footer.link.videos": "Video",
    "footer.link.careers": "Carriere",

    "footer.link.become_sponsor": "Diventa sponsor",
    "footer.link.for_providers": "Per i fornitori",
    "footer.link.partner_space": "Area Fornitori",

    "footer.link.create_pro_account": "Crea un account pro",
    "footer.link.pro_space": "Area Pro",
    "footer.link.pricing_offers": "Tariffe e offerte",
    "footer.link.features": "Funzionalità",
    "footer.link.request_demo": "Richiedi una demo",

    "footer.link.faq": "Domande frequenti",
    "footer.link.contact_phone": "Contattaci · 05 20 12 34 56",
    "footer.link.terms": "Condizioni d'uso",
    "footer.link.privacy": "Politica sulla Privacy",
    "footer.link.legal_notice": "Note legali",
    "footer.link.partner_charter": "Carta delle strutture",
    "footer.link.refund_policy": "Politica di rimborso",
    "footer.link.anti_no_show_policy": "Politica anti no-show",

    "footer.link.apple_store": "Apple Store",
    "footer.link.google_play": "Google Play",
    "footer.link.admin_aria": "Accedi all'interfaccia Admin",

    "footer.section.discover": "Scopri",
    "footer.install_app": "Installa l'applicazione",

    "footer.copyright_suffix": ". Tutti i diritti riservati.",

    // PWA
    "pwa.update_available": "Nuova versione disponibile",
    "pwa.update_description": "Clicca per aggiornare l'applicazione.",
    "pwa.update_button": "Aggiorna",
    "pwa.ios_guide_title": "Installa la webapp sam.ma",
    "pwa.ios_guide_subtitle": "Aggiungi l'app alla schermata Home per un accesso rapido.",
    "pwa.ios_step1_title": "Premi il pulsante Condividi",
    "pwa.ios_step1_desc": "In basso in Safari, premi l'icona di condivisione (quadrato con freccia verso l'alto).",
    "pwa.ios_step2_title": "\"Aggiungi alla schermata Home\"",
    "pwa.ios_step2_desc": "Scorri e premi \"Aggiungi alla schermata Home\".",
    "pwa.ios_step3_title": "Premi Aggiungi",
    "pwa.ios_step3_desc": "Conferma premendo \"Aggiungi\" in alto a destra. Fatto!",
    "pwa.ios_guide_ok": "Ho capito",

    // Notifiche push
    "push.prompt_title": "Attiva le notifiche",
    "push.prompt_description": "Ricevi le conferme di prenotazione e gli avvisi della lista d'attesa in tempo reale.",
    "push.prompt_enable": "Attiva",
    "push.prompt_enabling": "Attivazione…",
    "push.prompt_later": "Più tardi",

    // Preferenze profilo
    "profile.prefs.section_communication": "Comunicazione",
    "profile.prefs.newsletter_desc": "Ricevi novità, offerte e selezioni.",
    "profile.prefs.reminders": "Promemoria prenotazione",
    "profile.prefs.reminders_desc": "Ricevi un promemoria prima delle tue uscite.",
    "profile.prefs.whatsapp_desc": "Autorizza conferme e messaggi tramite WhatsApp.",
    "profile.prefs.section_push": "Notifiche push",
    "profile.prefs.push_blocked": "Le notifiche sono bloccate nelle impostazioni del browser. Per riattivarle, modifica i permessi del sito nel browser.",
    "profile.prefs.push_enabled": "Notifiche push",
    "profile.prefs.push_enabled_desc": "Ricevi notifiche su questo dispositivo.",
    "profile.prefs.push_bookings": "Prenotazioni",
    "profile.prefs.push_bookings_desc": "Conferme, promemoria e aggiornamenti delle prenotazioni.",
    "profile.prefs.push_waitlist": "Lista d'attesa",
    "profile.prefs.push_waitlist_desc": "Avvisi quando un posto si libera.",
    "profile.prefs.push_marketing": "Offerte e promozioni",
    "profile.prefs.push_marketing_desc": "Offerte speciali e raccomandazioni personalizzate.",

    // Newsletter
    "newsletter.title": "Newsletter",
    "newsletter.subtitle": "Ricevi le nostre offerte e novità",
    "newsletter.placeholder": "La tua email",
    "newsletter.button": "OK",
    "newsletter.success": "Grazie! Sei iscritto.",
    "newsletter.error.generic": "Si è verificato un errore. Riprova.",
    "newsletter.error.invalid_email": "Indirizzo email non valido",

    // Pagina video
    "videos.page.title": "Video",
    "videos.page.subtitle": "Scopri le migliori strutture del Marocco attraverso i nostri video esclusivi.",
    "videos.page.empty_title": "Nessun video disponibile",
    "videos.page.empty_description": "Torna presto per scoprire i nostri nuovi video.",

    // Pagine supporto
    "help.title": "Aiuto e Supporto",
    "help.subtitle":
      "FAQ, ticket di supporto e chat (disponibile dalle 9 alle 19).",
    "help.login_required":
      "Per creare un ticket o utilizzare la chat, devi essere connesso. La FAQ resta disponibile per tutti.",
    "help.tab.faq": "FAQ",
    "help.tab.tickets": "Ticket",
    "help.tab.chat": "Chat",

    "faq.title": "Domande frequenti",
    "faq.subtitle":
      "Trova le risposte alle domande più comuni: prenotazioni, cancellazioni, pagamento e assistenza.",
    "faq.button.access_help": "Accedi all'aiuto (ticket e chat)",
    "faq.phone_support.title": "Assistenza telefonica",
    "faq.phone_support.hours": " · dalle 9 alle 19",

    "faq.section.title": "FAQ · Domande frequenti",
    "faq.section.subtitle":
      "Digita qualche parola chiave (es: \"cancellazione\", \"pagamento\", \"ritardo\").",
    "faq.section.search_placeholder": "Cerca nelle FAQ…",
    "faq.section.categories": "Categorie",
    "faq.section.category_all": "Tutte le categorie",
    "faq.section.category_all_short": "Tutte",
    "faq.section.results": "{count} risultato/i",
    "faq.section.empty": "Nessun risultato. Prova con altre parole chiave.",
    "faq.section.error_load": "Impossibile caricare la FAQ. Riprova.",

    "faq.category.reservations": "Prenotazioni",
    "faq.category.reservations.desc":
      "Conferma, orari, numero di persone, dettagli della prenotazione.",
    "faq.category.paiements": "Pagamenti",
    "faq.category.paiements.desc":
      "Acconto, fattura, metodi di pagamento, rimborsi.",
    "faq.category.annulations": "Cancellazioni",
    "faq.category.annulations.desc":
      "Cambiare data, cancellare, politiche della struttura.",
    "faq.category.comptes_utilisateurs": "Account utenti",
    "faq.category.comptes_utilisateurs.desc":
      "Accesso, dati personali, sicurezza dell'account.",
    "faq.category.comptes_pro": "Account Pro",
    "faq.category.comptes_pro.desc":
      "Area pro, visibilità, gestione delle prenotazioni.",
    "faq.category.packs_offres": "Pack e offerte",
    "faq.category.packs_offres.desc": "Offerte, pack, visibilità, condizioni.",
    "faq.category.support_general": "Supporto generale",
    "faq.category.support_general.desc":
      "Assistenza, ticket, contatti e domande generali.",

    // SEO
    "seo.home.title": "Sortir Au Maroc — Prenota le migliori esperienze in Marocco",
    "seo.home.description":
      "Trova e prenota ristoranti, svago, spa, hotel ed esperienze in Marocco. Prenotazione semplice, conferme e supporto.",
    "seo.home.keywords":
      "prenotazione, ristorante, svago, spa, hotel, attività, Marocco",

    // Home
    "home.hero.title": "Scopri e prenota le migliori attività",
    "home.hero.subtitle":
      "Ristoranti, svago, wellness e molto altro. Prenota online in Marocco",

    "home.universe.restaurants": "Mangiare e Bere",
    "home.universe.sport": "Sport e Benessere",
    "home.universe.leisure": "Svago",
    "home.universe.accommodation": "Alloggio",
    "home.universe.culture": "Cultura",
    "home.universe.shopping": "Shopping",
    "home.universe.rentacar": "Spostarsi",

    "home.sections.best_offers.title": "Le nostre migliori offerte",
    "home.sections.selected_for_you.title":
      "Ristoranti selezionati per te",
    "home.sections.selected_for_you.activities.title":
      "Attività selezionate per te",
    "home.sections.selected_for_you.sport.title":
      "Sport e Benessere selezionati per te",
    "home.sections.selected_for_you.accommodation.title":
      "Alloggi selezionati per te",
    "home.sections.selected_for_you.culture.title":
      "Cultura selezionata per te",
    "home.sections.selected_for_you.shopping.title":
      "Shopping selezionato per te",
    "home.sections.selected_for_you.rentacar.title":
      "Veicoli selezionati per te",
    "home.sections.nearby.title": "Nelle tue vicinanze",
    "home.sections.most_booked.title": "I più prenotati del mese",
    "home.sections.open_now.title": "Aperto adesso",
    "home.sections.trending.title": "Di tendenza questo mese",
    "home.sections.new.title": "Novità",
    "home.sections.top_rated.title": "I più apprezzati",
    "home.sections.deals.title": "Le migliori offerte del momento",
    "home.sections.themed.romantic": "Per una serata romantica",
    "home.sections.themed.brunch": "Voglia di brunch?",
    "home.sections.themed.lunch": "Per la tua pausa pranzo",
    "home.sections.themed.ramadan": "Selezione Ftour e Shour",
    "home.sections.ramadan.title": "Speciale Ramadan",
    "home.sections.ramadan.subtitle": "Scopri le migliori proposte Ftour",

    "home.categories.restaurants.title": "Che cosa ti va?",
    "home.categories.sport.title": "Quale attività ti tenta?",
    "home.categories.loisirs.title": "Voglia di svago?",
    "home.categories.hebergement.title": "Che tipo di alloggio?",
    "home.categories.culture.title": "Voglia di cultura?",
    "home.categories.shopping.title": "Voglia di shopping?",
    "home.categories.rentacar.title": "Noleggia il tuo veicolo",
    "home.sections.top100.title": "Scopri la Top 100",
    "home.sections.top100.image_alt": "Top 100",
    "home.sections.view_all": "Vedi tutti",
    "home.sections.view_more": "VEDI DI PIÙ",

    "home.cards.reviews_count": "{count} recensioni",
    "home.cards.next_slot": "Prossima fascia oraria: {slot}",
    "home.cards.promo_badge": "-{percent}%",
    "home.cards.curated_badge": "Selezione",
    "home.cards.month_reservations_label": "Prenotazioni (30gg)",
    "home.cards.view_details_aria": "Vedi la scheda: {name}",

    "home.how_it_works.title": "Come funziona?",
    "home.how_it_works.subtitle":
      "Prenota la tua attività preferita in pochi clic",
    "home.how_it_works.step1.title": "Scopri",
    "home.how_it_works.step1.text":
      "Esplora i ristoranti e le attività vicino a te",
    "home.how_it_works.step2.title": "Seleziona",
    "home.how_it_works.step2.text":
      "Scegli la data, l'ora e il numero di persone",
    "home.how_it_works.step3.title": "Paga",
    "home.how_it_works.step3.text":
      "Completa la tua prenotazione in tutta sicurezza",
    "home.how_it_works.step4.title": "Goditi",
    "home.how_it_works.step4.text":
      "Ricevi la conferma e la guida del luogo",

    "home.owner_block.image_alt": "Proprietario di struttura",
    "home.owner_block.title": "Sei proprietario di una struttura?",
    "home.owner_block.subtitle": "Registra la tua struttura",
    "home.owner_block.paragraph":
      "Parlaci della tua struttura e ti contatteremo il prima possibile.",
    "home.owner_block.button_more": "MAGGIORI INFORMAZIONI",
    "home.owner_block.already_partner": "Già partner",
    "home.owner_block.already_partner_text":
      "Accedi alla tua dashboard per gestire prenotazioni, informazioni, categorie (tassonomie), offerte, fatture e messaggistica. Hai bisogno di aiuto? Contattaci tramite la chat.",
    "home.owner_block.dashboard_button": "ACCEDI ALLA DASHBOARD",

    "home.featured_offers.items.discount_50.title": "Fino al 50% di sconto",
    "home.featured_offers.items.discount_50.badge": "Offerta del momento",
    "home.featured_offers.items.weekend_brunch.title": "Brunch del Weekend",
    "home.featured_offers.items.weekend_brunch.badge": "In evidenza",
    "home.featured_offers.items.terrace_night.title": "Serata in Terrazza",
    "home.featured_offers.items.terrace_night.badge": "Offerta Limitata",
    "home.featured_offers.items.beach_vibes.title": "Atmosfera Spiaggia",
    "home.featured_offers.items.beach_vibes.badge": "Nuovo",
    "home.featured_offers.items.tasting_menu.title": "Menu Degustazione",
    "home.featured_offers.items.tasting_menu.badge": "Speciale",
    "home.featured_offers.items.culinary_experience.title":
      "Esperienza Culinaria",
    "home.featured_offers.items.culinary_experience.badge": "Esclusivo",

    // Sezioni homepage
    "home.search.placeholder.restaurants": "Cucina, ristorante, piatto...",
    "home.search.placeholder.restaurants_detailed": "Cucina, nome del ristorante, piatto...",
    "home.search.placeholder.accommodation": "Hotel, tipo, servizi...",
    "home.search.placeholder.accommodation_detailed": "Nome hotel, tipo, servizi...",
    "home.search.placeholder.activities": "Attività, luogo...",
    "home.search.placeholder.activities_detailed": "Attività, luogo, tipo...",
    "home.cities.title": "Altre città in Marocco",
    "home.cities.see_more": "Vedi di più",
    "home.videos.title": "Video",
    "home.videos.book": "Prenota",
    "home.videos.close": "Chiudi",
    "home.videos.fullscreen": "Schermo intero",
    "home.blog.title": "Blog",
    "home.blog.read": "Leggi",
    "home.blog.see_more": "Vedi di più",
    "home.sponsored": "Sponsorizzato",
    "home.how_it_works.default.exclusive_offers.title": "Offerte esclusive",
    "home.how_it_works.default.exclusive_offers.description": "Approfitta di sconti e vantaggi unici presso le nostre strutture partner in Marocco.",
    "home.how_it_works.default.best_choice.title": "La scelta migliore",
    "home.how_it_works.default.best_choice.description": "Una selezione accurata di strutture per ogni esigenza: ristoranti, svago, benessere...",
    "home.how_it_works.default.verified_reviews.title": "Recensioni verificate",
    "home.how_it_works.default.verified_reviews.description": "Raccomandazioni autentiche dalla nostra community per guidare le tue scelte.",
    "home.how_it_works.default.easy_booking.title": "Prenotazione facile",
    "home.how_it_works.default.easy_booking.description": "Prenota istantaneamente, gratuitamente, ovunque e in qualsiasi momento. 24/7.",

    // Risultati / Lista
    "results.search": "Cerca",
    "results.filters": "Filtri",
    "results.view.list": "Lista",
    "results.view.map": "Mappa",
    "results.summary.found": "{label} trovati",
    "results.summary.showing": "Visualizzazione",
    "results.geolocation.enable":
      "Attiva la geolocalizzazione per vedere la distanza",
    "results.no_results.title": "Nessuna struttura trovata",
    "results.no_results.body": "Non abbiamo trovato strutture corrispondenti ai tuoi criteri.",
    "results.no_results.suggestion": "Prova a modificare i filtri o esplora altre destinazioni per la tua prossima uscita in coppia, con amici o in famiglia!",
    "results.no_results.open_filters": "Modifica i filtri",
    "results.no_results.new_search": "Nuova ricerca",
    "results.sponsored": "Sponsorizzato",
    "results.status.open": "Aperto",
    "results.status.closed": "Chiuso",
    "results.promo.ongoing": "Offerta in corso",
    "results.favorite.add": "Aggiungi ai preferiti",
    "results.favorite.remove": "Rimuovi dai preferiti",
    "results.highlight.today_prefix": "Oggi: ",
    "results.offer.up_to": "Fino a -{percent}%",
    "results.action.book": "Prenota",
    "results.action.view": "Vedi",
    "results.action.view_hotel": "Vedi l'hotel",
    "results.load_more": "Mostra {count} risultati aggiuntivi",
    "results.people.option.1": "1 persona",
    "results.people.option.2": "2 persone",
    "results.people.option.3": "3 persone",
    "results.people.option.4": "4 persone",
    "results.people.option.5_plus": "5+ persone",
    "results.search_placeholder": "Dove vuoi andare?",
    "results.filter.date": "Data",
    "results.filter.time": "Ora",
    "results.filter.persons_short": "pers.",
    "results.filter.promotions": "Promozioni",
    "results.filter.best_rated": "Più votati",
    "results.filter.cuisine_type": "Tipo di cucina",
    "results.filter.ambiance": "Atmosfera",
    "results.filter.sort_and_filter": "Ordina e filtra",
    "results.filter.open_now": "Aperto ora",
    "results.filter.instant_booking": "Prenotazione istantanea",
    "results.filter.terrace": "Terrazza",
    "results.filter.parking": "Parcheggio",
    "results.filter.kid_friendly": "Adatto ai bambini",
    "results.filter.wifi": "Wi-Fi",
    "results.filter.budget": "Budget",
    "results.filter.price_1": "€",
    "results.filter.price_2": "€€",
    "results.filter.price_3": "€€€",
    "results.filter.price_4": "€€€€",
    "results.filter.no_results_filters": "Nessun risultato con questi filtri",
    "results.filter.reset_filters": "Reimposta filtri",

    // Prompt 12 — Personalizzazione
    "search.personalized": "Risultati adattati alle tue preferenze",
    "search.personalized.tooltip": "Basato sulle tue prenotazioni e ricerche passate",
    "search.personalized.disable": "Disattiva la personalizzazione",
    "search.personalized.enable": "Attiva la personalizzazione",
    "settings.personalization": "Personalizzazione dei risultati",
    "settings.personalization.description": "Adatta l'ordine dei risultati in base ai tuoi gusti",

    // Search fallback (Prompt 13)
    "search.no_results": "Nessun risultato per \"{query}\"",
    "search.did_you_mean": "Forse cercavi?",
    "search.did_you_mean.results": "{count} risultati",
    "search.similar_results": "Risultati simili",
    "search.relax_filters": "Prova con meno filtri",
    "search.relax_filters.without": "Senza {filter}",
    "search.reset_all_filters": "Reimposta tutti i filtri",
    "search.nearby": "Disponibile nelle vicinanze",
    "search.nearby.distance": "a {km} km",
    "search.nearby.see_results": "Vedi {count} risultati a {city}",
    "search.popular_fallback": "I più popolari",
    "search.also_like": "Potrebbe piacerti anche",

    // Ricerca
    "search.field.city.placeholder": "Città o quartiere",
    "search.field.activity.placeholder": "Attività o struttura",
    "search.validation.minimum_people": "Minimo: {count} persone",

    "search.placeholder.unified": "Cucina, nome del luogo, piatto...",
    "search.placeholder.restaurant_type": "Tipo di locale",
    "search.title.choose_restaurant_type": "Scegli un tipo di locale",
    "search.placeholder.accommodation_type": "Tipo di alloggio",
    "search.title.choose_accommodation_type": "Scegli un tipo di alloggio",
    "search.placeholder.culture_type": "Tipo di uscita",
    "search.title.choose_culture_type": "Scegli un tipo di uscita",
    "search.placeholder.shopping_type": "Tipo di negozio",
    "search.title.choose_shopping_type": "Scegli un tipo di negozio",
    "search.placeholder.sport_activity_type": "Tipo di attività",
    "search.title.choose_sport_activity_type": "Scegli un tipo di attività",
    "search.placeholder.prestation_type": "Tipo di servizio",
    "search.title.choose_prestation_type": "Scegli un tipo di servizio",

    "search.restaurant_type.gastronomique": "Gastronomico",
    "search.restaurant_type.rooftop": "Rooftop",
    "search.restaurant_type.plage": "Ristorante sulla spiaggia",
    "search.restaurant_type.brunch": "Brunch organizzato",
    "search.restaurant_type.cafe": "Caffè",
    "search.restaurant_type.fast_food": "Fast-food",
    "search.restaurant_type.bistronomie": "Bistronomia",
    "search.restaurant_type.familial": "Ristorante familiare",

    "search.shopping_type.mode": "Moda",
    "search.shopping_type.chaussures": "Scarpe",
    "search.shopping_type.beaute_parfumerie": "Bellezza / Profumeria",
    "search.shopping_type.optique": "Ottica",
    "search.shopping_type.bijoux": "Gioielli",
    "search.shopping_type.maison_deco": "Casa / Arredamento",
    "search.shopping_type.epicerie_fine": "Gastronomia fine",
    "search.shopping_type.artisanat": "Artigianato",
    "search.shopping_type.concept_store": "Concept store",
    "search.shopping_type.autres": "Altro",

    // Campi ricerca noleggio auto
    "search.placeholder.vehicle_type": "Tipo di veicolo",
    "search.title.choose_vehicle_type": "Scegli un tipo di veicolo",
    "search.rentacar.pickup_location": "Luogo di ritiro",
    "search.rentacar.dropoff_location": "Luogo di riconsegna",
    "search.rentacar.same_dropoff": "Riconsegna identica",
    "search.rentacar.same_dropoff_checkbox": "Riconsegna nello stesso luogo",
    "search.rentacar.pickup_date": "Data di ritiro",
    "search.rentacar.dropoff_date": "Data di riconsegna",
    "search.rentacar.pickup_time": "Ora di ritiro",
    "search.rentacar.dropoff_time": "Ora di riconsegna",
    "search.rentacar.driver_age": "Età del conducente",
    "search.rentacar.young_driver_warning": "Conducente con meno di 30 anni o più di 70 anni",
    "search.rentacar.young_driver_description": "I conducenti giovani e quelli anziani potrebbero dover pagare costi aggiuntivi.",
    "search.rentacar.select_dates": "Seleziona le date",

    // Cronologia ricerca
    "search.history.recent_searches": "Ricerche recenti",
    "search.history.clear_all": "Cancella tutto",
    "search.history.remove": "Elimina",

    "results.universe.restaurants.count_label": "ristoranti",
    "results.universe.sport.count_label": "attività benessere",
    "results.universe.loisirs.count_label": "attività di svago",
    "results.universe.hebergement.count_label": "alloggi",
    "results.universe.culture.count_label": "siti culturali",
    "results.universe.shopping.count_label": "luoghi di shopping",
    "results.universe.rentacar.count_label": "veicoli",
    "results.universe.default.count_label": "risultati",

    // Scheda veicolo
    "vehicle.badge.super_offer": "Super offerta",
    "vehicle.badge.member_price": "Prezzo membro",
    "vehicle.feature.unlimited_mileage": "Chilometraggio illimitato",
    "vehicle.cashback": "Guadagna {amount} MAD di cashback",
    "vehicle.benefit.free_cancellation": "Cancellazione gratuita",
    "vehicle.benefit.basic_insurance": "Assicurazione base contro danni",
    "vehicle.benefit.online_checkin": "Check-in online",
    "vehicle.positive_reviews": "di recensioni positive",
    "vehicle.discount": "di sconto",
    "vehicle.price_per_day": "al giorno",
    "vehicle.price_total": "totale",
    "vehicle.or_similar": "o simile",
    "vehicle.seats": "{count} posti",
    "vehicle.sort_filter": "Ordina e filtra",
    "vehicle.total_taxes_included": "Importo totale, tasse e spese incluse",
    "vehicle.sort_info": "Come funziona il nostro ordinamento",

    // Filtri
    "filters.title": "Filtri",
    "filters.promotions.title": "Promozioni",
    "filters.promotions.subtitle": "Mostra le promozioni",
    "filters.promotions.description":
      "Mette in evidenza le strutture con offerte o sconti",
    "filters.none_available": "Nessun filtro disponibile per questo universo.",
    "filters.apply": "Applica",

    "filters.section.restaurant.specialties": "Specialità culinarie",
    "filters.section.restaurant.specialties.search_placeholder":
      "Cerca una specialità",
    "filters.section.price": "Prezzo",
    "filters.section.availability": "Disponibilità",
    "filters.availability.now": "Disponibile ora",
    "filters.availability.tonight": "Stasera",
    "filters.availability.tomorrow": "Domani",
    "filters.availability.specific": "Data specifica",
    "filters.section.packs_offers": "Pack e offerte",
    "filters.section.options": "Opzioni",
    "filters.section.ambience": "Atmosfera",
    "filters.section.activity_type": "Tipo di attività",
    "filters.section.duration": "Durata",
    "filters.section.audience": "Pubblico",
    "filters.section.level": "Livello",
    "filters.section.constraints": "Vincoli",
    "filters.constraints.min_people": "Minimo di persone",
    "filters.constraints.privatization": "Privatizzazione possibile",
    "filters.section.type": "Tipo",
    "filters.section.format": "Formato",
    "filters.section.duration_minutes": "Durata (min)",
    "filters.section.equipment": "Dotazioni",
    "filters.section.offers": "Offerte",
    "filters.section.budget_per_night": "Budget / notte",
    "filters.section.ratings": "Valutazioni",
    "filters.section.conditions": "Condizioni",
    "filters.section.language": "Lingua",
    "filters.section.access": "Accesso",
    "filters.section.store_type": "Tipo negozio",
    "filters.section.budget": "Budget",
    "filters.section.services": "Servizi",
    "filters.placeholder.example": "Es: {value}",

    // Suggerimenti di ricerca
    "suggestions.my_position": "La mia posizione",
    "suggestions.use_my_location": "Usa la mia posizione",
    "suggestions.section.cities": "Città",
    "suggestions.section.neighborhoods": "Quartieri popolari",
    "suggestions.section.establishments": "Strutture e Attività",
    "suggestions.section.categories": "Categorie e Specialità",
    "suggestions.section.offers": "Offerte",
    "suggestions.section.trending": "Tendenze",

    // Prenotazione (percorsi prioritari)
    "booking.steps.details": "Dettagli",
    "booking.steps.payment": "Pagamento",
    "booking.steps.info": "Info",
    "booking.steps.confirmation": "Conferma",
    "booking.step_header.label": "PASSO {step} DI {total}",

    "booking.auth.title": "Accedi per finalizzare (1 min)",
    "booking.auth.subtitle.step2":
      "Questo permette di proteggere la tua prenotazione e ritrovare la conferma.",
    "booking.auth.subtitle.step3":
      "Potrai confermare le tue informazioni e ricevere il codice QR.",

    "booking.establishment.fallback": "Prenotazione",

    "booking.card.title.restaurant": "Prenota un tavolo",
    "booking.card.title.hotel": "Prenota una camera",
    "booking.card.title.ticket": "Prenota un ingresso",
    "booking.card.title.slot": "Prenota una fascia oraria",
    "booking.card.title.default": "Prenota",

    "booking.cta.book_now": "Prenota ora",
    "booking.module.step_progress": "Passo {current} / {total}",

    "booking.people.more_than_10": "Più di 10 persone",
    "booking.people.exact_count": "Numero esatto",
    "booking.people.remove_one": "Rimuovi una persona",
    "booking.people.add_one": "Aggiungi una persona",
    "booking.people.up_to": "Fino a 50 persone.",
    "booking.people.other_number": "Altro numero",
    "booking.people.range": "Tra {min} e {max} persone.",

    "booking.step1.title": "Scegli la tua fascia oraria",
    "booking.step1.subtitle":
      "Seleziona una data, un'ora e il numero di persone.",
    "booking.step1.section.date": "Seleziona una data",
    "booking.step1.section.time": "Seleziona un'ora",
    "booking.step1.section.people": "Numero di persone",

    "booking.date_time.placeholder": "Seleziona una data e un'ora",

    "booking.bottomsheet.tab.date": "Data",
    "booking.bottomsheet.tab.time": "Ora",
    "booking.bottomsheet.tab.persons_short": "Pers.",

    "booking.pack.selected": "PACK SELEZIONATO",
    "booking.pack.remove": "Rimuovi",

    "booking.step1.date.helper":
      "Scegli un giorno per visualizzare le fasce orarie disponibili.",
    "booking.step1.time.helper": "Scegli un orario disponibile.",
    "booking.step1.people.helper":
      "Scegli il numero di persone per la prenotazione.",

    "booking.step1.recap": "RIEPILOGO",

    "booking.step1.selected.date": "Data selezionata",
    "booking.step1.selected.time": "Orario selezionato",
    "booking.step1.selected.slot": "Fascia oraria selezionata",
    "booking.step1.selected.participants": "Partecipanti",

    "booking.step1.no_slots":
      "Nessuna fascia oraria disponibile per questa data. Prova un altro giorno.",
    "booking.step1.select_date_first":
      "Seleziona prima una data per visualizzare le fasce orarie.",
    "booking.step1.select_time_first":
      "Seleziona prima un'ora per scegliere il numero di persone.",

    "booking.step1.more_choices": "Più scelte",
    "booking.step1.more_dates": "+ date",

    "booking.choose_slot": "Scegli una fascia oraria",
    "booking.reservations_today": "Già {count} prenotazioni per oggi",

    "booking.waitlist": "Lista d'attesa",
    "booking.slot.full": "Completo",
    "booking.slot.full_aria": "Fascia oraria {time} completa",

    "booking.offer.short": "Offerta -{promo}% menu",
    "booking.offer.long": "Offerta -{promo}% sul menu",

    "booking.capacity.full_waitlist":
      "Questa fascia oraria è completa. Puoi unirti alla lista d'attesa.",
    "booking.capacity.remaining":
      "Capacità rimanente per questa fascia oraria: {remaining}",
    "booking.capacity.limited": "Questa fascia oraria è limitata a {remaining} {unit}.",
    "booking.waitlist.notice":
      "Fascia oraria completa: la tua richiesta verrà inviata in lista d'attesa.",

    "booking.step1.choose_people": "Scegli il numero di persone",
    "booking.step1.choose_time": "Scegli un'ora",
    "booking.step1.choose_date": "Scegli una data",

    "booking.activity.slot_at": "Fascia oraria alle {time}",
    "booking.time.choose": "Scegli {time}",
    "booking.service.at_time": "{service} alle {time}",

    "booking.calendar.choose_date": "Scegli una data",
    "booking.calendar.placeholder": "gg/mm/aaaa",
    "booking.calendar.prev_month": "Mese precedente",
    "booking.calendar.next_month": "Mese successivo",

    "booking.time.bucket.other": "Altro",
    "booking.time.bucket.morning": "Mattina",
    "booking.time.bucket.afternoon": "Pomeriggio",
    "booking.time.bucket.evening": "Sera",
    "booking.time.bucket.breakfast": "Colazione",
    "booking.time.bucket.lunch": "Pranzo",
    "booking.time.bucket.tea_time": "Tea Time",
    "booking.time.bucket.happy_hour": "Happy Hour",
    "booking.time.bucket.dinner": "Cena",
    "booking.time.bucket.available": "Disponibile",

    "booking.service.lunch": "Pranzo",
    "booking.service.continuous": "Servizio continuato",
    "booking.service.dinner": "Cena",

    "booking.footer.security_notice":
      "🔒 Pagamento sicuro • ⚡ Gestito da Sortir Au Maroc",

    "booking.recap.title": "Riepilogo",
    "booking.recap.establishment": "Struttura",
    "booking.recap.pack": "Pack",
    "booking.recap.guests": "Persone",
    "booking.recap.date": "Data",
    "booking.recap.time": "Orario",
    "booking.recap.discount": "Sconto",

    "booking.mode.guaranteed": "Prenotazione garantita",
    "booking.mode.not_guaranteed": "Prenotazione non garantita",

    "booking.price.per_person": "{amount} / persona",
    "booking.price.from": "A partire da",

    "booking.step2.title.secure": "Proteggi la tua prenotazione",
    "booking.step2.title.waitlist": "Richiesta lista d'attesa",
    "booking.step2.subtitle.secure":
      "Scegli se vuoi garantire il tuo tavolo.",
    "booking.step2.subtitle.waitlist":
      "La fascia oraria è completa. Trasmettiamo la tua richiesta al ristorante.",

    "booking.waitlist.banner.title": "Fascia oraria completa — lista d'attesa",
    "booking.waitlist.banner.body":
      "Inviamo la tua richiesta al ristorante. Sarai avvisato se un posto si libera.",
    "booking.waitlist.banner.note":
      "Nessun pagamento è richiesto per una richiesta in lista d'attesa.",

    "booking.mode.guaranteed.short": "Posto garantito",
    "booking.mode.non_guaranteed.short": "In attesa di conferma",
    "booking.mode.guaranteed.line1":
      "Pre-prenotazione di {unit} MAD/pers. (dedotta dal conto)",
    "booking.mode.guaranteed.line2": "Cancellazione gratuita fino a 24h prima",
    "booking.mode.non_guaranteed.line":
      "Senza pagamento iniziale, il ristorante può dare priorità ai posti garantiti.",
    "booking.mode.non_guaranteed.line_simple":
      "La tua prenotazione sarà confermata dal ristorante.",
    "booking.mode.non_guaranteed.more":
      "Senza prepagamento, la tua prenotazione dipende dalla disponibilità e dalla priorità del ristorante. Riceverai una conferma rapidamente.",

    "booking.payment.banner.title":
      "Pagamento sicuro — cancellazione secondo condizioni",
    "booking.payment.banner.waitlist":
      "Nessun pagamento immediato. Il ristorante confermerà se un posto si libera.",
    "booking.payment.banner.followup":
      "Riceverai una risposta il prima possibile.",
    "booking.payment.banner.guaranteed":
      "Pre-prenotazione di {unit} MAD / persona (dedotta dal conto).",
    "booking.payment.banner.total": "Totale prepagato oggi: {total} MAD",
    "booking.payment.banner.non_guaranteed":
      "Nessun pagamento immediato. Il ristorante può dare priorità ai posti garantiti.",
    "booking.payment.method.card": "Carta di credito",
    "booking.payment.secure_method": "Pagamento sicuro",

    "booking.deposit.title": "È richiesto un acconto",
    "booking.deposit.description":
      "Per garantire la disponibilità delle strutture ed evitare i no-show, un acconto può essere richiesto per alcune prenotazioni.",
    "booking.deposit.amount_label": "Importo da pagare",
    "booking.deposit.pre_auth":
      "Pre-prenotazione: {unit} {currency} × {partySize} pers.",
    "booking.deposit.note":
      "Questo importo sarà dedotto dal conto finale. In caso di no-show, potrebbe essere trattenuto secondo le condizioni.",
    "booking.deposit.payma_hint":
      "Sarai reindirizzato su pay.ma per effettuare il pagamento. Dopo il pagamento, torna qui per finalizzare.",
    "booking.deposit.pay_and_confirm": "Paga e conferma la prenotazione",

    "booking.deposit.pedagogy.context_label": "Contesto",
    "booking.deposit.pedagogy.context_value":
      "Per alcune prenotazioni, può essere applicata una conferma rafforzata.",
    "booking.deposit.pedagogy.impact_label": "Conseguenza",
    "booking.deposit.pedagogy.impact_value":
      "Questa prenotazione richiede un acconto per essere confermata.",
    "booking.deposit.pedagogy.reassurance":
      "Non è una sanzione: è una misura di protezione delle fasce orarie.",
    "booking.deposit.pedagogy.learn_more": "Scopri di più",

    "booking.step3.title": "Conferma le tue informazioni",
    "booking.step3.subtitle":
      "Queste informazioni permetteranno alla struttura di contattarti.",
    "booking.step3.description":
      "Queste informazioni permetteranno al ristorante di contattarti riguardo alla tua prenotazione.",

    "booking.form.first_name": "Nome",
    "booking.form.last_name": "Cognome",
    "booking.form.email": "Email",
    "booking.form.phone": "Telefono",
    "booking.form.message": "Messaggio speciale",
    "booking.form.optional": "facoltativo",

    "booking.form.placeholder.first_name": "Es: Amina",
    "booking.form.placeholder.last_name": "Es: Benali",
    "booking.form.placeholder.email": "Es: amina@example.com",
    "booking.form.placeholder.phone": "Es: +212 6 12 34 56 78",
    "booking.form.placeholder.message": "Es: Allergie, occasione speciale…",
    "booking.form.placeholder.message_long":
      "Descrivi l'occasione (compleanno, appuntamento...), menziona diete alimentari o richieste speciali...",

    "booking.step3.privacy_notice":
      "🔒 I tuoi dati sono protetti e saranno condivisi solo con il ristorante per la tua prenotazione.",
    "booking.step3.cta.review": "Verifica",

    "booking.step4.title.confirmed": "La tua prenotazione è confermata",
    "booking.step4.title.waitlist": "Richiesta in lista d'attesa",
    "booking.step4.title.sent": "Richiesta inviata",

    "booking.step4.subtitle.confirmed":
      "Trova il tuo codice QR e i documenti da presentare all'arrivo.",
    "booking.step4.subtitle.waitlist":
      "La fascia oraria è completa. Il ristorante ti ricontatterà se un posto si libera.",
    "booking.step4.subtitle.sent":
      "Il ristorante deve confermare la tua richiesta. Riceverai una risposta rapidamente.",

    "booking.step4.banner.title.confirmed": "Prenotazione confermata!",
    "booking.step4.banner.title.pending": "Richiesta inviata",
    "booking.step4.banner.body.confirmed":
      "Il tuo posto è garantito. Un SMS di conferma è stato inviato.",
    "booking.step4.banner.body.pending":
      "Il ristorante confermerà la tua prenotazione via SMS o WhatsApp a breve.",

    "booking.step4.contact.title": "CONTATTO",
    "booking.step4.contact.confirmation_sent":
      "Conferma inviata al numero fornito",
    "booking.step4.reference.title": "RIFERIMENTO PRENOTAZIONE",

    "booking.step4.qr.title": "Codice QR - Da presentare al ristorante",
    "booking.step4.qr.alt": "Codice QR della prenotazione",
    "booking.step4.qr.body":
      "Il ristorante potrà scansionare questo codice QR per confermare la tua presenza",

    "booking.step4.pdf.title": "Scarica la prenotazione in PDF",
    "booking.step4.pdf.cta": "Esporta in PDF",
    "booking.step4.pdf.generating": "Generazione...",

    "booking.step4.wallet.apple": "Aggiungi ad Apple Wallet",
    "booking.step4.wallet.google": "Aggiungi a Google Wallet",

    "booking.step4.calendar.add": "Aggiungi al calendario",
    "booking.step4.directions": "Vedi percorso",

    "booking.step4.modify": "Modifica",
    "booking.step4.cancel": "Cancella",
    "booking.step4.cancel.confirm":
      "Sei sicuro di voler cancellare questa prenotazione?",

    "booking.step4.trust.ssl": "Pagamento sicuro con SSL 256-bit",
    "booking.step4.trust.managed_by": "Prenotazione gestita da Sortir Au Maroc",
    "booking.step4.trust.count": "Più di 5.000 prenotazioni effettuate",

    "booking.step4.home": "Torna alla home",
    "booking.step4.calendar.event_title": "Prenotazione - {establishment}",
    "booking.waitlist.missing_slot":
      "Impossibile unirsi alla lista d'attesa: nessuna fascia oraria selezionata.",

    "booking.modify.title": "Richiedi una modifica",
    "booking.modify.datetime_label": "Nuova data/ora ({optional})",
    "booking.modify.datetime_help":
      "La struttura confermerà la modifica (in base alla disponibilità).",
    "booking.modify.party_size_label": "Numero di persone ({optional})",
    "booking.modify.party_size_placeholder": "Es: 4",
    "booking.modify.send": "Invia",

    // Stato prenotazione (extra)
    "reservation.status.modification_pending":
      "In verifica (modifica richiesta)",
    "reservation.status.modification_pending.title":
      "La tua richiesta di modifica è in fase di elaborazione dalla struttura.",

    "reservation.status.refused": "Rifiutata",
    "reservation.status.refused.title": "Prenotazione rifiutata",
    "reservation.status.waitlist": "Lista d'attesa",
    "reservation.status.pending_pro": "In attesa di conferma",

    "reservation.status.cancelled.you": "Cancellata (tu)",
    "reservation.status.cancelled.client": "Cancellata (cliente)",
    "reservation.status.cancelled.establishment": "Cancellata (struttura)",
    "reservation.status.cancelled.refunded": "Cancellata / rimborsata",
    "reservation.status.cancelled.generic": "Cancellata",

    "reservation.status.no_show": "No-show",

    "reservation.status.past.present": "Passata · presente",
    "reservation.status.past.no_show": "Passata · no-show",
    "reservation.status.past.generic": "Passata",

    "reservation.status.confirmed": "Confermata",
    "reservation.status.confirmed.guaranteed": "Confermata · garantita",
    "reservation.status.confirmed.not_guaranteed": "Confermata · non garantita",

    "reservation.status.generic": "Prenotazione",

    // Stato pagamento
    "payment.status.paid": "Pagato",
    "payment.status.pending": "Non pagato",
    "payment.status.refunded": "Rimborsato",

    // Dettagli prenotazione
    "booking_details.loading.title": "Caricamento…",
    "booking_details.loading.body": "Stiamo recuperando la tua prenotazione.",

    "booking_details.not_found": "Prenotazione non trovata",
    "booking_details.not_found.body_default":
      "Questa prenotazione non esiste più o è stata eliminata.",
    "booking_details.back_to_account": "Torna all'account",
    "booking_details.explore": "Esplora",
    "booking_details.back": "Indietro",

    "booking_details.ref_prefix": "Rif.",
    "booking_details.field.date": "Data",
    "booking_details.field.time": "Ora",
    "booking_details.field.people": "Persone",
    "booking_details.field.address": "Indirizzo",

    // Offerta lista d'attesa
    "booking_details.waitlist_offer.badge": "Offerta (lista d'attesa)",
    "booking_details.waitlist_offer.title": "Offerta posto disponibile",
    "booking_details.waitlist_offer.body":
      "Hai 15 minuti per confermare questa prenotazione.",
    "booking_details.waitlist_offer.expires_at": "Scade alle {time}",
    "booking_details.waitlist_offer.accept": "Accetta",
    "booking_details.waitlist_offer.refuse": "Rifiuta",
    "booking_details.waitlist_offer.expired_title": "Offerta scaduta",
    "booking_details.waitlist_offer.expired_body":
      "Questa offerta non è più disponibile. Il sistema proporrà il posto al prossimo cliente.",
    "booking_details.waitlist_offer.waiting_title": "In lista d'attesa",
    "booking_details.waitlist_offer.waiting_body":
      "La tua posizione attuale: #{position}.",

    "booking_details.payment.title": "Pagamento",
    "booking_details.payment.status": "Stato",
    "booking_details.payment.amount": "Importo",
    "booking_details.payment.total": "Totale",
    "booking_details.payment.paid_at": "Pagato il",
    "booking_details.payment.method": "Metodo",
    "booking_details.payment.escrow_held_badge": "Fondi trattenuti ⚠️",
    "booking_details.payment.none": "Nessun pagamento registrato.",
    "booking_details.payment.secure": "Pagamento sicuro",
    "booking_details.payment.pre_reservation_per_person":
      "Pre-prenotazione (per pers.)",
    "booking_details.payment.total_prepaid": "Totale prepagato",
    "booking_details.payment.calculation": "Calcolo: {unit} × {count} pers.",

    "booking_details.qr.title": "Codice QR e documenti",
    "booking_details.qr.invoice": "Fattura",
    "booking_details.qr.alt": "Codice QR",
    "booking_details.qr.present_on_arrival": "Da presentare all'arrivo",
    "booking_details.qr.contains":
      "Il codice QR contiene il riferimento della prenotazione e, se disponibile, l'importo prepagato.",
    "booking_details.qr.pdf_restaurant_only":
      "Il PDF è disponibile per le prenotazioni al ristorante.",

    "booking_details.review.title": "Recensione",
    "booking_details.review.overall": "Voto complessivo: {rating}/5",
    "booking_details.review.criteria_average": "Media dei criteri",
    "booking_details.review.published_at": "Pubblicata il {date}",
    "booking_details.review.leave": "Lascia una recensione",
    "booking_details.review.rate_each": "Valuta ogni criterio",
    "booking_details.review.estimated": "Voto complessivo stimato: {rating}/5",
    "booking_details.review.comment_label": "Commento",
    "booking_details.review.comment_placeholder": "Condividi la tua esperienza…",
    "booking_details.review.publish": "Pubblica",
    "booking_details.review.thank_you_title": "Grazie!",
    "booking_details.review.saved_body": "La tua recensione è stata registrata.",
    "booking_details.review.unavailable":
      "Lasciare una recensione è possibile dopo la prenotazione, se il cliente si è presentato.",

    "booking_details.summary.title": "Riepilogo",
    "booking_details.summary.note": "Nota:",
    "booking_details.summary.phone": "Telefono:",

    "booking_details.pro_message.title": "Messaggio della struttura",
    "booking_details.pro_message.template_prefix": "template",

    "booking_details.service.lunch": "pranzo",
    "booking_details.service.continuous": "continuato",
    "booking_details.service.dinner": "cena",

    "booking_details.attendance.title": "Presenza",
    "booking_details.attendance.present": "Presente",
    "booking_details.attendance.no_show": "Assente / no-show",
    "booking_details.attendance.unknown": "Non indicato",

    "booking_details.toast.declined.title": "Proposta rifiutata",
    "booking_details.toast.declined.body": "Abbiamo informato il sistema.",
    "booking_details.toast.accepted.title": "Richiesta inviata",
    "booking_details.toast.accepted.body":
      "La tua accettazione è stata inviata al Pro per la conferma.",
    "booking_details.toast.change_cancelled.title": "Annullato",
    "booking_details.toast.change_cancelled.body":
      "La tua richiesta di modifica è stata ritirata.",
    "booking_details.toast.cancellation_sent.title": "Cancellazione inviata",
    "booking_details.toast.cancellation_sent.body":
      "La tua richiesta di cancellazione è stata registrata. Riceverai una conferma appena il rimborso (se applicabile) sarà elaborato.",
    "booking_details.toast.payment_initiated.title": "Pagamento avviato",
    "booking_details.toast.payment_initiated.body":
      "Una volta effettuato il pagamento, torna qui e riprova ad accettare l'offerta.",
    "booking_details.toast.change_request_sent.title": "Richiesta inviata",
    "booking_details.toast.change_request_sent.body":
      "La tua richiesta di modifica è stata inviata alla struttura. Riceverai una risposta appena sarà elaborata.",

    "booking_details.cancellation.free_until":
      "Cancellazione gratuita fino al {date}.",
    "booking_details.cancellation.conditional":
      "Cancellazione con condizioni (trattenuta {percent}%).",
    "booking_details.cancellation.default_note":
      "Le richieste vengono gestite dalla struttura secondo la sua disponibilità e le sue politiche.",

    // Interfaccia utente (Menu / Ristorante / Profilo / Supporto / ecc.)
    "common.error": "Errore",
    "common.limited_offer": "Offerta limitata",
    "common.per_person": "per persona",
    "common.instead_of": "invece di",

    "not_found.title": "Pagina non trovata",
    "not_found.body": "Spiacenti, questa pagina non esiste (o non esiste più).",
    "not_found.back_home": "Torna alla home",
    "not_found.view_results": "Vedi i risultati",

    "hotel.booking.title_fallback": "Prenotazione hotel",
    "hotel.booking.step.details": "Dettagli",
    "hotel.booking.step.conditions": "Condizioni",
    "hotel.booking.step.info": "Info",
    "hotel.booking.step.confirmation": "Conferma",
    "hotel.booking.payment_footer": "Pagamento sicuro • Gestito da Sortir Au Maroc",

    "menu.search.placeholder": "Cerca nel menu…",
    "menu.search.results_label": "Risultati",
    "menu.search.no_results": "Nessun risultato per la tua ricerca.",
    "menu.sort.label": "Ordina",
    "menu.sort.all": "Tutti",
    "menu.sort.popular": "Popolari",
    "menu.sort.best_sellers": "Più venduti",
    "menu.group.packs": "Pack",
    "menu.packs.subtitle": "Offerte e pack",
    "menu.items.count": "{count} piatti",

    "menu.badge.new": "Nuovo",
    "menu.badge.specialty": "Specialità",
    "menu.badge.best_seller": "Best-seller",
    "menu.badge.healthy": "Healthy",
    "menu.badge.vegetarian": "Vegetariano",
    "menu.badge.fast": "Veloce",

    "pack.book_cta": "Prenota questo pack",
    "pack.urgency.today_only": "Solo oggi",
    "pack.urgency.limited_recommended": "Posti limitati",
    "pack.urgency.high_demand": "Molto richiesto",
    "pack.urgency.exclusive": "Offerta esclusiva",

    "restaurant.quick_booking.title": "Prenotazione rapida",
    "restaurant.quick_booking.subtitle":
      "Scegli una data, un'ora e il numero di persone.",
    "restaurant.quick_booking.duration": "1 min",
    "restaurant.quick_booking.closed_warning": "Fascia oraria non disponibile",
    "restaurant.quick_booking.advice":
      "Potrai finalizzare la prenotazione nel passaggio successivo.",
    "restaurant.quick_booking.cta.choose_slot": "Scegli questa fascia oraria",
    "restaurant.quick_booking.cta.book_slot": "Prenota questa fascia oraria",

    "weekday.monday": "Lunedì",
    "weekday.tuesday": "Martedì",
    "weekday.wednesday": "Mercoledì",
    "weekday.thursday": "Giovedì",
    "weekday.friday": "Venerdì",
    "weekday.saturday": "Sabato",
    "weekday.sunday": "Domenica",

    "restaurant.hours.title": "Orari",
    "restaurant.hours.table.day": "Giorno",
    "restaurant.hours.service.lunch": "Pranzo",
    "restaurant.hours.service.dinner": "Cena",
    "restaurant.hours.status.open": "Aperto",
    "restaurant.hours.status.soon": "A breve",
    "restaurant.hours.status.closed": "Chiuso",
    "restaurant.hours.today_label": "Oggi: {day}",
    "restaurant.hours.week_toggle": "Vedi gli orari della settimana",
    "restaurant.hours.closed": "Chiuso",
    "restaurant.hours.closed_today": "Chiuso oggi",
    "restaurant.hours.next_slot.label": "Prossima fascia oraria: {day} {from}–{to}",
    "restaurant.hours.next_slot.unavailable": "Nessuna fascia oraria disponibile",

    "restaurant.hours.compatibility.ok": "Fascia oraria disponibile",
    "restaurant.hours.compatibility.not_ok": "Fascia oraria non disponibile",
    "restaurant.hours.compatibility.closed_day": "Chiuso in questo giorno.",
    "restaurant.hours.compatibility.opens_at": "Apre alle {time}.",
    "restaurant.hours.compatibility.opens_tomorrow_at":
      "Apre domani alle {time}.",
    "restaurant.hours.compatibility.not_compatible": "Orario non compatibile.",

    "profile.user.fallback_name": "Il mio account",

    "profile.gate.title": "Accedi per accedere al tuo profilo",
    "profile.gate.subtitle":
      "Ritrova le tue prenotazioni, preferiti e preferenze.",
    "profile.gate.cta.explore": "Esplora",
    "profile.gate.card.bookings.title": "Prenotazioni",
    "profile.gate.card.bookings.subtitle":
      "Consulta le tue prenotazioni in corso e passate.",
    "profile.gate.card.favorites.title": "Preferiti",
    "profile.gate.card.favorites.subtitle":
      "Ritrova le tue strutture salvate.",
    "profile.gate.card.preferences.title": "Preferenze",
    "profile.gate.card.preferences.subtitle": "Personalizza la tua esperienza.",

    "profile.contact.placeholder": "Email o telefono",

    "profile.stats.bookings": "Prenotazioni",
    "profile.stats.favorites": "Preferiti",
    "profile.stats.preferences": "Preferenze",
    "profile.stats.preferences.short": "{enabled}/{total} attivate",
    "profile.stats.preferences.long":
      "{enabled} su {total} preferenze attivate",
    "profile.stats.preferences.examples":
      "Es: rooftop, brunch, hammam, attività in famiglia…",

    "profile.tabs.info": "Info",
    "profile.tabs.bookings": "Prenotazioni",
    "profile.tabs.waitlist": "Lista d'attesa",
    "profile.tabs.billing": "Fatturazione",
    "profile.tabs.packs": "Pack",
    "profile.tabs.favorites": "Preferiti",
    "profile.tabs.preferences": "Preferenze",
    "profile.tabs.privacy_account": "Privacy e account",

    "profile.privacy.title": "Privacy e account",
    "profile.privacy.subtitle":
      "Gestisci il tuo account, i tuoi dati e le tue richieste (disattivazione, eliminazione, esportazione).",

    "profile.privacy.export.title": "Scarica i miei dati",
    "profile.privacy.export.description":
      "Ricevi un link sicuro via email (JSON o CSV).",
    "profile.privacy.export.button": "Richiedi l'esportazione",
    "profile.privacy.export.button.loading": "Richiesta…",
    "profile.privacy.export.toast.title": "Richiesta inviata",
    "profile.privacy.export.toast.description":
      "Se un'email è associata al tuo account, riceverai un link per il download.",

    // Gestione password
    "profile.password.title": "Password",
    "profile.password.description": "Gestisci la sicurezza del tuo account.",
    "profile.password.reset.title": "Rigenera la mia password",
    "profile.password.reset.description": "Un link di reimpostazione ti verrà inviato via email.",
    "profile.password.reset.button": "Invia via email",
    "profile.password.reset.button.loading": "Invio…",
    "profile.password.reset.toast.title": "Email inviata",
    "profile.password.reset.toast.description": "Controlla la tua casella di posta per il link di reimpostazione.",
    "profile.password.reset.error.phone_only.title": "Reimpostazione non disponibile",
    "profile.password.reset.error.phone_only.description": "Ti sei registrato con il telefono. Utilizza l'opzione \"Cambia la mia password\".",
    "profile.password.change.title": "Cambia la mia password",
    "profile.password.change.description": "Modifica la tua password attuale.",
    "profile.password.change.button": "Modifica",
    "profile.password.change.button.loading": "Modifica…",
    "profile.password.change.button.confirm": "Conferma",
    "profile.password.change.dialog.title": "Cambia la password",
    "profile.password.change.dialog.description": "Inserisci la password attuale e poi scegli una nuova password.",
    "profile.password.change.current": "Password attuale",
    "profile.password.change.new": "Nuova password",
    "profile.password.change.confirm": "Conferma la nuova password",
    "profile.password.change.hint": "Minimo 8 caratteri",
    "profile.password.change.toast.title": "Password modificata",
    "profile.password.change.toast.description": "La tua password è stata aggiornata con successo.",
    "profile.password.change.error.too_short": "La password deve contenere almeno 8 caratteri.",
    "profile.password.change.error.mismatch": "Le password non corrispondono.",
    "profile.password.change.error.invalid_current": "La password attuale non è corretta.",

    "profile.privacy.deactivate.title": "Disattiva temporaneamente il mio account",
    "profile.privacy.deactivate.description":
      "Il tuo account verrà messo in pausa. Potrai riattivarlo riconnettendoti.",
    "profile.privacy.deactivate.button": "Disattiva",
    "profile.privacy.deactivate.button.loading": "Disattivazione…",
    "profile.privacy.deactivate.button.confirm": "Conferma la disattivazione",
    "profile.privacy.deactivate.dialog.title": "Disattiva il mio account",
    "profile.privacy.deactivate.dialog.description":
      "Scegli un motivo (facoltativo) e conferma. Sarai disconnesso.",
    "profile.privacy.deactivate.toast.title": "Account disattivato",
    "profile.privacy.deactivate.toast.description":
      "Il tuo account è in pausa. Potrai riattivarlo riconnettendoti.",

    "profile.privacy.delete.title": "Elimina definitivamente il mio account",
    "profile.privacy.delete.description":
      "Eliminazione irreversibile. Alcune informazioni potrebbero essere conservate se la legge lo richiede.",
    "profile.privacy.delete.button": "Elimina",
    "profile.privacy.delete.button.loading": "Eliminazione…",
    "profile.privacy.delete.button.confirm": "Conferma l'eliminazione",
    "profile.privacy.delete.dialog.title": "Elimina il mio account",
    "profile.privacy.delete.dialog.description":
      "Scegli un motivo e conferma. Questa azione è irreversibile.",
    "profile.privacy.delete.step2.warning":
      "Ultimo passaggio: questa azione è irreversibile. Una volta eliminato, il tuo account non potrà essere recuperato.",
    "profile.privacy.delete.step2.confirm_label":
      'Digita "{word}" per confermare',
    "profile.privacy.delete.confirm_word": "ELIMINA",
    "profile.privacy.delete.toast.title": "Account eliminato",
    "profile.privacy.delete.toast.description":
      "Il tuo account è stato eliminato. Grazie per aver utilizzato Sortir Au Maroc.",

    "profile.privacy.reason.label": "Motivo (facoltativo)",
    "profile.privacy.reason.details.label": "Dettagli (facoltativo)",
    "profile.privacy.reason.details.placeholder":
      "Dicci in poche parole…",

    "profile.privacy.reason.pause": "Sto facendo una pausa temporanea",
    "profile.privacy.reason.not_using": "Non utilizzo abbastanza Sortir Au Maroc",
    "profile.privacy.reason.too_many_notifications": "Troppe notifiche",
    "profile.privacy.reason.technical_issue": "Problema tecnico",
    "profile.privacy.reason.privacy_concerns":
      "Preoccupazioni legate alla privacy",
    "profile.privacy.reason.not_found":
      "Non ho trovato ciò che cercavo",
    "profile.privacy.reason.other": "Altro",

    "profile.privacy.deactivate.message.pause":
      "Grazie. Mettiamo il tuo account in pausa. Potrai riattivarlo quando vorrai.",
    "profile.privacy.deactivate.message.not_using":
      "Grazie per il tuo feedback. Il tuo account verrà messo in pausa.",
    "profile.privacy.deactivate.message.too_many_notifications":
      "Capito. Il tuo account verrà messo in pausa e non riceverai più notifiche.",
    "profile.privacy.deactivate.message.technical_issue":
      "Grazie. Se vuoi, contattaci: faremo del nostro meglio per risolvere il problema.",
    "profile.privacy.deactivate.message.privacy_concerns":
      "Grazie. Prendiamo la privacy sul serio e restiamo disponibili per eventuali domande.",
    "profile.privacy.deactivate.message.not_found":
      "Grazie. Speriamo di rivederti presto su Sortir Au Maroc.",
    "profile.privacy.deactivate.message.other":
      "Grazie. Il tuo account verrà messo in pausa.",

    "profile.privacy.delete.reason.not_using_anymore":
      "Non utilizzo più Sortir Au Maroc",
    "profile.privacy.delete.reason.found_alternative":
      "Ho trovato un'alternativa",
    "profile.privacy.delete.reason.unsatisfied_experience":
      "Esperienza insoddisfacente",
    "profile.privacy.delete.reason.too_buggy": "Troppi bug",
    "profile.privacy.delete.reason.payment_issue": "Problema legato ai pagamenti",
    "profile.privacy.delete.reason.data_privacy":
      "Preoccupazioni sui dati personali",
    "profile.privacy.delete.reason.not_covered":
      "Non mi trovo più in una zona coperta",

    "profile.privacy.delete.message.not_using_anymore":
      "Grazie per il tuo feedback. Procederemo con la tua richiesta di eliminazione.",
    "profile.privacy.delete.message.found_alternative":
      "Grazie per il tuo feedback. Procederemo con la tua richiesta di eliminazione.",
    "profile.privacy.delete.message.unsatisfied_experience":
      "Grazie. Ci dispiace che l'esperienza non sia stata all'altezza.",
    "profile.privacy.delete.message.too_buggy":
      "Grazie. Ci dispiace per i problemi riscontrati.",
    "profile.privacy.delete.message.payment_issue":
      "Grazie. Se vuoi, contattaci per chiarire la situazione prima dell'eliminazione.",
    "profile.privacy.delete.message.data_privacy":
      "Grazie. Procederemo con la tua richiesta conformemente alla nostra politica sulla privacy.",
    "profile.privacy.delete.message.not_covered":
      "Grazie. Speriamo di tornare presto nella tua zona.",
    "profile.privacy.delete.message.other":
      "Grazie. Procederemo con la tua richiesta di eliminazione.",

    "profile.privacy.footer_hint":
      "Hai bisogno di aiuto? Puoi contattare il supporto dalla pagina Aiuto.",

    "profile.waitlist.title": "Lista d'attesa",
    "profile.waitlist.subtitle":
      "Segui la tua posizione e rispondi alle offerte quando un posto si libera.",
    "profile.waitlist.empty.title": "Nessuna lista d'attesa",
    "profile.waitlist.empty.subtitle":
      "Quando una fascia oraria è completa, puoi unirti alla lista d'attesa dalla pagina di prenotazione.",
    "profile.waitlist.empty.hint":
      "Suggerimento: se hai una prenotazione contrassegnata come \"Lista d'attesa\", apparirà nella scheda Prenotazioni.",
    "profile.waitlist.section.active": "Richieste attive",
    "profile.waitlist.section.expired": "Cronologia",
    "profile.waitlist.section.active_empty": "Nessuna richiesta attiva.",
    "profile.waitlist.section.expired_empty": "Nessuna cronologia.",
    "profile.waitlist.status.offer": "Offerta",
    "profile.waitlist.status.waiting": "In attesa",
    "profile.waitlist.status.accepted": "Accettata",
    "profile.waitlist.status.expired": "Terminata",
    "profile.waitlist.status.unknown": "Stato",
    "profile.waitlist.field.date": "Data",
    "profile.waitlist.field.time": "Ora",
    "profile.waitlist.field.people": "Persone",
    "profile.waitlist.offer.expires_at": "Scade alle {time}",
    "profile.waitlist.position": "Posizione: #{position}",
    "profile.waitlist.cancel": "Cancella",
    "profile.waitlist.view_reservation": "Vedi",
    "profile.waitlist.establishment_fallback": "Struttura",

    "profile.info.title": "Le mie informazioni",
    "profile.info.subtitle":
      "Aggiorna le tue informazioni per facilitare le tue prenotazioni.",
    "profile.info.first_name.label": "Nome",
    "profile.info.first_name.placeholder": "Es: Amina",
    "profile.info.last_name.label": "Cognome",
    "profile.info.last_name.placeholder": "Es: Benali",
    "profile.info.phone.label": "Telefono",
    "profile.info.phone.placeholder": "Es: +212 6 12 34 56 78",
    "profile.info.phone.help": "Utilizzato per contattarti se necessario.",
    "profile.info.csp.label": "Situazione professionale",
    "profile.info.csp.placeholder": "Seleziona…",
    "profile.info.csp.help": "Facoltativo.",
    "profile.info.dob.label": "Data di nascita",
    "profile.info.dob.placeholder": "gg/mm/aaaa",
    "profile.info.dob.help": "Facoltativo.",
    "profile.info.city.label": "Città",
    "profile.info.city.placeholder": "Es: Casablanca",
    "profile.info.save": "Salva",
    "profile.info.saved": "Salvato",
    "profile.info.last_updated": "Ultimo aggiornamento: {value}",
    "profile.info.edit": "Modifica",
    "profile.info.phone.verified": "Verificato",
    "profile.info.phone.verified_help": "Questo numero è stato verificato e non può più essere modificato.",
    "profile.info.phone.verify": "Verifica",
    "profile.info.phone.verify_description": "Invia un codice SMS per verificare il tuo numero.",
    "profile.info.email.verified": "Verificato",
    "profile.info.email.verified_help": "Questo indirizzo è stato verificato.",
    "profile.info.email.verify": "Verifica",
    "profile.info.email.verify_description": "Un codice a 8 cifre verrà inviato al tuo indirizzo.",
    "profile.info.email.label": "Email",
    "profile.info.login_credentials": "Credenziali di accesso",
    "profile.info.phone.login_label": "Telefono di accesso",

    // Modale verifica telefono
    "profile.phone_verification.title": "Verifica il mio numero",
    "profile.phone_verification.subtitle": "Un codice SMS verrà inviato al tuo numero per la verifica. Una volta verificato, non potrà più essere modificato.",
    "profile.phone_verification.success": "Numero verificato!",
    "profile.phone_verification.success_description": "Il tuo numero di telefono è stato verificato con successo.",
    "profile.phone_verification.not_available": "Verifica non disponibile",

    // Modale verifica email
    "profile.email_verification.title": "Verifica la mia email",
    "profile.email_verification.subtitle": "Risolvi il captcha e poi clicca su Invia. Un codice a 8 cifre verrà inviato al tuo indirizzo email.",
    "profile.email_verification.send_code": "Invia il codice",
    "profile.email_verification.enter_code": "Inserisci il codice ricevuto",
    "profile.email_verification.code_sent_to": "Codice inviato a",
    "profile.email_verification.success": "Email verificata!",
    "profile.email_verification.success_description": "Il tuo indirizzo email è stato verificato con successo.",
    "profile.email_verification.error.invalid_email": "Indirizzo email non valido.",
    "profile.email_verification.error.send_failed": "Impossibile inviare il codice. Riprova.",
    "profile.email_verification.error.invalid_code": "Codice errato. Verifica e riprova.",
    "profile.email_verification.error.code_expired": "Questo codice è scaduto. Richiedine uno nuovo.",
    "profile.email_verification.error.captcha_required": "Risolvi il captcha.",

    "profile.info.csp.group.education": "Studi",
    "profile.info.csp.group.unemployed": "Disoccupato",
    "profile.info.csp.group.employed": "Dipendente",
    "profile.info.csp.group.self_employed": "Autonomo",
    "profile.info.csp.group.public": "Settore pubblico",
    "profile.info.csp.group.commerce": "Commercio",
    "profile.info.csp.group.manual": "Operai e servizi",
    "profile.info.csp.group.other": "Altro",

    "profile.info.csp.student": "Studente",
    "profile.info.csp.intern": "Stagista",
    "profile.info.csp.unemployed": "Disoccupato",
    "profile.info.csp.job_seeker": "In cerca di lavoro",
    "profile.info.csp.retraining": "Riqualificazione",
    "profile.info.csp.employee": "Impiegato",
    "profile.info.csp.technician": "Tecnico",
    "profile.info.csp.supervisor": "Capo reparto",
    "profile.info.csp.manager": "Manager",
    "profile.info.csp.executive": "Dirigente",
    "profile.info.csp.freelance": "Freelance",
    "profile.info.csp.entrepreneur": "Imprenditore",
    "profile.info.csp.liberal_profession": "Libero professionista",
    "profile.info.csp.public_servant": "Funzionario pubblico",
    "profile.info.csp.merchant": "Commerciante",
    "profile.info.csp.artisan": "Artigiano",
    "profile.info.csp.worker": "Operaio",
    "profile.info.csp.service_employee": "Addetto ai servizi",
    "profile.info.csp.retired": "Pensionato",
    "profile.info.csp.stay_at_home": "Casalingo/a",
    "profile.info.csp.other": "Altro",

    // Pagina reimpostazione password
    "reset_password.title": "Nuova password",
    "reset_password.for_account": "Per l'account {email}",
    "reset_password.validating": "Verifica del link...",
    "reset_password.new_password": "Nuova password",
    "reset_password.confirm_password": "Conferma la password",
    "reset_password.password_hint": "Minimo 8 caratteri",
    "reset_password.submit": "Imposta la password",
    "reset_password.submitting": "Salvataggio...",
    "reset_password.back_home": "Torna alla home",
    "reset_password.error.title": "Link non valido",
    "reset_password.error.missing_token": "Il link è incompleto. Utilizza il link completo ricevuto via email.",
    "reset_password.error.invalid_token": "Questo link di reimpostazione non è valido.",
    "reset_password.error.token_expired": "Questo link è scaduto. Richiedi un nuovo link di reimpostazione.",
    "reset_password.error.token_used": "Questo link è già stato utilizzato. Richiedi un nuovo link se necessario.",
    "reset_password.error.too_short": "La password deve contenere almeno 8 caratteri.",
    "reset_password.error.mismatch": "Le password non corrispondono.",
    "reset_password.error.generic": "Si è verificato un errore. Riprova.",
    "reset_password.success.title": "Password modificata",
    "reset_password.success.description": "La tua password è stata modificata con successo. Puoi ora accedere.",
    "reset_password.success.login": "Accedi",

    "profile.bookings.loading": "Caricamento prenotazioni…",
    "profile.bookings.empty.title": "Nessuna prenotazione",
    "profile.bookings.empty.subtitle": "Le tue prenotazioni appariranno qui.",
    "profile.bookings.ref": "Rif.",
    "profile.bookings.view": "Vedi",
    "profile.bookings.field.date": "Data",
    "profile.bookings.field.time": "Ora",
    "profile.bookings.field.people": "Persone",
    "profile.bookings.pre_reservation": "Pre-prenotazione",
    "profile.bookings.amount_paid": "Importo pagato",

    "support.tickets.title": "Ticket supporto",
    "support.tickets.subtitle": "Crea e segui le tue richieste di assistenza.",
    "support.hours": "Servizio clienti disponibile dalle 9 alle 19",
    "support.tickets.new": "Nuovo ticket",
    "support.tickets.my_tickets": "I miei ticket",
    "support.tickets.empty": "Nessun ticket al momento.",
    "support.tickets.select_prompt":
      "Seleziona un ticket per vedere i dettagli.",

    "support.ticket.form.subject": "Oggetto",
    "support.ticket.form.subject.placeholder": "Es: Problema con la prenotazione",
    "support.ticket.form.category": "Categoria",
    "support.ticket.form.category.placeholder": "Scegli una categoria",
    "support.ticket.form.message": "Messaggio",
    "support.ticket.form.message.placeholder": "Descrivi la tua richiesta…",
    "support.ticket.form.submit": "Invia",

    "support.ticket.category.reservations": "Prenotazioni",
    "support.ticket.category.cancellation": "Cancellazione",
    "support.ticket.category.billing": "Pagamento / fatturazione",
    "support.ticket.category.account": "Account",
    "support.ticket.category.technical": "Tecnico",
    "support.ticket.category.partners": "Partner",
    "support.ticket.category.other": "Altro",

    "support.ticket.updated_at": "Aggiornato: {date}",
    "support.ticket.status.open": "Aperto",
    "support.ticket.status.closed": "Chiuso",
    "support.ticket.action.close": "Chiudi",
    "support.ticket.action.reopen": "Riapri",

    "support.ticket.reply": "Risposta",
    "support.ticket.reply.placeholder": "Scrivi un messaggio…",
    "support.ticket.reply.placeholder_closed": "Questo ticket è chiuso.",
    "support.ticket.reply.send": "Invia",
    "support.ticket.closed_note":
      "Questo ticket è chiuso. Riaprilo per rispondere.",

    "treatments.category.packs": "Pack",
    "treatments.category.buggy": "Buggy",
    "treatments.category.quad": "Quad",
    "treatments.category.motocross": "Motocross",
    "treatments.category.kids": "Bambini",
    "treatments.category.rides": "Escursioni",
    "treatments.category.options": "Opzioni",
    "treatments.category.hammam": "Hammam",
    "treatments.category.massage": "Massaggio",
    "treatments.category.cils": "Ciglia e sopracciglia",
    "treatments.category.onglerie": "Nail art",
    "treatments.category.coiffure": "Parrucchiere",
    "treatments.category.other": "Altro",

    "treatments.empty.title": "Nessun servizio",
    "treatments.empty.subtitle": "I servizi saranno disponibili a breve.",
    "treatments.category_empty.title": "Nessun servizio",
    "treatments.category_empty.subtitle":
      "Nessun servizio in questa categoria al momento.",

    "establishment.tabs.aria_label": "Navigazione della scheda",
    "establishment.tabs.menu": "Menu",
    "establishment.tabs.reviews": "Recensioni",
    "establishment.tabs.info": "Info",
    "establishment.tabs.hours": "Orari",
    "establishment.tabs.map": "Mappa",
    "establishment.tabs.rooms": "Camere",
    "establishment.tabs.services": "Servizi",
    "establishment.tabs.pricing": "Servizi e tariffe",
    "establishment.tabs.vehicles": "Veicoli",

    // Impostazioni prenotazione Pro
    "pro.booking_settings.title": "Cancellazioni e modifiche",
    "pro.booking_settings.subtitle":
      "Configura le tue politiche di cancellazione e modifica (testo mostrato lato USER).",
    "pro.booking_settings.reload": "Ricarica",
    "pro.booking_settings.save": "Salva",
    "pro.booking_settings.load_failed":
      "Impossibile caricare la politica (riprova).",

    "pro.booking_settings.pedagogy.title": "Protezione delle fasce orarie",
    "pro.booking_settings.pedagogy.body":
      "Sortir Au Maroc può richiedere un acconto su alcune prenotazioni per ridurre i no-show e proteggere le tue fasce orarie. Questa misura è automatica e mira a proteggere l'esperienza di tutti.",
    "pro.booking_settings.pedagogy.note":
      "Consiglio: spiega al cliente che l'acconto serve a confermare e proteggere la fascia oraria.",

    "pro.booking_settings.section.cancel.title": "A — Politica di cancellazione",
    "pro.booking_settings.section.cancel.description":
      "Scadenze, penalità e testo mostrato lato USER.",
    "pro.booking_settings.cancel.enable.title":
      "Attiva una politica di cancellazione personalizzata",
    "pro.booking_settings.cancel.enable.hint":
      "Se disattivato, si applica la politica predefinita di Sortir Au Maroc.",
    "pro.booking_settings.cancel.free_hours.label":
      "Termine di cancellazione gratuita (ore prima)",
    "pro.booking_settings.cancel.penalty_percent.label":
      "Penalità oltre il termine (%)",
    "pro.booking_settings.cancel.penalty_percent.example":
      "Es: dal termine fino all'ora della prenotazione: {percent}% di trattenuta.",
    "pro.booking_settings.cancel.no_show_penalty.label": "Penalità no-show (%)",
    "pro.booking_settings.cancel.no_show_always_100.title":
      "Sempre 100% per i no-show garantiti",
    "pro.booking_settings.cancel.no_show_always_100.hint":
      "Facoltativo, consigliato se con prepagamento.",
    "pro.booking_settings.cancel.custom_text.title":
      "Testo personalizzato mostrato al cliente",
    "pro.booking_settings.cancel.custom_text.placeholder.fr":
      "Testo FR mostrato al cliente (pagina prenotazione + email)",
    "pro.booking_settings.cancel.custom_text.placeholder.en":
      "Client-facing text (EN)",

    "pro.booking_settings.section.modif.title": "B — Politica di modifica",
    "pro.booking_settings.section.modif.description":
      "Autorizzazione, termine e testo mostrato al cliente.",
    "pro.booking_settings.modif.enable.title":
      "Autorizza le richieste di modifica",
    "pro.booking_settings.modif.enable.hint":
      "Se disattivato, il pulsante USER sarà nascosto.",
    "pro.booking_settings.modif.deadline_hours.label":
      "Ultimo termine (ore prima della prenotazione)",
    "pro.booking_settings.modif.require_guarantee.label":
      "Imponi la garanzia se punteggio < … (facoltativo)",
    "pro.booking_settings.modif.require_guarantee.placeholder": "Es: 65",
    "pro.booking_settings.modif.require_guarantee.hint":
      "Lascia vuoto per non applicare questa regola.",
    "pro.booking_settings.modif.custom_text.title":
      "Testo informativo mostrato al cliente",
    "pro.booking_settings.modif.custom_text.placeholder.fr":
      "Testo FR mostrato al cliente nella modale di modifica",
    "pro.booking_settings.modif.custom_text.placeholder.en":
      "Client-facing text (EN)",

    // Contenuto Admin
    "admin.content.title": "Contenuto",
    "admin.content.description":
      "Gestisci le pagine editoriali e le FAQ (FR/EN) senza toccare il codice.",
    "admin.content.editor_language": "Lingua di editing",
    "admin.content.tab.pages": "Pagine",
    "admin.content.tab.faq": "FAQ",

    "admin.content.action.new_page": "Nuova pagina",
    "admin.content.action.new_faq": "Nuova FAQ",
    "admin.content.action.preview": "Anteprima",
    "admin.content.action.back_to_edit": "Indietro",
    "admin.content.action.save": "Salva",

    "admin.content.warning": "Avviso",
    "admin.content.translation_missing": "Traduzione mancante",
    "admin.content.translation_missing_hint":
      "Completa la versione FR/EN prima della pubblicazione per un'esperienza coerente.",

    "admin.content.status.draft": "Bozza",
    "admin.content.status.published": "Pubblicato",

    "admin.content.pages.search": "Cerca (slug, titolo)…",
    "admin.content.pages.column.slug": "Slug",
    "admin.content.pages.column.title": "Titolo",
    "admin.content.pages.column.status": "Stato",
    "admin.content.pages.column.updated": "AGG",

    "admin.content.faq.search": "Cerca (domanda, tag)…",
    "admin.content.faq.column.category": "Categoria",
    "admin.content.faq.column.order": "Ordine",
    "admin.content.faq.column.question": "Domanda",
    "admin.content.faq.column.status": "Stato",
    "admin.content.faq.column.updated": "AGG",

    "admin.content.dialog.page": "Pagina",
    "admin.content.dialog.faq": "FAQ",

    "admin.content.field.slug": "Slug",
    "admin.content.field.slug_placeholder": "es: cgu, privacy, about",
    "admin.content.field.status": "Stato",
    "admin.content.field.title": "Titolo",
    "admin.content.field.title_placeholder_fr": "Titolo (FR)",
    "admin.content.field.title_placeholder_en": "Title (EN)",
    "admin.content.field.meta_title": "Meta title",
    "admin.content.field.meta_title_placeholder": "Titolo SEO",
    "admin.content.field.meta_description": "Meta description",
    "admin.content.field.meta_description_placeholder":
      "Descrizione SEO (≈ 160 caratteri)",
    "admin.content.field.content": "Contenuto",
    "admin.content.field.content_placeholder": "Scrivi qui…",

    "admin.content.language.fr": "Français",
    "admin.content.language.en": "English",

    "admin.content.preview.seo": "SEO (anteprima)",
    "admin.content.preview.public": "Resa pubblica",

    "admin.content.history.title": "Cronologia",
    "admin.content.history.empty": "Nessuna modifica registrata.",
    "admin.content.history.created": "Creazione",
    "admin.content.history.updated": "Modifica",

    "admin.content.error.slug_required": "Lo slug è obbligatorio.",
    "admin.content.error.title_required":
      "Inserisci almeno un titolo (FR o EN).",
    "admin.content.error.question_required":
      "Inserisci almeno una domanda (FR o EN).",

    "admin.content.faq.field.category": "Categoria",
    "admin.content.faq.field.order": "Ordine di visualizzazione",
    "admin.content.faq.field.tags": "Tag",
    "admin.content.faq.field.tags_placeholder": "cancellazione, pagamento, no-show",
    "admin.content.faq.field.question": "Domanda",
    "admin.content.faq.field.question_placeholder_fr": "Domanda (FR)",
    "admin.content.faq.field.question_placeholder_en": "Question (EN)",
    "admin.content.faq.field.answer": "Risposta",
    "admin.content.faq.field.answer_placeholder": "La tua risposta…",

    "admin.content.faq.category.reservations": "Prenotazioni",
    "admin.content.faq.category.paiements": "Pagamenti",
    "admin.content.faq.category.annulations": "Cancellazioni",
    "admin.content.faq.category.comptes_utilisateurs": "Account utenti",
    "admin.content.faq.category.comptes_pro": "Account Pro",
    "admin.content.faq.category.packs_offres": "Pack e offerte",
    "admin.content.faq.category.support_general": "Supporto generale",

    // Editor rich text Admin
    "admin.richtext.h2": "H2",
    "admin.richtext.h3": "H3",
    "admin.richtext.p": "Paragr.",
    "admin.richtext.bold": "Grassetto",
    "admin.richtext.italic": "Corsivo",
    "admin.richtext.underline": "Sottolineato",
    "admin.richtext.ul": "Lista",
    "admin.richtext.ol": "Num.",
    "admin.richtext.link": "Link",
    "admin.richtext.link.dialog_title": "Aggiungi un link",
    "admin.richtext.link.hint":
      "Seleziona prima il testo, poi incolla l'URL (es: https://…, /faq, mailto:…).",
    "admin.richtext.link.placeholder": "https://example.com",
    "admin.richtext.link.insert": "Inserisci",
    "admin.richtext.ai": "IA",

    // Segnala struttura
    "report.title": "Segnala questa struttura",
    "report.description": "Vuoi segnalare un problema con {name}?",
    "report.reason_label": "Motivo della segnalazione",
    "report.reason_placeholder": "Seleziona un motivo",
    "report.reason.closed_permanently": "Struttura chiusa definitivamente",
    "report.reason.incorrect_info": "Informazioni errate",
    "report.reason.fraudulent": "Struttura fraudolenta",
    "report.reason.inappropriate_content": "Contenuto inappropriato",
    "report.reason.safety_concern": "Problema di sicurezza",
    "report.reason.other": "Altro",
    "report.details_label": "Dettagli aggiuntivi (facoltativo)",
    "report.details_placeholder": "Descrivi il problema riscontrato...",
    "report.submit": "Invia la segnalazione",
    "report.submitting": "Invio in corso...",
    "report.error.select_reason": "Seleziona un motivo",
    "report.error.login_required": "Devi essere connesso per segnalare",
    "report.error.generic": "Errore durante l'invio della segnalazione",
    "report.success.title": "Segnalazione inviata",
    "report.success.description": "Grazie per la tua segnalazione. Il nostro team la esaminerà.",
    "report.button": "Segnala",
    "report.button_tooltip": "Segnala questa struttura",

    // Impostazioni Admin
    "admin.settings.title": "Impostazioni Superadmin",
    "admin.settings.description":
      "Centro di configurazione globale — replicato nel database Supabase",
    "admin.settings.logs": "Registri",
    "admin.settings.loading.title": "Caricamento",
    "admin.settings.loading.body": "Sincronizzazione in corso…",
    "admin.settings.sync_report.message":
      "Impostazioni sincronizzate con Supabase.\nNuove regole attive: {created} — Regole modificate: {modified} — Nulla da fare: {noop}.",
    "admin.settings.permissions.title": "Permessi",
    "admin.settings.permissions.body":
      "Questa pagina è riservata al superadmin. In caso di accesso non autorizzato, l'utente viene reindirizzato alla dashboard.",
};

export default it as Record<string, string>;

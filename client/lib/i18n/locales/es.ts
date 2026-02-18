import type { TranslationKey } from "../translation-keys";

const es: Partial<Record<TranslationKey, string>> = {
    // Comunes
    "common.close": "Cerrar",
    "common.cancel": "Cancelar",
    "common.confirm": "Confirmar",
    "common.continue": "Continuar",
    "common.back": "Volver",
    "common.prev": "Anterior",
    "common.next": "Siguiente",
    "common.pdf": "PDF",
    "common.error.load_failed": "Error de carga",
    "currency.mad.short": "Dhs",
    "common.loading": "Cargando…",
    "common.refresh": "Actualizar",
    "common.impossible": "Imposible",
    "common.error.generic": "Error",
    "common.error.unexpected": "Error inesperado",
    "common.clear": "Borrar",
    "common.edit": "Editar",
    "common.reset": "Restablecer",
    "common.help": "Ayuda",

    // Reanudar navegación
    "navigation.resume.title": "Reanudar mi navegación",
    "navigation.resume.description": "Había comenzado una búsqueda. ¿Desea reanudarla?",
    "navigation.resume.continue": "Reanudar",
    "navigation.resume.new_search": "Nueva búsqueda",
    "navigation.resume.search": "Su búsqueda",
    "navigation.resume.establishment_page": "Página del establecimiento",
    "navigation.resume.just_now": "Ahora mismo",
    "navigation.resume.minutes_ago": "Hace {n} min",
    "navigation.resume.hours_ago": "Hace {n}h",

    "content.toc": "Índice",
    "content.related_links": "Enlaces útiles",

    "blog.index.title": "Blog",
    "blog.index.subtitle":
      "Novedades, guías y consejos para sus salidas en Marruecos.",
    "blog.index.error": "No se pudieron cargar los artículos.",
    "blog.index.empty.title": "Ningún artículo por el momento",
    "blog.index.empty.subtitle":
      "Publique un artículo desde el Super-admin para que aparezca aquí.",
    "blog.index.back_home": "Volver al inicio",

    "common.coming_soon": "Próximamente",
    "common.change": "Cambiar",
    "common.user": "Usuario",
    "common.today": "Hoy",
    "common.tomorrow": "Mañana",
    "common.at": "a las",
    "common.time_placeholder": "hh:mm",
    "common.person.one": "persona",
    "common.person.other": "personas",
    "timepicker.title": "Elegir una hora",

    // Personas
    "persons.title": "Personas",
    "persons.button.confirm": "Validar",
    "persons.action.add": "Añadir {label}",
    "persons.action.remove": "Quitar {label}",
    "persons.age_group.age0_2": "0–2 años",
    "persons.age_group.age3_6": "3–6 años",
    "persons.age_group.age6_12": "6–12 años",
    "persons.age_group.age12_17": "12–17 años",
    "persons.age_group.age18_plus": "+18 años",

    // Idioma
    "language.french": "Français",
    "language.english": "English",
    "language.switcher.label": "Idioma",
    "language.suggestion.title":
      "Sortir Au Maroc está disponible en Français / English.",
    "language.suggestion.subtitle":
      "Elija su idioma. Podrá cambiarlo en cualquier momento.",

    // Encabezado
    "header.add_establishment.full": "Añadir mi establecimiento",
    "header.add_establishment.short": "Añadir",
    "header.profile.menu": "Menú del perfil",
    "header.profile.photo_alt": "Foto de perfil",
    "header.profile.my_account": "Mi identificador",
    "header.profile.my_profile": "Mi perfil",

    // Lógica de lista de espera con auto-promoción
    "profile.bookings.waitlist_offer": "Oferta disponible",
    "header.profile.logout": "Cerrar sesión",
    "header.login": "Iniciar sesión",
    "header.brand": "Sortir Au Maroc",
    "header.pro_space": "Espacio Pro",
    "header.logo_alt": "Sortir Au Maroc",

    "header.pro_conflict.title": "Se requiere cierre de sesión Pro",
    "header.pro_conflict.description":
      "Está conectado al espacio Pro. Para conectarse como usuario, primero cierre sesión en el espacio Pro.",
    "header.pro_conflict.go_to_pro": "Acceder a mi espacio Pro",
    "header.pro_conflict.logout_pro": "Cerrar sesión Pro",

    // Autenticación
    "auth.title.login": "Iniciar sesión en Sortir Au Maroc",
    "auth.title.forgot": "¿Olvidó su contraseña?",
    "auth.title.signup": "Crear una cuenta gratis",

    "auth.subtitle.login":
      "Acceda a sus reservas, favoritos y ofertas exclusivas",
    "auth.subtitle.forgot":
      "Ingrese su email o número de teléfono para recibir un enlace de restablecimiento.",
    "auth.subtitle.signup":
      "Cree su cuenta para acceder a sus reservas, favoritos y ofertas exclusivas.",

    "auth.field.email_or_phone.label": "Email o Teléfono",
    "auth.field.email_or_phone.placeholder":
      "su@email.com o +212 6XX XXX XXX",
    "auth.field.password.label": "Contraseña",

    "auth.link.forgot_password": "¿Olvidó su contraseña?",
    "auth.link.create_account": "Crear una cuenta",
    "auth.link.login": "Iniciar sesión",

    "auth.password.show": "Mostrar la contraseña",
    "auth.password.hide": "Ocultar la contraseña",

    "auth.button.login": "Iniciar sesión",
    "auth.button.login_busy": "Conectando…",
    "auth.button.demo_login": "Conexión demo",

    "auth.or_continue_with": "O continuar con",
    "auth.button.continue_with_google": "Continuar con Google",
    "auth.button.continue_with_apple": "Continuar con Apple",
    "auth.button.continue_with_facebook": "Continuar con Facebook",

    "auth.button.send_reset": "Enviar el enlace",
    "auth.button.send_reset_busy": "Enviando…",

    "auth.button.signup": "Crear mi cuenta",
    "auth.button.signup_busy": "Creando…",

    "auth.note.no_account": "¿No tiene cuenta?",
    "auth.note.have_account": "¿Ya tiene una cuenta?",

    "auth.error.demo_login_failed":
      "No se pudo conectar a la cuenta demo. Inténtelo de nuevo.",
    "auth.error.phone_login_unavailable":
      "Por el momento, la conexión por teléfono no está disponible. Utilice un email.",
    "auth.error.invalid_credentials":
      "Credenciales incorrectas o cuenta inexistente.",
    "auth.error.reset_by_phone_unavailable":
      "Restablecimiento por teléfono no disponible. Utilice su email.",
    "auth.error.reset_send_failed":
      "No se pudo enviar el enlace de restablecimiento. Inténtelo de nuevo.",
    "auth.error.signup_requires_email":
      "Por el momento, el registro requiere un email.",
    "auth.error.signup_failed":
      "No se pudo crear la cuenta. Verifique el email e inténtelo de nuevo.",
    "auth.error.too_many_attempts":
      "Demasiados intentos. Espere unos segundos e inténtelo de nuevo.",
    "auth.error.signup_spam_detected":
      "Registro bloqueado (detección anti-spam).",
    "auth.error.social_unconfigured":
      "Conexión {provider} no configurada por el momento.",
    "auth.error.social_login_failed":
      "No se pudo conectar con esta red social. Inténtelo de nuevo.",

    "auth.notice.reset_link_sent":
      "Enlace de restablecimiento enviado. Revise su bandeja de entrada.",
    "auth.notice.account_created":
      "Cuenta creada. Verifique su email para confirmar y luego vuelva a iniciar sesión.",

    // Autenticación por teléfono
    "auth.phone.title": "Conexión por teléfono",
    "auth.phone.subtitle": "Ingrese su número de teléfono para recibir un código de verificación por SMS.",
    "auth.phone.label": "Número de teléfono",
    "auth.phone.hint": "Recibirá un SMS con un código de 6 dígitos.",
    "auth.phone.send_code": "Enviar el código",
    "auth.phone.verify_title": "Verificación",
    "auth.phone.code_sent_to": "Código enviado al",
    "auth.phone.resend_code": "Reenviar el código",
    "auth.phone.resend_in": "Reenviar en",
    "auth.phone.success_title": "Conexión exitosa",
    "auth.phone.success_message": "¡Está conectado!",
    "auth.phone.redirecting": "Redirigiendo...",
    "auth.phone.use_email_instead": "Usar el email en su lugar",
    "auth.phone.use_phone_instead": "Iniciar sesión por teléfono",
    "auth.phone.error.invalid_number": "Número de teléfono no válido.",
    "auth.phone.error.send_failed": "No se pudo enviar el código. Inténtelo de nuevo.",
    "auth.phone.error.too_many_requests": "Demasiados intentos. Inténtelo de nuevo en unos minutos.",
    "auth.phone.error.invalid_code": "Código incorrecto. Verifique e inténtelo de nuevo.",
    "auth.phone.error.code_expired": "El código ha expirado. Solicite uno nuevo.",
    "auth.phone.error.verify_failed": "Verificación fallida. Inténtelo de nuevo.",
    "auth.phone.error.not_configured": "La autenticación por teléfono no está disponible por el momento.",

    // Pie de página
    "footer.brand": "Sortir Au Maroc",
    "footer.section.partners": "Socios",
    "footer.section.professionals": "Profesionales",
    "footer.section.help": "Ayuda",
    "footer.section.legal": "Legal",
    "footer.section.download_app": "Descargar la app",

    "footer.link.discover": "Descubrir",
    "footer.link.about": "Acerca de",
    "footer.link.contact": "Contacto",
    "footer.link.blog": "Blog",
    "footer.link.videos": "Vídeos",
    "footer.link.careers": "Empleo",

    "footer.link.become_sponsor": "Convertirse en padrino",
    "footer.link.for_providers": "Para los proveedores",
    "footer.link.partner_space": "Espacio Proveedores",

    "footer.link.create_pro_account": "Crear una cuenta Pro",
    "footer.link.pro_space": "Espacio Pro",
    "footer.link.pricing_offers": "Tarifas y ofertas",
    "footer.link.features": "Funcionalidades",
    "footer.link.request_demo": "Solicitar una demo",

    "footer.link.faq": "Preguntas frecuentes",
    "footer.link.contact_phone": "Contáctenos · 05 20 12 34 56",
    "footer.link.terms": "Condiciones de uso",
    "footer.link.privacy": "Política de Privacidad",
    "footer.link.legal_notice": "Aviso legal",
    "footer.link.partner_charter": "Carta de establecimientos",
    "footer.link.refund_policy": "Política de reembolso",
    "footer.link.anti_no_show_policy": "Política anti no-show",

    "footer.link.apple_store": "Apple Store",
    "footer.link.google_play": "Google Play",
    "footer.link.admin_aria": "Acceder a la interfaz Admin",

    "footer.section.discover": "Descubrir",
    "footer.install_app": "Instalar la aplicación",

    "footer.copyright_suffix": ". Todos los derechos reservados.",

    // PWA
    "pwa.update_available": "Nueva versión disponible",
    "pwa.update_description": "Haga clic para actualizar la aplicación.",
    "pwa.update_button": "Actualizar",
    "pwa.ios_guide_title": "Instalar la webapp sam.ma",
    "pwa.ios_guide_subtitle": "Añada la app a su pantalla de inicio para un acceso rápido.",
    "pwa.ios_step1_title": "Pulse el botón Compartir",
    "pwa.ios_step1_desc": "En la parte inferior de Safari, pulse el icono de compartir (cuadrado con flecha hacia arriba).",
    "pwa.ios_step2_title": "\"Añadir a pantalla de inicio\"",
    "pwa.ios_step2_desc": "Desplácese y pulse \"Añadir a pantalla de inicio\".",
    "pwa.ios_step3_title": "Pulse Añadir",
    "pwa.ios_step3_desc": "Confirme pulsando \"Añadir\" en la esquina superior derecha. ¡Listo!",
    "pwa.ios_guide_ok": "Entendido",

    // Notificaciones push
    "push.prompt_title": "Activar notificaciones",
    "push.prompt_description": "Reciba sus confirmaciones de reserva y alertas de lista de espera en tiempo real.",
    "push.prompt_enable": "Activar",
    "push.prompt_enabling": "Activando…",
    "push.prompt_later": "Más tarde",

    // Preferencias de perfil
    "profile.prefs.section_communication": "Comunicación",
    "profile.prefs.newsletter_desc": "Recibir novedades, ofertas y selecciones.",
    "profile.prefs.reminders": "Recordatorios de reserva",
    "profile.prefs.reminders_desc": "Recibir un recordatorio antes de sus salidas.",
    "profile.prefs.whatsapp_desc": "Autorizar confirmaciones y mensajes a través de WhatsApp.",
    "profile.prefs.section_push": "Notificaciones push",
    "profile.prefs.push_blocked": "Las notificaciones están bloqueadas en la configuración de su navegador. Para reactivarlas, modifique los permisos del sitio en su navegador.",
    "profile.prefs.push_enabled": "Notificaciones push",
    "profile.prefs.push_enabled_desc": "Recibir notificaciones en este dispositivo.",
    "profile.prefs.push_bookings": "Reservas",
    "profile.prefs.push_bookings_desc": "Confirmaciones, recordatorios y actualizaciones de sus reservas.",
    "profile.prefs.push_waitlist": "Lista de espera",
    "profile.prefs.push_waitlist_desc": "Alertas cuando se libera un lugar.",
    "profile.prefs.push_marketing": "Ofertas y promociones",
    "profile.prefs.push_marketing_desc": "Ofertas especiales y recomendaciones personalizadas.",

    // Newsletter
    "newsletter.title": "Newsletter",
    "newsletter.subtitle": "Reciba nuestras ofertas y novedades",
    "newsletter.placeholder": "Su email",
    "newsletter.button": "OK",
    "newsletter.success": "¡Gracias! Se ha suscrito correctamente.",
    "newsletter.error.generic": "Ha ocurrido un error. Inténtelo de nuevo.",
    "newsletter.error.invalid_email": "Dirección de email no válida",

    // Página de vídeos
    "videos.page.title": "Vídeos",
    "videos.page.subtitle": "Descubra los mejores establecimientos de Marruecos a través de nuestros vídeos exclusivos.",
    "videos.page.empty_title": "Ningún vídeo disponible",
    "videos.page.empty_description": "Vuelva pronto para descubrir nuestros nuevos vídeos.",

    // Páginas de soporte
    "help.title": "Ayuda y Soporte",
    "help.subtitle":
      "FAQ, tickets de soporte y chat (disponible de 9h a 19h).",
    "help.login_required":
      "Para crear un ticket o usar el chat, debe haber iniciado sesión. La FAQ está disponible para todos.",
    "help.tab.faq": "FAQ",
    "help.tab.tickets": "Tickets",
    "help.tab.chat": "Chat",

    "faq.title": "Preguntas frecuentes",
    "faq.subtitle":
      "Encuentre las respuestas a las preguntas más comunes: reservas, cancelaciones, pago y asistencia.",
    "faq.button.access_help": "Acceder a la ayuda (tickets y chat)",
    "faq.phone_support.title": "Asistencia telefónica",
    "faq.phone_support.hours": " · de 9h a 19h",

    "faq.section.title": "FAQ · Preguntas frecuentes",
    "faq.section.subtitle":
      "Escriba algunas palabras clave (ej: \"cancelación\", \"pago\", \"retraso\").",
    "faq.section.search_placeholder": "Buscar en la FAQ…",
    "faq.section.categories": "Categorías",
    "faq.section.category_all": "Todas las categorías",
    "faq.section.category_all_short": "Todas",
    "faq.section.results": "{count} resultado(s)",
    "faq.section.empty": "Ningún resultado. Intente con otras palabras clave.",
    "faq.section.error_load": "No se pudo cargar la FAQ. Inténtelo de nuevo.",

    "faq.category.reservations": "Reservas",
    "faq.category.reservations.desc":
      "Confirmación, horarios, número de personas, detalles de la reserva.",
    "faq.category.paiements": "Pagos",
    "faq.category.paiements.desc":
      "Depósito, factura, medios de pago, reembolsos.",
    "faq.category.annulations": "Cancelaciones",
    "faq.category.annulations.desc":
      "Cambiar una fecha, cancelar, políticas del establecimiento.",
    "faq.category.comptes_utilisateurs": "Cuentas de usuario",
    "faq.category.comptes_utilisateurs.desc":
      "Conexión, datos personales, seguridad de la cuenta.",
    "faq.category.comptes_pro": "Cuentas Pro",
    "faq.category.comptes_pro.desc":
      "Espacio pro, visibilidad, gestión de reservas.",
    "faq.category.packs_offres": "Packs y ofertas",
    "faq.category.packs_offres.desc": "Ofertas, packs, visibilidad, condiciones.",
    "faq.category.support_general": "Soporte general",
    "faq.category.support_general.desc":
      "Asistencia, tickets, contacto y preguntas generales.",

    // SEO
    "seo.home.title": "Sortir Au Maroc — Reserve sus mejores salidas en Marruecos",
    "seo.home.description":
      "Encuentre y reserve sus restaurantes, ocio, spas, hoteles y experiencias en Marruecos. Reserva sencilla, confirmaciones y soporte.",
    "seo.home.keywords":
      "reserva, restaurante, ocio, spa, hotel, actividades, Marruecos",

    // Inicio
    "home.hero.title": "Descubra y reserve las mejores actividades",
    "home.hero.subtitle":
      "Restaurantes, ocio, wellness y mucho más. Reserve en línea en Marruecos",

    "home.universe.restaurants": "Comer y Beber",
    "home.universe.sport": "Deporte y Bienestar",
    "home.universe.leisure": "Ocio",
    "home.universe.accommodation": "Alojamiento",
    "home.universe.culture": "Cultura",
    "home.universe.shopping": "Shopping",
    "home.universe.rentacar": "Desplazarse",

    "home.sections.best_offers.title": "Nuestras mejores ofertas",
    "home.sections.selected_for_you.title":
      "Restaurantes seleccionados para usted",
    "home.sections.selected_for_you.activities.title":
      "Actividades seleccionadas para usted",
    "home.sections.selected_for_you.sport.title":
      "Deporte y Bienestar seleccionados para usted",
    "home.sections.selected_for_you.accommodation.title":
      "Alojamientos seleccionados para usted",
    "home.sections.selected_for_you.culture.title":
      "Cultura seleccionada para usted",
    "home.sections.selected_for_you.shopping.title":
      "Shopping seleccionado para usted",
    "home.sections.selected_for_you.rentacar.title":
      "Vehículos seleccionados para usted",
    "home.sections.nearby.title": "Cerca de usted",
    "home.sections.most_booked.title": "Los más reservados del mes",
    "home.sections.open_now.title": "Abierto ahora",
    "home.sections.trending.title": "Tendencia este mes",
    "home.sections.new.title": "Novedades",
    "home.sections.top_rated.title": "Los mejor valorados",
    "home.sections.deals.title": "Mejores ofertas del momento",
    "home.sections.themed.romantic": "Para una velada romántica",
    "home.sections.themed.brunch": "¿Antojo de brunch?",
    "home.sections.themed.lunch": "Para tu pausa del almuerzo",
    "home.sections.themed.ramadan": "Selección Ftour y Shour",
    "home.sections.ramadan.title": "Especial Ramadán",
    "home.sections.ramadan.subtitle": "Descubra las mejores opciones de Ftour",

    "home.categories.restaurants.title": "¿Qué le apetece hoy?",
    "home.categories.sport.title": "¿Qué actividad le tienta?",
    "home.categories.loisirs.title": "¿Le apetece algo de ocio?",
    "home.categories.hebergement.title": "¿Qué tipo de alojamiento?",
    "home.categories.culture.title": "¿Le apetece cultura?",
    "home.categories.shopping.title": "¿Le apetece ir de compras?",
    "home.categories.rentacar.title": "Alquile su vehículo",
    "home.sections.top100.title": "Descubra el Top 100",
    "home.sections.top100.image_alt": "Top 100",
    "home.sections.view_all": "Ver todos",
    "home.sections.view_more": "VER MÁS",

    "home.cards.reviews_count": "{count} reseñas",
    "home.cards.next_slot": "Próxima franja horaria: {slot}",
    "home.cards.promo_badge": "-{percent}%",
    "home.cards.curated_badge": "Selección",
    "home.cards.month_reservations_label": "Reservas (30d)",
    "home.cards.view_details_aria": "Ver la ficha: {name}",

    "home.how_it_works.title": "¿Cómo funciona?",
    "home.how_it_works.subtitle":
      "Reserve su actividad favorita en unos pocos clics",
    "home.how_it_works.step1.title": "Descubra",
    "home.how_it_works.step1.text":
      "Explore los restaurantes y actividades cerca de usted",
    "home.how_it_works.step2.title": "Seleccione",
    "home.how_it_works.step2.text":
      "Elija su fecha, hora y número de personas",
    "home.how_it_works.step3.title": "Pague",
    "home.how_it_works.step3.text":
      "Complete su reserva de forma segura",
    "home.how_it_works.step4.title": "Disfrute",
    "home.how_it_works.step4.text":
      "Reciba su confirmación y la guía del lugar",

    "home.owner_block.image_alt": "Propietario de establecimiento",
    "home.owner_block.title": "¿Es usted propietario de un establecimiento?",
    "home.owner_block.subtitle": "Registre su establecimiento",
    "home.owner_block.paragraph":
      "Cuéntenos sobre su establecimiento y le contactaremos lo antes posible.",
    "home.owner_block.button_more": "MÁS INFORMACIÓN",
    "home.owner_block.already_partner": "Ya es socio",
    "home.owner_block.already_partner_text":
      "Acceda a su panel de control para gestionar sus reservas, su información, sus categorías (taxonomías), sus ofertas, sus facturas y su mensajería. ¿Necesita ayuda? Contáctenos a través del chat.",
    "home.owner_block.dashboard_button": "CONECTARSE AL PANEL DE CONTROL",

    "home.featured_offers.items.discount_50.title": "Hasta 50% de descuento",
    "home.featured_offers.items.discount_50.badge": "Oferta del momento",
    "home.featured_offers.items.weekend_brunch.title": "Brunch del Fin de Semana",
    "home.featured_offers.items.weekend_brunch.badge": "Destacado",
    "home.featured_offers.items.terrace_night.title": "Noche en la Terraza",
    "home.featured_offers.items.terrace_night.badge": "Oferta Limitada",
    "home.featured_offers.items.beach_vibes.title": "Ambiente Playa",
    "home.featured_offers.items.beach_vibes.badge": "Nuevo",
    "home.featured_offers.items.tasting_menu.title": "Menú Degustación",
    "home.featured_offers.items.tasting_menu.badge": "Especial",
    "home.featured_offers.items.culinary_experience.title":
      "Experiencia Culinaria",
    "home.featured_offers.items.culinary_experience.badge": "Exclusivo",

    // Secciones de inicio
    "home.search.placeholder.restaurants": "Cocina, restaurante, plato...",
    "home.search.placeholder.restaurants_detailed": "Cocina, nombre de restaurante, plato...",
    "home.search.placeholder.accommodation": "Hotel, tipo, equipamiento...",
    "home.search.placeholder.accommodation_detailed": "Nombre de hotel, tipo, equipamiento...",
    "home.search.placeholder.activities": "Actividad, lugar...",
    "home.search.placeholder.activities_detailed": "Actividad, lugar, tipo...",
    "home.cities.title": "Otras ciudades en Marruecos",
    "home.cities.see_more": "Ver más",
    "home.videos.title": "Vídeos",
    "home.videos.book": "Reservar",
    "home.videos.close": "Cerrar",
    "home.videos.fullscreen": "Pantalla completa",
    "home.blog.title": "Blog",
    "home.blog.read": "Leer",
    "home.blog.see_more": "Ver más",
    "home.sponsored": "Patrocinado",
    "home.how_it_works.default.exclusive_offers.title": "Ofertas exclusivas",
    "home.how_it_works.default.exclusive_offers.description": "Disfrute de descuentos y ventajas únicas en nuestros establecimientos asociados en Marruecos.",
    "home.how_it_works.default.best_choice.title": "La mejor elección",
    "home.how_it_works.default.best_choice.description": "Una selección rigurosa de establecimientos para todos sus deseos: restaurantes, ocio, bienestar...",
    "home.how_it_works.default.verified_reviews.title": "Reseñas verificadas",
    "home.how_it_works.default.verified_reviews.description": "Recomendaciones auténticas de nuestra comunidad para guiar sus elecciones.",
    "home.how_it_works.default.easy_booking.title": "Reserva fácil",
    "home.how_it_works.default.easy_booking.description": "Reserve instantáneamente, de forma gratuita, en cualquier lugar y momento. 24/7.",

    // Resultados / Listado
    "results.search": "Buscar",
    "results.filters": "Filtros",
    "results.view.list": "Lista",
    "results.view.map": "Mapa",
    "results.summary.found": "{label} encontrados",
    "results.summary.showing": "Mostrando",
    "results.geolocation.enable":
      "Activar la geolocalización para ver la distancia",
    "results.no_results.title": "Ningún establecimiento encontrado",
    "results.no_results.body": "No hemos encontrado ningún establecimiento que coincida con sus criterios.",
    "results.no_results.suggestion": "Intente modificar sus filtros o explore otros destinos para su próxima salida en pareja, con amigos o en familia.",
    "results.no_results.open_filters": "Modificar los filtros",
    "results.no_results.new_search": "Nueva búsqueda",
    "results.sponsored": "Patrocinado",
    "results.status.open": "Abierto",
    "results.status.closed": "Cerrado",
    "results.promo.ongoing": "Oferta en curso",
    "results.favorite.add": "Añadir a favoritos",
    "results.favorite.remove": "Quitar de favoritos",
    "results.highlight.today_prefix": "Hoy: ",
    "results.offer.up_to": "Hasta -{percent}%",
    "results.action.book": "Reservar",
    "results.action.view": "Ver",
    "results.action.view_hotel": "Ver el hotel",
    "results.load_more": "Mostrar {count} resultados adicionales",
    "results.people.option.1": "1 persona",
    "results.people.option.2": "2 personas",
    "results.people.option.3": "3 personas",
    "results.people.option.4": "4 personas",
    "results.people.option.5_plus": "5+ personas",
    "results.search_placeholder": "¿Adónde quiere ir?",
    "results.filter.date": "Fecha",
    "results.filter.time": "Hora",
    "results.filter.persons_short": "pers.",
    "results.filter.promotions": "Promociones",
    "results.filter.best_rated": "Mejor valorados",
    "results.filter.cuisine_type": "Tipo de cocina",
    "results.filter.ambiance": "Ambiente",
    "results.filter.sort_and_filter": "Ordenar y filtrar",
    "results.filter.open_now": "Abierto ahora",
    "results.filter.instant_booking": "Reserva instantánea",
    "results.filter.terrace": "Terraza",
    "results.filter.parking": "Aparcamiento",
    "results.filter.kid_friendly": "Apto para niños",
    "results.filter.wifi": "Wi-Fi",
    "results.filter.budget": "Presupuesto",
    "results.filter.price_1": "€",
    "results.filter.price_2": "€€",
    "results.filter.price_3": "€€€",
    "results.filter.price_4": "€€€€",
    "results.filter.no_results_filters": "Sin resultados con estos filtros",
    "results.filter.reset_filters": "Restablecer filtros",

    // Prompt 12 — Personalización
    "search.personalized": "Resultados adaptados a tus preferencias",
    "search.personalized.tooltip": "Basado en tus reservas y búsquedas anteriores",
    "search.personalized.disable": "Desactivar la personalización",
    "search.personalized.enable": "Activar la personalización",
    "settings.personalization": "Personalización de resultados",
    "settings.personalization.description": "Adaptar el orden de los resultados según tus gustos",

    // Search fallback (Prompt 13)
    "search.no_results": "Sin resultados para \"{query}\"",
    "search.did_you_mean": "¿Quisiste decir?",
    "search.did_you_mean.results": "{count} resultados",
    "search.similar_results": "Resultados similares",
    "search.relax_filters": "Intenta con menos filtros",
    "search.relax_filters.without": "Sin {filter}",
    "search.reset_all_filters": "Restablecer todos los filtros",
    "search.nearby": "Disponible cerca",
    "search.nearby.distance": "a {km} km",
    "search.nearby.see_results": "Ver {count} resultados en {city}",
    "search.popular_fallback": "Los más populares",
    "search.also_like": "También te puede gustar",

    // Búsqueda
    "search.field.city.placeholder": "Ciudad o barrio",
    "search.field.activity.placeholder": "Actividad o establecimiento",
    "search.validation.minimum_people": "Mínimo: {count} personas",

    "search.placeholder.unified": "Cocina, nombre de lugar, plato...",
    "search.placeholder.restaurant_type": "Tipo de lugar",
    "search.title.choose_restaurant_type": "Elegir un tipo de lugar",
    "search.placeholder.accommodation_type": "Tipo de alojamiento",
    "search.title.choose_accommodation_type": "Elegir un tipo de alojamiento",
    "search.placeholder.culture_type": "Tipo de salida",
    "search.title.choose_culture_type": "Elegir un tipo de salida",
    "search.placeholder.shopping_type": "Tipo de tienda",
    "search.title.choose_shopping_type": "Elegir un tipo de tienda",
    "search.placeholder.sport_activity_type": "Tipo de actividad",
    "search.title.choose_sport_activity_type": "Elegir un tipo de actividad",
    "search.placeholder.prestation_type": "Tipo de servicio",
    "search.title.choose_prestation_type": "Elegir un tipo de servicio",

    "search.restaurant_type.gastronomique": "Gastronómico",
    "search.restaurant_type.rooftop": "Rooftop",
    "search.restaurant_type.plage": "Restaurante de playa",
    "search.restaurant_type.brunch": "Brunch organizado",
    "search.restaurant_type.cafe": "Café",
    "search.restaurant_type.fast_food": "Comida rápida",
    "search.restaurant_type.bistronomie": "Bistronomía",
    "search.restaurant_type.familial": "Restaurante familiar",

    "search.shopping_type.mode": "Moda",
    "search.shopping_type.chaussures": "Calzado",
    "search.shopping_type.beaute_parfumerie": "Belleza / Perfumería",
    "search.shopping_type.optique": "Óptica",
    "search.shopping_type.bijoux": "Joyería",
    "search.shopping_type.maison_deco": "Hogar / Decoración",
    "search.shopping_type.epicerie_fine": "Delicatessen",
    "search.shopping_type.artisanat": "Artesanía",
    "search.shopping_type.concept_store": "Concept store",
    "search.shopping_type.autres": "Otros",

    // Campos de búsqueda de alquiler de coches
    "search.placeholder.vehicle_type": "Tipo de vehículo",
    "search.title.choose_vehicle_type": "Elegir un tipo de vehículo",
    "search.rentacar.pickup_location": "Recogida",
    "search.rentacar.dropoff_location": "Devolución",
    "search.rentacar.same_dropoff": "Misma devolución",
    "search.rentacar.same_dropoff_checkbox": "Devolución en el mismo lugar",
    "search.rentacar.pickup_date": "Fecha de recogida",
    "search.rentacar.dropoff_date": "Fecha de devolución",
    "search.rentacar.pickup_time": "Hora de recogida",
    "search.rentacar.dropoff_time": "Hora de devolución",
    "search.rentacar.driver_age": "Edad del conductor",
    "search.rentacar.young_driver_warning": "Conductor menor de 30 años o mayor de 70 años",
    "search.rentacar.young_driver_description": "Los conductores jóvenes y los conductores mayores pueden tener que pagar cargos adicionales.",
    "search.rentacar.select_dates": "Seleccionar las fechas",

    // Historial de búsqueda
    "search.history.recent_searches": "Búsquedas recientes",
    "search.history.clear_all": "Borrar todo",
    "search.history.remove": "Eliminar",

    "results.universe.restaurants.count_label": "restaurantes",
    "results.universe.sport.count_label": "actividades de bienestar",
    "results.universe.loisirs.count_label": "actividades de ocio",
    "results.universe.hebergement.count_label": "alojamientos",
    "results.universe.culture.count_label": "sitios culturales",
    "results.universe.shopping.count_label": "lugares de shopping",
    "results.universe.rentacar.count_label": "vehículos",
    "results.universe.default.count_label": "resultados",

    // Tarjeta de vehículo
    "vehicle.badge.super_offer": "Súper oferta",
    "vehicle.badge.member_price": "Precio miembro",
    "vehicle.feature.unlimited_mileage": "Kilometraje ilimitado",
    "vehicle.cashback": "Gane {amount} MAD en cashback",
    "vehicle.benefit.free_cancellation": "Cancelación gratuita",
    "vehicle.benefit.basic_insurance": "Seguro de colisión básico",
    "vehicle.benefit.online_checkin": "Registro en línea",
    "vehicle.positive_reviews": "de reseñas positivas",
    "vehicle.discount": "de descuento",
    "vehicle.price_per_day": "por día",
    "vehicle.price_total": "total",
    "vehicle.or_similar": "o similar",
    "vehicle.seats": "{count} plazas",
    "vehicle.sort_filter": "Ordenar y filtrar",
    "vehicle.total_taxes_included": "Importe total, impuestos y tasas incluidos",
    "vehicle.sort_info": "Cómo funciona nuestro orden de clasificación",

    // Filtros
    "filters.title": "Filtros",
    "filters.promotions.title": "Promociones",
    "filters.promotions.subtitle": "Mostrar las promociones",
    "filters.promotions.description":
      "Destaca los establecimientos con ofertas o descuentos",
    "filters.none_available": "Ningún filtro disponible para este universo.",
    "filters.apply": "Aplicar",

    "filters.section.restaurant.specialties": "Especialidades culinarias",
    "filters.section.restaurant.specialties.search_placeholder":
      "Buscar una especialidad",
    "filters.section.price": "Precio",
    "filters.section.availability": "Disponibilidad",
    "filters.availability.now": "Disponible ahora",
    "filters.availability.tonight": "Esta noche",
    "filters.availability.tomorrow": "Mañana",
    "filters.availability.specific": "Fecha específica",
    "filters.section.packs_offers": "Packs y ofertas",
    "filters.section.options": "Opciones",
    "filters.section.ambience": "Ambiente",
    "filters.section.activity_type": "Tipo de actividad",
    "filters.section.duration": "Duración",
    "filters.section.audience": "Público",
    "filters.section.level": "Nivel",
    "filters.section.constraints": "Restricciones",
    "filters.constraints.min_people": "Mínimo de personas",
    "filters.constraints.privatization": "Privatización posible",
    "filters.section.type": "Tipo",
    "filters.section.format": "Formato",
    "filters.section.duration_minutes": "Duración (min)",
    "filters.section.equipment": "Equipamientos",
    "filters.section.offers": "Ofertas",
    "filters.section.budget_per_night": "Presupuesto / noche",
    "filters.section.ratings": "Valoraciones",
    "filters.section.conditions": "Condiciones",
    "filters.section.language": "Idioma",
    "filters.section.access": "Acceso",
    "filters.section.store_type": "Tipo de tienda",
    "filters.section.budget": "Presupuesto",
    "filters.section.services": "Servicios",
    "filters.placeholder.example": "Ej: {value}",

    // Sugerencias de búsqueda
    "suggestions.my_position": "Mi ubicación",
    "suggestions.use_my_location": "Usar mi ubicación",
    "suggestions.section.cities": "Ciudades",
    "suggestions.section.neighborhoods": "Barrios populares",
    "suggestions.section.establishments": "Establecimientos y Actividades",
    "suggestions.section.categories": "Categorías y Especialidades",
    "suggestions.section.offers": "Ofertas",
    "suggestions.section.trending": "Tendencias",

    // Reserva (rutas prioritarias)
    "booking.steps.details": "Detalles",
    "booking.steps.payment": "Pago",
    "booking.steps.info": "Info",
    "booking.steps.confirmation": "Confirmación",
    "booking.step_header.label": "PASO {step} DE {total}",

    "booking.auth.title": "Inicie sesión para finalizar (1 min)",
    "booking.auth.subtitle.step2":
      "Esto permite asegurar su reserva y encontrar su confirmación.",
    "booking.auth.subtitle.step3":
      "Podrá confirmar su información y recibir su código QR.",

    "booking.establishment.fallback": "Reserva",

    "booking.card.title.restaurant": "Reservar una mesa",
    "booking.card.title.hotel": "Reservar una habitación",
    "booking.card.title.ticket": "Reservar una entrada",
    "booking.card.title.slot": "Reservar una franja horaria",
    "booking.card.title.default": "Reservar",

    "booking.cta.book_now": "Reservar ahora",
    "booking.module.step_progress": "Paso {current} / {total}",

    "booking.people.more_than_10": "Más de 10 personas",
    "booking.people.exact_count": "Número exacto",
    "booking.people.remove_one": "Quitar una persona",
    "booking.people.add_one": "Añadir una persona",
    "booking.people.up_to": "Hasta 50 personas.",
    "booking.people.other_number": "Otro número",
    "booking.people.range": "Entre {min} y {max} personas.",

    "booking.step1.title": "Elija su franja horaria",
    "booking.step1.subtitle":
      "Seleccione una fecha, una hora y el número de personas.",
    "booking.step1.section.date": "Seleccione una fecha",
    "booking.step1.section.time": "Seleccione una hora",
    "booking.step1.section.people": "Número de personas",

    "booking.date_time.placeholder": "Seleccione una fecha y una hora",

    "booking.bottomsheet.tab.date": "Fecha",
    "booking.bottomsheet.tab.time": "Hora",
    "booking.bottomsheet.tab.persons_short": "Pers.",

    "booking.pack.selected": "PACK SELECCIONADO",
    "booking.pack.remove": "Quitar",

    "booking.step1.date.helper":
      "Elija un día para ver las franjas horarias disponibles.",
    "booking.step1.time.helper": "Elija un horario disponible.",
    "booking.step1.people.helper":
      "Elija el número de personas para la reserva.",

    "booking.step1.recap": "RESUMEN",

    "booking.step1.selected.date": "Fecha seleccionada",
    "booking.step1.selected.time": "Hora seleccionada",
    "booking.step1.selected.slot": "Franja horaria seleccionada",
    "booking.step1.selected.participants": "Participantes",

    "booking.step1.no_slots":
      "Ninguna franja horaria disponible para esta fecha. Intente otro día.",
    "booking.step1.select_date_first":
      "Seleccione primero una fecha para ver las franjas horarias.",
    "booking.step1.select_time_first":
      "Seleccione primero una hora para elegir el número de personas.",

    "booking.step1.more_choices": "Más opciones",
    "booking.step1.more_dates": "+ fechas",

    "booking.choose_slot": "Elija una franja horaria",
    "booking.reservations_today": "Ya {count} reservas para hoy",

    "booking.waitlist": "Lista de espera",
    "booking.slot.full": "Completo",
    "booking.slot.full_aria": "Franja horaria {time} completa",

    "booking.offer.short": "Oferta -{promo}% carta",
    "booking.offer.long": "Oferta -{promo}% en la carta",

    "booking.capacity.full_waitlist":
      "Esta franja horaria está completa. Puede unirse a la lista de espera.",
    "booking.capacity.remaining":
      "Capacidad restante para esta franja horaria: {remaining}",
    "booking.capacity.limited": "Esta franja horaria está limitada a {remaining} {unit}.",
    "booking.waitlist.notice":
      "Franja completa: su solicitud se enviará a la lista de espera.",

    "booking.step1.choose_people": "Elija el número de personas",
    "booking.step1.choose_time": "Elija una hora",
    "booking.step1.choose_date": "Elija una fecha",

    "booking.activity.slot_at": "Franja horaria a las {time}",
    "booking.time.choose": "Elegir {time}",
    "booking.service.at_time": "{service} a las {time}",

    "booking.calendar.choose_date": "Elegir una fecha",
    "booking.calendar.placeholder": "dd/mm/aaaa",
    "booking.calendar.prev_month": "Mes anterior",
    "booking.calendar.next_month": "Mes siguiente",

    "booking.time.bucket.other": "Otros",
    "booking.time.bucket.morning": "Mañana",
    "booking.time.bucket.afternoon": "Tarde",
    "booking.time.bucket.evening": "Noche",
    "booking.time.bucket.breakfast": "Desayuno",
    "booking.time.bucket.lunch": "Almuerzo",
    "booking.time.bucket.tea_time": "Tea Time",
    "booking.time.bucket.happy_hour": "Happy Hour",
    "booking.time.bucket.dinner": "Cena",
    "booking.time.bucket.available": "Disponible",

    "booking.service.lunch": "Almuerzo",
    "booking.service.continuous": "Servicio continuo",
    "booking.service.dinner": "Cena",

    "booking.footer.security_notice":
      "🔒 Pago seguro • ⚡ Gestionado por Sortir Au Maroc",

    "booking.recap.title": "Resumen",
    "booking.recap.establishment": "Establecimiento",
    "booking.recap.pack": "Pack",
    "booking.recap.guests": "Personas",
    "booking.recap.date": "Fecha",
    "booking.recap.time": "Horario",
    "booking.recap.discount": "Descuento",

    "booking.mode.guaranteed": "Reserva garantizada",
    "booking.mode.not_guaranteed": "Reserva no garantizada",

    "booking.price.per_person": "{amount} / persona",
    "booking.price.from": "Desde",

    "booking.step2.title.secure": "Asegure su reserva",
    "booking.step2.title.waitlist": "Solicitud de lista de espera",
    "booking.step2.subtitle.secure":
      "Elija si desea garantizar su mesa.",
    "booking.step2.subtitle.waitlist":
      "La franja horaria está completa. Transmitimos su solicitud al restaurante.",

    "booking.waitlist.banner.title": "Franja completa — lista de espera",
    "booking.waitlist.banner.body":
      "Enviamos su solicitud al restaurante. Le avisaremos si se libera un lugar.",
    "booking.waitlist.banner.note":
      "No se requiere ningún pago para una solicitud de lista de espera.",

    "booking.mode.guaranteed.short": "Plaza garantizada",
    "booking.mode.non_guaranteed.short": "En espera de confirmación",
    "booking.mode.guaranteed.line1":
      "Pre-reserva de {unit} MAD/pers. (deducida de la cuenta)",
    "booking.mode.guaranteed.line2": "Cancelación gratuita hasta 24h antes",
    "booking.mode.non_guaranteed.line":
      "Sin pago inicial, el restaurante puede priorizar las plazas garantizadas.",
    "booking.mode.non_guaranteed.line_simple":
      "Su reserva será confirmada por el restaurante.",
    "booking.mode.non_guaranteed.more":
      "Sin prepago, su reserva depende de la disponibilidad y la prioridad del restaurante. Recibirá una confirmación rápidamente.",

    "booking.payment.banner.title":
      "Pago seguro — cancelación según condiciones",
    "booking.payment.banner.waitlist":
      "Ningún pago inmediato. El restaurante confirmará si se libera un lugar.",
    "booking.payment.banner.followup":
      "Recibirá una respuesta lo antes posible.",
    "booking.payment.banner.guaranteed":
      "Pre-reserva de {unit} MAD / persona (deducida de la cuenta).",
    "booking.payment.banner.total": "Total prepagado hoy: {total} MAD",
    "booking.payment.banner.non_guaranteed":
      "Ningún pago inmediato. El restaurante puede priorizar las plazas garantizadas.",
    "booking.payment.method.card": "Tarjeta bancaria",
    "booking.payment.secure_method": "Pago seguro",

    "booking.deposit.title": "Se requiere un anticipo",
    "booking.deposit.description":
      "Para garantizar la disponibilidad de los establecimientos y evitar los no-shows, se puede requerir un anticipo para ciertas reservas.",
    "booking.deposit.amount_label": "Importe a pagar",
    "booking.deposit.pre_auth":
      "Pre-reserva: {unit} {currency} × {partySize} pers.",
    "booking.deposit.note":
      "Este importe se deducirá de la cuenta final. En caso de no-show, puede ser retenido según las condiciones.",
    "booking.deposit.payma_hint":
      "Será redirigido a pay.ma para realizar el pago. Después del pago, vuelva aquí para finalizar.",
    "booking.deposit.pay_and_confirm": "Pagar y confirmar la reserva",

    "booking.deposit.pedagogy.context_label": "Contexto",
    "booking.deposit.pedagogy.context_value":
      "En ciertas reservas, se puede aplicar una confirmación reforzada.",
    "booking.deposit.pedagogy.impact_label": "Consecuencia",
    "booking.deposit.pedagogy.impact_value":
      "Esta reserva requiere un anticipo para ser confirmada.",
    "booking.deposit.pedagogy.reassurance":
      "No es una sanción: es una medida de protección de las franjas horarias.",
    "booking.deposit.pedagogy.learn_more": "Más información",

    "booking.step3.title": "Confirme su información",
    "booking.step3.subtitle":
      "Esta información permitirá al establecimiento contactarle.",
    "booking.step3.description":
      "Esta información permitirá al restaurante contactarle sobre su reserva.",

    "booking.form.first_name": "Nombre",
    "booking.form.last_name": "Apellido",
    "booking.form.email": "Email",
    "booking.form.phone": "Teléfono",
    "booking.form.message": "Mensaje especial",
    "booking.form.optional": "opcional",

    "booking.form.placeholder.first_name": "Ej: Amina",
    "booking.form.placeholder.last_name": "Ej: Benali",
    "booking.form.placeholder.email": "Ej: amina@example.com",
    "booking.form.placeholder.phone": "Ej: +212 6 12 34 56 78",
    "booking.form.placeholder.message": "Ej: Alergias, ocasión especial…",
    "booking.form.placeholder.message_long":
      "Describa la ocasión (cumpleaños, cita...), mencione dietas alimentarias o solicitudes especiales...",

    "booking.step3.privacy_notice":
      "🔒 Sus datos están seguros y solo se compartirán con el restaurante para su reserva.",
    "booking.step3.cta.review": "Verificar",

    "booking.step4.title.confirmed": "Su reserva está confirmada",
    "booking.step4.title.waitlist": "Solicitud en lista de espera",
    "booking.step4.title.sent": "Solicitud enviada",

    "booking.step4.subtitle.confirmed":
      "Encuentre su código QR y sus documentos para presentar a la llegada.",
    "booking.step4.subtitle.waitlist":
      "La franja horaria está completa. El restaurante le contactará si se libera un lugar.",
    "booking.step4.subtitle.sent":
      "El restaurante debe validar su solicitud. Recibirá una respuesta rápidamente.",

    "booking.step4.banner.title.confirmed": "¡Reserva confirmada!",
    "booking.step4.banner.title.pending": "Solicitud enviada",
    "booking.step4.banner.body.confirmed":
      "Su plaza está garantizada. Se ha enviado un SMS de confirmación.",
    "booking.step4.banner.body.pending":
      "El restaurante confirmará su reserva por SMS o WhatsApp en breve.",

    "booking.step4.contact.title": "CONTACTO",
    "booking.step4.contact.confirmation_sent":
      "Confirmación enviada al número proporcionado",
    "booking.step4.reference.title": "REFERENCIA DE RESERVA",

    "booking.step4.qr.title": "Código QR - Para presentar en el restaurante",
    "booking.step4.qr.alt": "Código QR de reserva",
    "booking.step4.qr.body":
      "El restaurante podrá escanear este código QR para confirmar su presencia",

    "booking.step4.pdf.title": "Descargar la reserva en PDF",
    "booking.step4.pdf.cta": "Exportar en PDF",
    "booking.step4.pdf.generating": "Generando...",

    "booking.step4.wallet.apple": "Añadir a Apple Wallet",
    "booking.step4.wallet.google": "Añadir a Google Wallet",

    "booking.step4.calendar.add": "Añadir al calendario",
    "booking.step4.directions": "Ver el itinerario",

    "booking.step4.modify": "Modificar",
    "booking.step4.cancel": "Cancelar",
    "booking.step4.cancel.confirm":
      "¿Está seguro de que desea cancelar esta reserva?",

    "booking.step4.trust.ssl": "Pago seguro con SSL 256-bit",
    "booking.step4.trust.managed_by": "Reserva gestionada por Sortir Au Maroc",
    "booking.step4.trust.count": "Más de 5.000 reservas realizadas",

    "booking.step4.home": "Volver al inicio",
    "booking.step4.calendar.event_title": "Reserva - {establishment}",
    "booking.waitlist.missing_slot":
      "No se puede unir a la lista de espera: no se ha seleccionado ninguna franja horaria.",

    "booking.modify.title": "Solicitar una modificación",
    "booking.modify.datetime_label": "Nueva fecha/hora ({optional})",
    "booking.modify.datetime_help":
      "El establecimiento confirmará la modificación (según disponibilidad).",
    "booking.modify.party_size_label": "Número de personas ({optional})",
    "booking.modify.party_size_placeholder": "Ej: 4",
    "booking.modify.send": "Enviar",

    // Estado de la reserva (extra)
    "reservation.status.modification_pending":
      "En revisión (modificación solicitada)",
    "reservation.status.modification_pending.title":
      "Su solicitud de modificación está siendo procesada por el establecimiento.",

    "reservation.status.refused": "Rechazada",
    "reservation.status.refused.title": "Reserva rechazada",
    "reservation.status.waitlist": "Lista de espera",
    "reservation.status.pending_pro": "En espera de validación",

    "reservation.status.cancelled.you": "Cancelada (usted)",
    "reservation.status.cancelled.client": "Cancelada (cliente)",
    "reservation.status.cancelled.establishment": "Cancelada (establecimiento)",
    "reservation.status.cancelled.refunded": "Cancelada / reembolsada",
    "reservation.status.cancelled.generic": "Cancelada",

    "reservation.status.no_show": "No-show",

    "reservation.status.past.present": "Pasada · presente",
    "reservation.status.past.no_show": "Pasada · no-show",
    "reservation.status.past.generic": "Pasada",

    "reservation.status.confirmed": "Confirmada",
    "reservation.status.confirmed.guaranteed": "Confirmada · garantizada",
    "reservation.status.confirmed.not_guaranteed": "Confirmada · no garantizada",

    "reservation.status.generic": "Reserva",

    // Estado de pago
    "payment.status.paid": "Pagado",
    "payment.status.pending": "No pagado",
    "payment.status.refunded": "Reembolsado",

    // Detalles de reserva
    "booking_details.loading.title": "Cargando…",
    "booking_details.loading.body": "Estamos recuperando su reserva.",

    "booking_details.not_found": "Reserva no encontrada",
    "booking_details.not_found.body_default":
      "Esta reserva ya no existe o ha sido eliminada.",
    "booking_details.back_to_account": "Volver a la cuenta",
    "booking_details.explore": "Explorar",
    "booking_details.back": "Volver",

    "booking_details.ref_prefix": "Ref.",
    "booking_details.field.date": "Fecha",
    "booking_details.field.time": "Hora",
    "booking_details.field.people": "Personas",
    "booking_details.field.address": "Dirección",

    // Lógica de lista de espera con auto-promoción
    "booking_details.waitlist_offer.badge": "Oferta (lista de espera)",
    "booking_details.waitlist_offer.title": "Oferta de plaza disponible",
    "booking_details.waitlist_offer.body":
      "Tiene 15 minutos para confirmar esta reserva.",
    "booking_details.waitlist_offer.expires_at": "Expira a las {time}",
    "booking_details.waitlist_offer.accept": "Aceptar",
    "booking_details.waitlist_offer.refuse": "Rechazar",
    "booking_details.waitlist_offer.expired_title": "Oferta expirada",
    "booking_details.waitlist_offer.expired_body":
      "Esta oferta ya no está disponible. El sistema propondrá la plaza al siguiente cliente.",
    "booking_details.waitlist_offer.waiting_title": "En lista de espera",
    "booking_details.waitlist_offer.waiting_body":
      "Su posición actual: #{position}.",

    "booking_details.payment.title": "Pago",
    "booking_details.payment.status": "Estado",
    "booking_details.payment.amount": "Importe",
    "booking_details.payment.total": "Total",
    "booking_details.payment.paid_at": "Pagado el",
    "booking_details.payment.method": "Medio",
    "booking_details.payment.escrow_held_badge": "Fondos retenidos ⚠️",
    "booking_details.payment.none": "Ningún pago registrado.",
    "booking_details.payment.secure": "Pago seguro",
    "booking_details.payment.pre_reservation_per_person":
      "Pre-reserva (por pers.)",
    "booking_details.payment.total_prepaid": "Total prepagado",
    "booking_details.payment.calculation": "Cálculo: {unit} × {count} pers.",

    "booking_details.qr.title": "Código QR y documentos",
    "booking_details.qr.invoice": "Factura",
    "booking_details.qr.alt": "Código QR",
    "booking_details.qr.present_on_arrival": "Para presentar a la llegada",
    "booking_details.qr.contains":
      "El código QR contiene la referencia de reserva y, si está disponible, el importe prepagado.",
    "booking_details.qr.pdf_restaurant_only":
      "El PDF está disponible para las reservas de restaurante.",

    "booking_details.review.title": "Reseña",
    "booking_details.review.overall": "Nota global: {rating}/5",
    "booking_details.review.criteria_average": "Media de criterios",
    "booking_details.review.published_at": "Publicada el {date}",
    "booking_details.review.leave": "Dejar una reseña",
    "booking_details.review.rate_each": "Valore cada criterio",
    "booking_details.review.estimated": "Nota global estimada: {rating}/5",
    "booking_details.review.comment_label": "Comentario",
    "booking_details.review.comment_placeholder": "Comparta su experiencia…",
    "booking_details.review.publish": "Publicar",
    "booking_details.review.thank_you_title": "¡Gracias!",
    "booking_details.review.saved_body": "Su reseña ha sido registrada.",
    "booking_details.review.unavailable":
      "Dejar una reseña está disponible después de la reserva, si el cliente se presentó.",

    "booking_details.summary.title": "Resumen",
    "booking_details.summary.note": "Nota:",
    "booking_details.summary.phone": "Teléfono:",

    "booking_details.pro_message.title": "Mensaje del establecimiento",
    "booking_details.pro_message.template_prefix": "plantilla",

    "booking_details.service.lunch": "almuerzo",
    "booking_details.service.continuous": "continuo",
    "booking_details.service.dinner": "cena",

    "booking_details.attendance.title": "Asistencia",
    "booking_details.attendance.present": "Presente",
    "booking_details.attendance.no_show": "Ausente / no-show",
    "booking_details.attendance.unknown": "No indicado",

    "booking_details.toast.declined.title": "Propuesta rechazada",
    "booking_details.toast.declined.body": "Hemos informado al sistema.",
    "booking_details.toast.accepted.title": "Solicitud enviada",
    "booking_details.toast.accepted.body":
      "Su aceptación ha sido enviada al Pro para validación.",
    "booking_details.toast.change_cancelled.title": "Cancelado",
    "booking_details.toast.change_cancelled.body":
      "Su solicitud de modificación ha sido retirada.",
    "booking_details.toast.cancellation_sent.title": "Cancelación enviada",
    "booking_details.toast.cancellation_sent.body":
      "Su solicitud de cancelación ha sido registrada. Recibirá una confirmación en cuanto el reembolso (si corresponde) sea procesado.",
    "booking_details.toast.payment_initiated.title": "Pago iniciado",
    "booking_details.toast.payment_initiated.body":
      "Una vez realizado el pago, vuelva aquí e intente aceptar la oferta nuevamente.",
    "booking_details.toast.change_request_sent.title": "Solicitud enviada",
    "booking_details.toast.change_request_sent.body":
      "Su solicitud de modificación ha sido enviada al establecimiento. Recibirá una respuesta en cuanto sea procesada.",

    "booking_details.cancellation.free_until":
      "Cancelación gratuita hasta el {date}.",
    "booking_details.cancellation.conditional":
      "Cancelación con condiciones (retención del {percent}%).",
    "booking_details.cancellation.default_note":
      "Las solicitudes son procesadas por el establecimiento según su disponibilidad y su política.",

    // UI (Menú / Restaurante / Perfil / Soporte / etc.)
    "common.error": "Error",
    "common.limited_offer": "Oferta limitada",
    "common.per_person": "por persona",
    "common.instead_of": "en vez de",

    "not_found.title": "Página no encontrada",
    "not_found.body": "Lo sentimos, esta página no existe (o ya no existe).",
    "not_found.back_home": "Volver al inicio",
    "not_found.view_results": "Ver los resultados",

    "hotel.booking.title_fallback": "Reserva de hotel",
    "hotel.booking.step.details": "Detalles",
    "hotel.booking.step.conditions": "Condiciones",
    "hotel.booking.step.info": "Info",
    "hotel.booking.step.confirmation": "Confirmación",
    "hotel.booking.payment_footer": "Pago seguro • Gestionado por Sortir Au Maroc",

    "menu.search.placeholder": "Buscar en el menú…",
    "menu.search.results_label": "Resultados",
    "menu.search.no_results": "Ningún resultado para su búsqueda.",
    "menu.sort.label": "Ordenar",
    "menu.sort.all": "Todos",
    "menu.sort.popular": "Populares",
    "menu.sort.best_sellers": "Más vendidos",
    "menu.group.packs": "Packs",
    "menu.packs.subtitle": "Ofertas y packs",
    "menu.items.count": "{count} platos",

    "menu.badge.new": "Nuevo",
    "menu.badge.specialty": "Especialidad",
    "menu.badge.best_seller": "Best-seller",
    "menu.badge.healthy": "Healthy",
    "menu.badge.vegetarian": "Vegetariano",
    "menu.badge.fast": "Rápido",

    "pack.book_cta": "Reservar este pack",
    "pack.urgency.today_only": "Solo hoy",
    "pack.urgency.limited_recommended": "Plazas limitadas",
    "pack.urgency.high_demand": "Muy solicitado",
    "pack.urgency.exclusive": "Oferta exclusiva",

    "restaurant.quick_booking.title": "Reserva rápida",
    "restaurant.quick_booking.subtitle":
      "Elija una fecha, una hora y el número de personas.",
    "restaurant.quick_booking.duration": "1 min",
    "restaurant.quick_booking.closed_warning": "Franja horaria no disponible",
    "restaurant.quick_booking.advice":
      "Podrá finalizar la reserva en el siguiente paso.",
    "restaurant.quick_booking.cta.choose_slot": "Elegir esta franja horaria",
    "restaurant.quick_booking.cta.book_slot": "Reservar esta franja horaria",

    "weekday.monday": "Lunes",
    "weekday.tuesday": "Martes",
    "weekday.wednesday": "Miércoles",
    "weekday.thursday": "Jueves",
    "weekday.friday": "Viernes",
    "weekday.saturday": "Sábado",
    "weekday.sunday": "Domingo",

    "restaurant.hours.title": "Horarios",
    "restaurant.hours.table.day": "Día",
    "restaurant.hours.service.lunch": "Almuerzo",
    "restaurant.hours.service.dinner": "Cena",
    "restaurant.hours.status.open": "Abierto",
    "restaurant.hours.status.soon": "Pronto",
    "restaurant.hours.status.closed": "Cerrado",
    "restaurant.hours.today_label": "Hoy: {day}",
    "restaurant.hours.week_toggle": "Ver los horarios de la semana",
    "restaurant.hours.closed": "Cerrado",
    "restaurant.hours.closed_today": "Cerrado hoy",
    "restaurant.hours.next_slot.label": "Próxima franja: {day} {from}–{to}",
    "restaurant.hours.next_slot.unavailable": "Ninguna franja próxima",

    "restaurant.hours.compatibility.ok": "Franja disponible",
    "restaurant.hours.compatibility.not_ok": "Franja no disponible",
    "restaurant.hours.compatibility.closed_day": "Cerrado ese día.",
    "restaurant.hours.compatibility.opens_at": "Abre a las {time}.",
    "restaurant.hours.compatibility.opens_tomorrow_at":
      "Abre mañana a las {time}.",
    "restaurant.hours.compatibility.not_compatible": "Horario no compatible.",

    "profile.user.fallback_name": "Mi cuenta",

    "profile.gate.title": "Inicie sesión para acceder a su perfil",
    "profile.gate.subtitle":
      "Encuentre sus reservas, favoritos y preferencias.",
    "profile.gate.cta.explore": "Explorar",
    "profile.gate.card.bookings.title": "Reservas",
    "profile.gate.card.bookings.subtitle":
      "Consulte sus reservas en curso y pasadas.",
    "profile.gate.card.favorites.title": "Favoritos",
    "profile.gate.card.favorites.subtitle":
      "Encuentre sus establecimientos guardados.",
    "profile.gate.card.preferences.title": "Preferencias",
    "profile.gate.card.preferences.subtitle": "Personalice su experiencia.",

    "profile.contact.placeholder": "Email o teléfono",

    "profile.stats.bookings": "Reservas",
    "profile.stats.favorites": "Favoritos",
    "profile.stats.preferences": "Preferencias",
    "profile.stats.preferences.short": "{enabled}/{total} activadas",
    "profile.stats.preferences.long":
      "{enabled} de {total} preferencias activadas",
    "profile.stats.preferences.examples":
      "Ej: rooftop, brunch, hammam, actividades en familia…",

    "profile.tabs.info": "Info",
    "profile.tabs.bookings": "Reservas",
    "profile.tabs.waitlist": "Lista de espera",
    "profile.tabs.billing": "Facturación",
    "profile.tabs.packs": "Packs",
    "profile.tabs.favorites": "Favoritos",
    "profile.tabs.preferences": "Preferencias",
    "profile.tabs.privacy_account": "Privacidad y cuenta",

    "profile.privacy.title": "Privacidad y cuenta",
    "profile.privacy.subtitle":
      "Gestione su cuenta, sus datos y sus solicitudes (desactivación, eliminación, exportación).",

    "profile.privacy.export.title": "Descargar mis datos",
    "profile.privacy.export.description":
      "Reciba un enlace seguro por email (JSON o CSV).",
    "profile.privacy.export.button": "Solicitar la exportación",
    "profile.privacy.export.button.loading": "Solicitando…",
    "profile.privacy.export.toast.title": "Solicitud enviada",
    "profile.privacy.export.toast.description":
      "Si hay un email asociado a su cuenta, recibirá un enlace de descarga.",

    // Gestión de contraseña
    "profile.password.title": "Contraseña",
    "profile.password.description": "Gestione la seguridad de su cuenta.",
    "profile.password.reset.title": "Regenerar mi contraseña",
    "profile.password.reset.description": "Se le enviará un enlace de restablecimiento por email.",
    "profile.password.reset.button": "Enviar por email",
    "profile.password.reset.button.loading": "Enviando…",
    "profile.password.reset.toast.title": "Email enviado",
    "profile.password.reset.toast.description": "Revise su bandeja de entrada para el enlace de restablecimiento.",
    "profile.password.reset.error.phone_only.title": "Restablecimiento no disponible",
    "profile.password.reset.error.phone_only.description": "Se registró con su teléfono. Por favor, utilice la opción \"Cambiar mi contraseña\" en su lugar.",
    "profile.password.change.title": "Cambiar mi contraseña",
    "profile.password.change.description": "Modifique su contraseña actual.",
    "profile.password.change.button": "Modificar",
    "profile.password.change.button.loading": "Modificando…",
    "profile.password.change.button.confirm": "Confirmar",
    "profile.password.change.dialog.title": "Cambiar la contraseña",
    "profile.password.change.dialog.description": "Ingrese su contraseña actual y luego elija una nueva contraseña.",
    "profile.password.change.current": "Contraseña actual",
    "profile.password.change.new": "Nueva contraseña",
    "profile.password.change.confirm": "Confirmar la nueva contraseña",
    "profile.password.change.hint": "Mínimo 8 caracteres",
    "profile.password.change.toast.title": "Contraseña modificada",
    "profile.password.change.toast.description": "Su contraseña ha sido actualizada con éxito.",
    "profile.password.change.error.too_short": "La contraseña debe contener al menos 8 caracteres.",
    "profile.password.change.error.mismatch": "Las contraseñas no coinciden.",
    "profile.password.change.error.invalid_current": "La contraseña actual es incorrecta.",

    "profile.privacy.deactivate.title": "Desactivar temporalmente mi cuenta",
    "profile.privacy.deactivate.description":
      "Su cuenta será puesta en pausa. Podrá reactivarla volviendo a iniciar sesión.",
    "profile.privacy.deactivate.button": "Desactivar",
    "profile.privacy.deactivate.button.loading": "Desactivando…",
    "profile.privacy.deactivate.button.confirm": "Confirmar la desactivación",
    "profile.privacy.deactivate.dialog.title": "Desactivar mi cuenta",
    "profile.privacy.deactivate.dialog.description":
      "Elija un motivo (opcional) y confirme. Se cerrará su sesión.",
    "profile.privacy.deactivate.toast.title": "Cuenta desactivada",
    "profile.privacy.deactivate.toast.description":
      "Su cuenta está en pausa. Podrá reactivarla volviendo a iniciar sesión.",

    "profile.privacy.delete.title": "Eliminar definitivamente mi cuenta",
    "profile.privacy.delete.description":
      "Eliminación irreversible. Cierta información puede conservarse si la ley lo exige.",
    "profile.privacy.delete.button": "Eliminar",
    "profile.privacy.delete.button.loading": "Eliminando…",
    "profile.privacy.delete.button.confirm": "Confirmar la eliminación",
    "profile.privacy.delete.dialog.title": "Eliminar mi cuenta",
    "profile.privacy.delete.dialog.description":
      "Elija un motivo y luego confirme. Esta acción es irreversible.",
    "profile.privacy.delete.step2.warning":
      "Último paso: esta acción es irreversible. Una vez eliminada, su cuenta no podrá ser recuperada.",
    "profile.privacy.delete.step2.confirm_label":
      'Escriba "{word}" para confirmar',
    "profile.privacy.delete.confirm_word": "ELIMINAR",
    "profile.privacy.delete.toast.title": "Cuenta eliminada",
    "profile.privacy.delete.toast.description":
      "Su cuenta ha sido eliminada. Gracias por haber utilizado Sortir Au Maroc.",

    "profile.privacy.reason.label": "Motivo (opcional)",
    "profile.privacy.reason.details.label": "Detalles (opcional)",
    "profile.privacy.reason.details.placeholder":
      "Cuéntenos brevemente…",

    "profile.privacy.reason.pause": "Hago una pausa temporal",
    "profile.privacy.reason.not_using": "No uso Sortir Au Maroc lo suficiente",
    "profile.privacy.reason.too_many_notifications": "Demasiadas notificaciones",
    "profile.privacy.reason.technical_issue": "Problema técnico",
    "profile.privacy.reason.privacy_concerns":
      "Preocupaciones relacionadas con la privacidad",
    "profile.privacy.reason.not_found":
      "No encontré lo que buscaba",
    "profile.privacy.reason.other": "Otro",

    "profile.privacy.deactivate.message.pause":
      "Gracias. Ponemos su cuenta en pausa. Podrá reactivarla cuando lo desee.",
    "profile.privacy.deactivate.message.not_using":
      "Gracias por su comentario. Su cuenta será puesta en pausa.",
    "profile.privacy.deactivate.message.too_many_notifications":
      "Entendido. Su cuenta será puesta en pausa y no recibirá más notificaciones.",
    "profile.privacy.deactivate.message.technical_issue":
      "Gracias. Si lo desea, contáctenos: haremos lo posible por resolver el problema.",
    "profile.privacy.deactivate.message.privacy_concerns":
      "Gracias. Nos tomamos la privacidad en serio y estamos disponibles si tiene preguntas.",
    "profile.privacy.deactivate.message.not_found":
      "Gracias. Esperamos verle pronto de nuevo en Sortir Au Maroc.",
    "profile.privacy.deactivate.message.other":
      "Gracias. Su cuenta será puesta en pausa.",

    "profile.privacy.delete.reason.not_using_anymore":
      "Ya no uso Sortir Au Maroc",
    "profile.privacy.delete.reason.found_alternative":
      "Encontré una alternativa",
    "profile.privacy.delete.reason.unsatisfied_experience":
      "Experiencia insatisfactoria",
    "profile.privacy.delete.reason.too_buggy": "Demasiados errores",
    "profile.privacy.delete.reason.payment_issue": "Problema con los pagos",
    "profile.privacy.delete.reason.data_privacy":
      "Preocupaciones sobre datos personales",
    "profile.privacy.delete.reason.not_covered":
      "Ya no estoy en una zona cubierta",

    "profile.privacy.delete.message.not_using_anymore":
      "Gracias por su comentario. Procesaremos su solicitud de eliminación.",
    "profile.privacy.delete.message.found_alternative":
      "Gracias por su comentario. Procesaremos su solicitud de eliminación.",
    "profile.privacy.delete.message.unsatisfied_experience":
      "Gracias. Lamentamos que la experiencia no haya estado a la altura.",
    "profile.privacy.delete.message.too_buggy":
      "Gracias. Lamentamos los problemas encontrados.",
    "profile.privacy.delete.message.payment_issue":
      "Gracias. Si lo desea, contáctenos para aclarar la situación antes de la eliminación.",
    "profile.privacy.delete.message.data_privacy":
      "Gracias. Procesaremos su solicitud conforme a nuestra política de privacidad.",
    "profile.privacy.delete.message.not_covered":
      "Gracias. Esperamos volver pronto a su zona.",
    "profile.privacy.delete.message.other":
      "Gracias. Procesaremos su solicitud de eliminación.",

    "profile.privacy.footer_hint":
      "¿Necesita ayuda? Puede contactar al soporte desde la página de Ayuda.",

    "profile.waitlist.title": "Lista de espera",
    "profile.waitlist.subtitle":
      "Siga su posición y responda a las ofertas cuando se libere un lugar.",
    "profile.waitlist.empty.title": "Ninguna lista de espera",
    "profile.waitlist.empty.subtitle":
      "Cuando una franja horaria está completa, puede unirse a la lista de espera desde la página de reserva.",
    "profile.waitlist.empty.hint":
      "Consejo: si tiene una reserva marcada como «Lista de espera», aparece en la pestaña Reservas.",
    "profile.waitlist.section.active": "Solicitudes activas",
    "profile.waitlist.section.expired": "Historial",
    "profile.waitlist.section.active_empty": "Ninguna solicitud activa.",
    "profile.waitlist.section.expired_empty": "Ningún historial.",
    "profile.waitlist.status.offer": "Oferta",
    "profile.waitlist.status.waiting": "En espera",
    "profile.waitlist.status.accepted": "Aceptada",
    "profile.waitlist.status.expired": "Finalizada",
    "profile.waitlist.status.unknown": "Estado",
    "profile.waitlist.field.date": "Fecha",
    "profile.waitlist.field.time": "Hora",
    "profile.waitlist.field.people": "Personas",
    "profile.waitlist.offer.expires_at": "Expira a las {time}",
    "profile.waitlist.position": "Posición: #{position}",
    "profile.waitlist.cancel": "Cancelar",
    "profile.waitlist.view_reservation": "Ver",
    "profile.waitlist.establishment_fallback": "Establecimiento",

    "profile.info.title": "Mi información",
    "profile.info.subtitle":
      "Actualice su información para facilitar sus reservas.",
    "profile.info.first_name.label": "Nombre",
    "profile.info.first_name.placeholder": "Ej: Amina",
    "profile.info.last_name.label": "Apellido",
    "profile.info.last_name.placeholder": "Ej: Benali",
    "profile.info.phone.label": "Teléfono",
    "profile.info.phone.placeholder": "Ej: +212 6 12 34 56 78",
    "profile.info.phone.help": "Se usa para contactarle si es necesario.",
    "profile.info.csp.label": "Situación profesional",
    "profile.info.csp.placeholder": "Seleccionar…",
    "profile.info.csp.help": "Opcional.",
    "profile.info.dob.label": "Fecha de nacimiento",
    "profile.info.dob.placeholder": "dd/mm/aaaa",
    "profile.info.dob.help": "Opcional.",
    "profile.info.city.label": "Ciudad",
    "profile.info.city.placeholder": "Ej: Casablanca",
    "profile.info.save": "Guardar",
    "profile.info.saved": "Guardado",
    "profile.info.last_updated": "Última actualización: {value}",
    "profile.info.edit": "Editar",
    "profile.info.phone.verified": "Verificado",
    "profile.info.phone.verified_help": "Este número ha sido verificado y ya no puede ser modificado.",
    "profile.info.phone.verify": "Verificar",
    "profile.info.phone.verify_description": "Envíe un código SMS para verificar su número.",
    "profile.info.email.verified": "Verificado",
    "profile.info.email.verified_help": "Esta dirección ha sido verificada.",
    "profile.info.email.verify": "Verificar",
    "profile.info.email.verify_description": "Se enviará un código de 8 dígitos a su dirección.",
    "profile.info.email.label": "Email",
    "profile.info.login_credentials": "Credenciales de conexión",
    "profile.info.phone.login_label": "Teléfono de conexión",

    // Modal de verificación de teléfono
    "profile.phone_verification.title": "Verificar mi número",
    "profile.phone_verification.subtitle": "Se enviará un código SMS a su número para verificarlo. Una vez verificado, no podrá ser modificado.",
    "profile.phone_verification.success": "¡Número verificado!",
    "profile.phone_verification.success_description": "Su número de teléfono ha sido verificado con éxito.",
    "profile.phone_verification.not_available": "Verificación no disponible",

    // Modal de verificación de email
    "profile.email_verification.title": "Verificar mi email",
    "profile.email_verification.subtitle": "Resuelva el captcha y luego haga clic en Enviar. Se enviará un código de 8 dígitos a su dirección de email.",
    "profile.email_verification.send_code": "Enviar el código",
    "profile.email_verification.enter_code": "Ingrese el código recibido",
    "profile.email_verification.code_sent_to": "Código enviado a",
    "profile.email_verification.success": "¡Email verificado!",
    "profile.email_verification.success_description": "Su dirección de email ha sido verificada con éxito.",
    "profile.email_verification.error.invalid_email": "Dirección de email no válida.",
    "profile.email_verification.error.send_failed": "No se pudo enviar el código. Inténtelo de nuevo.",
    "profile.email_verification.error.invalid_code": "Código incorrecto. Verifique e inténtelo de nuevo.",
    "profile.email_verification.error.code_expired": "Este código ha expirado. Solicite uno nuevo.",
    "profile.email_verification.error.captcha_required": "Por favor, resuelva el captcha.",

    "profile.info.csp.group.education": "Estudios",
    "profile.info.csp.group.unemployed": "Desempleado",
    "profile.info.csp.group.employed": "Asalariado",
    "profile.info.csp.group.self_employed": "Autónomo",
    "profile.info.csp.group.public": "Sector público",
    "profile.info.csp.group.commerce": "Comercio",
    "profile.info.csp.group.manual": "Obreros y servicios",
    "profile.info.csp.group.other": "Otros",

    "profile.info.csp.student": "Estudiante",
    "profile.info.csp.intern": "Practicante",
    "profile.info.csp.unemployed": "Desempleado",
    "profile.info.csp.job_seeker": "En búsqueda de empleo",
    "profile.info.csp.retraining": "Reconversión",
    "profile.info.csp.employee": "Empleado",
    "profile.info.csp.technician": "Técnico",
    "profile.info.csp.supervisor": "Supervisor",
    "profile.info.csp.manager": "Manager",
    "profile.info.csp.executive": "Directivo",
    "profile.info.csp.freelance": "Freelance",
    "profile.info.csp.entrepreneur": "Emprendedor",
    "profile.info.csp.liberal_profession": "Profesión liberal",
    "profile.info.csp.public_servant": "Funcionario",
    "profile.info.csp.merchant": "Comerciante",
    "profile.info.csp.artisan": "Artesano",
    "profile.info.csp.worker": "Obrero",
    "profile.info.csp.service_employee": "Empleado de servicios",
    "profile.info.csp.retired": "Jubilado",
    "profile.info.csp.stay_at_home": "Ama de casa",
    "profile.info.csp.other": "Otro",

    // Página de restablecimiento de contraseña
    "reset_password.title": "Nueva contraseña",
    "reset_password.for_account": "Para la cuenta {email}",
    "reset_password.validating": "Verificando el enlace...",
    "reset_password.new_password": "Nueva contraseña",
    "reset_password.confirm_password": "Confirmar la contraseña",
    "reset_password.password_hint": "Mínimo 8 caracteres",
    "reset_password.submit": "Establecer la contraseña",
    "reset_password.submitting": "Guardando...",
    "reset_password.back_home": "Volver al inicio",
    "reset_password.error.title": "Enlace no válido",
    "reset_password.error.missing_token": "El enlace está incompleto. Por favor, utilice el enlace completo recibido por email.",
    "reset_password.error.invalid_token": "Este enlace de restablecimiento no es válido.",
    "reset_password.error.token_expired": "Este enlace ha expirado. Solicite un nuevo enlace de restablecimiento.",
    "reset_password.error.token_used": "Este enlace ya ha sido utilizado. Solicite un nuevo enlace si es necesario.",
    "reset_password.error.too_short": "La contraseña debe contener al menos 8 caracteres.",
    "reset_password.error.mismatch": "Las contraseñas no coinciden.",
    "reset_password.error.generic": "Ha ocurrido un error. Por favor, inténtelo de nuevo.",
    "reset_password.success.title": "Contraseña modificada",
    "reset_password.success.description": "Su contraseña ha sido modificada con éxito. Ahora puede iniciar sesión.",
    "reset_password.success.login": "Iniciar sesión",

    "profile.bookings.loading": "Cargando las reservas…",
    "profile.bookings.empty.title": "Ninguna reserva",
    "profile.bookings.empty.subtitle": "Sus reservas aparecerán aquí.",
    "profile.bookings.ref": "Ref.",
    "profile.bookings.view": "Ver",
    "profile.bookings.field.date": "Fecha",
    "profile.bookings.field.time": "Hora",
    "profile.bookings.field.people": "Personas",
    "profile.bookings.pre_reservation": "Pre-reserva",
    "profile.bookings.amount_paid": "Importe pagado",

    "support.tickets.title": "Tickets de soporte",
    "support.tickets.subtitle": "Cree y haga seguimiento de sus solicitudes de asistencia.",
    "support.hours": "Servicio al cliente disponible de 9h a 19h",
    "support.tickets.new": "Nuevo ticket",
    "support.tickets.my_tickets": "Mis tickets",
    "support.tickets.empty": "Ningún ticket por el momento.",
    "support.tickets.select_prompt":
      "Seleccione un ticket para ver los detalles.",

    "support.ticket.form.subject": "Asunto",
    "support.ticket.form.subject.placeholder": "Ej: Problema de reserva",
    "support.ticket.form.category": "Categoría",
    "support.ticket.form.category.placeholder": "Elegir una categoría",
    "support.ticket.form.message": "Mensaje",
    "support.ticket.form.message.placeholder": "Describa su solicitud…",
    "support.ticket.form.submit": "Enviar",

    "support.ticket.category.reservations": "Reservas",
    "support.ticket.category.cancellation": "Cancelación",
    "support.ticket.category.billing": "Pago / facturación",
    "support.ticket.category.account": "Cuenta",
    "support.ticket.category.technical": "Técnico",
    "support.ticket.category.partners": "Socios",
    "support.ticket.category.other": "Otro",

    "support.ticket.updated_at": "Actualizado: {date}",
    "support.ticket.status.open": "Abierto",
    "support.ticket.status.closed": "Cerrado",
    "support.ticket.action.close": "Cerrar",
    "support.ticket.action.reopen": "Reabrir",

    "support.ticket.reply": "Respuesta",
    "support.ticket.reply.placeholder": "Escribir un mensaje…",
    "support.ticket.reply.placeholder_closed": "Este ticket está cerrado.",
    "support.ticket.reply.send": "Enviar",
    "support.ticket.closed_note":
      "Este ticket está cerrado. Reábralo para responder.",

    "treatments.category.packs": "Packs",
    "treatments.category.buggy": "Buggy",
    "treatments.category.quad": "Quad",
    "treatments.category.motocross": "Motocross",
    "treatments.category.kids": "Niños",
    "treatments.category.rides": "Paseos",
    "treatments.category.options": "Opciones",
    "treatments.category.hammam": "Hammam",
    "treatments.category.massage": "Masaje",
    "treatments.category.cils": "Pestañas y cejas",
    "treatments.category.onglerie": "Manicura",
    "treatments.category.coiffure": "Peluquería",
    "treatments.category.other": "Otros",

    "treatments.empty.title": "Ningún servicio",
    "treatments.empty.subtitle": "Los servicios estarán disponibles próximamente.",
    "treatments.category_empty.title": "Ningún servicio",
    "treatments.category_empty.subtitle":
      "Ningún servicio en esta categoría por el momento.",

    "establishment.tabs.aria_label": "Navegación de la ficha",
    "establishment.tabs.menu": "Menú",
    "establishment.tabs.reviews": "Reseñas",
    "establishment.tabs.info": "Info",
    "establishment.tabs.hours": "Horarios",
    "establishment.tabs.map": "Mapa",
    "establishment.tabs.rooms": "Habitaciones",
    "establishment.tabs.services": "Servicios",
    "establishment.tabs.pricing": "Servicios y tarifas",

    // Configuración de reservas Pro
    "pro.booking_settings.title": "Cancelaciones y modificaciones",
    "pro.booking_settings.subtitle":
      "Configure sus políticas de cancelación y modificación (texto mostrado del lado del USUARIO).",
    "pro.booking_settings.reload": "Recargar",
    "pro.booking_settings.save": "Guardar",
    "pro.booking_settings.load_failed":
      "No se pudo cargar la política (inténtelo de nuevo).",

    "pro.booking_settings.pedagogy.title": "Protección de franjas horarias",
    "pro.booking_settings.pedagogy.body":
      "Sortir Au Maroc puede solicitar un anticipo en ciertas reservas para reducir los no-shows y asegurar sus franjas horarias. Esta medida es automática y busca proteger la experiencia de todos.",
    "pro.booking_settings.pedagogy.note":
      "Consejo: explique al cliente que el depósito sirve para confirmar y proteger la franja horaria.",

    "pro.booking_settings.section.cancel.title": "A — Política de cancelación",
    "pro.booking_settings.section.cancel.description":
      "Plazos, penalizaciones y texto mostrado del lado del USUARIO.",
    "pro.booking_settings.cancel.enable.title":
      "Activar una política de cancelación personalizada",
    "pro.booking_settings.cancel.enable.hint":
      "Si está desactivado, se aplica la política por defecto de Sortir Au Maroc.",
    "pro.booking_settings.cancel.free_hours.label":
      "Plazo de cancelación gratuita (horas antes)",
    "pro.booking_settings.cancel.penalty_percent.label":
      "Penalización después del límite (%)",
    "pro.booking_settings.cancel.penalty_percent.example":
      "Ej: desde el límite hasta la hora de la reserva: {percent}% de retención.",
    "pro.booking_settings.cancel.no_show_penalty.label": "Penalización por no-show (%)",
    "pro.booking_settings.cancel.no_show_always_100.title":
      "Siempre 100% para los no-show garantizados",
    "pro.booking_settings.cancel.no_show_always_100.hint":
      "Opcional, recomendado si hay prepago.",
    "pro.booking_settings.cancel.custom_text.title":
      "Texto personalizado mostrado al cliente",
    "pro.booking_settings.cancel.custom_text.placeholder.fr":
      "Texto FR mostrado al cliente (página de reserva + emails)",
    "pro.booking_settings.cancel.custom_text.placeholder.en":
      "Client-facing text (EN)",

    "pro.booking_settings.section.modif.title": "B — Política de modificación",
    "pro.booking_settings.section.modif.description":
      "Autorización, plazo y texto mostrado al cliente.",
    "pro.booking_settings.modif.enable.title":
      "Autorizar las solicitudes de modificación",
    "pro.booking_settings.modif.enable.hint":
      "Si está desactivado, el botón de USUARIO estará oculto.",
    "pro.booking_settings.modif.deadline_hours.label":
      "Último plazo (horas antes de la reserva)",
    "pro.booking_settings.modif.require_guarantee.label":
      "Imponer la garantía si el puntaje < … (opcional)",
    "pro.booking_settings.modif.require_guarantee.placeholder": "Ej: 65",
    "pro.booking_settings.modif.require_guarantee.hint":
      "Deje vacío para no aplicar esta regla.",
    "pro.booking_settings.modif.custom_text.title":
      "Texto informativo mostrado al cliente",
    "pro.booking_settings.modif.custom_text.placeholder.fr":
      "Texto FR mostrado al cliente en el diálogo de modificación",
    "pro.booking_settings.modif.custom_text.placeholder.en":
      "Client-facing text (EN)",

    // Contenido admin
    "admin.content.title": "Contenido",
    "admin.content.description":
      "Gestione las páginas editoriales y la FAQ (FR/EN) sin tocar el código.",
    "admin.content.editor_language": "Idioma de edición",
    "admin.content.tab.pages": "Páginas",
    "admin.content.tab.faq": "FAQ",

    "admin.content.action.new_page": "Nueva página",
    "admin.content.action.new_faq": "Nueva FAQ",
    "admin.content.action.preview": "Previsualizar",
    "admin.content.action.back_to_edit": "Volver",
    "admin.content.action.save": "Guardar",

    "admin.content.warning": "Alerta",
    "admin.content.translation_missing": "Traducción faltante",
    "admin.content.translation_missing_hint":
      "Complete la versión FR/EN antes de publicar para una experiencia coherente.",

    "admin.content.status.draft": "Borrador",
    "admin.content.status.published": "Publicado",

    "admin.content.pages.search": "Buscar (slug, título)…",
    "admin.content.pages.column.slug": "Slug",
    "admin.content.pages.column.title": "Título",
    "admin.content.pages.column.status": "Estado",
    "admin.content.pages.column.updated": "Actualiz.",

    "admin.content.faq.search": "Buscar (pregunta, etiquetas)…",
    "admin.content.faq.column.category": "Categoría",
    "admin.content.faq.column.order": "Orden",
    "admin.content.faq.column.question": "Pregunta",
    "admin.content.faq.column.status": "Estado",
    "admin.content.faq.column.updated": "Actualiz.",

    "admin.content.dialog.page": "Página",
    "admin.content.dialog.faq": "FAQ",

    "admin.content.field.slug": "Slug",
    "admin.content.field.slug_placeholder": "ej: cgu, privacy, about",
    "admin.content.field.status": "Estado",
    "admin.content.field.title": "Título",
    "admin.content.field.title_placeholder_fr": "Título (FR)",
    "admin.content.field.title_placeholder_en": "Title (EN)",
    "admin.content.field.meta_title": "Meta title",
    "admin.content.field.meta_title_placeholder": "Título SEO",
    "admin.content.field.meta_description": "Meta description",
    "admin.content.field.meta_description_placeholder":
      "Descripción SEO (aprox. 160 caracteres)",
    "admin.content.field.content": "Contenido",
    "admin.content.field.content_placeholder": "Escriba aquí…",

    "admin.content.language.fr": "Français",
    "admin.content.language.en": "English",

    "admin.content.preview.seo": "SEO (vista previa)",
    "admin.content.preview.public": "Vista pública",

    "admin.content.history.title": "Historial",
    "admin.content.history.empty": "Ninguna modificación registrada.",
    "admin.content.history.created": "Creación",
    "admin.content.history.updated": "Modificación",

    "admin.content.error.slug_required": "El slug es obligatorio.",
    "admin.content.error.title_required":
      "Por favor, ingrese al menos un título (FR o EN).",
    "admin.content.error.question_required":
      "Por favor, ingrese al menos una pregunta (FR o EN).",

    "admin.content.faq.field.category": "Categoría",
    "admin.content.faq.field.order": "Orden de visualización",
    "admin.content.faq.field.tags": "Etiquetas",
    "admin.content.faq.field.tags_placeholder": "cancelación, pago, no-show",
    "admin.content.faq.field.question": "Pregunta",
    "admin.content.faq.field.question_placeholder_fr": "Pregunta (FR)",
    "admin.content.faq.field.question_placeholder_en": "Question (EN)",
    "admin.content.faq.field.answer": "Respuesta",
    "admin.content.faq.field.answer_placeholder": "Su respuesta…",

    "admin.content.faq.category.reservations": "Reservas",
    "admin.content.faq.category.paiements": "Pagos",
    "admin.content.faq.category.annulations": "Cancelaciones",
    "admin.content.faq.category.comptes_utilisateurs": "Cuentas de usuario",
    "admin.content.faq.category.comptes_pro": "Cuentas Pro",
    "admin.content.faq.category.packs_offres": "Packs y ofertas",
    "admin.content.faq.category.support_general": "Soporte general",

    // Editor de texto enriquecido admin
    "admin.richtext.h2": "H2",
    "admin.richtext.h3": "H3",
    "admin.richtext.p": "Párr.",
    "admin.richtext.bold": "Negrita",
    "admin.richtext.italic": "Cursiva",
    "admin.richtext.underline": "Subrayado",
    "admin.richtext.ul": "Lista",
    "admin.richtext.ol": "Núm.",
    "admin.richtext.link": "Enlace",
    "admin.richtext.link.dialog_title": "Añadir un enlace",
    "admin.richtext.link.hint":
      "Seleccione primero el texto, luego pegue la URL (ej: https://…, /faq, mailto:…).",
    "admin.richtext.link.placeholder": "https://example.com",
    "admin.richtext.link.insert": "Insertar",
    "admin.richtext.ai": "IA",

    // Reportar establecimiento
    "report.title": "Reportar este establecimiento",
    "report.description": "¿Desea reportar un problema con {name}?",
    "report.reason_label": "Motivo del reporte",
    "report.reason_placeholder": "Seleccione un motivo",
    "report.reason.closed_permanently": "Establecimiento cerrado definitivamente",
    "report.reason.incorrect_info": "Información incorrecta",
    "report.reason.fraudulent": "Establecimiento fraudulento",
    "report.reason.inappropriate_content": "Contenido inapropiado",
    "report.reason.safety_concern": "Problema de seguridad",
    "report.reason.other": "Otro",
    "report.details_label": "Detalles adicionales (opcional)",
    "report.details_placeholder": "Describa el problema encontrado...",
    "report.submit": "Enviar el reporte",
    "report.submitting": "Enviando...",
    "report.error.select_reason": "Por favor, seleccione un motivo",
    "report.error.login_required": "Debe haber iniciado sesión para reportar",
    "report.error.generic": "Error al enviar el reporte",
    "report.success.title": "Reporte enviado",
    "report.success.description": "Gracias por su reporte. Nuestro equipo lo examinará.",
    "report.button": "Reportar",
    "report.button_tooltip": "Reportar este establecimiento",

    // Configuración admin
    "admin.settings.title": "⚙️ Parámetros Superadmin",
    "admin.settings.description":
      "Centro de configuración global — replicado en la base Supabase",
    "admin.settings.logs": "Registros",
    "admin.settings.loading.title": "Cargando",
    "admin.settings.loading.body": "Sincronización en curso…",
    "admin.settings.sync_report.message":
      "Parámetros sincronizados con Supabase.\nNuevas reglas activas: {created} — Reglas modificadas: {modified} — Nada que hacer: {noop}.",
    "admin.settings.permissions.title": "Permisos",
    "admin.settings.permissions.body":
      "Esta página está reservada al superadmin. En caso de acceso no autorizado, el usuario es redirigido al panel de control.",
};

export default es as Record<string, string>;

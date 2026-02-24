import type { TranslationKey } from "../translation-keys";

const ar: Partial<Record<TranslationKey, string>> = {
  "common.close": "إغلاق",
  "common.cancel": "إلغاء",
  "common.confirm": "تأكيد",
  "common.continue": "متابعة",
  "common.back": "رجوع",
  "common.prev": "السابق",
  "common.next": "التالي",
  "common.pdf": "PDF",
  "common.error.load_failed": "خطأ في التحميل",
  "currency.mad.short": "Dhs",
  "common.loading": "جارٍ التحميل…",
  "common.refresh": "تحديث",
  "common.impossible": "غير ممكن",
  "common.error.generic": "خطأ",
  "common.error.unexpected": "خطأ غير متوقع",
  "common.clear": "مسح",
  "common.edit": "تعديل",
  "common.reset": "إعادة تعيين",
  "common.help": "مساعدة",
  "navigation.resume.title": "استئناف التصفح",
  "navigation.resume.description": "كنتم قد بدأتم بحثاً. هل تودون استئنافه؟",
  "navigation.resume.continue": "استئناف",
  "navigation.resume.new_search": "بحث جديد",
  "navigation.resume.search": "بحثكم",
  "navigation.resume.establishment_page": "صفحة المؤسسة",
  "navigation.resume.just_now": "الآن",
  "navigation.resume.minutes_ago": "منذ {n} دقيقة",
  "navigation.resume.hours_ago": "منذ {n} ساعة",
  "content.toc": "الفهرس",
  "content.related_links": "روابط مفيدة",
  "blog.index.title": "المدونة",
  "blog.index.subtitle": "أخبار وأدلة ونصائح لخروجاتكم في المغرب.",
  "blog.index.error": "تعذّر تحميل المقالات.",
  "blog.index.empty.title": "لا توجد مقالات حالياً",
  "blog.index.empty.subtitle": "انشروا مقالاً من لوحة الإدارة ليظهر هنا.",
  "blog.index.back_home": "العودة إلى الصفحة الرئيسية",
  "common.coming_soon": "قريباً",
  "common.change": "تغيير",
  "common.user": "مستخدم",
  "common.today": "اليوم",
  "common.tomorrow": "غداً",
  "common.at": "على الساعة",
  "common.time_placeholder": "سس:دد",
  "common.person.one": "شخص",
  "common.person.other": "أشخاص",
  "timepicker.title": "اختيار الساعة",
  "persons.title": "الأشخاص",
  "persons.button.confirm": "تأكيد",
  "persons.action.add": "إضافة {label}",
  "persons.action.remove": "إزالة {label}",
  "persons.age_group.age0_2": "0–2 سنة",
  "persons.age_group.age3_6": "3–6 سنوات",
  "persons.age_group.age6_12": "6–12 سنة",
  "persons.age_group.age12_17": "12–17 سنة",
  "persons.age_group.age18_plus": "+18 سنة",
  "language.french": "Français",
  "language.english": "English",
  "language.switcher.label": "اللغة",
  "language.suggestion.title": "Sortir Au Maroc متوفر بالفرنسية / الإنجليزية.",
  "language.suggestion.subtitle": "اختاروا لغتكم. يمكنكم تغييرها في أي وقت.",
  "header.add_establishment.full": "إضافة مؤسستي",
  "header.add_establishment.short": "إضافة",
  "header.profile.menu": "قائمة الملف الشخصي",
  "header.profile.photo_alt": "صورة الملف الشخصي",
  "header.profile.my_account": "معرّفي",
  "header.profile.my_profile": "ملفي الشخصي",
  "profile.bookings.waitlist_offer": "عرض متاح",
  "header.profile.logout": "تسجيل الخروج",
  "header.login": "تسجيل الدخول",
  "header.brand": "Sortir Au Maroc",
  "header.pro_space": "الفضاء الاحترافي",
  "header.logo_alt": "Sortir Au Maroc",
  "header.pro_conflict.title": "يجب تسجيل الخروج من الفضاء الاحترافي",
  "header.pro_conflict.description": "أنتم متصلون بالفضاء الاحترافي. لتسجيل الدخول كمستخدم، يُرجى تسجيل الخروج أولاً من الفضاء الاحترافي.",
  "header.pro_conflict.go_to_pro": "الذهاب إلى فضائي الاحترافي",
  "header.pro_conflict.logout_pro": "تسجيل الخروج من الفضاء الاحترافي",
  "auth.title.login": "تسجيل الدخول إلى Sortir Au Maroc",
  "auth.title.forgot": "نسيتم كلمة المرور؟",
  "auth.title.signup": "إنشاء حساب مجاني",
  "auth.subtitle.login": "ادخلوا إلى حجوزاتكم ومفضلاتكم وعروضكم الحصرية",
  "auth.subtitle.forgot": "أدخلوا بريدكم الإلكتروني أو رقم هاتفكم لتلقي رابط إعادة التعيين.",
  "auth.subtitle.signup": "أنشئوا حسابكم للوصول إلى حجوزاتكم ومفضلاتكم وعروضكم الحصرية.",
  "auth.field.email_or_phone.label": "البريد الإلكتروني أو الهاتف",
  "auth.field.email_or_phone.placeholder": "email@example.com أو +212 6XX XXX XXX",
  "auth.field.password.label": "كلمة المرور",
  "auth.link.forgot_password": "نسيتم كلمة المرور؟",
  "auth.link.create_account": "إنشاء حساب",
  "auth.link.login": "تسجيل الدخول",
  "auth.password.show": "إظهار كلمة المرور",
  "auth.password.hide": "إخفاء كلمة المرور",
  "auth.button.login": "تسجيل الدخول",
  "auth.button.login_busy": "جارٍ الاتصال…",
  "auth.button.demo_login": "دخول تجريبي",
  "auth.or_continue_with": "أو المتابعة عبر",
  "auth.button.continue_with_google": "المتابعة عبر Google",
  "auth.button.continue_with_apple": "المتابعة عبر Apple",
  "auth.button.continue_with_facebook": "المتابعة عبر Facebook",
  "auth.button.send_reset": "إرسال الرابط",
  "auth.button.send_reset_busy": "جارٍ الإرسال…",
  "auth.button.signup": "إنشاء حسابي",
  "auth.button.signup_busy": "جارٍ الإنشاء…",
  "auth.note.no_account": "ليس لديكم حساب؟",
  "auth.note.have_account": "لديكم حساب بالفعل؟",
  "auth.error.demo_login_failed": "تعذّر الاتصال بالحساب التجريبي. أعيدوا المحاولة.",
  "auth.error.phone_login_unavailable": "تسجيل الدخول عبر الهاتف غير متاح حالياً. استخدموا البريد الإلكتروني.",
  "auth.error.invalid_credentials": "بيانات الدخول غير صحيحة أو الحساب غير موجود.",
  "auth.error.reset_by_phone_unavailable": "إعادة التعيين عبر الهاتف غير متاحة. استخدموا بريدكم الإلكتروني.",
  "auth.error.reset_send_failed": "تعذّر إرسال رابط إعادة التعيين. أعيدوا المحاولة.",
  "auth.error.signup_requires_email": "التسجيل يتطلب حالياً بريداً إلكترونياً.",
  "auth.error.signup_failed": "تعذّر إنشاء الحساب. تحققوا من البريد الإلكتروني وأعيدوا المحاولة.",
  "auth.error.too_many_attempts": "محاولات كثيرة جداً. انتظروا بضع ثوانٍ ثم أعيدوا المحاولة.",
  "auth.error.signup_spam_detected": "تم حظر التسجيل (كشف مضاد للرسائل غير المرغوبة).",
  "auth.error.social_unconfigured": "تسجيل الدخول عبر {provider} غير مُهيّأ حالياً.",
  "auth.error.social_login_failed": "تعذّر تسجيل الدخول عبر هذه الشبكة الاجتماعية. أعيدوا المحاولة.",
  "auth.notice.reset_link_sent": "تم إرسال رابط إعادة التعيين. تحققوا من بريدكم الإلكتروني.",
  "auth.notice.account_created": "تم إنشاء الحساب. تحققوا من بريدكم الإلكتروني للتأكيد ثم أعيدوا تسجيل الدخول.",
  "auth.phone.title": "تسجيل الدخول عبر الهاتف",
  "auth.phone.subtitle": "أدخلوا رقم هاتفكم لتلقي رمز التحقق عبر SMS.",
  "auth.phone.label": "رقم الهاتف",
  "auth.phone.hint": "ستتلقون رسالة SMS تتضمن رمزاً من 6 أرقام.",
  "auth.phone.send_code": "إرسال الرمز",
  "auth.phone.verify_title": "التحقق",
  "auth.phone.code_sent_to": "تم إرسال الرمز إلى",
  "auth.phone.resend_code": "إعادة إرسال الرمز",
  "auth.phone.resend_in": "إعادة الإرسال خلال",
  "auth.phone.success_title": "تم تسجيل الدخول بنجاح",
  "auth.phone.success_message": "أنتم متصلون الآن!",
  "auth.phone.redirecting": "جارٍ إعادة التوجيه...",
  "auth.phone.use_email_instead": "استخدام البريد الإلكتروني بدلاً من ذلك",
  "auth.phone.use_phone_instead": "تسجيل الدخول عبر الهاتف",
  "auth.phone.error.invalid_number": "رقم هاتف غير صالح.",
  "auth.phone.error.send_failed": "تعذّر إرسال الرمز. أعيدوا المحاولة.",
  "auth.phone.error.too_many_requests": "محاولات كثيرة جداً. أعيدوا المحاولة بعد بضع دقائق.",
  "auth.phone.error.invalid_code": "رمز غير صحيح. تحققوا وأعيدوا المحاولة.",
  "auth.phone.error.code_expired": "انتهت صلاحية الرمز. اطلبوا رمزاً جديداً.",
  "auth.phone.error.verify_failed": "فشل التحقق. أعيدوا المحاولة.",
  "auth.phone.error.not_configured": "المصادقة عبر الهاتف غير متاحة حالياً.",
  "footer.brand": "Sortir Au Maroc",
  "footer.section.partners": "شركاء",
  "footer.section.professionals": "محترفون",
  "footer.section.help": "مساعدة",
  "footer.section.legal": "قانوني",
  "footer.section.download_app": "تحميل التطبيق",
  "footer.link.discover": "اكتشفوا",
  "footer.link.about": "من نحن",
  "footer.link.contact": "اتصلوا بنا",
  "footer.link.blog": "المدونة",
  "footer.link.videos": "فيديوهات",
  "footer.link.careers": "وظائف",
  "footer.link.become_sponsor": "كونوا راعياً",
  "footer.link.for_providers": "لمقدمي الخدمات",
  "footer.link.partner_space": "فضاء مقدمي الخدمات",
  "footer.link.create_pro_account": "إنشاء حساب احترافي",
  "footer.link.pro_space": "الفضاء الاحترافي",
  "footer.link.pricing_offers": "الأسعار والعروض",
  "footer.link.features": "المميزات",
  "footer.link.request_demo": "طلب عرض توضيحي",
  "footer.link.faq": "الأسئلة الشائعة",
  "footer.link.contact_phone": "اتصلوا بنا · 05 20 12 34 56",
  "footer.link.terms": "شروط الاستخدام",
  "footer.link.privacy": "سياسة الخصوصية",
  "footer.link.legal_notice": "إشعارات قانونية",
  "footer.link.partner_charter": "ميثاق المؤسسات",
  "footer.link.refund_policy": "سياسة الاسترداد",
  "footer.link.anti_no_show_policy": "سياسة مكافحة عدم الحضور",
  "footer.link.apple_store": "Apple Store",
  "footer.link.google_play": "Google Play",
  "footer.link.admin_aria": "الوصول إلى واجهة الإدارة",
  "footer.section.discover": "اكتشفوا",
  "footer.install_app": "تثبيت التطبيق",
  "footer.copyright_suffix": ". جميع الحقوق محفوظة.",
  "footer.ramadan_moubarak": "رمضان مبارك",
  "pwa.update_available": "نسخة جديدة متاحة",
  "pwa.update_description": "انقروا للتحديث.",
  "pwa.update_button": "تحديث",
  "pwa.ios_guide_title": "تثبيت تطبيق sam.ma",
  "pwa.ios_guide_subtitle": "أضيفوا التطبيق إلى شاشتكم الرئيسية للوصول السريع.",
  "pwa.ios_step1_title": "اضغطوا على زر المشاركة",
  "pwa.ios_step1_desc": "في أسفل Safari، اضغطوا على أيقونة المشاركة (مربع مع سهم للأعلى).",
  "pwa.ios_step2_title": "\"إضافة إلى الشاشة الرئيسية\"",
  "pwa.ios_step2_desc": "مرروا للأسفل واضغطوا على \"إضافة إلى الشاشة الرئيسية\".",
  "pwa.ios_step3_title": "اضغطوا على إضافة",
  "pwa.ios_step3_desc": "أكّدوا بالضغط على \"إضافة\" في أعلى اليمين. تمّ!",
  "pwa.ios_guide_ok": "فهمت",
  "push.prompt_title": "تفعيل الإشعارات",
  "push.prompt_description": "تلقوا تأكيدات الحجز وتنبيهات قائمة الانتظار في الوقت الفعلي.",
  "push.prompt_enable": "تفعيل",
  "push.prompt_enabling": "جارٍ التفعيل…",
  "push.prompt_later": "لاحقاً",
  "profile.prefs.section_communication": "التواصل",
  "profile.prefs.newsletter_desc": "تلقي الجديد والعروض والتوصيات.",
  "profile.prefs.reminders": "تذكيرات الحجز",
  "profile.prefs.reminders_desc": "تلقي تذكير قبل خروجاتكم.",
  "profile.prefs.whatsapp_desc": "السماح بالتأكيدات والرسائل عبر WhatsApp.",
  "profile.prefs.section_push": "إشعارات الدفع",
  "profile.prefs.push_blocked": "الإشعارات محظورة في إعدادات متصفحكم. لإعادة تفعيلها، عدّلوا أذونات الموقع في متصفحكم.",
  "profile.prefs.push_enabled": "إشعارات الدفع",
  "profile.prefs.push_enabled_desc": "تلقي الإشعارات على هذا الجهاز.",
  "profile.prefs.push_bookings": "الحجوزات",
  "profile.prefs.push_bookings_desc": "التأكيدات والتذكيرات وتحديثات حجوزاتكم.",
  "profile.prefs.push_waitlist": "قائمة الانتظار",
  "profile.prefs.push_waitlist_desc": "تنبيهات عند توفر مكان.",
  "profile.prefs.push_marketing": "عروض وتخفيضات",
  "profile.prefs.push_marketing_desc": "عروض خاصة وتوصيات مخصصة.",
  "newsletter.title": "النشرة الإخبارية",
  "newsletter.subtitle": "تلقوا عروضنا وآخر المستجدات",
  "newsletter.placeholder": "بريدكم الإلكتروني",
  "newsletter.button": "موافق",
  "newsletter.success": "شكراً! تم تسجيلكم.",
  "newsletter.error.generic": "حدث خطأ. أعيدوا المحاولة.",
  "newsletter.error.invalid_email": "عنوان بريد إلكتروني غير صالح",
  "videos.page.title": "فيديوهات",
  "videos.page.subtitle": "اكتشفوا أفضل المؤسسات في المغرب من خلال فيديوهاتنا الحصرية.",
  "videos.page.empty_title": "لا توجد فيديوهات متاحة",
  "videos.page.empty_description": "عودوا قريباً لاكتشاف فيديوهاتنا الجديدة.",
  "help.title": "المساعدة والدعم",
  "help.subtitle": "الأسئلة الشائعة، تذاكر الدعم والدردشة (متاحة من 9 صباحاً إلى 7 مساءً).",
  "help.login_required": "لإنشاء تذكرة أو استخدام الدردشة، يجب أن تكونوا متصلين. تبقى الأسئلة الشائعة متاحة للجميع.",
  "help.tab.faq": "الأسئلة الشائعة",
  "help.tab.tickets": "التذاكر",
  "help.tab.chat": "الدردشة",
  "faq.title": "الأسئلة الشائعة",
  "faq.subtitle": "اعثروا على إجابات الأسئلة الأكثر شيوعاً: الحجوزات، الإلغاءات، الدفع والمساعدة.",
  "faq.button.access_help": "الوصول إلى المساعدة (التذاكر والدردشة)",
  "faq.phone_support.title": "الدعم الهاتفي",
  "faq.phone_support.hours": " · من 9 صباحاً إلى 7 مساءً",
  "faq.section.title": "الأسئلة الشائعة",
  "faq.section.subtitle": "اكتبوا بعض الكلمات المفتاحية (مثال: \"إلغاء\"، \"دفع\"، \"تأخير\").",
  "faq.section.search_placeholder": "البحث في الأسئلة الشائعة…",
  "faq.section.categories": "الفئات",
  "faq.section.category_all": "جميع الفئات",
  "faq.section.category_all_short": "الكل",
  "faq.section.results": "{count} نتيجة",
  "faq.section.empty": "لا توجد نتائج. جرّبوا كلمات مفتاحية أخرى.",
  "faq.section.error_load": "تعذّر تحميل الأسئلة الشائعة. أعيدوا المحاولة.",
  "faq.category.reservations": "الحجوزات",
  "faq.category.reservations.desc": "التأكيد، المواعيد، عدد الأشخاص، تفاصيل الحجز.",
  "faq.category.paiements": "المدفوعات",
  "faq.category.paiements.desc": "العربون، الفاتورة، وسائل الدفع، الاستردادات.",
  "faq.category.annulations": "الإلغاءات",
  "faq.category.annulations.desc": "تغيير التاريخ، الإلغاء، سياسات المؤسسة.",
  "faq.category.comptes_utilisateurs": "حسابات المستخدمين",
  "faq.category.comptes_utilisateurs.desc": "تسجيل الدخول، البيانات الشخصية، أمان الحساب.",
  "faq.category.comptes_pro": "الحسابات الاحترافية",
  "faq.category.comptes_pro.desc": "الفضاء الاحترافي، الظهور، إدارة الحجوزات.",
  "faq.category.packs_offres": "الباقات والعروض",
  "faq.category.packs_offres.desc": "العروض، الباقات، الظهور، الشروط.",
  "faq.category.support_general": "الدعم العام",
  "faq.category.support_general.desc": "المساعدة، التذاكر، الاتصال والأسئلة العامة.",
  "seo.home.title": "Sortir Au Maroc — احجزوا أفضل خروجاتكم في المغرب",
  "seo.home.description": "اعثروا واحجزوا مطاعمكم وأنشطتكم الترفيهية ومنتجعاتكم وفنادقكم وتجاربكم في المغرب. حجز بسيط وتأكيدات ودعم.",
  "seo.home.keywords": "حجز، مطعم، ترفيه، منتجع صحي، فندق، أنشطة، المغرب",
  "home.hero.title": "اكتشفوا واحجزوا أفضل الأنشطة",
  "home.hero.subtitle": "مطاعم، ترفيه، عافية وأكثر. احجزوا عبر الإنترنت في المغرب",
  "home.universe.restaurants": "أكل وشرب",
  "home.universe.sport": "رياضة وعافية",
  "home.universe.leisure": "ترفيه",
  "home.universe.accommodation": "إقامة",
  "home.universe.culture": "ثقافة",
  "home.universe.shopping": "تسوق",
  "home.universe.rentacar": "تنقل",
  "home.sections.best_offers.title": "أفضل عروضنا",
  "home.sections.selected_for_you.title": "مطاعم مختارة لكم",
  "home.sections.selected_for_you.activities.title": "أنشطة مختارة لكم",
  "home.sections.selected_for_you.sport.title": "رياضة وعافية مختارة لكم",
  "home.sections.selected_for_you.accommodation.title": "إقامات مختارة لكم",
  "home.sections.selected_for_you.culture.title": "ثقافة مختارة لكم",
  "home.sections.selected_for_you.shopping.title": "تسوق مختار لكم",
  "home.sections.selected_for_you.rentacar.title": "مركبات مختارة لكم",
  "home.sections.nearby.title": "بالقرب منكم",
  "home.sections.most_booked.title": "الأكثر حجزاً هذا الشهر",
  "home.sections.open_now.title": "مفتوح الآن",
  "home.sections.trending.title": "الأكثر رواجاً هذا الشهر",
  "home.sections.new.title": "جديد على SAM",
  "home.sections.top_rated.title": "الأفضل تقييماً",
  "home.sections.deals.title": "أفضل العروض الآن",
  "home.sections.themed.romantic": "لسهرة رومانسية",
  "home.sections.themed.brunch": "هل تشتهي برانش؟",
  "home.sections.themed.lunch": "لاستراحة الغداء",
  "home.sections.themed.ramadan": "اختيارات الفطور والسحور",
  "home.sections.ramadan.title": "خاص رمضان",
  "home.sections.ramadan.subtitle": "اكتشفوا أفضل عروض الإفطار",

  // ليالي ألف ليلة وليلة — رمضان 2026
  "home.ramadan.hero.title": "رمضان مبارك",
  "home.ramadan.hero.subtitle": "عيشوا أمسيات استثنائية مع أفضل العناوين في المغرب",
  "home.ramadan.announcement": "رمضان مبارك! اكتشفوا عروضنا الخاصة للإفطار والسحور",
  "home.ramadan.cta.title": "عيشوا رمضان استثنائي",
  "home.ramadan.cta.description": "أفضل المطاعم في المملكة في انتظاركم لإفطار لا يُنسى",
  "home.ramadan.cta.button": "اكتشفوا عروض رمضان",
  "home.ramadan.category.ftour": "إفطار رمضان",
  "home.ramadan.badge.ftour": "إفطار",

  "home.categories.restaurants.title": "ما الذي ترغبون فيه الآن؟",
  "home.categories.sport.title": "أي نشاط يستهويكم؟",
  "home.categories.loisirs.title": "رغبة في الترفيه؟",
  "home.categories.hebergement.title": "أي نوع من الإقامة؟",
  "home.categories.culture.title": "رغبة في الثقافة؟",
  "home.categories.shopping.title": "رغبة في التسوق؟",
  "home.categories.rentacar.title": "استأجروا مركبتكم",
  "home.sections.top100.title": "اكتشفوا أفضل 100",
  "home.sections.top100.image_alt": "أفضل 100",
  "home.sections.view_all": "عرض الكل",
  "home.sections.view_more": "عرض المزيد",
  "home.cards.reviews_count": "{count} تقييم",
  "home.cards.next_slot": "الموعد التالي: {slot}",
  "home.cards.promo_badge": "-{percent}%",
  "home.cards.curated_badge": "مختارات",
  "home.cards.month_reservations_label": "الحجوزات (30 يوم)",
  "home.cards.view_details_aria": "عرض بطاقة: {name}",
  "home.how_it_works.title": "كيف يعمل؟",
  "home.how_it_works.subtitle": "احجزوا نشاطكم المفضل في بضع نقرات",
  "home.how_it_works.step1.title": "اكتشفوا",
  "home.how_it_works.step1.text": "استكشفوا المطاعم والأنشطة القريبة منكم",
  "home.how_it_works.step2.title": "اختاروا",
  "home.how_it_works.step2.text": "اختاروا التاريخ والساعة وعدد الأشخاص",
  "home.how_it_works.step3.title": "ادفعوا",
  "home.how_it_works.step3.text": "أكملوا حجزكم بكل أمان",
  "home.how_it_works.step4.title": "استمتعوا",
  "home.how_it_works.step4.text": "تلقوا تأكيدكم ودليل المكان",
  "home.owner_block.image_alt": "صاحب مؤسسة",
  "home.owner_block.title": "هل أنتم أصحاب مؤسسة؟",
  "home.owner_block.subtitle": "سجّلوا مؤسستكم",
  "home.owner_block.paragraph": "حدثونا عن مؤسستكم وسنتواصل معكم في أقرب وقت.",
  "home.owner_block.button_more": "مزيد من المعلومات",
  "home.owner_block.already_partner": "شريك بالفعل",
  "home.owner_block.already_partner_text": "ادخلوا إلى لوحة التحكم لإدارة حجوزاتكم ومعلوماتكم وفئاتكم وعروضكم وفواتيركم ورسائلكم. تحتاجون مساعدة؟ تواصلوا معنا عبر الدردشة.",
  "home.owner_block.dashboard_button": "الدخول إلى لوحة التحكم",
  "home.featured_offers.items.discount_50.title": "تخفيضات تصل إلى 50%",
  "home.featured_offers.items.discount_50.badge": "عرض اللحظة",
  "home.featured_offers.items.weekend_brunch.title": "برانش نهاية الأسبوع",
  "home.featured_offers.items.weekend_brunch.badge": "في الواجهة",
  "home.featured_offers.items.terrace_night.title": "سهرة على السطح",
  "home.featured_offers.items.terrace_night.badge": "عرض محدود",
  "home.featured_offers.items.beach_vibes.title": "أجواء الشاطئ",
  "home.featured_offers.items.beach_vibes.badge": "جديد",
  "home.featured_offers.items.tasting_menu.title": "قائمة تذوق",
  "home.featured_offers.items.tasting_menu.badge": "خاص",
  "home.featured_offers.items.culinary_experience.title": "تجربة طهوية",
  "home.featured_offers.items.culinary_experience.badge": "حصري",

  // أقسام الصفحة الرئيسية
  "home.search.placeholder.restaurants": "مطبخ، مطعم، طبق...",
  "home.search.placeholder.restaurants_detailed": "مطبخ، اسم المطعم، طبق...",
  "home.search.placeholder.accommodation": "فندق، نوع، تجهيزات...",
  "home.search.placeholder.accommodation_detailed": "اسم الفندق، نوع، تجهيزات...",
  "home.search.placeholder.activities": "نشاط، مكان...",
  "home.search.placeholder.activities_detailed": "نشاط، مكان، نوع...",
  "home.cities.title": "مدن أخرى في المغرب",
  "home.cities.see_more": "عرض المزيد",
  "home.videos.title": "فيديوهات",
  "home.videos.book": "حجز",
  "home.videos.close": "إغلاق",
  "home.videos.fullscreen": "ملء الشاشة",
  "home.blog.title": "المدونة",
  "home.blog.read": "اقرأ",
  "home.blog.see_more": "عرض المزيد",
  "home.sponsored": "مُموَّل",
  "home.how_it_works.default.exclusive_offers.title": "عروض حصرية",
  "home.how_it_works.default.exclusive_offers.description": "استفيدوا من تخفيضات ومزايا فريدة لدى مؤسساتنا الشريكة في المغرب.",
  "home.how_it_works.default.best_choice.title": "أفضل اختيار",
  "home.how_it_works.default.best_choice.description": "مجموعة مختارة بعناية من المؤسسات لجميع رغباتكم: مطاعم، ترفيه، عافية...",
  "home.how_it_works.default.verified_reviews.title": "تقييمات موثقة",
  "home.how_it_works.default.verified_reviews.description": "توصيات حقيقية من مجتمعنا لتوجيه اختياراتكم.",
  "home.how_it_works.default.easy_booking.title": "حجز سهل",
  "home.how_it_works.default.easy_booking.description": "احجزوا فوراً، مجاناً، في أي مكان وأي وقت. 24/7.",

  "results.search": "بحث",
  "results.filters": "تصفية",
  "results.view.list": "قائمة",
  "results.view.map": "خريطة",
  "results.summary.found": "تم العثور على {label}",
  "results.summary.showing": "عرض",
  "results.geolocation.enable": "فعّلوا تحديد الموقع لرؤية المسافة",
  "results.no_results.title": "لم يُعثر على أي مؤسسة",
  "results.no_results.body": "لم نجد مؤسسة تطابق معاييركم.",
  "results.no_results.suggestion": "جرّبوا تعديل عوامل التصفية أو استكشفوا وجهات أخرى لخروجتكم القادمة كثنائي أو مع الأصدقاء أو العائلة!",
  "results.no_results.open_filters": "تعديل عوامل التصفية",
  "results.no_results.new_search": "بحث جديد",
  "results.sponsored": "مُموّل",
  "results.status.open": "مفتوح",
  "results.status.closed": "مُغلق",
  "results.promo.ongoing": "عرض جارٍ",
  "results.favorite.add": "إضافة إلى المفضلة",
  "results.favorite.remove": "إزالة من المفضلة",
  "results.highlight.today_prefix": "اليوم: ",
  "results.offer.up_to": "تخفيض يصل إلى -{percent}%",
  "results.action.book": "حجز",
  "results.action.view": "عرض",
  "results.action.view_hotel": "عرض الفندق",
  "results.load_more": "عرض {count} نتيجة إضافية",
  "results.people.option.1": "شخص واحد",
  "results.people.option.2": "شخصان",
  "results.people.option.3": "3 أشخاص",
  "results.people.option.4": "4 أشخاص",
  "results.people.option.5_plus": "+5 أشخاص",
  "results.search_placeholder": "أين تودون الذهاب؟",
  "results.filter.date": "التاريخ",
  "results.filter.time": "الساعة",
  "results.filter.persons_short": "أشخاص",
  "results.filter.promotions": "عروض",
  "results.filter.best_rated": "الأفضل تقييماً",
  "results.filter.cuisine_type": "نوع المطبخ",
  "results.filter.ambiance": "أجواء",
  "results.filter.sort_and_filter": "ترتيب وتصفية",
  "results.filter.open_now": "مفتوح الآن",
  "results.filter.instant_booking": "حجز فوري",
  "results.filter.terrace": "تراس",
  "results.filter.parking": "موقف سيارات",
  "results.filter.kid_friendly": "مناسب للأطفال",
  "results.filter.wifi": "واي فاي",
  "results.filter.budget": "الميزانية",
  "results.filter.price_1": "€",
  "results.filter.price_2": "€€",
  "results.filter.price_3": "€€€",
  "results.filter.price_4": "€€€€",
  "results.filter.no_results_filters": "لا توجد نتائج مع هذه الفلاتر",
  "results.filter.reset_filters": "إعادة تعيين الفلاتر",
  "search.personalized": "نتائج مخصصة حسب تفضيلاتك",
  "search.personalized.tooltip": "بناءً على حجوزاتك وعمليات البحث السابقة",
  "search.personalized.disable": "تعطيل التخصيص",
  "search.personalized.enable": "تفعيل التخصيص",
  "settings.personalization": "تخصيص النتائج",
  "settings.personalization.description": "تكييف ترتيب النتائج وفقاً لأذواقك",
  "search.no_results": "لا توجد نتائج لـ \"{query}\"",
  "search.did_you_mean": "هل تقصد؟",
  "search.did_you_mean.results": "{count} نتائج",
  "search.similar_results": "نتائج مشابهة",
  "search.relax_filters": "جرّب بفلاتر أقل",
  "search.relax_filters.without": "بدون {filter}",
  "search.reset_all_filters": "إعادة تعيين جميع الفلاتر",
  "search.nearby": "متوفر بالقرب",
  "search.nearby.distance": "على بعد {km} كم",
  "search.nearby.see_results": "عرض {count} نتائج في {city}",
  "search.popular_fallback": "الأكثر شعبية",
  "search.also_like": "قد يعجبك أيضاً",
  "search.field.city.placeholder": "مدينة أو حي",
  "search.field.activity.placeholder": "نشاط أو مؤسسة",
  "search.validation.minimum_people": "الحد الأدنى: {count} أشخاص",
  "search.placeholder.unified": "مطبخ، اسم مكان، طبق...",
  "search.placeholder.restaurant_type": "نوع المكان",
  "search.title.choose_restaurant_type": "اختيار نوع المكان",
  "search.placeholder.accommodation_type": "نوع الإقامة",
  "search.title.choose_accommodation_type": "اختيار نوع الإقامة",
  "search.placeholder.culture_type": "نوع الخروجة",
  "search.title.choose_culture_type": "اختيار نوع الخروجة",
  "search.placeholder.shopping_type": "نوع المتجر",
  "search.title.choose_shopping_type": "اختيار نوع المتجر",
  "search.placeholder.sport_activity_type": "نوع النشاط",
  "search.title.choose_sport_activity_type": "اختيار نوع النشاط",
  "search.placeholder.prestation_type": "نوع الخدمة",
  "search.title.choose_prestation_type": "اختيار نوع الخدمة",
  "search.restaurant_type.gastronomique": "راقي",
  "search.restaurant_type.rooftop": "سطح",
  "search.restaurant_type.plage": "مطعم شاطئي",
  "search.restaurant_type.brunch": "برانش منظم",
  "search.restaurant_type.cafe": "مقهى",
  "search.restaurant_type.fast_food": "وجبات سريعة",
  "search.restaurant_type.bistronomie": "بيسترونومي",
  "search.restaurant_type.familial": "مطعم عائلي",
  "search.shopping_type.mode": "أزياء",
  "search.shopping_type.chaussures": "أحذية",
  "search.shopping_type.beaute_parfumerie": "تجميل / عطور",
  "search.shopping_type.optique": "بصريات",
  "search.shopping_type.bijoux": "مجوهرات",
  "search.shopping_type.maison_deco": "منزل / ديكور",
  "search.shopping_type.epicerie_fine": "بقالة فاخرة",
  "search.shopping_type.artisanat": "حرف يدوية",
  "search.shopping_type.concept_store": "متجر مفاهيمي",
  "search.shopping_type.autres": "أخرى",
  "search.placeholder.vehicle_type": "نوع المركبة",
  "search.title.choose_vehicle_type": "اختيار نوع المركبة",
  "search.rentacar.pickup_location": "مكان الاستلام",
  "search.rentacar.dropoff_location": "مكان الإرجاع",
  "search.rentacar.same_dropoff": "إرجاع في نفس المكان",
  "search.rentacar.same_dropoff_checkbox": "الإرجاع في نفس المكان",
  "search.rentacar.pickup_date": "تاريخ الاستلام",
  "search.rentacar.dropoff_date": "تاريخ الإرجاع",
  "search.rentacar.pickup_time": "ساعة الاستلام",
  "search.rentacar.dropoff_time": "ساعة الإرجاع",
  "search.rentacar.driver_age": "عمر السائق",
  "search.rentacar.young_driver_warning": "سائق أقل من 30 سنة أو أكثر من 70 سنة",
  "search.rentacar.young_driver_description": "قد يُطلب من السائقين الشباب والسائقين الكبار دفع رسوم إضافية.",
  "search.rentacar.select_dates": "اختيار التواريخ",
  "search.history.recent_searches": "عمليات بحث سابقة",
  "search.history.clear_all": "مسح الكل",
  "search.history.remove": "حذف",
  "results.universe.restaurants.count_label": "مطاعم",
  "results.universe.sport.count_label": "أنشطة عافية",
  "results.universe.loisirs.count_label": "أنشطة ترفيهية",
  "results.universe.hebergement.count_label": "إقامات",
  "results.universe.culture.count_label": "مواقع ثقافية",
  "results.universe.shopping.count_label": "أماكن تسوق",
  "results.universe.rentacar.count_label": "مركبات",
  "results.universe.default.count_label": "نتائج",
  "vehicle.badge.super_offer": "عرض ممتاز",
  "vehicle.badge.member_price": "سعر العضو",
  "vehicle.feature.unlimited_mileage": "كيلومترات غير محدودة",
  "vehicle.cashback": "اربحوا {amount} MAD كاسترداد نقدي",
  "vehicle.benefit.free_cancellation": "إلغاء مجاني",
  "vehicle.benefit.basic_insurance": "تأمين تصادم أساسي",
  "vehicle.benefit.online_checkin": "تسجيل وصول عبر الإنترنت",
  "vehicle.positive_reviews": "من التقييمات الإيجابية",
  "vehicle.discount": "تخفيض",
  "vehicle.price_per_day": "في اليوم",
  "vehicle.price_total": "المجموع",
  "vehicle.or_similar": "أو ما يشابهها",
  "vehicle.seats": "{count} مقاعد",
  "vehicle.sort_filter": "ترتيب وتصفية",
  "vehicle.total_taxes_included": "المبلغ الإجمالي شامل الضرائب والرسوم",
  "vehicle.sort_info": "كيف يعمل ترتيبنا",
  "filters.title": "عوامل التصفية",
  "filters.promotions.title": "العروض",
  "filters.promotions.subtitle": "عرض العروض الترويجية",
  "filters.promotions.description": "إبراز المؤسسات التي لديها عروض أو تخفيضات",
  "filters.none_available": "لا توجد عوامل تصفية متاحة لهذا القسم.",
  "filters.apply": "تطبيق",
  "filters.section.restaurant.specialties": "التخصصات المطبخية",
  "filters.section.restaurant.specialties.search_placeholder": "البحث عن تخصص",
  "filters.section.price": "السعر",
  "filters.section.availability": "التوفر",
  "filters.availability.now": "متاح الآن",
  "filters.availability.tonight": "هذا المساء",
  "filters.availability.tomorrow": "غداً",
  "filters.availability.specific": "تاريخ محدد",
  "filters.section.packs_offers": "الباقات والعروض",
  "filters.section.options": "الخيارات",
  "filters.section.ambience": "الأجواء",
  "filters.section.activity_type": "نوع النشاط",
  "filters.section.duration": "المدة",
  "filters.section.audience": "الجمهور",
  "filters.section.level": "المستوى",
  "filters.section.constraints": "القيود",
  "filters.constraints.min_people": "الحد الأدنى للأشخاص",
  "filters.constraints.privatization": "إمكانية الحجز الخاص",
  "filters.section.type": "النوع",
  "filters.section.format": "الصيغة",
  "filters.section.duration_minutes": "المدة (دقيقة)",
  "filters.section.equipment": "التجهيزات",
  "filters.section.offers": "العروض",
  "filters.section.budget_per_night": "الميزانية / الليلة",
  "filters.section.ratings": "التقييمات",
  "filters.section.conditions": "الشروط",
  "filters.section.language": "اللغة",
  "filters.section.access": "الوصول",
  "filters.section.store_type": "نوع المتجر",
  "filters.section.budget": "الميزانية",
  "filters.section.services": "الخدمات",
  "filters.placeholder.example": "مثال: {value}",
  "suggestions.my_position": "موقعي",
  "suggestions.use_my_location": "استخدام موقعي",
  "suggestions.section.cities": "المدن",
  "suggestions.section.neighborhoods": "الأحياء الشعبية",
  "suggestions.section.establishments": "المؤسسات والأنشطة",
  "suggestions.section.categories": "الفئات والتخصصات",
  "suggestions.section.offers": "العروض",
  "suggestions.section.trending": "الرائج",
    "booking.steps.details": "التفاصيل",
    "booking.steps.payment": "ملخص",
    "booking.steps.info": "المعلومات",
    "booking.steps.confirmation": "التأكيد",
    "booking.step_header.label": "الخطوة {step} من {total}",
    "booking.auth.title": "سجّلوا الدخول لإتمام الحجز (دقيقة واحدة)",
    "booking.auth.subtitle.step2": "يتيح لكم ذلك تأمين حجزكم والعثور على تأكيدكم.",
    "booking.auth.subtitle.step3": "ستتمكنون من تأكيد معلوماتكم واستلام رمز QR الخاص بكم.",
    "booking.establishment.fallback": "حجز",
    "booking.card.title.restaurant": "حجز طاولة",
    "booking.card.title.hotel": "حجز غرفة",
    "booking.card.title.ticket": "حجز تذكرة دخول",
    "booking.card.title.slot": "حجز فترة زمنية",
    "booking.card.title.default": "حجز",
    "booking.cta.book_now": "احجزوا الآن",
    "booking.module.step_progress": "الخطوة {current} / {total}",
    "booking.people.more_than_10": "أكثر من 10 أشخاص",
    "booking.people.exact_count": "العدد الدقيق",
    "booking.people.remove_one": "إزالة شخص",
    "booking.people.add_one": "إضافة شخص",
    "booking.people.up_to": "حتى 50 شخصًا.",
    "booking.people.other_number": "عدد آخر",
    "booking.people.range": "بين {min} و{max} شخصًا.",
    "booking.step1.title": "اختاروا الفترة الزمنية",
    "booking.step1.subtitle": "حدّدوا التاريخ والوقت وعدد الأشخاص.",
    "booking.step1.section.date": "حدّدوا التاريخ",
    "booking.step1.section.time": "حدّدوا الوقت",
    "booking.step1.section.people": "عدد الأشخاص",
    "booking.date_time.placeholder": "حدّدوا التاريخ والوقت",
    "booking.bottomsheet.tab.date": "التاريخ",
    "booking.bottomsheet.tab.time": "الوقت",
    "booking.bottomsheet.tab.persons_short": "أشخاص",
    "booking.pack.selected": "الباقة المختارة",
    "booking.pack.remove": "إزالة",
    "booking.step1.date.helper": "اختاروا يومًا لعرض الفترات الزمنية المتاحة.",
    "booking.step1.time.helper": "اختاروا وقتًا متاحًا.",
    "booking.step1.people.helper": "اختاروا عدد الأشخاص للحجز.",
    "booking.step1.recap": "الملخص",
    "booking.step1.selected.date": "التاريخ المحدد",
    "booking.step1.selected.time": "الوقت المحدد",
    "booking.step1.selected.slot": "الفترة الزمنية المحددة",
    "booking.step1.selected.participants": "المشاركون",
    "booking.step1.no_slots": "لا توجد فترات زمنية متاحة لهذا التاريخ. جرّبوا يومًا آخر.",
    "booking.step1.select_date_first": "حدّدوا التاريخ أولًا لعرض الفترات الزمنية.",
    "booking.step1.select_time_first": "حدّدوا الوقت أولًا لاختيار عدد الأشخاص.",
    "booking.step1.more_choices": "خيارات أخرى",
    "booking.step1.more_dates": "تواريخ أخرى",
    "booking.choose_slot": "اختاروا فترة زمنية",
    "booking.reservations_today": "{count} حجز بالفعل اليوم",
    "booking.waitlist": "قائمة الانتظار",
    "booking.slot.full": "مكتمل",
    "booking.slot.full_aria": "الفترة الزمنية {time} مكتملة",
    "booking.offer.short": "عرض -{promo}% على القائمة",
    "booking.offer.long": "عرض -{promo}% على القائمة",
    "booking.capacity.full_waitlist": "هذه الفترة الزمنية مكتملة. يمكنكم الانضمام إلى قائمة الانتظار.",
    "booking.capacity.remaining": "السعة المتبقية لهذه الفترة الزمنية: {remaining}",
    "booking.capacity.limited": "هذه الفترة الزمنية محدودة بـ {remaining} {unit}.",
    "booking.waitlist.notice": "الفترة الزمنية مكتملة: سيتم إرسال طلبكم إلى قائمة الانتظار.",
    "booking.step1.choose_people": "اختاروا عدد الأشخاص",
    "booking.step1.choose_time": "اختاروا وقتًا",
    "booking.step1.choose_date": "اختاروا تاريخًا",
    "booking.activity.slot_at": "فترة زمنية في الساعة {time}",
    "booking.time.choose": "اختيار {time}",
    "booking.service.at_time": "{service} في الساعة {time}",
    "booking.calendar.choose_date": "اختيار تاريخ",
    "booking.calendar.placeholder": "يي/شش/سسسس",
    "booking.calendar.prev_month": "الشهر السابق",
    "booking.calendar.next_month": "الشهر التالي",
    "booking.time.bucket.other": "أخرى",
    "booking.time.bucket.morning": "الصباح",
    "booking.time.bucket.afternoon": "بعد الظهر",
    "booking.time.bucket.evening": "المساء",
    "booking.time.bucket.breakfast": "الفطور",
    "booking.time.bucket.lunch": "الغداء",
    "booking.time.bucket.tea_time": "Tea Time",
    "booking.time.bucket.happy_hour": "Happy Hour",
    "booking.time.bucket.dinner": "العشاء",
    "booking.time.bucket.available": "متاح",
    "booking.service.lunch": "الغداء",
    "booking.service.continuous": "خدمة متواصلة",
    "booking.service.dinner": "العشاء",
    "booking.footer.security_notice": "🔒 دفع آمن • ⚡ تُديره Sortir Au Maroc",
    "booking.recap.title": "الملخص",
    "booking.recap.establishment": "المؤسسة",
    "booking.recap.pack": "الباقة",
    "booking.recap.guests": "الأشخاص",
    "booking.recap.date": "التاريخ",
    "booking.recap.time": "الوقت",
    "booking.recap.discount": "التخفيض",
    "booking.mode.guaranteed": "حجز مضمون",
    "booking.mode.not_guaranteed": "حجز غير مضمون",
    "booking.price.per_person": "{amount} / شخص",
    "booking.price.from": "ابتداءً من",
    "booking.step2.title.secure": "أمّنوا حجزكم",
    "booking.step2.title.waitlist": "طلب قائمة الانتظار",
    "booking.step2.subtitle.secure": "اختاروا ما إذا كنتم تريدون ضمان طاولتكم.",
    "booking.step2.subtitle.waitlist": "الفترة الزمنية مكتملة. سنرسل طلبكم إلى المطعم.",
    "booking.waitlist.banner.title": "الفترة الزمنية مكتملة — قائمة الانتظار",
    "booking.waitlist.banner.body": "سنرسل طلبكم إلى المطعم. ستُخطرون إذا توفّر مكان.",
    "booking.waitlist.banner.note": "لا يُطلب أي دفع لطلب الانضمام إلى قائمة الانتظار.",
    "booking.mode.guaranteed.short": "مكان مضمون",
    "booking.mode.non_guaranteed.short": "في انتظار التأكيد",
    "booking.mode.guaranteed.line1": "حجز مسبق بقيمة {unit} MAD/شخص (تُخصم من الفاتورة)",
    "booking.mode.guaranteed.line2": "إلغاء مجاني حتى 24 ساعة قبل الموعد",
    "booking.mode.non_guaranteed.line": "بدون دفع مسبق، قد يُعطي المطعم الأولوية للأماكن المضمونة.",
    "booking.mode.non_guaranteed.line_simple": "سيتم تأكيد حجزكم من طرف المطعم.",
    "booking.mode.non_guaranteed.more": "بدون دفع مسبق، يعتمد حجزكم على التوافر وأولوية المطعم. ستتلقون تأكيدًا في أقرب وقت.",
    "booking.payment.banner.title": "دفع آمن — الإلغاء حسب الشروط",
    "booking.payment.banner.waitlist": "لا دفع فوري. سيؤكد المطعم إذا توفّر مكان.",
    "booking.payment.banner.followup": "ستتلقون ردًا في أقرب وقت ممكن.",
    "booking.payment.banner.guaranteed": "حجز مسبق بقيمة {unit} MAD / شخص (تُخصم من الفاتورة).",
    "booking.payment.banner.total": "المبلغ المدفوع مسبقًا اليوم: {total} MAD",
    "booking.payment.banner.non_guaranteed": "لا دفع فوري. قد يُعطي المطعم الأولوية للأماكن المضمونة.",
    "booking.payment.method.card": "البطاقة البنكية",
    "booking.payment.secure_method": "دفع آمن",
    "booking.deposit.title": "مطلوب دفع عربون",
    "booking.deposit.description": "لضمان توافر الأماكن في المؤسسات وتفادي حالات عدم الحضور، قد يُطلب عربون لبعض الحجوزات.",
    "booking.deposit.amount_label": "المبلغ المطلوب دفعه",
    "booking.deposit.pre_auth": "حجز مسبق: {unit} {currency} × {partySize} أشخاص",
    "booking.deposit.note": "سيُخصم هذا المبلغ من الفاتورة النهائية. في حالة عدم الحضور، قد يُحتفظ به وفقًا للشروط.",
    "booking.deposit.payma_hint": "ستتم إعادة توجيهكم إلى pay.ma لإتمام الدفع. بعد الدفع، عودوا إلى هنا لإنهاء العملية.",
    "booking.deposit.pay_and_confirm": "ادفعوا وأكّدوا الحجز",
    "booking.deposit.pedagogy.context_label": "السياق",
    "booking.deposit.pedagogy.context_value": "قد يُطبق تأكيد معزّز على بعض الحجوزات.",
    "booking.deposit.pedagogy.impact_label": "الأثر",
    "booking.deposit.pedagogy.impact_value": "يتطلب هذا الحجز عربونًا للتأكيد.",
    "booking.deposit.pedagogy.reassurance": "هذا ليس عقوبة: إنه إجراء لحماية الفترات الزمنية.",
    "booking.deposit.pedagogy.learn_more": "معرفة المزيد",
    "booking.step3.title": "أكّدوا معلوماتكم",
    "booking.step3.subtitle": "ستمكّن هذه المعلومات المؤسسة من الاتصال بكم.",
    "booking.step3.description": "ستمكّن هذه المعلومات المطعم من الاتصال بكم بشأن حجزكم.",
    "booking.form.first_name": "الاسم الشخصي",
    "booking.form.last_name": "اسم العائلة",
    "booking.form.email": "البريد الإلكتروني",
    "booking.form.phone": "الهاتف",
    "booking.form.message": "رسالة خاصة",
    "booking.form.optional": "اختياري",
    "booking.form.placeholder.first_name": "مثال: أمينة",
    "booking.form.placeholder.last_name": "مثال: بنعلي",
    "booking.form.placeholder.email": "مثال: amina@example.com",
    "booking.form.placeholder.phone": "مثال: +212 6 12 34 56 78",
    "booking.form.placeholder.phone_local": "6 12 34 56 78",
    "booking.form.placeholder.message": "مثال: حساسيات غذائية، مناسبة خاصة…",
    "booking.form.placeholder.message_long": "صِفوا المناسبة (عيد ميلاد، لقاء...)، اذكروا الأنظمة الغذائية أو الطلبات الخاصة...",
    "booking.step3.privacy_notice": "🔒 بياناتكم محمية ولن تُشارك إلا مع المطعم لغرض حجزكم.",
    "booking.step3.cta.review": "مراجعة",
    "booking.step4.title.confirmed": "تم تأكيد حجزكم",
    "booking.step4.title.waitlist": "طلب في قائمة الانتظار",
    "booking.step4.title.sent": "تم إرسال الطلب",
    "booking.step4.subtitle.confirmed": "ستجدون رمز QR والمستندات لتقديمها عند الوصول.",
    "booking.step4.subtitle.waitlist": "الفترة الزمنية مكتملة. سيتواصل معكم المطعم إذا توفّر مكان.",
    "booking.step4.subtitle.sent": "يجب أن يُصادق المطعم على طلبكم. ستتلقون ردًا قريبًا.",
    "booking.step4.banner.title.confirmed": "تم تأكيد الحجز!",
    "booking.step4.banner.title.pending": "تم تقديم الطلب",
    "booking.step4.banner.body.confirmed": "مكانكم مضمون. تم إرسال رسالة SMS للتأكيد.",
    "booking.step4.banner.body.pending": "سيؤكد المطعم حجزكم عبر SMS أو البريد الإلكتروني قريبًا.",
    "booking.step4.contact.title": "التواصل",
    "booking.step4.contact.confirmation_sent": "تم إرسال التأكيد إلى الرقم المُقدَّم",
    "booking.step4.reference.title": "مرجع الحجز",
    "booking.step4.qr.title": "رمز QR - قدّموه في المطعم",
    "booking.step4.qr.alt": "رمز QR للحجز",
    "booking.step4.qr.body": "سيتمكن المطعم من مسح رمز QR هذا لتأكيد حضوركم",
    "booking.step4.pdf.title": "تحميل الحجز بصيغة PDF",
    "booking.step4.pdf.cta": "تصدير بصيغة PDF",
    "booking.step4.pdf.generating": "جارٍ الإنشاء...",
    "booking.step4.wallet.apple": "إضافة إلى Apple Wallet",
    "booking.step4.wallet.google": "إضافة إلى Google Wallet",
    "booking.step4.calendar.add": "إضافة إلى التقويم",
    "booking.step4.directions": "عرض المسار",
    "booking.step4.modify": "تعديل",
    "booking.step4.cancel": "إلغاء",
    "booking.step4.cancel.confirm": "هل أنتم متأكدون من رغبتكم في إلغاء هذا الحجز؟",
    "booking.step4.trust.ssl": "دفع آمن بتشفير SSL 256-bit",
    "booking.step4.trust.managed_by": "حجز تُديره Sortir Au Maroc",
    "booking.step4.trust.count": "أكثر من 5,000 حجز تم إنجازه",
    "booking.step4.home": "العودة إلى الصفحة الرئيسية",
    "booking.step4.calendar.event_title": "حجز - {establishment}",
    "booking.waitlist.missing_slot": "تعذّر الانضمام إلى قائمة الانتظار: لم يتم تحديد أي فترة زمنية.",
    "booking.modify.title": "طلب تعديل",
    "booking.modify.datetime_label": "التاريخ/الوقت الجديد ({optional})",
    "booking.modify.datetime_help": "ستؤكد المؤسسة التعديل (حسب التوافر).",
    "booking.modify.party_size_label": "عدد الأشخاص ({optional})",
    "booking.modify.party_size_placeholder": "مثال: 4",
    "booking.modify.send": "إرسال",
    "reservation.status.modification_pending": "قيد المراجعة (طلب تعديل)",
    "reservation.status.modification_pending.title": "طلب التعديل الخاص بكم قيد المعالجة من طرف المؤسسة.",
    "reservation.status.refused": "مرفوض",
    "reservation.status.refused.title": "حجز مرفوض",
    "reservation.status.waitlist": "قائمة الانتظار",
    "reservation.status.pending_pro": "في انتظار المصادقة",
    "reservation.status.cancelled.you": "مُلغى (أنتم)",
    "reservation.status.cancelled.client": "مُلغى (العميل)",
    "reservation.status.cancelled.establishment": "مُلغى (المؤسسة)",
    "reservation.status.cancelled.refunded": "مُلغى / تم الاسترجاع",
    "reservation.status.cancelled.generic": "مُلغى",
    "reservation.status.no_show": "عدم حضور",
    "reservation.status.past.present": "منتهٍ · حاضر",
    "reservation.status.past.no_show": "منتهٍ · عدم حضور",
    "reservation.status.past.generic": "منتهٍ",
    "reservation.status.confirmed": "مؤكد",
    "reservation.status.confirmed.guaranteed": "مؤكد · مضمون",
    "reservation.status.confirmed.not_guaranteed": "مؤكد · غير مضمون",
    "reservation.status.generic": "حجز",
    "payment.status.paid": "مدفوع",
    "payment.status.pending": "غير مدفوع",
    "payment.status.refunded": "مُسترجَع",
    "booking_details.loading.title": "جارٍ التحميل…",
    "booking_details.loading.body": "نسترجع معلومات حجزكم.",
    "booking_details.not_found": "حجز غير موجود",
    "booking_details.not_found.body_default": "هذا الحجز لم يعد موجودًا أو تم حذفه.",
    "booking_details.back_to_account": "العودة إلى الحساب",
    "booking_details.explore": "استكشاف",
    "booking_details.back": "رجوع",
    "booking_details.ref_prefix": "مرجع",
    "booking_details.field.date": "التاريخ",
    "booking_details.field.time": "الوقت",
    "booking_details.field.people": "الأشخاص",
    "booking_details.field.address": "العنوان",
    "booking_details.waitlist_offer.badge": "عرض (قائمة الانتظار)",
    "booking_details.waitlist_offer.title": "عرض مكان متاح",
    "booking_details.waitlist_offer.body": "لديكم 15 دقيقة لتأكيد هذا الحجز.",
    "booking_details.waitlist_offer.expires_at": "ينتهي في الساعة {time}",
    "booking_details.waitlist_offer.accept": "قبول",
    "booking_details.waitlist_offer.refuse": "رفض",
    "booking_details.waitlist_offer.expired_title": "انتهت صلاحية العرض",
    "booking_details.waitlist_offer.expired_body": "هذا العرض لم يعد متاحًا. سيقترح النظام المكان على العميل التالي.",
    "booking_details.waitlist_offer.waiting_title": "في قائمة الانتظار",
    "booking_details.waitlist_offer.waiting_body": "ترتيبكم الحالي: #{position}.",
    "booking_details.payment.title": "الدفع",
    "booking_details.payment.status": "الحالة",
    "booking_details.payment.amount": "المبلغ",
    "booking_details.payment.total": "المجموع",
    "booking_details.payment.paid_at": "تم الدفع في",
    "booking_details.payment.method": "وسيلة الدفع",
    "booking_details.payment.escrow_held_badge": "أموال محتجزة ⚠️",
    "booking_details.payment.none": "لا يوجد دفع مسجّل.",
    "booking_details.payment.secure": "دفع آمن",
    "booking_details.payment.pre_reservation_per_person": "حجز مسبق (لكل شخص)",
    "booking_details.payment.total_prepaid": "المبلغ المدفوع مسبقًا",
    "booking_details.payment.calculation": "الحساب: {unit} × {count} أشخاص",
    "booking_details.qr.title": "رمز QR والمستندات",
    "booking_details.qr.invoice": "الفاتورة",
    "booking_details.qr.alt": "رمز QR",
    "booking_details.qr.present_on_arrival": "قدّموه عند الوصول",
    "booking_details.qr.contains": "يحتوي رمز QR على مرجع الحجز، وعند توفره، المبلغ المدفوع مسبقًا.",
    "booking_details.qr.pdf_restaurant_only": "ملف PDF متاح فقط لحجوزات المطاعم.",
    "booking_details.review.title": "التقييم",
    "booking_details.review.overall": "التقييم العام: {rating}/5",
    "booking_details.review.criteria_average": "متوسط المعايير",
    "booking_details.review.published_at": "نُشر في {date}",
    "booking_details.review.leave": "اتركوا تقييمًا",
    "booking_details.review.rate_each": "قيّموا كل معيار",
    "booking_details.review.estimated": "التقييم العام المقدّر: {rating}/5",
    "booking_details.review.comment_label": "التعليق",
    "booking_details.review.comment_placeholder": "شاركوا تجربتكم…",
    "booking_details.review.publish": "نشر",
    "booking_details.review.thank_you_title": "شكرًا لكم!",
    "booking_details.review.saved_body": "تم تسجيل تقييمكم.",
    "booking_details.review.unavailable": "ترك تقييم متاح بعد انتهاء الحجز، إذا حضر العميل.",
    "booking_details.summary.title": "الملخص",
    "booking_details.summary.note": "ملاحظة:",
    "booking_details.summary.phone": "الهاتف:",
    "booking_details.pro_message.title": "رسالة من المؤسسة",
    "booking_details.pro_message.template_prefix": "قالب",
    "booking_details.service.lunch": "الغداء",
    "booking_details.service.continuous": "متواصل",
    "booking_details.service.dinner": "العشاء",
    "booking_details.attendance.title": "الحضور",
    "booking_details.attendance.present": "حاضر(ة)",
    "booking_details.attendance.no_show": "غائب(ة) / عدم حضور",
    "booking_details.attendance.unknown": "غير محدد",
    "booking_details.toast.declined.title": "تم رفض العرض",
    "booking_details.toast.declined.body": "تم إبلاغ النظام.",
    "booking_details.toast.accepted.title": "تم إرسال الطلب",
    "booking_details.toast.accepted.body": "تم إرسال قبولكم إلى المحترف للمصادقة.",
    "booking_details.toast.change_cancelled.title": "تم الإلغاء",
    "booking_details.toast.change_cancelled.body": "تم سحب طلب التعديل الخاص بكم.",
    "booking_details.toast.cancellation_sent.title": "تم إرسال طلب الإلغاء",
    "booking_details.toast.cancellation_sent.body": "تم تسجيل طلب الإلغاء الخاص بكم. ستتلقون تأكيدًا بمجرد معالجة الاسترجاع (إن وُجد).",
    "booking_details.toast.payment_initiated.title": "تم بدء الدفع",
    "booking_details.toast.payment_initiated.body": "بمجرد إتمام الدفع، عودوا إلى هنا وأعيدوا محاولة قبول العرض.",
    "booking_details.toast.change_request_sent.title": "تم إرسال الطلب",
    "booking_details.toast.change_request_sent.body": "تم إرسال طلب التعديل إلى المؤسسة. ستتلقون ردًا بمجرد معالجته.",
    "booking_details.cancellation.free_until": "إلغاء مجاني حتى {date}.",
    "booking_details.cancellation.conditional": "إلغاء مشروط (خصم {percent}%).",
    "booking_details.cancellation.default_note": "تتم معالجة الطلبات من طرف المؤسسة حسب التوافر وسياستها.",
    "common.error": "خطأ",
    "common.limited_offer": "عرض محدود",
    "common.per_person": "للشخص الواحد",
    "common.instead_of": "بدلاً من",
    "not_found.title": "الصفحة غير موجودة",
    "not_found.body": "عذراً، هذه الصفحة غير موجودة (أو لم تعد موجودة).",
    "not_found.back_home": "العودة إلى الرئيسية",
    "not_found.view_results": "عرض النتائج",
    "hotel.booking.title_fallback": "حجز فندق",
    "hotel.booking.step.details": "التفاصيل",
    "hotel.booking.step.conditions": "الشروط",
    "hotel.booking.step.info": "المعلومات",
    "hotel.booking.step.confirmation": "التأكيد",
    "hotel.booking.payment_footer": "دفع آمن • تتم إدارته بواسطة Sortir Au Maroc",
    "menu.search.placeholder": "البحث في القائمة…",
    "menu.search.results_label": "النتائج",
    "menu.search.no_results": "لا توجد نتائج لبحثكم.",
    "menu.sort.label": "ترتيب",
    "menu.sort.all": "الكل",
    "menu.sort.popular": "الأكثر شعبية",
    "menu.sort.best_sellers": "الأكثر مبيعاً",
    "menu.group.packs": "باقات",
    "menu.packs.subtitle": "العروض والباقات",
    "menu.items.count": "{count} أطباق",
    "menu.badge.new": "جديد",
    "menu.badge.specialty": "تخصص",
    "menu.badge.best_seller": "الأكثر مبيعاً",
    "menu.badge.healthy": "صحي",
    "menu.badge.vegetarian": "نباتي",
    "menu.badge.fast": "سريع",
    "pack.book_cta": "حجز هذه الباقة",
    "pack.urgency.today_only": "اليوم فقط",
    "pack.urgency.limited_recommended": "أماكن محدودة",
    "pack.urgency.high_demand": "طلب مرتفع جداً",
    "pack.urgency.exclusive": "عرض حصري",
    "restaurant.quick_booking.title": "حجز سريع",
    "restaurant.quick_booking.subtitle": "اختاروا تاريخاً ووقتاً وعدد الأشخاص.",
    "restaurant.quick_booking.duration": "دقيقة واحدة",
    "restaurant.quick_booking.closed_warning": "الفترة الزمنية غير متاحة",
    "restaurant.quick_booking.advice": "يمكنكم إتمام الحجز في الخطوة التالية.",
    "restaurant.quick_booking.cta.choose_slot": "اختيار هذه الفترة",
    "restaurant.quick_booking.cta.book_slot": "حجز هذه الفترة",
    "weekday.monday": "الإثنين",
    "weekday.tuesday": "الثلاثاء",
    "weekday.wednesday": "الأربعاء",
    "weekday.thursday": "الخميس",
    "weekday.friday": "الجمعة",
    "weekday.saturday": "السبت",
    "weekday.sunday": "الأحد",
    "restaurant.hours.title": "أوقات العمل",
    "restaurant.hours.table.day": "اليوم",
    "restaurant.hours.service.lunch": "الغداء",
    "restaurant.hours.service.dinner": "العشاء",
    "restaurant.hours.status.open": "مفتوح",
    "restaurant.hours.status.soon": "قريباً",
    "restaurant.hours.status.closed": "مغلق",
    "restaurant.hours.today_label": "اليوم: {day}",
    "restaurant.hours.week_toggle": "عرض أوقات الأسبوع",
    "restaurant.hours.closed": "مغلق",
    "restaurant.hours.closed_today": "مغلق اليوم",
    "restaurant.hours.next_slot.label": "الفترة التالية: {day} {from}–{to}",
    "restaurant.hours.next_slot.unavailable": "لا توجد فترات قادمة",
    "restaurant.hours.compatibility.ok": "الفترة الزمنية متاحة",
    "restaurant.hours.compatibility.not_ok": "الفترة الزمنية غير متاحة",
    "restaurant.hours.compatibility.closed_day": "مغلق في هذا اليوم.",
    "restaurant.hours.compatibility.opens_at": "يفتح على الساعة {time}.",
    "restaurant.hours.compatibility.opens_tomorrow_at": "يفتح غداً على الساعة {time}.",
    "restaurant.hours.compatibility.not_compatible": "التوقيت غير متوافق.",
    "profile.user.fallback_name": "حسابي",
    "profile.gate.title": "سجّلوا الدخول للوصول إلى ملفكم الشخصي",
    "profile.gate.subtitle": "استعرضوا حجوزاتكم ومفضلاتكم وتفضيلاتكم.",
    "profile.gate.cta.explore": "استكشاف",
    "profile.gate.card.bookings.title": "الحجوزات",
    "profile.gate.card.bookings.subtitle": "اطلعوا على حجوزاتكم الحالية والسابقة.",
    "profile.gate.card.favorites.title": "المفضلة",
    "profile.gate.card.favorites.subtitle": "استعرضوا المؤسسات المحفوظة لديكم.",
    "profile.gate.card.preferences.title": "التفضيلات",
    "profile.gate.card.preferences.subtitle": "خصّصوا تجربتكم.",
    "profile.contact.placeholder": "البريد الإلكتروني أو الهاتف",
    "profile.stats.bookings": "الحجوزات",
    "profile.stats.favorites": "المفضلة",
    "profile.stats.preferences": "التفضيلات",
    "profile.stats.preferences.short": "{enabled}/{total} مفعّلة",
    "profile.stats.preferences.long": "{enabled} من أصل {total} تفضيلات مفعّلة",
    "profile.stats.preferences.examples": "مثال: سطح، فطور متأخر، حمام، أنشطة عائلية…",
    "profile.tabs.info": "المعلومات",
    "profile.tabs.bookings": "الحجوزات",
    "profile.tabs.waitlist": "قائمة الانتظار",
    "profile.tabs.billing": "الفواتير",
    "profile.tabs.packs": "الباقات",
    "profile.tabs.favorites": "المفضلة",
    "profile.tabs.preferences": "التفضيلات",
    "profile.tabs.privacy_account": "الخصوصية والحساب",
    "profile.privacy.title": "الخصوصية والحساب",
    "profile.privacy.subtitle": "أديروا حسابكم وبياناتكم وطلباتكم (تعطيل، حذف، تصدير).",
    "profile.privacy.export.title": "تحميل بياناتي",
    "profile.privacy.export.description": "ستتلقون رابطاً آمناً عبر البريد الإلكتروني (JSON أو CSV).",
    "profile.privacy.export.button": "طلب التصدير",
    "profile.privacy.export.button.loading": "جارٍ الطلب…",
    "profile.privacy.export.toast.title": "تم إرسال الطلب",
    "profile.privacy.export.toast.description": "إذا كان هناك بريد إلكتروني مرتبط بحسابكم، ستتلقون رابط تحميل.",
    "profile.password.title": "كلمة المرور",
    "profile.password.description": "أديروا أمان حسابكم.",
    "profile.password.reset.title": "إعادة تعيين كلمة المرور",
    "profile.password.reset.description": "سيتم إرسال رابط إعادة التعيين إلى بريدكم الإلكتروني.",
    "profile.password.reset.button": "إرسال عبر البريد الإلكتروني",
    "profile.password.reset.button.loading": "جارٍ الإرسال…",
    "profile.password.reset.toast.title": "تم إرسال البريد الإلكتروني",
    "profile.password.reset.toast.description": "تحققوا من صندوق الوارد للحصول على رابط إعادة التعيين.",
    "profile.password.reset.error.phone_only.title": "إعادة التعيين غير متاحة",
    "profile.password.reset.error.phone_only.description": "لقد سجّلتم الدخول باستخدام هاتفكم. يرجى استخدام خيار \"تغيير كلمة المرور\" بدلاً من ذلك.",
    "profile.password.change.title": "تغيير كلمة المرور",
    "profile.password.change.description": "عدّلوا كلمة المرور الحالية.",
    "profile.password.change.button": "تعديل",
    "profile.password.change.button.loading": "جارٍ التعديل…",
    "profile.password.change.button.confirm": "تأكيد",
    "profile.password.change.dialog.title": "تغيير كلمة المرور",
    "profile.password.change.dialog.description": "أدخلوا كلمة المرور الحالية ثم اختاروا كلمة مرور جديدة.",
    "profile.password.change.current": "كلمة المرور الحالية",
    "profile.password.change.new": "كلمة المرور الجديدة",
    "profile.password.change.confirm": "تأكيد كلمة المرور الجديدة",
    "profile.password.change.hint": "8 أحرف على الأقل",
    "profile.password.change.toast.title": "تم تغيير كلمة المرور",
    "profile.password.change.toast.description": "تم تحديث كلمة المرور بنجاح.",
    "profile.password.change.error.too_short": "يجب أن تحتوي كلمة المرور على 8 أحرف على الأقل.",
    "profile.password.change.error.mismatch": "كلمتا المرور غير متطابقتين.",
    "profile.password.change.error.invalid_current": "كلمة المرور الحالية غير صحيحة.",
    "profile.privacy.deactivate.title": "تعطيل حسابي مؤقتاً",
    "profile.privacy.deactivate.description": "سيتم إيقاف حسابكم مؤقتاً. يمكنكم إعادة تفعيله بتسجيل الدخول مجدداً.",
    "profile.privacy.deactivate.button": "تعطيل",
    "profile.privacy.deactivate.button.loading": "جارٍ التعطيل…",
    "profile.privacy.deactivate.button.confirm": "تأكيد التعطيل",
    "profile.privacy.deactivate.dialog.title": "تعطيل حسابي",
    "profile.privacy.deactivate.dialog.description": "اختاروا سبباً (اختياري) وأكّدوا. سيتم تسجيل خروجكم.",
    "profile.privacy.deactivate.toast.title": "تم تعطيل الحساب",
    "profile.privacy.deactivate.toast.description": "حسابكم معطّل مؤقتاً. يمكنكم إعادة تفعيله بتسجيل الدخول مجدداً.",
    "profile.privacy.delete.title": "حذف حسابي نهائياً",
    "profile.privacy.delete.description": "حذف نهائي لا رجعة فيه. قد يتم الاحتفاظ ببعض المعلومات إذا اقتضى القانون ذلك.",
    "profile.privacy.delete.button": "حذف",
    "profile.privacy.delete.button.loading": "جارٍ الحذف…",
    "profile.privacy.delete.button.confirm": "تأكيد الحذف",
    "profile.privacy.delete.dialog.title": "حذف حسابي",
    "profile.privacy.delete.dialog.description": "اختاروا سبباً ثم أكّدوا. هذا الإجراء نهائي لا رجعة فيه.",
    "profile.privacy.delete.step2.warning": "الخطوة الأخيرة: هذا الإجراء نهائي لا رجعة فيه. بمجرد الحذف، لا يمكن استرجاع حسابكم.",
    "profile.privacy.delete.step2.confirm_label": "اكتبوا \"{word}\" للتأكيد",
    "profile.privacy.delete.confirm_word": "حذف",
    "profile.privacy.delete.toast.title": "تم حذف الحساب",
    "profile.privacy.delete.toast.description": "تم حذف حسابكم. شكراً لاستخدامكم Sortir Au Maroc.",
    "profile.privacy.reason.label": "السبب (اختياري)",
    "profile.privacy.reason.details.label": "تفاصيل (اختياري)",
    "profile.privacy.reason.details.placeholder": "أخبرونا في بضع كلمات…",
    "profile.privacy.reason.pause": "أريد أخذ استراحة مؤقتة",
    "profile.privacy.reason.not_using": "لا أستخدم Sortir Au Maroc بما يكفي",
    "profile.privacy.reason.too_many_notifications": "إشعارات كثيرة جداً",
    "profile.privacy.reason.technical_issue": "مشكلة تقنية",
    "profile.privacy.reason.privacy_concerns": "مخاوف تتعلق بالخصوصية",
    "profile.privacy.reason.not_found": "لم أجد ما كنت أبحث عنه",
    "profile.privacy.reason.other": "سبب آخر",
    "profile.privacy.deactivate.message.pause": "شكراً لكم. سنقوم بإيقاف حسابكم مؤقتاً. يمكنكم إعادة تفعيله متى شئتم.",
    "profile.privacy.deactivate.message.not_using": "شكراً على ملاحظتكم. سيتم إيقاف حسابكم مؤقتاً.",
    "profile.privacy.deactivate.message.too_many_notifications": "مفهوم. سيتم إيقاف حسابكم مؤقتاً ولن تتلقوا إشعارات بعد الآن.",
    "profile.privacy.deactivate.message.technical_issue": "شكراً لكم. إذا رغبتم، تواصلوا معنا وسنبذل قصارى جهدنا لحل المشكلة.",
    "profile.privacy.deactivate.message.privacy_concerns": "شكراً لكم. نأخذ الخصوصية على محمل الجد ونبقى متاحين إذا كانت لديكم أسئلة.",
    "profile.privacy.deactivate.message.not_found": "شكراً لكم. نأمل أن نراكم مجدداً على Sortir Au Maroc.",
    "profile.privacy.deactivate.message.other": "شكراً لكم. سيتم إيقاف حسابكم مؤقتاً.",
    "profile.privacy.delete.reason.not_using_anymore": "لم أعد أستخدم Sortir Au Maroc",
    "profile.privacy.delete.reason.found_alternative": "وجدت بديلاً آخر",
    "profile.privacy.delete.reason.unsatisfied_experience": "تجربة غير مرضية",
    "profile.privacy.delete.reason.too_buggy": "أعطال كثيرة جداً",
    "profile.privacy.delete.reason.payment_issue": "مشكلة تتعلق بالدفع",
    "profile.privacy.delete.reason.data_privacy": "مخاوف تتعلق بالبيانات الشخصية",
    "profile.privacy.delete.reason.not_covered": "لم أعد في منطقة مغطاة",
    "profile.privacy.delete.message.not_using_anymore": "شكراً على ملاحظتكم. سنقوم بمعالجة طلب الحذف.",
    "profile.privacy.delete.message.found_alternative": "شكراً على ملاحظتكم. سنقوم بمعالجة طلب الحذف.",
    "profile.privacy.delete.message.unsatisfied_experience": "شكراً لكم. نأسف أن التجربة لم تكن في المستوى المطلوب.",
    "profile.privacy.delete.message.too_buggy": "شكراً لكم. نعتذر عن المشاكل التي واجهتموها.",
    "profile.privacy.delete.message.payment_issue": "شكراً لكم. إذا رغبتم، تواصلوا معنا لتوضيح الوضع قبل الحذف.",
    "profile.privacy.delete.message.data_privacy": "شكراً لكم. سنقوم بمعالجة طلبكم وفقاً لسياسة الخصوصية الخاصة بنا.",
    "profile.privacy.delete.message.not_covered": "شكراً لكم. نأمل أن نعود قريباً إلى منطقتكم.",
    "profile.privacy.delete.message.other": "شكراً لكم. سنقوم بمعالجة طلب الحذف.",
    "profile.privacy.footer_hint": "تحتاجون مساعدة؟ يمكنكم التواصل مع الدعم من صفحة المساعدة.",
    "profile.waitlist.title": "قائمة الانتظار",
    "profile.waitlist.subtitle": "تابعوا ترتيبكم واستجيبوا للعروض عند توفر مكان.",
    "profile.waitlist.empty.title": "لا توجد قائمة انتظار",
    "profile.waitlist.empty.subtitle": "عندما تكون الفترة الزمنية ممتلئة، يمكنكم الانضمام إلى قائمة الانتظار من صفحة الحجز.",
    "profile.waitlist.empty.hint": "نصيحة: إذا كان لديكم حجز بحالة \"قائمة انتظار\"، فسيظهر في تبويب الحجوزات.",
    "profile.waitlist.section.active": "الطلبات النشطة",
    "profile.waitlist.section.expired": "السجل",
    "profile.waitlist.section.active_empty": "لا توجد طلبات نشطة.",
    "profile.waitlist.section.expired_empty": "لا يوجد سجل.",
    "profile.waitlist.status.offer": "عرض",
    "profile.waitlist.status.waiting": "في الانتظار",
    "profile.waitlist.status.accepted": "مقبولة",
    "profile.waitlist.status.expired": "منتهية",
    "profile.waitlist.status.unknown": "الحالة",
    "profile.waitlist.field.date": "التاريخ",
    "profile.waitlist.field.time": "الوقت",
    "profile.waitlist.field.people": "الأشخاص",
    "profile.waitlist.offer.expires_at": "تنتهي في {time}",
    "profile.waitlist.position": "الترتيب: #{position}",
    "profile.waitlist.cancel": "إلغاء",
    "profile.waitlist.view_reservation": "عرض",
    "profile.waitlist.establishment_fallback": "مؤسسة",
    "profile.info.title": "معلوماتي",
    "profile.info.subtitle": "حدّثوا معلوماتكم لتسهيل حجوزاتكم.",
    "profile.info.first_name.label": "الاسم الأول",
    "profile.info.first_name.placeholder": "مثال: أمينة",
    "profile.info.last_name.label": "اسم العائلة",
    "profile.info.last_name.placeholder": "مثال: بنعلي",
    "profile.info.phone.label": "الهاتف",
    "profile.info.phone.placeholder": "مثال: +212 6 12 34 56 78",
    "profile.info.phone.help": "يُستخدم للتواصل معكم عند الحاجة.",
    "profile.info.csp.label": "الوضعية المهنية",
    "profile.info.csp.placeholder": "اختاروا…",
    "profile.info.csp.help": "اختياري.",
    "profile.info.dob.label": "تاريخ الميلاد",
    "profile.info.dob.placeholder": "يي/شش/سسسس",
    "profile.info.dob.help": "اختياري.",
    "profile.info.city.label": "المدينة",
    "profile.info.city.placeholder": "مثال: الدار البيضاء",
    "profile.info.save": "حفظ",
    "profile.info.saved": "تم الحفظ",
    "profile.info.last_updated": "آخر تحديث: {value}",
    "profile.info.edit": "تعديل",
    "profile.info.phone.verified": "مُتحقَّق منه",
    "profile.info.phone.verified_help": "تم التحقق من هذا الرقم ولا يمكن تعديله.",
    "profile.info.phone.verify": "تحقق",
    "profile.info.phone.verify_description": "أرسلوا رمز SMS للتحقق من رقمكم.",
    "profile.info.email.verified": "مُتحقَّق منه",
    "profile.info.email.verified_help": "تم التحقق من هذا العنوان.",
    "profile.info.email.verify": "تحقق",
    "profile.info.email.verify_description": "سيتم إرسال رمز مكوّن من 8 أرقام إلى عنوانكم.",
    "profile.info.email.label": "البريد الإلكتروني",
    "profile.info.login_credentials": "بيانات تسجيل الدخول",
    "profile.info.phone.login_label": "هاتف تسجيل الدخول",
    "profile.phone_verification.title": "التحقق من رقمي",
    "profile.phone_verification.subtitle": "سيتم إرسال رمز SMS إلى رقمكم للتحقق منه. بمجرد التحقق، لا يمكن تعديله.",
    "profile.phone_verification.success": "تم التحقق من الرقم!",
    "profile.phone_verification.success_description": "تم التحقق من رقم هاتفكم بنجاح.",
    "profile.phone_verification.not_available": "التحقق غير متاح",
    "profile.email_verification.title": "التحقق من بريدي الإلكتروني",
    "profile.email_verification.subtitle": "حلّوا اختبار captcha ثم انقروا على إرسال. سيتم إرسال رمز مكوّن من 8 أرقام إلى عنوان بريدكم الإلكتروني.",
    "profile.email_verification.send_code": "إرسال الرمز",
    "profile.email_verification.enter_code": "أدخلوا الرمز المستلم",
    "profile.email_verification.code_sent_to": "تم إرسال الرمز إلى",
    "profile.email_verification.success": "تم التحقق من البريد الإلكتروني!",
    "profile.email_verification.success_description": "تم التحقق من عنوان بريدكم الإلكتروني بنجاح.",
    "profile.email_verification.error.invalid_email": "عنوان البريد الإلكتروني غير صالح.",
    "profile.email_verification.error.send_failed": "تعذر إرسال الرمز. أعيدوا المحاولة.",
    "profile.email_verification.error.invalid_code": "الرمز غير صحيح. تحققوا وأعيدوا المحاولة.",
    "profile.email_verification.error.code_expired": "انتهت صلاحية هذا الرمز. اطلبوا رمزاً جديداً.",
    "profile.email_verification.error.captcha_required": "يرجى حل اختبار captcha.",
    "profile.info.csp.group.education": "الدراسة",
    "profile.info.csp.group.unemployed": "بدون عمل",
    "profile.info.csp.group.employed": "موظف",
    "profile.info.csp.group.self_employed": "مستقل",
    "profile.info.csp.group.public": "القطاع العام",
    "profile.info.csp.group.commerce": "التجارة",
    "profile.info.csp.group.manual": "عمال وخدمات",
    "profile.info.csp.group.other": "أخرى",
    "profile.info.csp.student": "طالب",
    "profile.info.csp.intern": "متدرب",
    "profile.info.csp.unemployed": "بدون عمل",
    "profile.info.csp.job_seeker": "باحث عن عمل",
    "profile.info.csp.retraining": "إعادة تأهيل مهني",
    "profile.info.csp.employee": "موظف",
    "profile.info.csp.technician": "تقني",
    "profile.info.csp.supervisor": "مشرف",
    "profile.info.csp.manager": "مدير",
    "profile.info.csp.executive": "إطار",
    "profile.info.csp.freelance": "عامل حر",
    "profile.info.csp.entrepreneur": "رائد أعمال",
    "profile.info.csp.liberal_profession": "مهنة حرة",
    "profile.info.csp.public_servant": "موظف حكومي",
    "profile.info.csp.merchant": "تاجر",
    "profile.info.csp.artisan": "حرفي",
    "profile.info.csp.worker": "عامل",
    "profile.info.csp.service_employee": "موظف خدمات",
    "profile.info.csp.retired": "متقاعد",
    "profile.info.csp.stay_at_home": "ربّ/ربّة بيت",
    "profile.info.csp.other": "أخرى",
    "reset_password.title": "كلمة مرور جديدة",
    "reset_password.for_account": "للحساب {email}",
    "reset_password.validating": "جارٍ التحقق من الرابط...",
    "reset_password.new_password": "كلمة المرور الجديدة",
    "reset_password.confirm_password": "تأكيد كلمة المرور",
    "reset_password.password_hint": "8 أحرف على الأقل",
    "reset_password.submit": "تعيين كلمة المرور",
    "reset_password.submitting": "جارٍ الحفظ...",
    "reset_password.back_home": "العودة إلى الرئيسية",
    "reset_password.error.title": "رابط غير صالح",
    "reset_password.error.missing_token": "الرابط غير مكتمل. يرجى استخدام الرابط الكامل المرسل عبر البريد الإلكتروني.",
    "reset_password.error.invalid_token": "رابط إعادة التعيين هذا غير صالح.",
    "reset_password.error.token_expired": "انتهت صلاحية هذا الرابط. اطلبوا رابط إعادة تعيين جديداً.",
    "reset_password.error.token_used": "تم استخدام هذا الرابط مسبقاً. اطلبوا رابطاً جديداً إذا لزم الأمر.",
    "reset_password.error.too_short": "يجب أن تحتوي كلمة المرور على 8 أحرف على الأقل.",
    "reset_password.error.mismatch": "كلمتا المرور غير متطابقتين.",
    "reset_password.error.generic": "حدث خطأ. يرجى إعادة المحاولة.",
    "reset_password.success.title": "تم تغيير كلمة المرور",
    "reset_password.success.description": "تم تغيير كلمة المرور بنجاح. يمكنكم الآن تسجيل الدخول.",
    "reset_password.success.login": "تسجيل الدخول",
    "profile.bookings.loading": "جارٍ تحميل الحجوزات…",
    "profile.bookings.empty.title": "لا توجد حجوزات",
    "profile.bookings.empty.subtitle": "ستظهر حجوزاتكم هنا.",
    "profile.bookings.ref": "المرجع",
    "profile.bookings.view": "عرض",
    "profile.bookings.field.date": "التاريخ",
    "profile.bookings.field.time": "الوقت",
    "profile.bookings.field.people": "الأشخاص",
    "profile.bookings.pre_reservation": "حجز مسبق",
    "profile.bookings.amount_paid": "المبلغ المدفوع",
    "support.tickets.title": "تذاكر الدعم",
    "support.tickets.subtitle": "أنشئوا وتابعوا طلبات المساعدة الخاصة بكم.",
    "support.hours": "خدمة العملاء متاحة من 9 صباحاً إلى 7 مساءً",
    "support.tickets.new": "تذكرة جديدة",
    "support.tickets.my_tickets": "تذاكري",
    "support.tickets.empty": "لا توجد تذاكر حالياً.",
    "support.tickets.select_prompt": "اختاروا تذكرة لعرض التفاصيل.",
    "support.ticket.form.subject": "الموضوع",
    "support.ticket.form.subject.placeholder": "مثال: مشكلة في الحجز",
    "support.ticket.form.category": "الفئة",
    "support.ticket.form.category.placeholder": "اختاروا فئة",
    "support.ticket.form.message": "الرسالة",
    "support.ticket.form.message.placeholder": "صِفوا طلبكم…",
    "support.ticket.form.submit": "إرسال",
    "support.ticket.category.reservations": "الحجوزات",
    "support.ticket.category.cancellation": "الإلغاء",
    "support.ticket.category.billing": "الدفع / الفواتير",
    "support.ticket.category.account": "الحساب",
    "support.ticket.category.technical": "تقني",
    "support.ticket.category.partners": "الشركاء",
    "support.ticket.category.other": "أخرى",
    "support.ticket.updated_at": "آخر تحديث: {date}",
    "support.ticket.status.open": "مفتوح",
    "support.ticket.status.closed": "مغلق",
    "support.ticket.action.close": "إغلاق",
    "support.ticket.action.reopen": "إعادة فتح",
    "support.ticket.reply": "الرد",
    "support.ticket.reply.placeholder": "اكتبوا رسالة…",
    "support.ticket.reply.placeholder_closed": "هذه التذكرة مغلقة.",
    "support.ticket.reply.send": "إرسال",
    "support.ticket.closed_note": "هذه التذكرة مغلقة. أعيدوا فتحها للرد.",
    "treatments.category.packs": "باقات",
    "treatments.category.buggy": "باغي",
    "treatments.category.quad": "كواد",
    "treatments.category.motocross": "موتوكروس",
    "treatments.category.kids": "أطفال",
    "treatments.category.rides": "جولات",
    "treatments.category.options": "خيارات",
    "treatments.category.hammam": "حمام",
    "treatments.category.massage": "تدليك",
    "treatments.category.cils": "رموش وحواجب",
    "treatments.category.onglerie": "تجميل الأظافر",
    "treatments.category.coiffure": "تصفيف الشعر",
    "treatments.category.other": "أخرى",
    "treatments.empty.title": "لا توجد خدمات",
    "treatments.empty.subtitle": "ستتوفر الخدمات قريباً.",
    "treatments.category_empty.title": "لا توجد خدمات",
    "treatments.category_empty.subtitle": "لا توجد خدمات في هذه الفئة حالياً.",
    "establishment.tabs.aria_label": "التنقل في صفحة المؤسسة",
    "establishment.tabs.menu": "القائمة",
    "establishment.tabs.reviews": "التقييمات",
    "establishment.tabs.info": "المعلومات",
    "establishment.tabs.hours": "الأوقات",
    "establishment.tabs.map": "الخريطة",
    "establishment.tabs.rooms": "الغرف",
    "establishment.tabs.services": "الخدمات",
    "establishment.tabs.pricing": "الخدمات والأسعار",
    "pro.booking_settings.title": "الإلغاءات والتعديلات",
    "pro.booking_settings.subtitle": "اضبطوا سياسات الإلغاء والتعديل (النص المعروض للمستخدم).",
    "pro.booking_settings.reload": "إعادة التحميل",
    "pro.booking_settings.save": "حفظ",
    "pro.booking_settings.load_failed": "تعذر تحميل السياسة (أعيدوا المحاولة).",
    "pro.booking_settings.pedagogy.title": "حماية الفترات الزمنية",
    "pro.booking_settings.pedagogy.body": "قد يطلب Sortir Au Maroc عربوناً على بعض الحجوزات لتقليل حالات عدم الحضور وتأمين فتراتكم الزمنية. هذا الإجراء تلقائي ويهدف إلى حماية تجربة الجميع.",
    "pro.booking_settings.pedagogy.note": "نصيحة: اشرحوا للعميل أن العربون يُستخدم لتأكيد وحماية الفترة الزمنية.",
    "pro.booking_settings.section.cancel.title": "أ — سياسة الإلغاء",
    "pro.booking_settings.section.cancel.description": "المهل الزمنية والغرامات والنص المعروض للمستخدم.",
    "pro.booking_settings.cancel.enable.title": "تفعيل سياسة إلغاء مخصصة",
    "pro.booking_settings.cancel.enable.hint": "إذا تم التعطيل، ستُطبّق سياسة Sortir Au Maroc الافتراضية.",
    "pro.booking_settings.cancel.free_hours.label": "مهلة الإلغاء المجاني (ساعات قبل الموعد)",
    "pro.booking_settings.cancel.penalty_percent.label": "الغرامة بعد انتهاء المهلة (%)",
    "pro.booking_settings.cancel.penalty_percent.example": "مثال: من نهاية المهلة حتى وقت الحجز: خصم {percent}%.",
    "pro.booking_settings.cancel.no_show_penalty.label": "غرامة عدم الحضور (%)",
    "pro.booking_settings.cancel.no_show_always_100.title": "100% دائماً لحالات عدم الحضور المؤكدة",
    "pro.booking_settings.cancel.no_show_always_100.hint": "اختياري، يُنصح به في حالة الدفع المسبق.",
    "pro.booking_settings.cancel.custom_text.title": "نص مخصص يُعرض للعميل",
    "pro.booking_settings.cancel.custom_text.placeholder.fr": "نص بالفرنسية يُعرض للعميل (صفحة الحجز + البريد الإلكتروني)",
    "pro.booking_settings.cancel.custom_text.placeholder.en": "نص بالإنجليزية يُعرض للعميل",
    "pro.booking_settings.section.modif.title": "ب — سياسة التعديل",
    "pro.booking_settings.section.modif.description": "التفويض والمهلة والنص المعروض للعميل.",
    "pro.booking_settings.modif.enable.title": "السماح بطلبات التعديل",
    "pro.booking_settings.modif.enable.hint": "إذا تم التعطيل، سيتم إخفاء زر التعديل للمستخدم.",
    "pro.booking_settings.modif.deadline_hours.label": "آخر مهلة (ساعات قبل الحجز)",
    "pro.booking_settings.modif.require_guarantee.label": "فرض الضمان إذا كانت النتيجة أقل من… (اختياري)",
    "pro.booking_settings.modif.require_guarantee.placeholder": "مثال: 65",
    "pro.booking_settings.modif.require_guarantee.hint": "اتركوه فارغاً لعدم تطبيق هذه القاعدة.",
    "pro.booking_settings.modif.custom_text.title": "نص إعلامي يُعرض للعميل",
    "pro.booking_settings.modif.custom_text.placeholder.fr": "نص بالفرنسية يُعرض للعميل في نافذة التعديل",
    "pro.booking_settings.modif.custom_text.placeholder.en": "نص بالإنجليزية يُعرض للعميل",
    "admin.content.title": "المحتوى",
    "admin.content.description": "أديروا الصفحات التحريرية والأسئلة الشائعة (FR/EN) بدون تعديل الكود.",
    "admin.content.editor_language": "لغة التحرير",
    "admin.content.tab.pages": "الصفحات",
    "admin.content.tab.faq": "الأسئلة الشائعة",
    "admin.content.action.new_page": "صفحة جديدة",
    "admin.content.action.new_faq": "سؤال شائع جديد",
    "admin.content.action.preview": "معاينة",
    "admin.content.action.back_to_edit": "رجوع",
    "admin.content.action.save": "حفظ",
    "admin.content.warning": "تنبيه",
    "admin.content.translation_missing": "ترجمة مفقودة",
    "admin.content.translation_missing_hint": "أكملوا النسخة FR/EN قبل النشر لضمان تجربة متسقة.",
    "admin.content.status.draft": "مسودة",
    "admin.content.status.published": "منشور",
    "admin.content.pages.search": "بحث (slug، عنوان)…",
    "admin.content.pages.column.slug": "Slug",
    "admin.content.pages.column.title": "العنوان",
    "admin.content.pages.column.status": "الحالة",
    "admin.content.pages.column.updated": "التحديث",
    "admin.content.faq.search": "بحث (سؤال، علامات)…",
    "admin.content.faq.column.category": "الفئة",
    "admin.content.faq.column.order": "الترتيب",
    "admin.content.faq.column.question": "السؤال",
    "admin.content.faq.column.status": "الحالة",
    "admin.content.faq.column.updated": "التحديث",
    "admin.content.dialog.page": "صفحة",
    "admin.content.dialog.faq": "سؤال شائع",
    "admin.content.field.slug": "Slug",
    "admin.content.field.slug_placeholder": "مثال: cgu, privacy, about",
    "admin.content.field.status": "الحالة",
    "admin.content.field.title": "العنوان",
    "admin.content.field.title_placeholder_fr": "العنوان (FR)",
    "admin.content.field.title_placeholder_en": "العنوان (EN)",
    "admin.content.field.meta_title": "Meta title",
    "admin.content.field.meta_title_placeholder": "عنوان SEO",
    "admin.content.field.meta_description": "Meta description",
    "admin.content.field.meta_description_placeholder": "وصف SEO (حوالي 160 حرفاً)",
    "admin.content.field.content": "المحتوى",
    "admin.content.field.content_placeholder": "اكتبوا هنا…",
    "admin.content.language.fr": "الفرنسية",
    "admin.content.language.en": "الإنجليزية",
    "admin.content.preview.seo": "SEO (معاينة)",
    "admin.content.preview.public": "العرض العام",
    "admin.content.history.title": "السجل",
    "admin.content.history.empty": "لا توجد تعديلات مسجلة.",
    "admin.content.history.created": "إنشاء",
    "admin.content.history.updated": "تعديل",
    "admin.content.error.slug_required": "الحقل slug إلزامي.",
    "admin.content.error.title_required": "يرجى إدخال عنوان واحد على الأقل (FR أو EN).",
    "admin.content.error.question_required": "يرجى إدخال سؤال واحد على الأقل (FR أو EN).",
    "admin.content.faq.field.category": "الفئة",
    "admin.content.faq.field.order": "ترتيب العرض",
    "admin.content.faq.field.tags": "العلامات",
    "admin.content.faq.field.tags_placeholder": "إلغاء، دفع، عدم حضور",
    "admin.content.faq.field.question": "السؤال",
    "admin.content.faq.field.question_placeholder_fr": "السؤال (FR)",
    "admin.content.faq.field.question_placeholder_en": "السؤال (EN)",
    "admin.content.faq.field.answer": "الإجابة",
    "admin.content.faq.field.answer_placeholder": "إجابتكم…",
    "admin.content.faq.category.reservations": "الحجوزات",
    "admin.content.faq.category.paiements": "المدفوعات",
    "admin.content.faq.category.annulations": "الإلغاءات",
    "admin.content.faq.category.comptes_utilisateurs": "حسابات المستخدمين",
    "admin.content.faq.category.comptes_pro": "حسابات المهنيين",
    "admin.content.faq.category.packs_offres": "الباقات والعروض",
    "admin.content.faq.category.support_general": "الدعم العام",
    "admin.richtext.h2": "H2",
    "admin.richtext.h3": "H3",
    "admin.richtext.p": "فقرة",
    "admin.richtext.bold": "غامق",
    "admin.richtext.italic": "مائل",
    "admin.richtext.underline": "تحته خط",
    "admin.richtext.ul": "قائمة",
    "admin.richtext.ol": "ترقيم",
    "admin.richtext.link": "رابط",
    "admin.richtext.link.dialog_title": "إضافة رابط",
    "admin.richtext.link.hint": "حددوا النص أولاً، ثم الصقوا URL (مثال: https://…، /faq، mailto:…).",
    "admin.richtext.link.placeholder": "https://example.com",
    "admin.richtext.link.insert": "إدراج",
    "admin.richtext.ai": "ذكاء اصطناعي",
    "report.title": "الإبلاغ عن هذه المؤسسة",
    "report.description": "هل تودون الإبلاغ عن مشكلة مع {name}؟",
    "report.reason_label": "سبب الإبلاغ",
    "report.reason_placeholder": "اختاروا سبباً",
    "report.reason.closed_permanently": "مؤسسة مغلقة نهائياً",
    "report.reason.incorrect_info": "معلومات غير صحيحة",
    "report.reason.fraudulent": "مؤسسة احتيالية",
    "report.reason.inappropriate_content": "محتوى غير لائق",
    "report.reason.safety_concern": "مشكلة أمان",
    "report.reason.other": "سبب آخر",
    "report.details_label": "تفاصيل إضافية (اختياري)",
    "report.details_placeholder": "صِفوا المشكلة التي واجهتموها...",
    "report.submit": "إرسال الإبلاغ",
    "report.submitting": "جارٍ الإرسال...",
    "report.error.select_reason": "يرجى اختيار سبب",
    "report.error.login_required": "يجب تسجيل الدخول للإبلاغ",
    "report.error.generic": "خطأ أثناء إرسال الإبلاغ",
    "report.success.title": "تم إرسال الإبلاغ",
    "report.success.description": "شكراً على إبلاغكم. سيقوم فريقنا بمراجعته.",
    "report.button": "إبلاغ",
    "report.button_tooltip": "الإبلاغ عن هذه المؤسسة",
    "admin.settings.title": "إعدادات المشرف العام",
    "admin.settings.description": "مركز التكوين العام — منسوخ في قاعدة بيانات Supabase",
    "admin.settings.logs": "السجلات",
    "admin.settings.loading.title": "جارٍ التحميل",
    "admin.settings.loading.body": "جارٍ المزامنة…",
    "admin.settings.sync_report.message": "تمت مزامنة الإعدادات مع Supabase.\nقواعد جديدة نشطة: {created} — قواعد معدّلة: {modified} — لا شيء للتنفيذ: {noop}.",
    "admin.settings.permissions.title": "الصلاحيات",
    "admin.settings.permissions.body": "هذه الصفحة مخصصة للمشرف العام. في حالة الوصول غير المصرح به، يتم توجيه المستخدم إلى لوحة التحكم.",
};

export default ar as Record<string, string>;

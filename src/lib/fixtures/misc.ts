import type { ContentPage, FeatureFlag, Integration, NotificationTemplate, PromoCode, Review, Ticket } from "../domain/types";
import { daysFromNow, hoursFromNow, iso } from "./helpers";

export const promos: PromoCode[] = [
  { id: "promo_karibu", code: "KARIBU10", description: "10% off first stay booking", discountType: "pct", discountValue: 10, verticals: ["stay"], budgetMinor: 5_000_000, usedMinor: 1_240_000, usageLimit: 500, usedCount: 62, validFrom: iso(daysFromNow(-30)), validTo: iso(daysFromNow(60)), status: "active" },
  { id: "promo_safari", code: "SAFARI250", description: "TZS 250,000 off any tour over 5M", discountType: "fixed", discountValue: 250_000, verticals: ["tour"], budgetMinor: 10_000_000, usedMinor: 3_000_000, usageLimit: 40, usedCount: 12, validFrom: iso(daysFromNow(-10)), validTo: iso(daysFromNow(45)), status: "active" },
  { id: "promo_eid", code: "EID2026", description: "Eid beach break · 15% off Zanzibar stays", discountType: "pct", discountValue: 15, verticals: ["stay"], budgetMinor: 8_000_000, usedMinor: 0, usageLimit: 300, usedCount: 0, validFrom: iso(daysFromNow(20)), validTo: iso(daysFromNow(35)), status: "scheduled" },
  { id: "promo_old", code: "JULY5", description: "July flash sale", discountType: "pct", discountValue: 5, verticals: ["stay", "tour", "transfer", "flight"], budgetMinor: 2_000_000, usedMinor: 2_000_000, usageLimit: 200, usedCount: 200, validFrom: iso(daysFromNow(-60)), validTo: iso(daysFromNow(-30)), status: "expired" },
];

export const reviews: Review[] = [
  { id: "rev_1", productId: "prd_serena_lodge", supplierId: "sup_serena", authorName: "Charlotte W.", rating: 5, title: "Views to remember", body: "Sat on the terrace watching a storm roll across the plains. Staff were superb, food was better than expected for such a remote place.", status: "published", response: { text: "Asante sana Charlotte, karibu tena!", at: iso(daysFromNow(-20)) }, createdAt: iso(daysFromNow(-22)) },
  { id: "rev_2", productId: "prd_serena_lodge", supplierId: "sup_serena", authorName: "Juma K.", rating: 4, title: "Great base for Seronera", body: "Rooms are dated but clean. Pool is a highlight. Wi-Fi only in the lobby.", status: "published", createdAt: iso(daysFromNow(-9)) },
  { id: "rev_3", productId: "prd_serena_lodge", supplierId: "sup_serena", authorName: "Priya S.", rating: 5, title: "Honeymoon perfection", body: "The team set up a private dinner for us on the deck. Unforgettable.", status: "pending", createdAt: iso(daysFromNow(-1)) },
  { id: "rev_4", productId: "prd_zuri", supplierId: "sup_zanzibar", authorName: "Marco B.", rating: 5, title: "Best beach in Zanzibar", body: "Swimmable at all tides, which matters more than you think. Bungalow was huge.", status: "published", createdAt: iso(daysFromNow(-15)) },
  { id: "rev_5", productId: "prd_kubu_kubu", supplierId: "sup_kubu", authorName: "Hannah L.", rating: 4, title: "Leopard from the deck", body: "Actually saw a leopard from our tent deck. Shower water pressure could be better.", status: "published", createdAt: iso(daysFromNow(-33)) },
  { id: "rev_6", productId: "prd_tour_northern_7d", supplierId: "sup_kili_exp", authorName: "David O.", rating: 5, title: "Elias is the best guide", body: "Seven days, every big cat, and Elias knew every bird. Lodges were exactly as described.", status: "published", createdAt: iso(daysFromNow(-40)) },
  { id: "rev_7", productId: "prd_kubu_kubu", supplierId: "sup_kubu", authorName: "Anonymous", rating: 1, title: "Terrible", body: "spam link www.example.biz", status: "flagged", createdAt: iso(daysFromNow(-2)) },
];

export const tickets: Ticket[] = [
  { id: "tkt_1", reference: "TKT-10422", bookingReference: "AP-7K2M9", customerName: "Amina Hassan", customerPhone: "+255754123456", channel: "whatsapp", subject: "Can I add a night at Serena?", status: "open", priority: "normal", slaDueAt: iso(hoursFromNow(3)), assigneeName: "Zawadi Komba", messages: [
    { id: "m1", from: "customer", text: "Hi, we'd like to extend our Serengeti stay by one night if possible. Same room.", at: iso(hoursFromNow(-2)) },
    { id: "m2", from: "agent", text: "Hi Amina, checking availability with the lodge now. I'll come back within the hour.", at: iso(hoursFromNow(-1.5)) },
  ], createdAt: iso(hoursFromNow(-2)) },
  { id: "tkt_2", reference: "TKT-10419", bookingReference: "AP-3B8QX", customerName: "Ruth Mahenge", customerPhone: "+255713998877", channel: "phone", subject: "Money left M-Pesa but no confirmation", status: "pending", priority: "high", slaDueAt: iso(hoursFromNow(0.5)), assigneeName: "Zawadi Komba", messages: [
    { id: "m1", from: "agent", text: "Customer paid TZS 268,000 via M-Pesa ref RJ7X21LMQ, no callback received. Raised to reconciliation.", at: iso(hoursFromNow(-5)) },
  ], createdAt: iso(hoursFromNow(-5)) },
  { id: "tkt_3", reference: "TKT-10401", customerName: "Kevin Otieno", customerPhone: "+254722001122", channel: "email", subject: "Invoice for company expenses", status: "resolved", priority: "low", slaDueAt: iso(daysFromNow(-1)), assigneeName: "Zawadi Komba", messages: [
    { id: "m1", from: "customer", text: "Please send a VAT invoice for booking AP-9PL2W.", at: iso(daysFromNow(-2)) },
    { id: "m2", from: "agent", text: "Sent to your email, Kevin. Also downloadable from My Trips.", at: iso(daysFromNow(-2)) },
  ], createdAt: iso(daysFromNow(-2)) },
  { id: "tkt_4", reference: "TKT-10425", bookingReference: "AP-5RT7N", customerName: "Rehema Ngowi", customerPhone: "+255754222333", channel: "in_app", subject: "Approval still pending, hold expiring?", status: "open", priority: "high", slaDueAt: iso(hoursFromNow(1)), messages: [
    { id: "m1", from: "customer", text: "My approver is travelling. Will the hold expire before she approves?", at: iso(hoursFromNow(-0.5)) },
  ], createdAt: iso(hoursFromNow(-0.5)) },
];

export const contentPages: ContentPage[] = [
  { id: "cp_serengeti", kind: "destination", slug: "serengeti", title: "Serengeti", subtitle: "Endless plains, the great migration and the densest lion population on earth.", heroTone: "from-amber-700 via-orange-500 to-yellow-300", status: "published", blocks: [
    { id: "b1", type: "hero" },
    { id: "b2", type: "editorial", title: "When to go", body: "The wildebeest cross the Mara river July to October. The calving season in the south peaks in February. Green season (April to May) means fewer vehicles and lower rates." },
    { id: "b3", type: "rail", title: "Lodges and camps", productIds: ["prd_serena_lodge", "prd_kubu_kubu"] },
    { id: "b4", type: "rail", title: "Experiences", productIds: ["prd_tour_balloon", "prd_tour_northern_7d"] },
    { id: "b5", type: "faq", title: "Good to know", body: "Park fees are USD 70 per adult per 24 hours and are collected at the gate or added at checkout." },
  ], seo: { title: "Serengeti safaris, lodges and camps · Aeropath", description: "Book Serengeti lodges, tented camps and balloon safaris with all-in pricing and mobile money." }, updatedAt: iso(daysFromNow(-4)) },
  { id: "cp_zanzibar", kind: "destination", slug: "zanzibar", title: "Zanzibar", subtitle: "Spice island beaches, Stone Town alleys and dhow sunsets.", heroTone: "from-cyan-600 via-sky-400 to-teal-200", status: "published", blocks: [
    { id: "b1", type: "hero" },
    { id: "b2", type: "editorial", title: "North vs east coast", body: "Kendwa and Nungwi in the north are swimmable all day. The east coast has dramatic tides and kite surfing at Paje." },
    { id: "b3", type: "rail", title: "Where to stay", productIds: ["prd_zuri", "prd_ss_park_hyatt"] },
    { id: "b4", type: "rail", title: "Getting around", productIds: ["prd_xfer_znz_kendwa", "prd_car_zanzibar", "prd_tour_zanzibar_spice"] },
  ], seo: { title: "Zanzibar hotels and beach resorts · Aeropath", description: "Book Zanzibar beach resorts, Stone Town hotels, transfers and tours." }, updatedAt: iso(daysFromNow(-6)) },
  { id: "cp_arusha", kind: "destination", slug: "arusha", title: "Arusha & Kilimanjaro", subtitle: "Safari capital, gateway to the northern circuit and the roof of Africa.", heroTone: "from-emerald-800 via-emerald-600 to-lime-300", status: "published", blocks: [
    { id: "b1", type: "hero" },
    { id: "b3", type: "rail", title: "Stay", productIds: ["prd_gran_melia", "prd_kili_view"] },
    { id: "b4", type: "rail", title: "Climb and safari", productIds: ["prd_tour_kili_machame", "prd_tour_northern_7d"] },
    { id: "b5", type: "rail", title: "Transfers", productIds: ["prd_xfer_jro_arusha", "prd_xfer_arusha_serengeti"] },
  ], seo: { title: "Arusha hotels and Kilimanjaro climbs · Aeropath", description: "Hotels in Arusha, Kilimanjaro treks and airport transfers." }, updatedAt: iso(daysFromNow(-10)) },
  { id: "cp_ngorongoro", kind: "destination", slug: "ngorongoro", title: "Ngorongoro", subtitle: "The world's largest intact caldera, 25,000 animals in one view.", heroTone: "from-slate-800 via-slate-600 to-emerald-300", status: "published", blocks: [
    { id: "b1", type: "hero" },
    { id: "b3", type: "rail", title: "Lodges", productIds: ["prd_ngoro_lodge", "prd_ngoro_farmhouse"] },
  ], seo: { title: "Ngorongoro Crater lodges · Aeropath", description: "Crater rim lodges and Karatu farm stays." }, updatedAt: iso(daysFromNow(-12)) },
  { id: "cp_honeymoon", kind: "collection", slug: "bush-and-beach", title: "Bush & Beach", subtitle: "Serengeti mornings, Zanzibar afternoons. The honeymoon classic.", heroTone: "from-rose-500 via-orange-400 to-cyan-300", status: "published", blocks: [
    { id: "b1", type: "hero" },
    { id: "b2", type: "editorial", title: "How it fits together", body: "Three nights in the Serengeti, a bush plane to Zanzibar and four nights on Kendwa beach. We hold all legs together so a change to one updates the rest." },
    { id: "b3", type: "rail", title: "Bush", productIds: ["prd_kubu_kubu", "prd_serena_lodge"] },
    { id: "b4", type: "rail", title: "The link", productIds: ["prd_fl_seronera_znz"] },
    { id: "b5", type: "rail", title: "Beach", productIds: ["prd_zuri", "prd_ss_park_hyatt"] },
  ], seo: { title: "Bush and beach honeymoons · Aeropath", description: "Serengeti plus Zanzibar itineraries." }, updatedAt: iso(daysFromNow(-3)) },
  { id: "cp_family", kind: "collection", slug: "family-safaris", title: "Family safaris", subtitle: "Pools, family rooms and short driving days.", heroTone: "from-green-700 via-lime-500 to-yellow-200", status: "draft", blocks: [
    { id: "b1", type: "hero" },
    { id: "b3", type: "rail", title: "Family friendly stays", productIds: ["prd_ngoro_farmhouse", "prd_serena_lodge", "prd_gran_melia"] },
  ], seo: { title: "Family safaris in Tanzania · Aeropath", description: "" }, updatedAt: iso(daysFromNow(-1)) },
];

export const featureFlags: FeatureFlag[] = [
  { key: "checkout.new-review-layout", description: "Two column review and pay layout", kind: "release", enabled: true, expiresAt: iso(daysFromNow(20)) },
  { key: "checkout.insurance-placement-b", description: "Insurance card above extras vs below", kind: "experiment", enabled: false, expiresAt: iso(daysFromNow(40)) },
  { key: "overlay.agent", description: "Agent overlay enabled for organisation", kind: "permission", enabled: true },
  { key: "overlay.corporate", description: "Corporate overlay enabled for organisation", kind: "permission", enabled: true },
  { key: "payment.rail.mpesa", description: "M-Pesa rail", kind: "kill_switch", enabled: true },
  { key: "payment.rail.tigopesa", description: "Tigo Pesa rail", kind: "kill_switch", enabled: true },
  { key: "payment.rail.airtel", description: "Airtel Money rail", kind: "kill_switch", enabled: true },
  { key: "payment.rail.halopesa", description: "Halopesa rail", kind: "kill_switch", enabled: false },
  { key: "payment.rail.card", description: "Card rail", kind: "kill_switch", enabled: true },
  { key: "search.flights", description: "Flights vertical visible in search", kind: "release", enabled: true, expiresAt: iso(daysFromNow(90)) },
];

export const integrations: Integration[] = [
  { id: "int_mpesa", name: "Vodacom M-Pesa (Daraja)", kind: "payment", status: "healthy", lastCheckAt: iso(hoursFromNow(-0.05)), successRatePct: 96.4, keyMasked: "ck_live_••••7f3a" },
  { id: "int_tigo", name: "Tigo Pesa", kind: "payment", status: "degraded", lastCheckAt: iso(hoursFromNow(-0.05)), successRatePct: 88.1, keyMasked: "tp_••••91cc" },
  { id: "int_airtel", name: "Airtel Money", kind: "payment", status: "healthy", lastCheckAt: iso(hoursFromNow(-0.05)), successRatePct: 94.9, keyMasked: "am_••••2b10" },
  { id: "int_dpo", name: "DPO Pay (cards)", kind: "payment", status: "healthy", lastCheckAt: iso(hoursFromNow(-0.05)), successRatePct: 97.8, keyMasked: "dpo_••••e441" },
  { id: "int_typesense", name: "Typesense search", kind: "search", status: "healthy", lastCheckAt: iso(hoursFromNow(-0.02)), successRatePct: 99.9, keyMasked: "ts_••••0a9f" },
  { id: "int_beem", name: "Beem SMS", kind: "messaging", status: "healthy", lastCheckAt: iso(hoursFromNow(-0.1)), successRatePct: 99.2, keyMasked: "beem_••••55d2" },
  { id: "int_wa", name: "WhatsApp Business", kind: "messaging", status: "healthy", lastCheckAt: iso(hoursFromNow(-0.1)), successRatePct: 98.7, keyMasked: "wa_••••c8e0" },
  { id: "int_amadeus", name: "Flight aggregator (Duffel)", kind: "supplier", status: "down", lastCheckAt: iso(hoursFromNow(-0.3)), successRatePct: 71.0, keyMasked: "duffel_••••1122" },
  { id: "int_s3", name: "Object storage", kind: "storage", status: "healthy", lastCheckAt: iso(hoursFromNow(-0.02)), successRatePct: 100, keyMasked: "AKIA••••Q7ZL" },
];

export const notificationTemplates: NotificationTemplate[] = [
  { id: "nt_1", event: "booking.paid", channel: "sms", locale: "en", body: "Aeropath: payment of {amount} received for {ref}. We're confirming with {supplier}, usually under 2 hours." },
  { id: "nt_2", event: "booking.paid", channel: "sms", locale: "sw", body: "Aeropath: malipo ya {amount} yamepokelewa kwa {ref}. Tunathibitisha na {supplier}, kwa kawaida chini ya saa 2." },
  { id: "nt_3", event: "booking.confirmed", channel: "sms", locale: "en", body: "Aeropath: {ref} is confirmed! Voucher: {link}. Safari njema." },
  { id: "nt_4", event: "booking.confirmed", channel: "email", locale: "en", subject: "Your booking {ref} is confirmed", body: "Habari {name}, {supplier} has confirmed your booking. Your voucher is attached and available in My Trips." },
  { id: "nt_5", event: "booking.supplier_rejected", channel: "email", locale: "en", subject: "We couldn't confirm {ref} · full refund on its way", body: "Unfortunately {supplier} could not confirm. We've refunded {amount} automatically and our team will call with alternatives." },
  { id: "nt_6", event: "supplier.new_booking", channel: "whatsapp", locale: "en", body: "New booking {ref} for {product}, {dates}. Please confirm within 2 hours: {link}" },
  { id: "nt_7", event: "approval.requested", channel: "email", locale: "en", subject: "Approval needed · {requester} · {amount}", body: "{requester} has requested approval for a booking outside policy. Review: {link}" },
  { id: "nt_8", event: "payment.timeout", channel: "sms", locale: "en", body: "Aeropath: we haven't received your M-Pesa confirmation for {ref}. If money left your account, enter the reference here: {link}" },
];

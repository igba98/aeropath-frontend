"use client";

import * as React from "react";
import { nanoid } from "nanoid";
import { ClipboardPaste, CloudDownload, Keyboard, Loader2, RotateCw } from "lucide-react";

import type { Currency, FlightDetails, ID, LineDetailsByType, LineType, ServiceLine, SupplierKind, Traveller } from "@/domain/types";
import { can } from "@/domain/permissions";
import { isBelowCost, margin } from "@/domain/pricing";
import { describeLine } from "@/domain/describe";
import { updateServiceLine } from "@/domain/commands";
import { getProvider } from "@/providers";
import { snapshotToFlightDetails, autoMatchTravellers } from "@/providers/mappers/pnr-to-flight-line";
import { toProviderError, type ProviderError } from "@/providers/types";
import { getDb, useApp, useDispatch, useMe } from "@/store";
import { commitLineDraft, type LineDraft } from "@/lib/commit-line";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Banner, Field, FormSection } from "@/components/shared/field";
import { Combobox } from "@/components/shared/combobox";
import { MoneyInput } from "@/components/shared/money-input";
import { LINE_ICON, LINE_LABEL } from "@/components/shared/bits";
import { Segmented } from "@/components/shared/page";
import { DetailsForm, FlightManualForm, defaultDetails, validateDetails, type Errors } from "./line-forms";
import { PricingBlock, previewPricing, pricingDraftFrom, type PricingDraft } from "./pricing-block";
import { PnrPaste, PnrPreview, emptyPnrValue, pnrReady, type PnrPasteValue } from "./pnr-paste";

const KIND_FOR: Partial<Record<LineType, SupplierKind>> = {
  flight: "air_settlement",
  hotel: "hotel",
  car: "car_rental",
  transfer: "transfer",
  tour: "tour",
  visa: "visa",
  insurance: "insurance",
};

const TYPES: LineType[] = ["flight", "hotel", "transfer", "car", "tour", "visa", "insurance", "service_fee", "other"];

type FlightMode = "paste" | "fetch" | "manual";

export interface LineDrawerProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  clientId: ID;
  fileCurrency: Currency;
  /** Travellers the agent can attach (the client's travellers). */
  travellers: Traveller[];
  /** Pre-ticked travellers (the file's). */
  defaultTravellerIds: ID[];
  dates?: { start?: string; end?: string };
  /** Save straight onto this booking… */
  fileId?: ID;
  /** …or hand the draft back (new-booking wizard). */
  onDraft?: (d: LineDraft) => void;
  /** Edit an existing line (file mode only). */
  line?: ServiceLine;
  initialType?: LineType;
  initialFlightMode?: FlightMode;
  /** Reopen a wizard draft for editing (same key is kept). */
  initialDraft?: LineDraft;
  /** Start from a PNR already pasted elsewhere (wizard step 1). */
  initialPnr?: PnrPasteValue;
}

export function LineDrawer(props: LineDrawerProps) {
  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent className="sm:max-w-[760px]">{props.open && <LineDrawerBody {...props} />}</SheetContent>
    </Sheet>
  );
}

function LineDrawerBody({ onOpenChange, fileCurrency, travellers, defaultTravellerIds, dates, fileId, onDraft, line, initialType, initialFlightMode, initialDraft, initialPnr }: LineDrawerProps) {
  const me = useMe();
  const dispatch = useDispatch();
  const settings = useApp((s) => s.db!.settings);
  const suppliers = useApp((s) => s.db!.suppliers);
  const editing = Boolean(line) || Boolean(initialDraft);
  const editable = !line || line.status === "quoted" || line.status === "booked";

  const startType: LineType = initialDraft?.type ?? line?.type ?? (initialPnr ? "flight" : initialType) ?? "flight";
  const [type, setType] = React.useState<LineType>(startType);
  const [flightMode, setFlightMode] = React.useState<FlightMode>(
    initialPnr || initialDraft?.pnr ? (initialDraft?.pnr?.fetched ? "fetch" : "paste") : line?.type === "flight" || (initialDraft && initialDraft.type === "flight") ? "manual" : (initialFlightMode ?? "paste"),
  );
  const [pnr, setPnr] = React.useState<PnrPasteValue>(() => {
    const v = initialPnr ?? (initialDraft?.pnr ? { text: initialDraft.pnr.snapshot.raw, snapshot: initialDraft.pnr.snapshot, map: initialDraft.pnr.map } : emptyPnrValue);
    if (!v.snapshot) return v;
    // The PNR may have been pasted before the client was known: match its passengers now.
    const auto = autoMatchTravellers(v.snapshot.passengers, travellers);
    const map = { ...v.map };
    for (const p of v.snapshot.passengers) if (!map[p.pnrPaxNo] || map[p.pnrPaxNo] === "new") map[p.pnrPaxNo] = auto[p.pnrPaxNo] ?? "new";
    return { ...v, map };
  });
  const [pnrFare, setPnrFare] = React.useState<{ currency: Currency; minor: number | null }>(() =>
    initialDraft?.pnr?.fare ? { currency: initialDraft.pnr.fare.currency, minor: initialDraft.pnr.fare.totalFare.amountMinor } : { currency: "USD", minor: null },
  );
  const [fetched, setFetched] = React.useState(Boolean(initialDraft?.pnr?.fetched));
  const [locator, setLocator] = React.useState("");
  const [fetchState, setFetchState] = React.useState<{ loading: boolean; error?: ProviderError }>({ loading: false });
  const pax = defaultTravellerIds.length || 1;

  const initialDetails = React.useCallback(
    (t: LineType) => (line && line.type === t ? structuredClone(line.details) : defaultDetails(t, { start: dates?.start, end: dates?.end, pax, settings })),
    [line, dates?.start, dates?.end, pax, settings],
  );
  const [details, setDetails] = React.useState<LineDetailsByType[LineType]>(() => (initialDraft && !initialDraft.pnr ? structuredClone(initialDraft.details) : initialDetails(startType)));

  const supplierOptionsFor = React.useCallback(
    (t: LineType) => {
      const kind = KIND_FOR[t];
      return Object.values(suppliers)
        .filter((s) => s.active || s.id === line?.supplierId)
        .filter((s) => !kind || s.kind === kind)
        .sort((a, b) => a.name.localeCompare(b.name));
    },
    [suppliers, line?.supplierId],
  );
  const defaultSupplier = React.useCallback(
    (t: LineType) => {
      if (t === "flight") return settings.airSettlement.supplierId;
      const opts = supplierOptionsFor(t);
      if (opts.length === 1) return opts[0].id;
      return opts.find((s) => s.kind === "other")?.id ?? opts[0]?.id;
    },
    [settings.airSettlement.supplierId, supplierOptionsFor],
  );
  const [supplierId, setSupplierId] = React.useState<ID | undefined>(initialDraft?.supplierId ?? line?.supplierId ?? defaultSupplier(startType));
  const [travellerIds, setTravellerIds] = React.useState<ID[]>(initialDraft?.travellerIds.length ? initialDraft.travellerIds : (line?.travellerIds ?? defaultTravellerIds));
  const [pricing, setPricing] = React.useState<PricingDraft>(() => {
    const supCur = supplierId ? suppliers[supplierId]?.currency : undefined;
    return pricingDraftFrom(initialDraft?.pricing ?? line?.pricing, supCur ?? fileCurrency, startType, settings);
  });
  const [notes, setNotes] = React.useState(initialDraft?.notes ?? line?.notes ?? "");
  const [markBooked, setMarkBooked] = React.useState(initialDraft ? initialDraft.status === "booked" : line ? line.status === "booked" : false);
  const [errors, setErrors] = React.useState<Errors>({});
  const [saving, setSaving] = React.useState(false);

  const changeType = (t: LineType) => {
    setType(t);
    setDetails(initialDetails(t));
    const sid = defaultSupplier(t);
    setSupplierId(sid);
    const supCur = sid ? suppliers[sid]?.currency : undefined;
    setPricing(pricingDraftFrom(undefined, supCur ?? fileCurrency, t, settings));
    setErrors({});
  };

  // Flight fare in play (for pricing): from the PNR, or the manual form.
  const pnrBase: FlightDetails | null = React.useMemo(
    () => (type === "flight" && flightMode !== "manual" && pnr.snapshot ? snapshotToFlightDetails(pnr.snapshot, { travellerMap: {}, airlines: settings.airlines }) : null),
    [type, flightMode, pnr.snapshot, settings.airlines],
  );
  /** A PNR display only carries a fare once ticketed (FA lines); before that the agent types it from the pricing. */
  const pnrHasFare = Boolean(pnrBase && pnrBase.fare.totalFare.amountMinor > 0);
  const pnrDetails: FlightDetails | null = React.useMemo(() => {
    if (!pnrBase || pnrHasFare || !pnrFare.minor) return pnrBase;
    const total = { amountMinor: pnrFare.minor, currency: pnrFare.currency };
    return { ...pnrBase, fare: { ...pnrBase.fare, currency: pnrFare.currency, baseFare: total, taxes: [], totalFare: total } };
  }, [pnrBase, pnrHasFare, pnrFare]);
  const fare = type === "flight" ? (pnrDetails ? pnrDetails.fare : (details as FlightDetails).fare) : undefined;
  const preview = previewPricing(pricing, type, settings, fare);

  const doFetch = async () => {
    const loc = locator.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(loc)) {
      setFetchState({ loading: false });
      setErrors({ locator: "A record locator is 6 letters or digits, e.g. Z8K4QM." });
      return;
    }
    setErrors({});
    setFetchState({ loading: true });
    try {
      const snapshot = await getProvider(settings).retrievePnr(loc);
      const auto = autoMatchTravellers(snapshot.passengers, travellers);
      const map: PnrPasteValue["map"] = {};
      for (const p of snapshot.passengers) map[p.pnrPaxNo] = auto[p.pnrPaxNo] ?? "new";
      setPnr({ text: snapshot.raw, snapshot, map });
      setFetched(true);
      setFetchState({ loading: false });
    } catch (e) {
      setFetchState({ loading: false, error: toProviderError(e) });
    }
  };

  const validate = (): Errors => {
    const e: Errors = {};
    if (!editable) return e;
    if (type === "flight" && flightMode !== "manual") {
      if (!pnrReady(pnr)) e.pnr = flightMode === "fetch" ? "Fetch a booking first." : "Paste a PNR with a record locator, passengers and flights.";
      else if (!pnrHasFare && !pnrFare.minor) e.pnrFare = "Enter the total fare from the Amadeus pricing (FXP) so the price is right.";
    } else {
      Object.assign(e, validateDetails(type, details));
      if (type === "flight" && markBooked && !(details as FlightDetails).recordLocator) e.recordLocator = "Enter the record locator to mark it booked.";
    }
    if (type !== "flight" && !supplierId) e.supplier = "Pick the supplier.";
    if (type !== "flight" && type !== "service_fee" && (pricing.costMinor === null || pricing.costMinor < 0)) e.cost = "Enter the net cost (0 if none).";
    if (type !== "flight" && type !== "service_fee" && type !== "other" && type !== "visa" && type !== "insurance" && !travellerIds.length) e.travellers = "Tick at least one traveller.";
    if (isBelowCost(preview)) {
      if (!can(me, "line.price_below_cost")) e.markup = "Only a Manager can sell below cost.";
      else if (!pricing.overrideReason.trim()) e.overrideReason = "Give a reason for selling below cost.";
    }
    return e;
  };

  const submit = (ev?: React.FormEvent) => {
    ev?.preventDefault();
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true);

    const cur = preview.currency;
    const pricingInput = {
      currency: cur,
      cost: type === "flight" ? undefined : { amountMinor: type === "service_fee" ? 0 : (pricing.costMinor ?? 0), currency: cur },
      markup: { amountMinor: type === "service_fee" ? 0 : (pricing.markupMinor ?? 0), currency: cur },
      serviceFee: { amountMinor: pricing.serviceFeeMinor ?? 0, currency: cur },
    };

    // Editing an existing line in place.
    if (line && fileId) {
      if (type === "flight" && flightMode !== "manual" && pnr.snapshot) {
        const id = commitLineDraft(dispatch, getDb, fileId, buildDraft(pricingInput), { lineId: line.id });
        setSaving(false);
        if (id) onOpenChange(false);
        return;
      }
      const r = dispatch(updateServiceLine, {
        lineId: line.id,
        patch: editable ? { supplierId, travellerIds: type === "flight" ? (details as FlightDetails).passengers.map((p) => p.travellerId) : travellerIds, details, pricing: pricingInput, notes: notes || undefined } : { notes: notes || undefined },
        overrideReason: pricing.overrideReason || undefined,
      });
      setSaving(false);
      if (r.ok) onOpenChange(false);
      return;
    }

    const draft = buildDraft(pricingInput);
    if (onDraft) {
      onDraft(draft);
      setSaving(false);
      onOpenChange(false);
      return;
    }
    if (fileId) {
      const id = commitLineDraft(dispatch, getDb, fileId, draft);
      setSaving(false);
      if (id) onOpenChange(false);
    }
  };

  function buildDraft(pricingInput: LineDraft["pricing"]): LineDraft {
    const isPnr = type === "flight" && flightMode !== "manual" && pnr.snapshot;
    const d = isPnr ? pnrDetails! : details;
    const tIds = type === "flight" ? (isPnr ? [] : (details as FlightDetails).passengers.map((p) => p.travellerId)) : travellerIds;
    return {
      key: initialDraft?.key ?? nanoid(8),
      type,
      supplierId,
      travellerIds: tIds,
      details: d,
      pricing: pricingInput,
      status: type === "flight" && !isPnr ? (markBooked ? "booked" : "quoted") : markBooked ? "booked" : "quoted",
      source: isPnr && fetched ? "amadeus" : "manual",
      notes: notes || undefined,
      overrideReason: pricing.overrideReason || undefined,
      pnr: isPnr ? { snapshot: pnr.snapshot!, map: pnr.map, fetched, fare: pnrHasFare ? undefined : pnrDetails?.fare } : undefined,
      summary: {
        description: describeLine(type, d as never),
        sell: preview.sell,
        cost: preview.cost,
        margin: margin(preview),
        vat: preview.vat,
        serviceFee: preview.serviceFee,
        markup: preview.markup,
      },
    };
  }

  const amadeusOn = settings.integrations.amadeus.mode !== "off";
  const supplierOptions = supplierOptionsFor(type).map((s) => ({ value: s.id, label: s.name, hint: s.currency }));
  const Icon = LINE_ICON[type];
  const pnrMode = type === "flight" && flightMode !== "manual";

  return (
    <form onSubmit={submit} className="flex h-full min-h-0 flex-col" noValidate>
      <SheetHeader>
        <SheetTitle className="flex items-center gap-2">
          <Icon className="size-4 text-ink-3" />
          {editing ? `Edit ${LINE_LABEL[type].toLowerCase()}` : "Add a service"}
        </SheetTitle>
        <SheetDescription>
          {line ? line.description : initialDraft ? initialDraft.summary.description : "Everything saves onto the booking; totals update as you type."}
        </SheetDescription>
      </SheetHeader>

      <SheetBody className="space-y-5">
        {!line && !initialDraft && (
          <div role="radiogroup" aria-label="Service type" className="grid grid-cols-3 gap-1.5 sm:grid-cols-9">
            {TYPES.map((t) => {
              const I = LINE_ICON[t];
              const on = t === type;
              return (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => changeType(t)}
                  className={cn(
                    "flex h-14 flex-col items-center justify-center gap-1 rounded-lg border text-xs font-semibold transition-colors",
                    on ? "border-primary bg-band text-brand-700 ring-1 ring-primary dark:text-brand-200" : "border-rule-2 text-ink-2 hover:border-ink-4/50 hover:bg-band-hover hover:text-ink",
                  )}
                >
                  <I className="size-4" />
                  {LINE_LABEL[t]}
                </button>
              );
            })}
          </div>
        )}

        {!editable && (
          <Banner tone="info" title={`This line is ${line!.status.replace("_", " ")}`}>
            Issued and closed lines can&apos;t be changed. Use Void, Request refund or Request exchange on the booking instead. You can still edit the note.
          </Banner>
        )}

        {editable && type === "flight" && (
          <div className="space-y-4">
            <Segmented<FlightMode>
              label="How to add the flight"
              value={flightMode}
              onChange={(m) => {
                setFlightMode(m);
                setErrors({});
              }}
              options={[
                { value: "paste", label: <span className="inline-flex items-center gap-1.5"><ClipboardPaste className="size-3.5" /> {editing ? "Re-paste PNR" : "Paste PNR"}</span> },
                {
                  value: "fetch",
                  label: amadeusOn ? (
                    <span className="inline-flex items-center gap-1.5">
                      <CloudDownload className="size-3.5" /> Fetch from Amadeus
                    </span>
                  ) : (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-flex items-center gap-1.5 opacity-50">
                          <CloudDownload className="size-3.5" /> Fetch from Amadeus
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>Amadeus is off. A Manager can turn on Mock in Settings → Integrations.</TooltipContent>
                    </Tooltip>
                  ),
                },
                { value: "manual", label: <span className="inline-flex items-center gap-1.5"><Keyboard className="size-3.5" /> Enter manually</span> },
              ]}
            />

            {flightMode === "paste" && (
              <PnrPaste
                value={pnr}
                onChange={(v) => {
                  setPnr(v);
                  setFetched(false);
                }}
                travellers={travellers}
                autoFocus
              />
            )}

            {flightMode === "fetch" &&
              (!amadeusOn ? (
                <Banner tone="info" title="Amadeus isn't connected">
                  A Manager can switch Settings → Integrations to Mock to demo this. Until then, paste the PNR or enter the flight manually.
                </Banner>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-end gap-2">
                    <Field label="Record locator" htmlFor="fetch-loc" error={errors.locator} className="w-44">
                      <Input
                        id="fetch-loc"
                        value={locator}
                        autoFocus
                        maxLength={6}
                        placeholder="Z8K4QM"
                        onChange={(e) => setLocator(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            void doFetch();
                          }
                        }}
                        className="font-mono text-[15px] tracking-wider"
                      />
                    </Field>
                    <Button type="button" variant="outline" onClick={() => void doFetch()} disabled={fetchState.loading}>
                      {fetchState.loading ? <Loader2 className="animate-spin" /> : <CloudDownload />}
                      {fetchState.loading ? "Fetching…" : "Fetch"}
                    </Button>
                    <span className="ml-auto self-center text-xs text-ink-3">
                      Mode: {settings.integrations.amadeus.mode === "mock" ? "Mock" : "Live"} · {settings.integrations.amadeus.environment}
                    </span>
                  </div>
                  {fetchState.error && (
                    <Banner
                      tone="error"
                      title={
                        { NOT_FOUND: "Booking not found", TIMEOUT: "Amadeus timed out", AUTH: "Amadeus rejected our login", NOT_SUPPORTED: "Not available", UNKNOWN: "Couldn't fetch" }[fetchState.error.code]
                      }
                      action={
                        <div className="flex flex-wrap gap-2">
                          <Button type="button" size="sm" variant="outline" onClick={() => void doFetch()}>
                            <RotateCw /> Retry
                          </Button>
                          <Button type="button" size="sm" variant="outline" onClick={() => setFlightMode("paste")}>
                            Paste PNR instead
                          </Button>
                          <Button type="button" size="sm" variant="outline" onClick={() => setFlightMode("manual")}>
                            Enter manually instead
                          </Button>
                        </div>
                      }
                    >
                      {fetchState.error.message}
                    </Banner>
                  )}
                  {fetched && pnr.snapshot && <PnrPreview value={pnr} onChange={setPnr} travellers={travellers} />}
                </div>
              ))}

            {flightMode === "manual" && (
              <FlightManualForm value={details as FlightDetails} onChange={setDetails} errors={errors} travellers={travellers} airlines={settings.airlines} />
            )}
            {errors.pnr && <p className="text-[13px] text-[var(--st-red-fg)]">{errors.pnr}</p>}
          </div>
        )}

        {editable && type !== "flight" && (
          <>
            <FormSection title="Details">
              <DetailsForm type={type} value={details} onChange={setDetails} errors={errors} />
            </FormSection>
            <FormSection title="Travellers" description={travellers.length ? undefined : "Add travellers to the booking to attach them."}>
              {travellers.length > 0 && (
                <ul className="flex flex-wrap gap-x-5 gap-y-2">
                  {travellers.map((t) => (
                    <li key={t.id} className="flex items-center gap-2">
                      <Checkbox
                        id={`lt-${t.id}`}
                        checked={travellerIds.includes(t.id)}
                        onCheckedChange={(v) => setTravellerIds((ids) => (v === true ? [...ids, t.id] : ids.filter((x) => x !== t.id)))}
                      />
                      <label htmlFor={`lt-${t.id}`} className="text-sm">
                        {t.givenName} {t.surname} <span className="text-[13px] text-ink-3">{t.paxType}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
              {errors.travellers && <p className="mt-1 text-[13px] text-[var(--st-red-fg)]">{errors.travellers}</p>}
            </FormSection>
          </>
        )}

        {editable && (
          <FormSection title="Supplier and price">
            <div className="space-y-4">
              {pnrMode && pnr.snapshot && !pnrHasFare && (
                <Field
                  label="Total fare, all passengers"
                  htmlFor="pnr-fare"
                  required
                  error={errors.pnrFare}
                  hint="Not ticketed yet, so the PNR has no fare. Take it from the Amadeus pricing (FXP/TQT); it updates from the FA lines when you issue."
                >
                  <MoneyInput id="pnr-fare" value={pnrFare.minor} onChange={(m) => setPnrFare((f) => ({ ...f, minor: m }))} currency={pnrFare.currency} onCurrencyChange={(c) => setPnrFare((f) => ({ ...f, currency: c }))} invalid={Boolean(errors.pnrFare)} />
                </Field>
              )}
              <Field label="Supplier" required={type !== "flight"} error={errors.supplier} hint={type === "flight" ? "Ticket money goes to the air settlement supplier." : undefined}>
                <Combobox
                  value={supplierId}
                  onChange={(v) => {
                    setSupplierId(v);
                    const c = suppliers[v]?.currency;
                    if (c && type !== "flight" && pricing.costMinor === null) setPricing((p) => ({ ...p, currency: c }));
                  }}
                  options={supplierOptions}
                  placeholder="Pick a supplier"
                  invalid={Boolean(errors.supplier)}
                />
              </Field>
              {(!pnrMode || pnr.snapshot) && (
                <PricingBlock type={type} value={pricing} onChange={setPricing} settings={settings} user={me} fare={fare} errors={errors} />
              )}
            </div>
          </FormSection>
        )}

        {editable && !pnrMode && !line && (
          <label className="flex items-start gap-2.5 text-sm">
            <Switch checked={markBooked} onCheckedChange={setMarkBooked} className="mt-0.5" />
            <span>
              <span className="font-medium text-ink">Already confirmed with the supplier</span>
              <span className="block text-[13px] text-ink-3">
                Saves as Booked instead of Quoted.{type === "flight" ? " Needs the record locator and a confirmed (HK/KK/TK) segment." : ""}
              </span>
            </span>
          </label>
        )}

        <Field label="Note" htmlFor="line-notes" optional>
          <Textarea id="line-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Internal; not printed" />
        </Field>
      </SheetBody>

      <SheetFooter>
        <div className="mr-auto hidden text-[13.5px] text-ink-3 sm:block">
          {editable && (!pnrMode || pnr.snapshot) && (
            <>
              Sells for <span className="tnum font-semibold text-ink">{preview.currency} {(preview.sell.amountMinor / 100).toLocaleString("en-US", { minimumFractionDigits: preview.currency === "USD" ? 2 : 0, maximumFractionDigits: preview.currency === "USD" ? 2 : 0 })}</span>
            </>
          )}
        </div>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button type="submit" loading={saving}>
          {line || initialDraft ? "Save changes" : onDraft ? "Add to booking" : "Add service"}
        </Button>
      </SheetFooter>
    </form>
  );
}

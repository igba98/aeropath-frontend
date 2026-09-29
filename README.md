# Aeropath back office

Staff-only back office for Aeropath Travel, an air-ticketing agency in Dar es Salaam: bookings, payments, suppliers, expenses and reports. This is a **frontend prototype with no database**. All state lives in the browser (`localStorage`, key `aeropath-bo-v1`), but the domain logic is written so a real database and the Amadeus Enterprise APIs can be plugged in later without rewriting screens.

The full build spec is in [`aeropath-backoffice-spec.md`](aeropath-backoffice-spec.md). Product context is in [`PRODUCT.md`](PRODUCT.md).

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # vitest: domain, PNR parser, providers, seed
```

Sign in with any demo user from the login page (any password works):

| User | Role |
|---|---|
| Neema Mushi, Baraka Lema | Agent |
| Peter Mwakalinga | Accountant |
| Grace Kimaro | Manager |

A Manager can reset everything to the seed from **Settings → Demo data**.

## Shortcuts

`N` new booking · `P` record payment · `/` or `⌘K` search (file no., client, phone, surname, PNR, ticket, receipt).

## How it's built

- `src/domain/`: pure TypeScript business rules: types, money (integer minor units), pricing and VAT, the service-line state machine, derived file and payment status, a double-entry ledger, permissions, and one **command** per state change. Screens never mutate state; they `dispatch(command, input)`.
- `src/providers/`: where Amadeus plugs in. `manual` (default), `amadeus-mock` (fixtures with latency and failure modes), the PNR paste parser, and the snapshot → flight line mapper. `amadeus/README.md` describes the real adapter.
- `src/store/`: the zustand store (`dispatch`, session, persistence) and the deterministic seed, which is built by running the real commands.
- `src/app/(app)/`: the signed-in screens. `src/app/print/`: A4 documents (invoice, quote, receipt, itinerary, statement).
- `src/components/`: `ui/` primitives, `shared/` building blocks (data table, status chip, amount, money input, combobox…), and feature folders.

The visual system ("Timetable Grid") lives in `src/app/globals.css` as CSS variables for light and dark mode.

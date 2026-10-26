// src/components/admin/CompleteVisitModal.tsx
// The confirm-and-edit step for marking a visit complete.
//
// This single screen is doing a lot of work on purpose. Rather than building separate flows for
// "custom amount not set yet", "parking isn't the usual $25", "this free visit should carry a
// parking charge" and "I'm not ready to invoice", every figure is editable here and there is one
// opt-out. That collapses four workflows into one, and means the defaults can reproduce the legacy
// system's behaviour exactly while a human stays free to disagree with any of them.
//
// It is also the irreversibility warning. Sending an invoice puts a bill in someone's inbox and
// cannot be unsent, so the button says exactly what will happen and to whom before it is pressed.

'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, FileText, AlertTriangle, Plus, Trash2, Info } from 'lucide-react';

interface LineItem {
  description: string;
  detail?: string | null;
  rate: number;
  quantity: number;
  amount: number;
}

interface Preview {
  visit: { id: number; title: string | null; visit_date: string; status: string };
  contactName: string;
  lineItems: LineItem[];
  total: number;
  feeTier: string | null;
  billToName: string;
  billToAddress: string | null;
  recipients: { to: string | null; cc: string[]; all: string[] };
  blockers: ('no_fee_tier' | 'custom_amount_missing' | 'no_recipient')[];
  isFreeVisit: boolean;
  existingInvoice: { invoice_number: number; status: string; total: number } | null;
}

interface Props {
  visitId: number;
  onClose: () => void;
  onCompleted: (message: string | null) => void;
}

const money = (n: number) =>
  n.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function CompleteVisitModal({ visitId, onClose, onCompleted }: Props) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [skipInvoice, setSkipInvoice] = useState(false);
  const [note, setNote] = useState('');
  const [notifyVolunteers, setNotifyVolunteers] = useState(true);

  // Recipients are editable here rather than only on the org profile. The profile is the more
  // "correct" place to fix a missing address, but it's two screens away from where the problem
  // becomes visible, and an admin who is mid-completion shouldn't have to abandon the task to
  // solve it. Addresses added here are also persisted to the organization, so the correct path
  // happens as a side effect of the convenient one.
  const [recipients, setRecipients] = useState<string[]>([]);
  const [addedEmails, setAddedEmails] = useState<string[]>([]);
  const [newRecipient, setNewRecipient] = useState('');
  const [recipientError, setRecipientError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/admin/visits/${visitId}/invoice-preview`);
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(json.error || 'Could not load the invoice preview.');
          return;
        }
        setPreview(json);
        setLineItems(json.lineItems);
        setRecipients(json.recipients.all ?? []);
        // Already invoiced, or genuinely free — either way there's nothing to issue, and the
        // checkbox would only invite someone to turn off something that isn't happening.
        if (json.existingInvoice || json.isFreeVisit) setSkipInvoice(true);
      } catch {
        if (!cancelled) setError('Could not load the invoice preview.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [visitId]);

  const total = lineItems.reduce((sum, li) => sum + (Number(li.amount) || 0), 0);

  const setItem = (i: number, patch: Partial<LineItem>) =>
    setLineItems(prev => prev.map((li, idx) => {
      if (idx !== i) return li;
      const next = { ...li, ...patch };
      // Every sample invoice is quantity 1, so the amount *is* the rate. Keeping them in step
      // means someone editing the amount never produces a PDF whose columns disagree.
      if (patch.amount !== undefined) next.rate = patch.amount;
      return next;
    }));

  const addLine = () =>
    setLineItems(prev => [...prev, { description: '', rate: 0, quantity: 1, amount: 0 }]);

  const removeLine = (i: number) =>
    setLineItems(prev => prev.filter((_, idx) => idx !== i));

  const addRecipient = () => {
    const email = newRecipient.trim().toLowerCase();
    if (!email) return;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setRecipientError('That doesn’t look like an email address.');
      return;
    }
    if (recipients.some(e => e.toLowerCase() === email)) {
      setRecipientError('That address is already on the list.');
      return;
    }
    setRecipients(prev => [...prev, email]);
    setAddedEmails(prev => [...prev, email]);
    setNewRecipient('');
    setRecipientError(null);
  };

  const removeRecipient = (email: string) => {
    setRecipients(prev => prev.filter(e => e !== email));
    setAddedEmails(prev => prev.filter(e => e !== email));
  };

  const willInvoice = !skipInvoice && !preview?.existingInvoice && !preview?.isFreeVisit;
  const needsAmount = willInvoice && lineItems.some(li => !li.description.trim() || !(li.amount > 0));

  const submit = async () => {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/visits/${visitId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          internal_note: note,
          notify_volunteers: notifyVolunteers,
          invoice: willInvoice
            ? {
                line_items: lineItems,
                fee_tier: preview.feeTier,
                recipient_to: recipients[0] ?? null,
                recipient_cc: recipients.slice(1),
                added_emails: addedEmails,
              }
            : null,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Could not complete the visit.');
        return;
      }
      // The visit completed even if the invoice didn't. Pass the warning up rather than
      // swallowing it — "done" and "done, but the email failed" are different outcomes.
      onCompleted(json.invoice?.warning ?? (json.note_saved === false ? 'Visit completed, but the note could not be saved.' : null));
    } catch {
      setError('Could not complete the visit.');
    } finally {
      setBusy(false);
    }
  };

  const inputClass = 'border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-500';

  // Rendered into document.body rather than in place. `position: fixed` resolves against the
  // nearest ancestor with a transform, filter or backdrop-filter rather than the viewport — and
  // this modal is mounted deep inside the visit detail tree, so the backdrop was anchoring to the
  // dashboard's content column and sitting offset beside the sidebar instead of covering the
  // screen. A portal removes the dependency on whatever styling an ancestor happens to carry.
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4"
      onClick={e => { if (e.target === e.currentTarget && !busy) onClose(); }}
    >
      <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-xl max-h-[90dvh] flex flex-col">

        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            <FileText size={20} className="text-green-600" />
            <h2 className="text-lg font-bold text-gray-900">Mark visit complete</h2>
          </div>
          <button onClick={onClose} disabled={busy}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition disabled:opacity-40">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 overflow-y-auto space-y-5">
          {loading && <p className="text-sm text-gray-500">Loading…</p>}

          {error && (
            <div className="flex gap-2 bg-red-50 border border-red-200 rounded-lg p-3">
              <AlertTriangle size={16} className="text-red-600 shrink-0 mt-0.5" />
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {preview && (
            <>
              {preview.existingInvoice && (
                <div className="flex gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-sm text-amber-900">
                    This visit was already invoiced — <strong>#{preview.existingInvoice.invoice_number}</strong> for
                    ${money(preview.existingInvoice.total)}. Completing it again will not send another invoice.
                  </p>
                </div>
              )}

              {preview.isFreeVisit && !preview.existingInvoice && (
                <div className="flex gap-2 bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <Info size={16} className="text-blue-600 shrink-0 mt-0.5" />
                  <p className="text-sm text-blue-900">
                    <strong>Free visit</strong> — no invoice will be raised. {preview.billToName} will receive a
                    thank-you email with a donation request.
                  </p>
                </div>
              )}

              {preview.blockers.includes('no_fee_tier') && !preview.isFreeVisit && (
                <div className="flex gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-sm text-amber-900">
                    This visit has <strong>no fee tier set</strong>, so there is no amount to bill. Enter one below,
                    or tick &ldquo;don&rsquo;t invoice&rdquo; and raise it later.
                  </p>
                </div>
              )}

              {preview.blockers.includes('custom_amount_missing') && (
                <div className="flex gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-sm text-amber-900">
                    This is a <strong>custom-amount</strong> visit and no amount was set. Enter it below.
                  </p>
                </div>
              )}

              {/* ── Invoice editor ── */}
              {/* The opt-out sits outside the editor rather than inside it, so it stays usable
                  while the editor is dimmed. */}
              {!preview.existingInvoice && !preview.isFreeVisit && (
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={skipInvoice}
                    onChange={e => setSkipInvoice(e.target.checked)}
                    className="rounded border-gray-300 text-green-600 focus:ring-green-500" />
                  Don&rsquo;t invoice this visit
                </label>
              )}

              {!preview.existingInvoice && !preview.isFreeVisit && !skipInvoice && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Invoice</p>

                  <div className="space-y-2">
                    {lineItems.map((li, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <div className="flex-1">
                          <input
                            className={`${inputClass} w-full`}
                            value={li.description}
                            onChange={e => setItem(i, { description: e.target.value })}
                            placeholder="Description"
                          />
                          {li.detail && <p className="text-xs text-gray-400 mt-1 ml-1">{li.detail}</p>}
                        </div>
                        <div className="relative w-28 shrink-0">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
                          <input
                            type="number" min="0" step="0.01"
                            className={`${inputClass} w-full pl-6 text-right`}
                            value={li.amount}
                            onChange={e => setItem(i, { amount: parseFloat(e.target.value) || 0 })}
                          />
                        </div>
                        <button
                          onClick={() => removeLine(i)}
                          aria-label="Remove line"
                          className="p-2 mt-0.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition shrink-0"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between mt-3">
                    <button onClick={addLine}
                      className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 hover:text-blue-700">
                      <Plus size={15} /> Add line
                    </button>
                    <p className="text-base font-bold text-gray-900">Total ${money(total)}</p>
                  </div>

                  <div className="mt-4 bg-gray-50 rounded-lg p-3">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Sending to</p>

                    {recipients.length === 0 && (
                      <p className="text-sm text-amber-800 mb-2">
                        No email address on file for {preview.billToName}. Add one below to send this invoice now —
                        otherwise it will be created and saved, but not sent.
                      </p>
                    )}

                    {recipients.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {recipients.map((email, i) => (
                          <span key={email}
                            className="inline-flex items-center gap-1 bg-white border border-gray-200 rounded-full pl-2.5 pr-1 py-1 text-xs text-gray-800">
                            {i === 0
                              ? <strong className="font-semibold">{email}</strong>
                              : <>{email}<span className="text-gray-400">cc</span></>}
                            <button onClick={() => removeRecipient(email)} aria-label={`Remove ${email}`}
                              className="p-0.5 rounded-full text-gray-400 hover:text-red-600 hover:bg-red-50">
                              <X size={12} />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="flex gap-2">
                      <input
                        type="email"
                        className={`${inputClass} flex-1 bg-white`}
                        value={newRecipient}
                        onChange={e => { setNewRecipient(e.target.value); setRecipientError(null); }}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addRecipient(); } }}
                        placeholder="Add another email address"
                      />
                      <button onClick={addRecipient} disabled={!newRecipient.trim()}
                        className="px-3 py-2 text-sm font-semibold text-blue-600 hover:text-blue-700 disabled:opacity-40 disabled:hover:text-blue-600">
                        Add
                      </button>
                    </div>
                    {recipientError && <p className="text-xs text-red-600 mt-1">{recipientError}</p>}
                    <p className="text-xs text-gray-400 mt-1.5">
                      The first address is the main recipient; the rest are copied. New addresses are saved to
                      this organization for future visits.
                    </p>
                  </div>

                </div>
              )}

              {/* ── Internal note ── */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                  Internal note <span className="font-medium text-gray-400 normal-case">Optional</span>
                </label>
                <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
                  className={`${inputClass} w-full resize-y`}
                  placeholder="How did the visit go? Any follow-ups or notes for next time…" />
              </div>

              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={notifyVolunteers}
                  onChange={e => setNotifyVolunteers(e.target.checked)}
                  className="rounded border-gray-300 text-green-600 focus:ring-green-500" />
                Send thank-you emails to confirmed volunteers
              </label>
            </>
          )}
        </div>

        {/* Footer states exactly what pressing the button does. */}
        <div className="px-6 py-4 border-t border-gray-100 shrink-0">
          {preview && willInvoice && recipients.length > 0 && (
            <p className="text-xs text-gray-500 mb-3">
              Invoice for <strong>${money(total)}</strong> will be emailed to {recipients[0]}
              {recipients.length > 1 && ` (+${recipients.length - 1} cc'd)`} immediately. This cannot be unsent.
            </p>
          )}
          {preview && willInvoice && recipients.length === 0 && (
            <p className="text-xs text-amber-700 mb-3">
              No recipient — the invoice will be saved but not sent.
            </p>
          )}
          <div className="flex gap-2">
            <button
              onClick={submit}
              disabled={busy || loading || !preview || needsAmount}
              className="flex-1 px-4 py-2.5 bg-green-600 text-white text-sm font-semibold rounded-lg disabled:opacity-50 hover:bg-green-700 transition"
            >
              {busy
                ? 'Working…'
                : needsAmount
                  ? 'Enter an amount for every line'
                  : willInvoice
                    ? (recipients.length > 0
                        ? `Complete & send invoice ($${money(total)})`
                        : `Complete & save invoice ($${money(total)})`)
                    : 'Mark complete'}
            </button>
            <button onClick={onClose} disabled={busy}
              className="px-4 py-2.5 text-sm text-gray-600 hover:text-gray-800 disabled:opacity-40">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

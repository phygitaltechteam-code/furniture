import {ConfirmDialog} from '@/components/Forms';
import {PageHeader} from '@/components/ui';
import {useQuotation, useQuotationStatus} from '@/lib/react-query/queriesAndMutations/quotation';
import {Quotation} from '@/types/quotation';
import {getErrorMessage} from '@/utils/axios';
import {inr} from '@/utils/money';
import {Link, useNavigate, useParams} from '@tanstack/react-router';
import {CheckCircle2, Loader2, Mail, MessageCircle, Pencil, Printer, Receipt, Send, XCircle} from 'lucide-react';
import {useState} from 'react';
import {QuotationStatusPill} from './QuotationListPage';

const date = (iso: string) => new Date(iso).toLocaleDateString('en-IN', {day: '2-digit', month: 'short', year: 'numeric'});

/** Spell an amount in Indian words for the quotation footer */
const words = (n: number): string => {
  const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const two = (x: number) => (x < 20 ? a[x] : `${b[Math.floor(x / 10)]}${x % 10 ? ` ${a[x % 10]}` : ''}`);
  const three = (x: number) => `${x >= 100 ? `${a[Math.floor(x / 100)]} Hundred${x % 100 ? ' ' : ''}` : ''}${x % 100 ? two(x % 100) : ''}`;
  let v = Math.round(n);
  if (!v) return 'Zero';
  const parts: string[] = [];
  const crore = Math.floor(v / 1e7);
  v %= 1e7;
  const lakh = Math.floor(v / 1e5);
  v %= 1e5;
  const thousand = Math.floor(v / 1e3);
  v %= 1e3;
  if (crore) parts.push(`${three(crore)} Crore`);
  if (lakh) parts.push(`${two(lakh)} Lakh`);
  if (thousand) parts.push(`${two(thousand)} Thousand`);
  if (v) parts.push(three(v));
  return parts.join(' ');
};

/** The printable quotation (A4) */
const Document = ({q}: {q: Quotation}) => (
  <article className="print-area mx-auto max-w-[210mm] bg-white p-6 text-[13px] leading-relaxed text-espresso shadow-card sm:p-10 print:p-0 print:shadow-none">
    <header className="flex flex-col gap-4 border-b-2 border-walnut pb-5 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <p className="font-serif text-2xl font-semibold text-walnut">{q.shop.company.name}</p>
        <p className="mt-1 text-on-surface-variant">
          {q.shop.branch.name}
          {q.shop.address ? `, ${q.shop.address}` : ''}, {q.shop.branch.city}, {q.shop.branch.state}
        </p>
        <p className="text-on-surface-variant">
          {[q.shop.phone && `Phone ${q.shop.phone}`, q.shop.email].filter(Boolean).join(' · ')}
        </p>
        {q.shop.gstin && <p className="font-medium">GSTIN: {q.shop.gstin}</p>}
      </div>
      <div className="sm:text-right">
        <p className="font-serif text-xl font-semibold uppercase tracking-wide">Quotation</p>
        <p className="font-semibold">{q.quotationNumber}</p>
        <p className="text-on-surface-variant">Date: {date(q.quoteDate)}</p>
        <p className="text-on-surface-variant">Valid until: {date(q.validUntil)}</p>
        <p className="text-on-surface-variant">{q.saleType === 'WHOLESALE' ? 'Wholesale / dealer prices' : 'Retail prices'}</p>
      </div>
    </header>

    <section className="mt-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-outline">Quotation for</p>
      <p className="mt-1 text-base font-semibold">{q.customerName}</p>
      <p>{q.customerPhone}{q.customerEmail ? ` · ${q.customerEmail}` : ''}</p>
      {q.customerAddress && <p className="whitespace-pre-line text-on-surface-variant">{q.customerAddress}</p>}
      {q.customerGstin && <p>GSTIN: {q.customerGstin}</p>}
    </section>

    <div className="table-wrap mt-5">
      <table className="w-full min-w-[34rem] border-collapse text-left">
        <thead>
          <tr className="bg-walnut text-white">
            <th className="px-2 py-2 font-semibold">#</th>
            <th className="px-2 py-2 font-semibold">Item</th>
            <th className="px-2 py-2 font-semibold">HSN</th>
            <th className="px-2 py-2 text-right font-semibold">Qty</th>
            <th className="px-2 py-2 text-right font-semibold">Rate</th>
            <th className="px-2 py-2 text-right font-semibold">Disc.</th>
            <th className="px-2 py-2 text-right font-semibold">GST</th>
            <th className="px-2 py-2 text-right font-semibold">Amount</th>
          </tr>
        </thead>
        <tbody>
          {q.items.map((i, idx) => (
            <tr key={i.id} className="border-b border-ivory-300 align-top">
              <td className="px-2 py-2">{idx + 1}</td>
              <td className="px-2 py-2">{i.description}</td>
              <td className="px-2 py-2">{i.hsnCode ?? '—'}</td>
              <td className="px-2 py-2 text-right">{i.quantity}</td>
              <td className="px-2 py-2 text-right">{inr(i.unitPrice)}</td>
              <td className="px-2 py-2 text-right">{i.discount ? inr(i.discount) : '—'}</td>
              <td className="px-2 py-2 text-right">{i.taxRate}%</td>
              <td className="px-2 py-2 text-right font-medium">{inr(i.totalPrice)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>

    <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:justify-between">
      <p className="max-w-sm text-on-surface-variant">
        <span className="font-semibold text-espresso">Amount in words:</span> Rupees {words(q.totalAmount)} only
      </p>
      <dl className="w-full max-w-xs space-y-1">
        <div className="flex justify-between"><dt>Subtotal</dt><dd>{inr(q.subtotal)}</dd></div>
        {q.discount > 0 && <div className="flex justify-between"><dt>Discount</dt><dd>− {inr(q.discount)}</dd></div>}
        <div className="flex justify-between"><dt>GST</dt><dd>{inr(q.taxAmount)}</dd></div>
        {q.extraCharges > 0 && <div className="flex justify-between"><dt>Delivery / installation</dt><dd>{inr(q.extraCharges)}</dd></div>}
        <div className="flex justify-between border-t-2 border-walnut pt-1.5 text-base font-semibold text-walnut"><dt>Total</dt><dd>{inr(q.totalAmount)}</dd></div>
      </dl>
    </div>

    {q.terms && (
      <section className="mt-6 border-t border-ivory-300 pt-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-outline">Terms & conditions</p>
        <p className="mt-1 whitespace-pre-line text-on-surface-variant">{q.terms}</p>
      </section>
    )}
    <footer className="mt-10 flex justify-end">
      <div className="text-center">
        <div className="h-12" />
        <p className="border-t border-espresso px-8 pt-1 text-xs">Authorised signatory, {q.shop.company.name}</p>
      </div>
    </footer>
  </article>
);

/** /shop-admin/quotations/:quotationId */
const QuotationDetailPage = () => {
  const {quotationId} = useParams({strict: false}) as {quotationId: string};
  const navigate = useNavigate();
  const {data: q, isPending, isError, error} = useQuotation(quotationId);
  const status = useQuotationStatus();
  const [confirmReject, setConfirmReject] = useState(false);

  const shareText = q
    ? `Dear ${q.customerName}, thank you for visiting ${q.shop.company.name}. Your quotation ${q.quotationNumber} for ${inr(q.totalAmount)} (${q.items.length} item${q.items.length > 1 ? 's' : ''}) is valid until ${date(q.validUntil)}. We look forward to serving you.`
    : '';
  const openable = q && ['DRAFT', 'SENT', 'ACCEPTED'].includes(q.status);
  const editable = q && ['DRAFT', 'SENT'].includes(q.status);

  return (
    <>
      <div className="print:hidden">
        <PageHeader
          compact
          breadcrumbs={[{label: 'Quotations', to: '/shop-admin/quotations'}, {label: q?.quotationNumber ?? '…'}]}
          title={q ? `${q.quotationNumber} · ${q.customerName}` : 'Quotation'}
          actions={
            q && (
              <div className="flex flex-wrap items-center gap-2">
                <QuotationStatusPill status={q.status} />
                {editable && (
                  <button type="button" className="btn-ghost" onClick={() => navigate({to: '/shop-admin/quotations/edit/$quotationId', params: {quotationId: q.id}})}>
                    <Pencil size={15} /> Edit
                  </button>
                )}
                <button type="button" className="btn-ghost" onClick={() => window.print()}>
                  <Printer size={15} /> Print / PDF
                </button>
                {openable && (
                  <button type="button" className="btn-primary" onClick={() => navigate({to: '/shop-admin/new-bill', search: {quotation: q.id} as never})}>
                    <Receipt size={15} /> Bill it
                  </button>
                )}
              </div>
            )
          }
        />
      </div>

      {isPending ? (
        <div className="flex items-center gap-2 py-16 text-on-surface-variant">
          <Loader2 size={16} className="animate-spin" /> Loading quotation…
        </div>
      ) : isError ? (
        <div className="panel px-6 py-12 text-center">
          <p className="font-serif text-headline-sm text-walnut">Quotation not available</p>
          <p className="mt-1 text-sm text-on-surface-variant">{getErrorMessage(error, 'It may have been removed.')}</p>
          <Link to="/shop-admin/quotations" className="btn-ghost mt-4">
            Back to quotations
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[1fr_18rem]">
          <Document q={q} />
          <aside className="space-y-4 print:hidden">
            <div className="panel space-y-2 p-4">
              <p className="text-sm font-semibold">Status</p>
              {q.status === 'DRAFT' && (
                <button type="button" className="btn-ghost w-full" disabled={status.isPending} onClick={() => status.mutate({id: q.id, status: 'SENT'})}>
                  <Send size={15} /> Mark as sent
                </button>
              )}
              {['DRAFT', 'SENT'].includes(q.status) && (
                <button type="button" className="btn-accent w-full" disabled={status.isPending} onClick={() => status.mutate({id: q.id, status: 'ACCEPTED'})}>
                  <CheckCircle2 size={15} /> Customer accepted
                </button>
              )}
              {['DRAFT', 'SENT', 'ACCEPTED'].includes(q.status) && (
                <button type="button" className="btn-ghost w-full text-error" disabled={status.isPending} onClick={() => setConfirmReject(true)}>
                  <XCircle size={15} /> Customer declined
                </button>
              )}
              {q.status === 'CONVERTED' && q.salesBill && (
                <p className="rounded-md bg-secondary-container px-3 py-2 text-sm text-on-secondary-container">
                  Billed as <span className="font-semibold">{q.salesBill.billNumber}</span> for {inr(q.salesBill.totalAmount)}
                </p>
              )}
              {q.status === 'REJECTED' && <p className="text-sm text-on-surface-variant">The customer declined this quotation.</p>}
            </div>
            <div className="panel space-y-2 p-4">
              <p className="text-sm font-semibold">Share with the customer</p>
              <a
                className="btn-ghost w-full"
                href={`https://wa.me/91${q.customerPhone}?text=${encodeURIComponent(shareText)}`}
                target="_blank"
                rel="noreferrer"
              >
                <MessageCircle size={15} /> WhatsApp
              </a>
              {q.customerEmail && (
                <a className="btn-ghost w-full" href={`mailto:${q.customerEmail}?subject=${encodeURIComponent(`Quotation ${q.quotationNumber}`)}&body=${encodeURIComponent(shareText)}`}>
                  <Mail size={15} /> Email
                </a>
              )}
              <p className="text-xs text-outline">Use Print / PDF to save the quotation as a PDF and attach it.</p>
            </div>
            {q.notes && (
              <div className="panel p-4">
                <p className="text-sm font-semibold">Internal notes</p>
                <p className="mt-1 whitespace-pre-line text-sm text-on-surface-variant">{q.notes}</p>
              </div>
            )}
          </aside>
        </div>
      )}

      <ConfirmDialog
        open={confirmReject}
        title="Mark as declined?"
        message="The quotation is closed as declined and can no longer be billed."
        confirmLabel="Mark declined"
        tone="danger"
        onConfirm={() => {
          if (q) status.mutate({id: q.id, status: 'REJECTED'});
          setConfirmReject(false);
        }}
        onCancel={() => setConfirmReject(false)}
      />
    </>
  );
};

export default QuotationDetailPage;

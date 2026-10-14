// Bank transfer (local or international via SWIFT). Confirmed manually by sending the transfer receipt.
import { el, copyButton, icon } from '../../ui/dom.js';

export const bank = {
  id: 'bank',
  confirmMode: 'manual',
  icon: icon('bank'),
  label: (s) => s.bank.label,
  hint: (s) => s.bank.hint,

  render({ order, config, strings, money }) {
    const s = strings.bank;
    const k = strings.checkout;
    const wrap = el('div', { class: 'ip' });
    wrap.style.display = 'grid';
    wrap.style.gap = '10px';
    wrap.append(el('p', { class: 'bank-amount' }, [s.transfer, ' ', el('b', {}, money(order.total))]));
    const rows = [
      [s.bankName, config.bankName, false],
      [s.accountName, config.accountName, true],
      [s.accountNumber, config.accountNumber, true],
      [s.iban, config.iban, true],
      [s.swift, config.swift, true],
      [s.branch, config.branch, false],
      [k.orderRef, order.ref, true],
    ];
    for (const [label, value, copy] of rows) {
      if (!value) continue;
      wrap.append(el('div', { class: 'ip-copy' }, [
        el('span', {}, [el('small', {}, label), el('b', { dir: 'ltr' }, value)]),
        copy ? copyButton(value, k.copy, k.copied) : null,
      ]));
    }
    wrap.append(el('p', { class: 'ip-note' }, s.note));
    return wrap;
  },
};

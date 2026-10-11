// InstaPay (Egypt): payment link + QR code, confirmed manually by sending the transfer screenshot.
import { el, copyButton, icon } from '../../ui/dom.js';

export const instapay = {
  id: 'instapay',
  confirmMode: 'manual',
  icon: icon('bolt'),
  label: (s) => s.instapay.label,
  hint: (s) => s.instapay.hint,

  render({ order, config, strings, money }) {
    const s = strings.instapay;
    const k = strings.checkout;
    const wrap = el('div', { class: 'ip' });

    wrap.append(
      el('a', {
        class: 'btn btn-primary btn-lg btn-block ip-pay',
        href: config.link, target: '_blank', rel: 'noopener',
        'data-track': 'instapay_link',
      }, [el('span', {}, s.openLink), el('b', {}, money(order.total)), icon('external')]),
    );

    if (config.qr) {
      wrap.append(el('div', { class: 'ip-qr' }, [
        el('img', { src: config.qr, alt: `InstaPay QR — ${config.handle || ''}`, width: 200, height: 200, loading: 'lazy' }),
        el('p', {}, s.scan),
      ]));
    }

    if (config.handle) {
      wrap.append(el('div', { class: 'ip-copy' }, [
        el('span', {}, [el('small', {}, s.handle), el('b', {}, config.handle)]),
        copyButton(config.handle, k.copy, k.copied),
      ]));
    }
    if (config.accountName) {
      wrap.append(el('div', { class: 'ip-copy' }, [
        el('span', {}, [el('small', {}, s.account), el('b', {}, config.accountName)]),
      ]));
    }
    wrap.append(el('div', { class: 'ip-copy' }, [
      el('span', {}, [el('small', {}, k.orderRef), el('b', {}, order.ref)]),
      copyButton(order.ref, k.copy, k.copied),
    ]));
    wrap.append(el('p', { class: 'ip-note' }, s.note));
    wrap.style.display = 'grid';
    wrap.style.gap = '12px';
    return wrap;
  },
};
